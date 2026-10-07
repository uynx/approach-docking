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
sim.reset_flight();
for(const [i,v] of Object.entries({0:14,1:0,2:-30,3:50,4:0,5:0,6:1,7:0,8:0,9:0,10:Math.sqrt(3.986004418e14/6771000**3),11:0,12:0}))sim.restore(Number(i),v);
for(let i=0;i<13;i++)sim.restore_station(15+i,i===2?-33.2:i===6?1:0);
for(let i=0;i<12;i++){sim.step_flight(0,0,0,0,0,0,0);sim.judge_flight(0);}
execFileSync(native,['satellite'],{encoding:'utf8'}).trim().split('\n').map(Number).forEach((value,index)=>{
  const actual=index<sim.state_size()?sim.component(index):sim.station_component(index-sim.state_size());
  assert.ok(Math.abs(actual-value)<1e-7,`satellite impact parity at ${index}: ${actual} vs ${value}`);
});
assert.equal(sim.component(35),2);assert.ok(sim.station_component(18)>0,'a satellite gains the opposing recoil');
console.log('PASS the visible satellite collider transfers the same recoil in native and WASM physics');
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
assert.equal(sim.frame_size(),sim.state_size()*3+sim.station_size()+3);
for(const slot of [0,1]) {
  sim.reset_flight(123);sim.restore(0,2.4);sim.restore_station(10,0.02);sim.restore_opponent(0,12);
  const packed=new Float64Array(sim.memory.buffer,sim.read_frame(slot),sim.frame_size());
  const size=sim.state_size(),stationSize=sim.station_size(),guideAt=size*2+stationSize;
  for(let i=0;i<size;i++){assert.equal(packed[i],sim.component(i));assert.equal(packed[size+i],sim.opponent_component(i));}
  for(let i=0;i<stationSize;i++)assert.equal(packed[size*2+i],sim.station_component(i));
  for(let i=0;i<13;i++)assert.equal(packed[guideAt+i],sim.guidance_component(i,slot));
  assert.equal(packed[guideAt+size],sim.flight_altitude());assert.equal(packed[guideAt+size+1],sim.flight_heat());assert.equal(packed[guideAt+size+2],sim.flight_airspeed());
  sim.restore(0,7);sim.read_state();assert.equal(packed[0],7,'the tutorial reads the latest tick through the same buffer');
  sim.reset_flight(456);sim.read_frame(slot);assert.equal(packed[13],80,'round resets update the existing view');
}
console.log('PASS packed frame views match scalar state and guidance across both slots and resets');
