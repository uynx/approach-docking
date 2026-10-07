import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const [wasm, native] = process.argv.slice(2);
const { instance } = await WebAssembly.instantiate(readFileSync(wasm), { env: { acos: Math.acos, sin: Math.sin, cos: Math.cos, exp: Math.exp, log: Math.log } });
const sim = instance.exports;
sim.reset_flight();
for (let i = 0; i < 7200; i++) {
  sim.step_flight(i >= 1800 && i < 2100 ? -0.2 : 0, 0, i < 1200 ? 1 : 0,
    i >= 1200 && i < 1260 ? 0.2 : 0, 0, 0);
}
const expected = execFileSync(native, { encoding: 'utf8' }).trim().split('\n').map(Number);
expected.forEach((value, index) => assert.ok(Math.abs(sim.component(index) - value) < 1e-7,
  `native/WASM mismatch at component ${index}: ${sim.component(index)} vs ${value}`));
assert.ok(Number.isFinite(sim.flight_alignment()));
assert.ok(Number.isFinite(sim.flight_spin()));
console.log('PASS native/WASM agree after 7200 mixed-control physics steps');
sim.reset_flight();sim.restore(0,0.35);sim.restore(1,0.2);sim.restore(2,-1);sim.restore(5,50);
for(let i=0;i<120;i++){sim.step_flight(0,0,0,0,0,0,0);sim.judge_flight(0);}
const collision=execFileSync(native,['collision'],{encoding:'utf8'}).trim().split('\n').map(Number);
collision.forEach((value,index)=>{
  const actual=index<sim.state_size()?sim.component(index):sim.station_component(index-sim.state_size());
  assert.ok(Math.abs(actual-value)<1e-7,`collision parity mismatch ${index}: ${actual} vs ${value}`);
});
assert.equal(sim.component(15),2);
assert.ok(Math.hypot(sim.station_component(10),sim.station_component(11),sim.station_component(12))>0);
console.log('PASS native/WASM collision, torque, fracture metadata and station motion agree');
const pair=execFileSync(native,['pair'],{encoding:'utf8'}).trim().split('\n').map(Number);
for(const slot of [0,1]) {
  sim.reset_flight();sim.set_opponent(1);
  for(const [i,write] of [sim.restore,sim.restore_opponent].entries()) {
    const globalSlot=i^slot;
    const pose={0:globalSlot?-16:16,1:0,2:-30,3:globalSlot?-50:50,4:0,5:0,6:1,7:0,8:0,9:0,10:Math.sqrt(3.986004418e14/(6771000**3)),11:0,12:0};
    for(const [index,value] of Object.entries(pose))write(Number(index),value);
  }
  for(let i=0;i<24;i++)sim.step_flight(0,0,0,0,0,0,slot);
  pair.forEach((value,index)=>{
    const size=sim.state_size(),body=Math.floor(index/size),field=index%size;
    const actual=body<2?(body===slot?sim.component(field):sim.opponent_component(field)):sim.station_component(index-2*size);
    assert.ok(Math.abs(actual-value)<1e-7,`two-capsule parity at slot ${slot}, field ${index}: ${actual} vs ${value}`);
  });
  assert.equal(sim.component(15),2);assert.equal(sim.opponent_component(15),2);
}
console.log('PASS both pilot slots predict the same two-capsule collision as the server');
const { Flight, Station } = await import('../web/state.js');
assert.equal(sim.state_size(), Object.keys(Flight).length);
assert.equal(sim.station_size(), Object.keys(Station).length);
for (const [fields,read,write] of [[Flight,sim.component,sim.restore],[Station,sim.station_component,sim.restore_station]]) {
  for (const [name,index] of Object.entries(fields)) {
    const value=index+1;
    write(index,value);assert.equal(read(index),value,`restore ${name}`);
    write(index,NaN);write(index,Infinity);assert.equal(read(index),value,`reject nonfinite ${name}`);
  }
  assert.equal(read(-1),0);assert.equal(read(Object.keys(fields).length),0);
}
sim.reset_flight();
assert.equal(sim.component(Flight.fuel),80);
assert.equal(sim.component(Flight.impactPart),-1);
assert.equal(sim.station_component(Station.brokenPanels),0);
console.log('PASS every named state field round-trips and rejects nonfinite input');
const launches=[];
for(let seed=1;seed<=32;seed++) {
  sim.reset_flight(seed);
  const attitude=[6,7,8,9].map(sim.component);
  assert.ok(sim.flight_alignment()>=8&&sim.flight_alignment()<=16,'start remains close to docking attitude');
  assert.ok(sim.flight_spin()<1e-9,'random attitude does not invent a spin');
  sim.reset_flight(seed);
  assert.deepEqual([6,7,8,9].map(sim.component),attitude,'seeded launch is reproducible');
  launches.push(attitude.join(','));
}
assert.equal(new Set(launches).size,32,'new seeds produce different launch attitudes');
console.log('PASS varied launch attitudes stay within a controllable cone');
