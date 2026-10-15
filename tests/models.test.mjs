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

test('a combat ship keeps impact deformation after its controls become active again',()=>{
  const world=new THREE.Scene(),own=spacecraftModel(0),other=spacecraftModel(1);
  const station={group:new THREE.Group(),fragments:[],offset:new THREE.Vector3(),velocity:new THREE.Vector3(),deform(){}};
  own.velocity=new THREE.Vector3();world.add(own.group,other.group,station.group);
  const effects=createDamageEffects(world,station,[own,other]),state=new Array(36).fill(0);
  Object.assign(state,{6:1,15:0,17:-1,20:30,24:0.5,28:2000,29:20000,30:0.5,31:1,32:-1,35:1});
  effects.update([state,null],new Array(54).fill(0),0);
  assert.ok(own.body?.capsuleCrush>0.3,'an impact leaves damage while flight controls remain available');
  const body=own.body;state[15]=2;effects.update([state,null],new Array(54).fill(0),0);
  assert.equal(own.body,body,'changing flight status does not replay the same impact');
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

test('an off-centre strike folds the struck side without repeating around the hull',()=>{
  const ship=spacecraftModel(0x6daaa7),panels=ship.fragments.filter(p=>p.name==='capsule-hull');
  const before=panels.map(p=>p.geometry.attributes.position.array.slice());
  const hit=new CrushBody(2200,8);hit.advance(1);
  ship.damageDirection(new THREE.Vector3(0,0,1),new THREE.Vector3(1.2,0,-1.5));ship.deform(hit);
  let struck=0,opposite=0;
  panels.forEach((panel,j)=>{
    const points=panel.geometry.attributes.position.array;
    for(let i=0;i<points.length;i+=3)if(Math.abs(before[j][i+2]+1.5)<0.02&&Math.abs(before[j][i+1])<0.05) {
      const displacement=Math.hypot(points[i]-before[j][i],points[i+1]-before[j][i+1],points[i+2]-before[j][i+2]);
      if(before[j][i]>1.2)struck=Math.max(struck,displacement);
      if(before[j][i]<-1.2)opposite=Math.max(opposite,displacement);
    }
  });
  assert.ok(struck>0.2,'the contacted hull loses its shape');
  assert.ok(opposite<struck*0.4,'the opposite side does not receive the same fold');
});

test('a crushed capsule moves its hatch as one rigid plate',()=>{
  const ship=spacecraftModel(0x6daaa7),vertices=[];
  for(const part of solidMeshes(ship.group)) {
    const p=part.geometry.attributes.position;
    for(let i=0;i<p.count;i++)if(Math.abs(p.getZ(i)+3.075)<1e-5&&Math.hypot(p.getX(i),p.getY(i))<0.641)
      vertices.push({part,i,before:new THREE.Vector3().fromBufferAttribute(p,i)});
  }
  assert.ok(vertices.length>=65,'the actual hatch mesh is sampled');
  const center=vertices.find(v=>v.before.lengthSq()<3.0751**2&&Math.hypot(v.before.x,v.before.y)<1e-5);
  const hit=new CrushBody(2200,30);hit.advance(1);
  ship.damageDirection(new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-3.2));ship.deform(hit);
  const after=v=>new THREE.Vector3().fromBufferAttribute(v.part.geometry.attributes.position,v.i);
  for(const vertex of vertices)assert.ok(Math.abs(after(vertex).distanceTo(after(center))-vertex.before.distanceTo(center.before))<1e-5,'the plate retains its radius');
  assert.ok(after(center).z>center.before.z+0.5,'the mounting structure still crushes');
  ship.commitDamage();
  ship.damageDirection(new THREE.Vector3(0.3,0,1).normalize(),new THREE.Vector3(0.8,0,-2.5));
  ship.deform(hit);
  for(const vertex of vertices)assert.ok(Math.abs(after(vertex).distanceTo(after(center))-vertex.before.distanceTo(center.before))<1e-5,'a second impact preserves the plate');
  ship.deform(null);
  for(const vertex of vertices)assert.ok(after(vertex).distanceTo(vertex.before)<1e-6,'reset restores the fitting');
});

test('constructing another capsule does not transform shared fittings twice',()=>{
  const first=solidMeshes(spacecraftModel(0).group),second=solidMeshes(spacecraftModel(0).group);
  assert.equal(first.length,second.length);
  first.forEach((part,i)=>assert.deepEqual(part.geometry.attributes.position.array,second[i].geometry.attributes.position.array));
});

test('opposite off-centre impacts tear the struck side and preserve distant structure',()=>{
  const broken=[];
  for(const side of [-1,1]) {
    const world=new THREE.Scene(),own=spacecraftModel(0),other=spacecraftModel(1);
    const station={group:new THREE.Group(),fragments:[],offset:new THREE.Vector3(),velocity:new THREE.Vector3(),deform(){}};
    own.velocity=new THREE.Vector3();world.add(own.group,other.group,station.group);
    const centers=own.fragments.map(part=>{part.geometry.computeBoundingSphere();return part.geometry.boundingSphere.center.clone();});
    const effects=createDamageEffects(world,station,[own,other]),state=new Array(36).fill(0);
    Object.assign(state,{6:1,15:2,19:-1,20:8,21:side*1.2,23:1.5,24:1,28:2100,29:80000,30:0.15,31:1,32:-1});
    effects.update([state,null],new Array(54).fill(0),0);
    const torn=own.fragments.flatMap((part,i)=>!part.visible?[i]:[]);
    assert.ok(torn.length>0,'the loaded side tears');
    assert.ok(torn.reduce((sum,i)=>sum+centers[i].x*side,0)/torn.length>0.4,'tearing concentrates on the struck side');
    assert.ok(own.fragments.every((part,i)=>centers[i].z<0.8||part.visible),'the distant rear structure remains attached');
    assert.ok(own.fragments.some((part,i)=>part.visible&&part.name==='capsule-hull'&&centers[i].x*side>0),'folding does not strip every loaded panel');
    broken.push(torn);
    effects.reset();assert.ok(own.fragments.every(part=>part.visible));
  }
  assert.notDeepEqual(broken[0],broken[1],'the impact location determines what tears');
});

test('broken solar tiles tumble with different axes and periods',()=>{
  const world=new THREE.Scene(),station=stationModel(1,false),own=spacecraftModel(0),other=spacecraftModel(1);
  station.offset=new THREE.Vector3();station.velocity=new THREE.Vector3();
  const effects=createDamageEffects(world,station,[own,other]),state=new Array(54).fill(0);state[13]=1;
  effects.update([null,null],state,0);effects.advance(0.2);
  const pieces=world.children.filter(p=>p.name==='station-panel-fragment');
  assert.equal(pieces.length,24);
  const speeds=pieces.map(p=>2*Math.acos(Math.min(1,Math.abs(p.quaternion.w)))/0.2);
  assert.ok(Math.max(...speeds)-Math.min(...speeds)>0.1,'equal-sized panels have different periods');
  const axes=pieces.map(p=>new THREE.Vector3(p.quaternion.x,p.quaternion.y,p.quaternion.z).normalize());
  assert.ok(axes.some(axis=>Math.abs(axis.dot(axes[0]))<0.9),'panel normals do not rotate together');
});

test('capsule tearing selects the same parts at different frame rates',()=>{
  const results=[];
  for(const steps of [1,30,60]) {
    const world=new THREE.Scene(),own=spacecraftModel(0),other=spacecraftModel(1);
    const station={group:new THREE.Group(),fragments:[],offset:new THREE.Vector3(),velocity:new THREE.Vector3(),deform(){}};
    own.velocity=new THREE.Vector3();world.add(own.group,other.group,station.group);
    const effects=createDamageEffects(world,station,[own,other]),state=new Array(36).fill(0);
    Object.assign(state,{6:1,15:2,19:-1,20:30,21:1.2,23:1.5,28:2100,29:80000,30:0.15,31:1,32:-1});
    for(let i=1;i<=steps;i++){state[24]=i/steps;effects.update([state,null],new Array(54).fill(0),1/steps);}
    results.push(own.fragments.flatMap((part,i)=>!part.visible?[i]:[]));
  }
  assert.ok(results[0].length>0);assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);
});

test('an immediate weak second hit cannot suppress the first impact tears',()=>{
  const results=[];
  for(const interrupted of [false,true]) {
    const world=new THREE.Scene(),own=spacecraftModel(0),other=spacecraftModel(1);
    const station={group:new THREE.Group(),fragments:[],offset:new THREE.Vector3(),velocity:new THREE.Vector3(),deform(){}};
    own.velocity=new THREE.Vector3();world.add(own.group,other.group,station.group);
    const effects=createDamageEffects(world,station,[own,other]),state=new Array(36).fill(0);
    Object.assign(state,{6:1,15:2,19:-1,20:30,21:1.2,23:1.5,24:0.001,28:2100,29:80000,30:0.15,31:1,32:-1});
    effects.update([state,null],new Array(54).fill(0),0);
    state[24]=1;if(interrupted){state[31]=2;state[20]=0.1;}
    effects.update([state,null],new Array(54).fill(0),0);
    results.push(own.fragments.flatMap((part,i)=>!part.visible?[i]:[]));
  }
  assert.ok(results[0].length>0);assert.deepEqual(results[0],results[1]);
});
