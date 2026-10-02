import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const [wasm, native] = process.argv.slice(2);
const { instance } = await WebAssembly.instantiate(readFileSync(wasm), { env: { acos: Math.acos } });
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
