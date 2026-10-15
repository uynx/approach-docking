import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {controlAxes,aimMovement,readBattle} from '../web/combat-view.js';

test('moving weapon aim does not command the ship attitude thrusters',()=>{
  const state=new Float64Array(40);state[6]=1;state[10]=Math.sqrt(3.986004418e14/6771000**3);
  const aim=aimMovement([0,0,1],state,150,50);
  assert.ok(aim[0]>0.1&&aim[1]<0,'the mouse redirects the weapon');
  assert.deepEqual(controlAxes(state,new Set(),aim).slice(3),[0,0,0],'aiming leaves the attitude controls alone');
  assert.equal(controlAxes(state,new Set(['ArrowRight']),aim)[4],1,'arrow keys still turn the ship');
});

test('laser strikes remove authoritative hull sections and destruction breaks the whole hull',async()=>{
  const {instance}=await WebAssembly.instantiate(await readFile(new URL('../build/web/physics.wasm',import.meta.url)),{env:{acos:Math.acos,sin:Math.sin,cos:Math.cos,exp:Math.exp,log:Math.log}});
  const sim=instance.exports;sim.reset_combat(0,0);
  sim.step_combat(0,0,0,0,0,0,1,-1,0,1);
  assert.ok(Array.from({length:4},(_,i)=>sim.opponent_component(36+i)).some(v=>v!==0),'a hit removes real collider sections');
  for(let i=0;i<120;i++)sim.step_combat(0,0,0,0,0,0,1,-1,0,1);
  const battle=readBattle(new Float64Array(sim.memory.buffer,sim.read_combat(),sim.combat_size()));
  assert.equal(battle.fighters[1].health,0);
  assert.ok(Array.from({length:4},(_,i)=>sim.opponent_component(36+i)).every(v=>v===4294967295),'a destroyed hull cannot remain intact');
});

test('scrap armor absorbs a laser before it can tear the hull',async()=>{
  const {instance}=await WebAssembly.instantiate(await readFile(new URL('../build/web/physics.wasm',import.meta.url)),{env:{acos:Math.acos,sin:Math.sin,cos:Math.cos,exp:Math.exp,log:Math.log}});
  const sim=instance.exports;sim.reset_combat(0,0);sim.restore_combat(55,50);
  sim.step_combat(0,0,0,0,0,0,1,-1,0,1);
  const battle=readBattle(new Float64Array(sim.memory.buffer,sim.read_combat(),sim.combat_size()));
  assert.equal(battle.fighters[1].health,100);assert.equal(battle.fighters[1].shield,25);
  assert.ok(Array.from({length:4},(_,i)=>sim.opponent_component(36+i)).every(v=>v===0),'absorbed energy does not remove hull geometry');
});
