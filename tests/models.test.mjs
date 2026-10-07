import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CrushBody} from '../web/damage.js';
import * as THREE from 'three';

const source=(await readFile(new URL('../web/models.js',import.meta.url),'utf8'))
  .replace('/vendor/three.module.js',new URL('../node_modules/three/build/three.module.js',import.meta.url).href)
  .replace('./flight-view.js',new URL('../web/flight-view.js',import.meta.url).href);
const {spacecraftModel,stationModel,solidMeshes,clipMeshCamera,meshHit,batchRendering}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const effectsSource=(await readFile(new URL('../web/damage-effects.js',import.meta.url),'utf8'))
  .replace('/vendor/three.module.js',new URL('../node_modules/three/build/three.module.js',import.meta.url).href)
  .replace('./state.js',new URL('../web/state.js',import.meta.url).href)
  .replace('./damage.js',new URL('../web/damage.js',import.meta.url).href);
const {createDamageEffects}=await import('data:text/javascript;base64,'+Buffer.from(effectsSource).toString('base64'));

test('accelerated rays preserve the nearest actual triangle after damage and reset',()=>{
  const station=stationModel(1,false);station.group.updateMatrixWorld(true);
  const origin=new THREE.Vector3(-18,0,2),direction=new THREE.Vector3(0,0,-1);
  const expected=()=>{
    const ray=new THREE.Raycaster(origin,direction),meshes=solidMeshes(station.group);
    const materials=new Map(meshes.map(p=>[p.material,p.material.side]));
    materials.forEach((side,material)=>material.side=THREE.DoubleSide);
    const hit=ray.intersectObjects(meshes,false)[0];
    materials.forEach((side,material)=>material.side=side);return hit;
  };
  for(const impacts of [[],[{point:new THREE.Vector3(-18,0,0),normal:new THREE.Vector3(0,0,1),crush:0.4}],[]]) {
    station.deform(impacts);
    const actual=meshHit(origin,direction,solidMeshes(station.group)),reference=expected();
    assert.ok(actual,'the collar still has a solid surface');
    assert.ok(Math.abs(actual.distance-reference.distance)<1e-8,'damage refits the actual surface');
    assert.equal(actual.object,reference.object);assert.ok(actual.face.normal.distanceTo(reference.face.normal)<1e-8);
    assert.equal(meshHit(origin,direction,solidMeshes(station.group),0.1),null,'short rays do not reach the collar');
  }
  assert.equal(meshHit(new THREE.Vector3(-27.5,0,-11),direction,solidMeshes(station.group),4),null,'empty truss bays stay open');
});

test('render batches follow crushed vertices, detached visibility and round reset',()=>{
  const ship=spacecraftModel(0x6daaa7),sync=batchRendering(ship.group);
  const triangleCount=()=>ship.group.children.filter(p=>p.name==='render-batch').reduce((sum,p)=>sum+p.geometry.drawRange.count/3,0);
  const initial=triangleCount(),panel=ship.fragments.find(p=>p.name==='capsule-hull');
  const batch=ship.group.children.find(p=>p.name==='render-batch'&&p.material===panel.material);
  const before=batch.geometry.attributes.position.array.slice();
  const body=new CrushBody(2200,30);body.advance(1);ship.deform(body);sync();
  assert.ok(batch.geometry.attributes.position.array.some((v,i)=>Math.abs(v-before[i])>0.1),'the renderer shows the real crush');
  panel.visible=false;sync();
  assert.ok(triangleCount()<initial,'detached hull leaves a visible hole');
  panel.visible=true;ship.deform(null);sync();
  assert.equal(triangleCount(),initial);assert.deepEqual(batch.geometry.attributes.position.array,before);
  assert.ok(!solidMeshes(ship.group).includes(batch),'render copies do not add colliders');
  assert.ok(solidMeshes(ship.group).includes(panel),'the actual hull retains its collider');
});

test('camera clearance uses actual truss rails while leaving empty bays open',()=>{
  const station=stationModel(1,false);station.group.updateMatrixWorld(true);
  const from=new THREE.Vector3(-27.5,0,-11),to=new THREE.Vector3(-27.5,0,-15);
  assert.deepEqual(clipMeshCamera(from,to,solidMeshes(station.group)).toArray(),to.toArray());
  const rail=clipMeshCamera(new THREE.Vector3(-30,0.8,-11),new THREE.Vector3(-30,0.8,-15),solidMeshes(station.group));
  assert.ok(rail.z>-12,'the camera stops before the physical rail');
});

test('solid queries exclude hidden parts, guidance and exhaust while including detached hardware',()=>{
  const ship=spacecraftModel(0x6daaa7),world=new THREE.Group();world.add(ship.group);
  ship.plumes[0].visible=true;
  const hidden=ship.fragments[0];hidden.visible=false;
  const cue=new THREE.Mesh(new THREE.PlaneGeometry(50,50),new THREE.MeshBasicMaterial());world.add(cue);
  const detached=new THREE.Mesh(hidden.geometry.clone(),hidden.material);detached.userData.solid=true;world.add(detached);
  const meshes=solidMeshes(world);
  assert.ok(meshes.includes(detached));assert.ok(!meshes.includes(hidden));assert.ok(!meshes.includes(cue));assert.ok(!meshes.includes(ship.plumes[0]));
});

test('a collision between capsules crushes both craft without denting the station',()=>{
  const world=new THREE.Scene(),own=spacecraftModel(0x6daaa7),other=spacecraftModel(0xc6a06c),station=stationModel(1,false);
  station.offset=new THREE.Vector3();station.velocity=new THREE.Vector3();own.velocity=new THREE.Vector3();other.velocity=new THREE.Vector3();
  const surfaces=[];station.group.traverse(p=>{if(p.isMesh)surfaces.push([p,p.geometry.attributes.position.array.slice()]);});
  const effects=createDamageEffects(world,station,[own,other]),states=[new Array(36).fill(0),new Array(36).fill(0)];
  for(const state of states)Object.entries({6:1,15:2,19:-1,20:30,24:1,28:1100,29:20000,30:0.5,31:1,32:-1,35:1}).forEach(([i,v])=>state[i]=v);
  effects.update(states,new Array(15).fill(0),0);
  assert.ok(own.body.capsuleCrush>0.2&&other.body.capsuleCrush>0.2,'both impact participants lose hull shape');
  for(const [mesh,before] of surfaces)assert.deepEqual(mesh.geometry.attributes.position.array,before,'the uninvolved station keeps its geometry');
});

test('a fuel rupture tears frame sections and produces a short expanding flash in vacuum',()=>{
  const world=new THREE.Scene(),own=spacecraftModel(0x6daaa7),other=spacecraftModel(0xc6a06c);
  const station={group:new THREE.Group(),fragments:[],offset:new THREE.Vector3(),velocity:new THREE.Vector3(),deform(){}};
  own.velocity=new THREE.Vector3();world.add(own.group,other.group,station.group);
  const effects=createDamageEffects(world,station,[own,other]),state=new Array(35).fill(0);
  Object.entries({6:1,15:2,19:-1,20:30,24:1,28:2000,29:80000,30:0.15,31:1,32:-1,33:80}).forEach(([i,v])=>state[i]=v);
  effects.update([state,null],new Array(15).fill(0),0);
  const frames=world.children.filter(p=>p.name==='capsule-frame-fragment');
  assert.ok(frames.length>0,'the exposed front frame breaks into actual geometry');
  assert.ok(world.children.some(p=>p.name==='propellant-ejecta'&&p.isPoints),'luminous gas has an expanding cloud');
  effects.advance(0.05);
  const glow=world.children.find(p=>p.name==='propellant-flash');
  assert.ok(glow.visible&&glow.material.opacity>0.02,'the initial flash is visible');
  effects.advance(2);
  assert.ok(!glow.visible,'the gas cools rapidly instead of becoming a persistent fireball');
  effects.reset();
  assert.equal(world.children.filter(p=>p.name.endsWith('-fragment')).length,0);
  assert.ok(own.fragments.every(p=>p.visible));
});

test('the structural frame has individual breakable sections',()=>{
  const ship=spacecraftModel(0x6daaa7);
  const frame=ship.fragments.filter(p=>p.name==='capsule-frame');
  assert.ok(frame.length>=24,'rings and stringers can tear away independently');
  assert.ok(frame.every(p=>p.geometry.attributes.position.count>0&&p.userData.mass>0));
});

test('a severe axial crash buckles the metal frame as well as its skin',()=>{
  const ship=spacecraftModel(0x6daaa7);
  const metal=ship.group.children.filter(p=>p.isMesh&&p.material.color?.getHex()===0xa9afb1);
  const before=metal.map(p=>p.geometry.attributes.position.array.slice());
  const hit=new CrushBody(2200,30);hit.advance(1);
  ship.damageDirection({x:0,y:0,z:1});ship.deform(hit);
  let fold=0;
  metal.forEach((part,j)=>{
    const points=part.geometry.attributes.position.array;
    for(let i=0;i<points.length;i+=3)fold=Math.max(fold,Math.abs(Math.hypot(points[i],points[i+1])-Math.hypot(before[j][i],before[j][i+1])));
  });
  assert.ok(fold>0.1,'exposed metal must lose its pristine circular shape');
  ship.commitDamage();ship.deform(new CrushBody(2200,0.2));
  assert.ok(metal.some((p,j)=>p.geometry.attributes.position.array.some((v,i)=>Math.abs(v-before[j][i])>0.1)),'a later light hit preserves frame damage');
  ship.deform(null);
  metal.forEach((part,j)=>assert.deepEqual(part.geometry.attributes.position.array,before[j],'reset restores the frame'));
});
