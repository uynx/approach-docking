import {Flight} from './state.js';
import {createScene} from './scene.js';
import {powers,readBattle,direction,aimMovement,controlAxes} from './combat-view.js';

const $=id=>document.getElementById(id),held=new Set();
let sim,scene,display,combatValues,socket,battle,snapshot;
let mode='hangar',slot=0,room='',sequence=0,lastFrame=performance.now(),accumulator=0;
let aim=[1,0,0],fire=false,pendingPower=-1,ready=false,latency=0,pingAt=0,lastSnapshotAt=0;
let reconnectTimer,reconnectDelay=500,toastTimer,stability=0,trainingStage=0;
const sessionKey='approach-combat-session';
const current=()=>{sim.read_frame(slot);return display.state;};
const enabled=()=>mode==='training'||mode==='online'&&snapshot?.phase==='flight'&&battle.fighters[slot].health>0;
const axes=()=>controlAxes(current(),held,aim,enabled()&&!$('controls-dialog').open&&!document.hidden);
function toast(message) {
  $('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{$('toast').hidden=true;},6500);
}
function send(message){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));}
function clearControls(){held.clear();fire=false;pendingPower=-1;}
function releaseMouse(){if(document.pointerLockElement)document.exitPointerLock();clearControls();}
function showFlight(){
  $('hangar').hidden=true;$('combat-ui').hidden=false;$('training-panel').hidden=mode!=='training';
  $('room-panel').hidden=mode!=='online';$('engage').hidden=!enabled()||!!document.pointerLockElement;
}
function restore(message) {
  const previous=snapshot,oldRound=battle?.number;
  snapshot=message;lastSnapshotAt=performance.now();battle=readBattle(message.combat.packed);
  message.pilots[slot].state.forEach((v,i)=>sim.restore(i,v));
  message.pilots[1-slot].state.forEach((v,i)=>sim.restore_opponent(i,v));sim.set_opponent(1);
  message.station.forEach((v,i)=>sim.restore_station(i,v));
  message.combat.packed.forEach((v,i)=>sim.restore_combat(i,Number(v)));
  if(oldRound!==battle.number||previous?.phase==='finished'&&message.phase==='lobby')scene.resetSimulation();
  if(oldRound!==battle.number||previous?.phase!==message.phase){
    clearControls();accumulator=0;aim=direction(current());scene.resetCamera();
  }
  if(previous?.phase!==message.phase&&message.phase==='flight')$('room-panel').hidden=true;
  const opponent=message.pilots[1-slot];
  $('combat-room').textContent=room;$('opponent-name').textContent=opponent.name||'Waiting for opponent';
  $('target-name').textContent=opponent.name||'Target';
  $('room-status').textContent=!opponent.name?'Share the room code or invite link.':!opponent.connected?'Opponent disconnected. Ten seconds to reconnect.':message.phase==='lobby'?(opponent.ready?'Opponent ready.':'Opponent is choosing when to start.'):'First to three round wins.';
  $('ready-combat').disabled=message.pilots[slot].ready||!['lobby','finished'].includes(message.phase);
  $('ready-combat').textContent=message.phase==='finished'?'Ready for rematch':'Ready to fight';
  $('combat-mode').textContent=message.phase==='flight'?'LIVE PVP':message.phase.toUpperCase();
  if(message.phase==='countdown')$('round-message').textContent=`Fight in ${Math.ceil(message.countdown)}`;
  else if(message.phase==='intermission'||message.phase==='finished') {
    const winner=battle.result<0?'Draw':`${message.pilots[battle.result].name} wins`;
    $('round-message').textContent=message.phase==='finished'?`${winner} the match`:`${winner} round ${battle.number} · Next round in ${Math.ceil(message.countdown)}`;
    if(message.phase==='finished'){$('room-panel').hidden=false;releaseMouse();}
  } else $('round-message').textContent=message.phase==='lobby'?'Both pilots press Ready to fight':'';
  $('engage').hidden=!enabled()||!!document.pointerLockElement;
}
function connect(){
  clearTimeout(reconnectTimer);
  socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws`);
  socket.addEventListener('open',()=>{
    reconnectDelay=500;$('connection').textContent='CONNECTED';
    $('create-combat').disabled=!ready;$('join-combat').disabled=!ready;
    let saved;try{saved=JSON.parse(sessionStorage.getItem(sessionKey));}catch{}
    if(saved&&mode!=='training')send({type:'resume',...saved});
  });
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.type==='joined'){
      mode='online';room=message.room;slot=message.slot;sequence=Math.max(sequence,message.seq+1);
      sessionStorage.setItem(sessionKey,JSON.stringify({room,token:message.token}));
      snapshot=undefined;battle=undefined;sim.reset_combat(0,0);scene.resetSimulation();showFlight();
    }else if(message.type==='state'&&message.mode==='combat'&&mode==='online')restore(message);
    else if(message.type==='pong')latency=performance.now()-pingAt;
    else if(message.type==='error'){
      toast(message.message);
      if(/expired|unavailable|not found/.test(message.message)){sessionStorage.removeItem(sessionKey);room='';mode='hangar';$('hangar').hidden=false;$('combat-ui').hidden=true;}
    }
  });
  socket.addEventListener('close',()=>{
    clearControls();$('connection').textContent='RECONNECTING';$('create-combat').disabled=true;$('join-combat').disabled=true;
    if(mode==='online')$('round-message').textContent='Connection lost. Reconnecting…';
    reconnectTimer=setTimeout(connect,reconnectDelay);reconnectDelay=Math.min(8000,reconnectDelay*2);
  });
}
function leaveRoom(){
  if(room)send({type:'leave'});room='';snapshot=undefined;sessionStorage.removeItem(sessionKey);releaseMouse();
}
function startTraining(){
  leaveRoom();mode='training';slot=0;sim.reset_combat($('arena-map').value==='scrapyard'?1:0,1);
  scene.resetSimulation();scene.resetCamera();clearControls();stability=0;trainingStage=0;accumulator=0;
  battle=readBattle(new Float64Array(sim.memory.buffer,sim.read_combat(),sim.combat_size()));aim=direction(current());
  $('combat-mode').textContent='RECOVERY TRAINING';$('target-name').textContent='Practice target';$('round-message').textContent='';showFlight();
}
function transmit(){
  if(mode!=='online'||snapshot?.phase!=='flight'||socket?.readyState!==WebSocket.OPEN)return;
  const message={type:'input',seq:++sequence,axes:axes(),fire:fire||held.has('Space')};
  if(pendingPower>=0)message.power=pendingPower;
  pendingPower=-1;send(message);
}
function usePower(index){if(enabled()){pendingPower=index;transmit();}}
function training(state,dt){
  const speed=Math.hypot(...state.slice(3,6)),spin=Math.hypot(...state.slice(10,13))*180/Math.PI;
  if(trainingStage<2){
    const stable=trainingStage===0?spin<3:speed<0.5&&spin<3;
    stability=stable?Math.min(2,stability+dt):0;
    if(stability>=2){trainingStage++;stability=0;}
  }
  $('training-progress').value=trainingStage===2?2:stability;
  $('training-stage').textContent=['Arrest the spin','Cancel the drift','Control recovered'][trainingStage];
  $('training-tip').textContent=[
    'Your ship starts in a spin. Keep your aim steady while the attitude jets counter it. Recovery override on 2 adds damping.',
    'Now cancel your drift. Hold B to apply opposite thrust, or use WASD and R/F yourself. Keep speed below 0.5 m/s for two seconds.',
    'You recovered stable flight. Aim at the practice target and fire. Collect supply pods to try the powers. Restart for another recovery.'
  ][trainingStage];
  if(battle.fighters[0].health<=0)$('training-tip').textContent='Your hull is disabled. Restart training for a repaired ship.';
}
function instruments(state,dt,now){
  if(!battle)return;
  const mine=battle.fighters[slot],enemy=battle.fighters[1-slot];
  $('map-name').textContent=battle.map?'ORBITAL SCRAPYARD':'STATION SHIPYARD';
  $('combat-round').textContent=battle.number;$('combat-score').textContent=`${battle.wins[slot]} : ${battle.wins[1-slot]}`;
  const seconds=Math.ceil(battle.remaining/120);$('combat-clock').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  $('hull-value').textContent=Math.ceil(mine.health);$('hull-bar').value=mine.health;document.body.dataset.damaged=String(mine.health<50);
  $('propulsion').textContent=`${Math.round(mine.propulsion*100)}%`;$('steering').textContent=`${Math.round(mine.steering*100)}%`;
  $('combat-fuel').textContent=state[Flight.fuel].toFixed(1);$('combat-speed').textContent=`${Math.hypot(...state.slice(3,6)).toFixed(1)} m/s`;
  $('combat-spin').textContent=`${(Math.hypot(...state.slice(10,13))*180/Math.PI).toFixed(1)}°/s`;$('combat-shield').textContent=Math.ceil(mine.shield);
  for(let i=0;i<2;i++){
    const button=$(`power-${i}`),item=powers[mine.items[i]];
    button.querySelector('strong').textContent=item.name;button.querySelector('small').textContent=item.tip;
    button.disabled=!mine.items[i]||!enabled();button.setAttribute('aria-label',mine.items[i]===6?'Use recovery override':`Use ${item.name.toLowerCase()}`);
  }
  $('weapon-status').textContent=mine.reload>0?'LASER RECHARGING':'LASER READY';
  $('aim-reticle').dataset.hit=String(mine.shotHit===1-slot&&mine.shotAge<15);
  const warnings=[];
  if(mine.spin>0)warnings.push(`SPIN BUG ATTACHED · ${(mine.spin/120).toFixed(1)} s`);
  if(mine.stabilize>0)warnings.push(`RECOVERY OVERRIDE · ${(mine.stabilize/120).toFixed(1)} s`);
  if(mine.steering<0.8||mine.propulsion<0.8)warnings.push('THRUSTER DAMAGE · Expect unequal thrust');
  const position=[state[0]+(slot?18:-18),state[1],state[2]-3.2];
  if(Math.hypot(...position)>180)warnings.push('OUTSIDE ARENA · Return to avoid hull damage');
  if(mode==='online'&&now-lastSnapshotAt>1000)warnings.push('CONNECTION STALE · Controls suspended');
  $('damage-warning').textContent=warnings.join(' · ');
  const other=display.opponent,range=Math.hypot(state[0]-other[0]+(slot?36:-36),state[1]-other[1],state[2]-other[2]);
  $('target-range').textContent=`${range.toFixed(0)} m · ${Math.ceil(enemy.health)} HULL`;
  if(mode==='training')training(state,dt);
}
const canvas=$('viewport');
async function captureMouse(){if(enabled())try{await canvas.requestPointerLock();}catch{toast('Mouse capture is unavailable. Drag with the left mouse button to aim; Space fires.');}}
$('engage').onclick=captureMouse;
canvas.addEventListener('contextmenu',event=>event.preventDefault());
canvas.addEventListener('pointerdown',event=>{
  if(!enabled())return;
  if(event.button===0){if(document.pointerLockElement===canvas)fire=true;else captureMouse();}
  if(event.button===2)held.add('MouseRight');
});
canvas.addEventListener('pointermove',event=>{
  if(!enabled())return;
  if(held.has('MouseRight'))scene.moveCamera(event.movementX,event.movementY);
  else if(document.pointerLockElement===canvas||(event.buttons&1))aim=aimMovement(aim,current(),event.movementX,event.movementY);
});
addEventListener('pointerup',event=>{if(event.button===0)fire=false;if(event.button===2){held.delete('MouseRight');scene.resetCamera();}});
document.addEventListener('pointerlockchange',()=>{clearControls();$('engage').hidden=!enabled()||document.pointerLockElement===canvas;});
const keys=['KeyW','KeyS','KeyA','KeyD','KeyR','KeyF','KeyQ','KeyE','KeyB','Space'];
addEventListener('keydown',event=>{
  if(event.target instanceof HTMLInputElement||event.target instanceof HTMLSelectElement||$('controls-dialog').open)return;
  if(keys.includes(event.code)&&enabled()){event.preventDefault();held.add(event.code);}
  if(!event.repeat&&event.code==='Digit1')usePower(0);
  if(!event.repeat&&event.code==='Digit2')usePower(1);
  if(event.code==='KeyV')scene.resetCamera();
});
addEventListener('keyup',event=>held.delete(event.code));
addEventListener('blur',()=>{clearControls();transmit();});
document.addEventListener('visibilitychange',()=>{clearControls();accumulator=0;transmit();});
$('power-0').onclick=()=>usePower(0);$('power-1').onclick=()=>usePower(1);
$('training').onclick=startTraining;$('reset-training').onclick=startTraining;
$('create-combat').onclick=()=>{leaveRoom();mode='hangar';send({type:'create',mode:'combat',map:$('arena-map').value,name:$('callsign').value.trim()});};
$('join-combat').onclick=()=>{leaveRoom();mode='hangar';send({type:'join',room:$('join-code').value.trim().toUpperCase(),name:$('callsign').value.trim()});};
$('ready-combat').onclick=()=>{clearControls();send({type:'ready'});};
$('leave-combat').onclick=()=>{leaveRoom();mode='hangar';battle=undefined;$('hangar').hidden=false;$('combat-ui').hidden=true;};
$('menu').onclick=()=>{
  releaseMouse();if(mode==='online')$('room-panel').hidden=!$('room-panel').hidden;
  else $('hangar').hidden=!$('hangar').hidden;
};
$('help').onclick=()=>{releaseMouse();$('controls-dialog').showModal();};$('close-controls').onclick=()=>$('controls-dialog').close();
$('copy-invite').onclick=async()=>{
  const url=`${location.origin}/arena?room=${room}`;
  try{await navigator.clipboard.writeText(url);toast('Invite link copied.');}catch{toast(url);}
};
$('callsign').onchange=()=>{try{localStorage.setItem('approach-callsign',$('callsign').value.trim());}catch{}};
function frame(now){
  const dt=Math.min(0.1,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
  const commands=axes(),fresh=mode==='training'||mode==='online'&&now-lastSnapshotAt<1000;
  if(enabled()&&fresh&&!document.hidden){
    accumulator+=dt;
    while(accumulator>=1/120){
      sim.step_combat(...commands,mode==='training'&&(fire||held.has('Space'))?1:0,mode==='training'?pendingPower:-1,slot,mode==='training'?1:0);
      if(mode==='training')pendingPower=-1;accumulator-=1/120;
    }
  }
  sim.read_frame(slot);
  if(mode==='training')battle=readBattle(new Float64Array(sim.memory.buffer,sim.read_combat(),sim.combat_size()));
  if(mode!=='hangar')instruments(display.state,dt,now);
  const thermal={altitude:display.thermal[0],heat:display.thermal[1],airspeed:display.thermal[2]};
  scene.render(display.state,mode==='hangar'?null:display.opponent,slot,mode!=='hangar',commands,now,display.station,thermal,battle);
  requestAnimationFrame(frame);
}
try{
  scene=createScene(canvas);
  const response=await fetch('/physics.wasm');if(!response.ok)throw new Error('The flight simulation is missing.');
  const {instance}=await WebAssembly.instantiate(await response.arrayBuffer(),{env:{acos:Math.acos,sin:Math.sin,cos:Math.cos,exp:Math.exp,log:Math.log}});
  sim=instance.exports;sim.reset_combat(0,0);
  const size=sim.state_size(),stationSize=sim.station_size(),values=new Float64Array(sim.memory.buffer,sim.read_frame(0),sim.frame_size()),guideAt=size*2+stationSize;
  display={state:values.subarray(0,size),opponent:values.subarray(size,size*2),station:values.subarray(size*2,guideAt),thermal:values.subarray(guideAt+size)};
  combatValues=new Float64Array(sim.memory.buffer,sim.read_combat(),sim.combat_size());readBattle(combatValues);
  let callsign;try{callsign=localStorage.getItem('approach-callsign');}catch{}
  if(!callsign){const bytes=crypto.getRandomValues(new Uint8Array(6));callsign='PILOT-'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();}
  $('callsign').value=callsign;
  $('join-code').value=new URLSearchParams(location.search).get('room')||'';
  connect();await scene.ready;ready=true;
  $('training').disabled=false;$('create-combat').disabled=socket.readyState!==WebSocket.OPEN;$('join-combat').disabled=socket.readyState!==WebSocket.OPEN;
  requestAnimationFrame(frame);setInterval(transmit,50);
  setInterval(()=>{if(socket.readyState===WebSocket.OPEN){pingAt=performance.now();send({type:'ping'});}},3000);
}catch(error){$('connection').textContent='UNABLE TO START';toast(error.message);}
