import { Flight } from './state.js';
export const meanMotion = Math.sqrt(3.986004418e14 / 6771000 ** 3);

export function shipPosition(s, slot) {
  return [s[Flight.x] + (slot ? 18 : -18), s[Flight.y], 3.2 - s[Flight.z]];
}

export function clipCamera(origin, desired, boxes, clearance = 0.25) {
  origin=[...origin];
  for(let pass=0;pass<boxes.length;pass++) {
    let moved=false;
    for(const box of boxes)if(origin.every((v,i)=>v>box[i]-clearance&&v<box[i+3]+clearance)) {
      let axis=0,position=0,distance=Infinity;
      for(let i=0;i<3;i++)for(const edge of [box[i]-clearance-1e-6,box[i+3]+clearance+1e-6])
        if(Math.abs(edge-origin[i])<distance) {axis=i;position=edge;distance=Math.abs(edge-origin[i]);}
      origin[axis]=position;moved=true;
    }
    if(!moved)break;
  }
  const delta = desired.map((v, i) => v - origin[i]);
  const length = Math.hypot(...delta);
  if (!length) return [...origin];
  let nearest = 1;
  for (const box of boxes) {
    let enter = -Infinity, leave = Infinity;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(delta[i]) < 1e-10) {
        if (origin[i] < box[i] - clearance || origin[i] > box[i + 3] + clearance) { leave = -Infinity; break; }
      } else {
        const a = (box[i] - clearance - origin[i]) / delta[i], b = (box[i + 3] + clearance - origin[i]) / delta[i];
        enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
      }
    }
    if (enter <= leave && leave >= 0 && enter <= 1) nearest = Math.min(nearest, Math.max(0, enter));
  }
  return origin.map((v, i) => v + delta[i] * nearest);
}

export function dockingIndicators(s) {
  const [w, x, y, z] = s.slice(6, 10);
  const alignment = 2 * Math.acos(Math.min(1, Math.abs(w))) * 180 / Math.PI;
  const spin = Math.hypot(s[Flight.wx] - meanMotion * (1 - 2 * (y*y + z*z)),
    s[Flight.wy] - meanMotion * 2 * (x*y - w*z), s[Flight.wz] - meanMotion * 2 * (x*z + w*y)) * 180 / Math.PI;
  const speed = s[Flight.vz] >= 0 && s[Flight.vz] <= 0.15;
  const offset = Math.hypot(s[Flight.x], s[Flight.y]) <= 0.25;
  const drift = Math.hypot(s[Flight.vx], s[Flight.vy]) <= 0.05;
  const rotation = alignment <= 3 && spin <= 0.5;
  const roll = Math.atan2(2 * (w*z + x*y), 1 - 2 * (y*y + z*z)) * 180 / Math.PI;
  return { speed, offset, drift, rotation, alignment, spin, roll, ready: speed && offset && drift && rotation };
}

const axes = [[1,0,0], [0,1,0], [0,0,1]], arms = [[0,1,0], [0,0,1], [1,0,0]];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const thrusters = [];
for (let axis = 0; axis < 6; axis++) for (const sign of [-1, 1]) for (const side of [-1, 1]) {
  const i = axis % 3, arm = axis === 3 ? [0,0,1] : arms[i];
  const force = (axis < 3 ? axes[i] : cross(axes[i], arm)).map(v => v * sign * (axis < 3 ? 880 : 55 * side));
  const position = arm.map(v => v * side * (axis < 3 ? 1 : 1.5));
  const direction = force.findIndex(v => v !== 0);
  position[direction] = -Math.sign(force[direction]) * (direction === 2 ? 2.2 : 1.4);
  thrusters.push({ axis, sign, position, force });
}

export function firing(thruster, commands, state) {
  const command = commands[thruster.axis] * thruster.sign;
  const phase = (Math.floor((state[Flight.elapsed] + 1e-8) / 0.05) % 5) / 5;
  return state[Flight.fuel] > 0 && state[Flight.status] === 0 && command > phase;
}
