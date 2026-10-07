import {Flight} from './state.js';
import {dockingIndicators,meanMotion} from './flight-view.js';

function bodyVector(s,[a,b,c]) {
  const w=s[Flight.qw],x=-s[Flight.qx],y=-s[Flight.qy],z=-s[Flight.qz];
  const tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);
  return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];
}
const pulse=value=>Math.abs(value)<0.008?0:Math.max(-1,Math.min(1,value));

const straight={6:1,7:0,8:0,9:0,10:meanMotion,11:0,12:0};
export const tutorialLessons=[
  {id:'dock',title:'A clean approach',pose:{},tip:'Turn toward the port, stop your rotation, then centre the nose before closing.'},
  {id:'braking',title:'Brake before the port',pose:{...straight,0:0,1:0,2:-60,3:0,4:0,5:30},tip:'Releasing W only stops thrust. At 30 m/s you need over 560 m to brake with S.'},
  {id:'offset',title:'An off-centre impact',pose:{...straight,0:0.85,1:0.6,2:-35,3:0,4:0,5:24},tip:'A rim strike twists both spacecraft and tears the hull. Centre the ray and remove sideways drift.'},
  {id:'wing',title:'Fragile hardware still hurts',pose:{...straight,0:8,1:4,2:-35,3:0,4:0,5:50},tip:'Solar wings tear instead of stopping you. A clear route matters even when you miss the docking port.'},
];

export function pilotControls(s) {
  if(s[Flight.status])return [0,0,0,0,0,0];
  const cues=dockingIndicators(s),distance=Math.max(0,-s[Flight.z]);
  const aligned=cues.alignment<0.8&&cues.spin<0.1&&Math.hypot(s[Flight.x],s[Flight.y])<0.08&&Math.hypot(s[Flight.vx],s[Flight.vy])<0.035;
  const speed=aligned?Math.min(0.9,Math.sqrt(0.35*distance),Math.max(0.02,distance*0.25)):0;
  const acceleration=bodyVector(s,[-0.22*s[Flight.x]-1.05*s[Flight.vx],-0.22*s[Flight.y]-1.05*s[Flight.vy]-2*meanMotion*s[Flight.vz],0.9*(speed-s[Flight.vz])]);
  const orbit=bodyVector(s,[meanMotion,0,0]);
  return [...acceleration.map(value=>pulse(value/0.8)),...[Flight.qx,Flight.qy,Flight.qz].map((angle,i)=>{
    const torque=(-0.65*s[angle]-1.5*(s[Flight.wx+i]-orbit[i]))*(i===2?2400+s[Flight.fuel]*0.6:3300+s[Flight.fuel]*0.4)/165;
    return Math.abs(torque)<0.035?0:pulse(torque);
  })];
}
