import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shipPosition, clipCamera, dockingIndicators, thrusters, firing } from '../web/flight-view.js';

const state = () => [0, 0, -25, 0, 0, 0, 1, 0, 0, 0, Math.sqrt(3.986004418e14 / 6771000 ** 3), 0, 0, 80, 0, 0, 0];
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('capsule mating face reaches the station contact plane at zero separation', () => {
  const s = state(); s[2] = 0;
  for (const slot of [0, 1]) {
    const p = shipPosition(s, slot);
    near(p[2] - 3.2, 0);
    near(p[0], slot ? 18 : -18);
  }
});

test('camera stops before the station from the front and from either side', () => {
  const boxes = [[-2, -2, -6, 2, 2, 0]];
  const p = clipCamera([0, 0, 3.2], [0, 0, -12], boxes);
  near(p[2], 0.25);
  near(clipCamera([4, 0, -3], [-4, 0, -3], boxes)[0], 2.25);
  near(clipCamera([-4, 0, -3], [4, 0, -3], boxes)[0], -2.25);
  assert.deepEqual(clipCamera([4, 0, 3], [4, 4, 3], boxes), [4, 4, 3]);
});

test('guidance uses the same capture conditions as the flight core', () => {
  const s = state(); s[5] = 0.1;
  assert.equal(dockingIndicators(s).ready, true);
  s[5] = 0.151;
  assert.equal(dockingIndicators(s).speed, false);
  s[5] = 0.1; s[0] = 0.251;
  assert.equal(dockingIndicators(s).offset, false);
  s[0] = 0; s[11] = 0.02;
  assert.equal(dockingIndicators(s).rotation, false);
});

test('visible nozzles reproduce the forces and torques of all six control axes', () => {
  for (let axis = 0; axis < 6; axis++) for (const sign of [-1, 1]) {
    const pair = thrusters.filter(t => t.axis === axis && t.sign === sign);
    assert.equal(pair.length, 2);
    const force = [0, 0, 0], torque = [0, 0, 0];
    for (const t of pair) {
      const [x, y, z] = t.position, [fx, fy, fz] = t.force;
      t.force.forEach((f, i) => { force[i] += f; });
      torque[0] += y * fz - z * fy; torque[1] += z * fx - x * fz; torque[2] += x * fy - y * fx;
    }
    for (let i = 0; i < 3; i++) {
      near(force[i], axis < 3 && axis === i ? 1760 * sign : 0);
      near(torque[i], axis >= 3 && axis - 3 === i ? 165 * sign : 0);
    }
  }
});

test('exhaust obeys pulse timing, command sign, fuel, and completed flight state', () => {
  const s = state(), t = thrusters.find(t => t.axis === 2 && t.sign === 1);
  assert.equal(firing(t, [0, 0, 0.2, 0, 0, 0], s), true);
  s[14] = 0.075;
  assert.equal(firing(t, [0, 0, 0.2, 0, 0, 0], s), false);
  assert.equal(firing(t, [0, 0, -1, 0, 0, 0], s), false);
  s[14] = 0; s[13] = 0;
  assert.equal(firing(t, [0, 0, 1, 0, 0, 0], s), false);
  s[13] = 80; s[15] = 2;
  assert.equal(firing(t, [0, 0, 1, 0, 0, 0], s), false);
});

test('camera clearance is measured normal to the wall on diagonal approaches', () => {
  const point=clipCamera([0,0,3.2],[0.5,0,-10],[[-2,-2,-6,2,2,0]]);
  assert.ok(point[2]>=0.25-1e-10);
});

test('a camera whose target starts inside station hardware is moved outside it',()=>{
  const p=clipCamera([0,0,-3],[0,1,8],[[-2,-2,-6,2,2,0]]);
  assert.ok(p.some((v,i)=>v<=[-2.25,-2.25,-6.25][i]||v>=[2.25,2.25,0.25][i]));
});

test('pitch and yaw use transverse forces at the front and rear of the capsule', () => {
  for(const axis of [3,4]) {
    const pair=thrusters.filter(t=>t.axis===axis&&t.sign===1);
    assert.deepEqual(pair.map(t=>t.position[2]).sort((a,b)=>a-b),[-1.5,1.5]);
    for(const t of pair) {
      near(t.force[2],0);
      assert.equal(Math.abs(t.force[axis===3?1:0]),55);
    }
  }
});
