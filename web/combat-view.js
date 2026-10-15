import {Flight} from './state.js';
import {meanMotion} from './flight-view.js';

export const powers=[
  {name:'EMPTY',tip:'Collect a supply pod',color:0x718393},
  {name:'SPIN BUG',tip:'Aim at a ship · disrupt its thrusters',color:0xff956e},
  {name:'TOW CABLE',tip:'Aim at a ship · pull both together',color:0x89cfff},
  {name:'EMERGENCY KICK',tip:'A burst of forward momentum',color:0xffdb81},
  {name:'DECOY CAPSULE',tip:'Leave a moving radar decoy',color:0xbb9bff},
  {name:'SCRAP ARMOR',tip:'Absorb the next 50 damage',color:0xb8d6e7},
  {name:'RECOVERY OVERRIDE',tip:'Stronger rotation damping for 5 seconds',color:0x8ff9da},
];

export function readBattle(values) {
  let at=0;
  const next=()=>Number(values[at++]),vector=()=>[next(),next(),next()];
  const battle={map:next(),number:next(),wins:[next(),next()],result:next(),remaining:next(),training:!!next(),tick:next(),random:next()};
  battle.fighters=Array.from({length:2},()=>{
    const f={health:next(),shield:next(),thrusters:Array.from({length:12},next),items:[next(),next()],reload:next(),spin:next(),immune:next(),tether:next(),decoy:next(),stabilize:next(),tetherLength:next(),tetherPoint:vector(),decoyPosition:vector(),decoyVelocity:vector(),shotSequence:next(),shotFrom:vector(),shotTo:vector(),shotAge:next(),shotHit:next(),lastImpact:next()};
    f.propulsion=f.thrusters.slice(0,6).reduce((a,b)=>a+b,0)/6;
    f.steering=f.thrusters.slice(6).reduce((a,b)=>a+b,0)/6;
    return f;
  });
  battle.pickups=Array.from({length:6},()=>({position:vector(),power:next(),cooldown:next()}));
  if(at!==values.length)throw new Error('Combat versions differ. Reload after rebuilding.');
  return battle;
}

export function rotate(q,v) {
  const [w,x,y,z]=q,[a,b,c]=v;
  const tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);
  return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];
}
export function direction(state){return rotate(state.slice(Flight.qw,Flight.qz+1),[0,0,1]);}
export function aimMovement(aim,state,dx,dy) {
  const q=state.slice(Flight.qw,Flight.qz+1),right=rotate(q,[1,0,0]),up=rotate(q,[0,1,0]);
  const next=aim.map((v,i)=>v+right[i]*dx*0.0025-up[i]*dy*0.0025),length=Math.hypot(...next);
  return next.map(v=>v/length);
}
export function controlAxes(state,held,aim,enabled=true) {
  if(!enabled)return [0,0,0,0,0,0];
  const down=key=>held.has(key)?1:0,clamp=v=>Math.max(-1,Math.min(1,v));
  const q=state.slice(6,10),inverse=[q[0],-q[1],-q[2],-q[3]],target=rotate(inverse,aim);
  const orbital=rotate(inverse,[meanMotion,0,0]),spin=state.slice(10,13).map((v,i)=>v-orbital[i]);
  const pitch=-Math.atan2(target[1],Math.hypot(target[0],target[2])),yaw=Math.atan2(target[0],target[2]);
  const axes=[down('KeyD')-down('KeyA'),down('KeyR')-down('KeyF'),down('KeyW')-down('KeyS'),
    clamp(pitch*2.8-spin[0]*2),clamp(yaw*2.8-spin[1]*2),clamp(down('KeyQ')-down('KeyE')-spin[2]*2)];
  if(held.has('KeyB')) {
    const velocity=rotate(inverse,state.slice(3,6));
    for(let i=0;i<3;i++)axes[i]=clamp(axes[i]-velocity[i]*0.8);
  }
  return axes;
}
