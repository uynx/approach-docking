import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CrushBody} from '../web/damage.js';
import * as THREE from 'three';

const source=(await readFile(new URL('../web/models.js',import.meta.url),'utf8'))
  .replace('/vendor/three.module.js',new URL('../node_modules/three/build/three.module.js',import.meta.url).href)
  .replace('./flight-view.js',new URL('../web/flight-view.js',import.meta.url).href);
const {spacecraftModel}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const effectsSource=(await readFile(new URL('../web/damage-effects.js',import.meta.url),'utf8'))
  .replace('/vendor/three.module.js',new URL('../node_modules/three/build/three.module.js',import.meta.url).href)
  .replace('./state.js',new URL('../web/state.js',import.meta.url).href)
  .replace('./damage.js',new URL('../web/damage.js',import.meta.url).href);
const {createDamageEffects}=await import('data:text/javascript;base64,'+Buffer.from(effectsSource).toString('base64'));

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
