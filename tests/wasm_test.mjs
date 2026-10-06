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
  const actual=index<35?sim.component(index):sim.station_component(index-35);
  assert.ok(Math.abs(actual-value)<1e-7,`collision parity mismatch ${index}: ${actual} vs ${value}`);
});
assert.equal(sim.component(15),2);
assert.ok(Math.hypot(sim.station_component(10),sim.station_component(11),sim.station_component(12))>0);
console.log('PASS native/WASM collision, torque, fracture metadata and station motion agree');
