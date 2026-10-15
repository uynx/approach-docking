import { Flight,Station } from './state.js';
import { createScene } from './scene.js';
import { dockingIndicators } from './flight-view.js';
import {pilotControls,tutorialLessons} from './tutorial.js';

const $ = id => document.getElementById(id);
const pixelBudgets={performance:960*540,balanced:1280*720,sharp:1920*1080};
let sim, scene, socket, snapshot, slot = 0, practice = false, active = false;
let sequence = 0, room = '', lastFrame = performance.now(), accumulator = 0, toastTimer;
let reconnectTimer, reconnectDelay = 500, latency = 0, pingAt = 0, lastSnapshotAt = 0;
let debriefKey = '';
let awardStarted=0,awardScore=0;
let demo;
let display;
const held = new Set();
const statusText = ['Approaching', 'Docked', 'Approach failed', 'Time expired', 'Ground impact'];
function toast(message, persistent = false) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer);
  if (!persistent) toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6000);
}
function controls() {
  if ($('manual').open || !active || demo) return [0, 0, 0, 0, 0, 0];
  const down = key => held.has(key) ? 1 : 0;
  const amount = held.has('ShiftLeft') || held.has('ShiftRight') ? 0.2 : 1;
  return [down('KeyD') - down('KeyA'), down('KeyR') - down('KeyF'), down('KeyW') - down('KeyS'),
    down('ArrowDown') - down('ArrowUp'), down('ArrowRight') - down('ArrowLeft'), Math.max(down('KeyQ'), down('Comma')) - Math.max(down('KeyE'), down('Period'))].map(v => v * amount);
}
function send(message) {
  if (socket?.readyState === WebSocket.OPEN) { socket.send(JSON.stringify(message)); return true; }
  toast('Connecting to the server. Try again in a moment.'); return false;
}
function current() {sim.read_state();return display.state;}
function restore(state) { state.forEach((value, i) => sim.restore(i, value)); accumulator = 0; }
function showFlight() {
  scene.resetSimulation();resetCamera();
  active = true; $('welcome').hidden = true; $('flight-ui').hidden = false;
  $('session').hidden=practice;$('multiplayer').setAttribute('aria-expanded',String(!practice));
  $('reset-practice').hidden = !practice; $('copy-link').hidden = practice; $('ready').hidden = practice;
  $('pilot-name').textContent = $('callsign').value.trim() || 'Pilot';
  document.activeElement?.blur();
}
function showResults(pilots,now=performance.now()) {
  const mine = pilots[slot], theirs = pilots[1 - slot];
  const key = `${practice ? 'practice' : snapshot.phase}:${mine.state[Flight.status]}`;
  if (debriefKey === key) return;
  debriefKey = key;
  if(mine.state[Flight.status]===2||mine.state[Flight.status]===4) {scene.impactView();$('camera-mode').textContent='CHASE CAM';}
  $('result-title').textContent = mine.state[Flight.status] === 1 ? 'Docked' : 'Approach failed';
  const successful = pilots.filter(p => p.state[Flight.status] === 1);
  if (practice) $('result-description').textContent = 'Practice complete. Reset to fly another approach.';
  else if (snapshot.phase !== 'finished') $('result-description').textContent = 'Your attempt is complete. The other pilot is still flying.';
  else if (!successful.length) $('result-description').textContent = 'Neither pilot docked. Try another approach together.';
  else if (mine.state[Flight.score] === theirs.state[Flight.score]) $('result-description').textContent = 'Equal scores. You share the win.';
  else $('result-description').textContent = `${mine.state[Flight.score] > theirs.state[Flight.score] ? mine.name : theirs.name} wins this round.`;
  $('scores').replaceChildren(...pilots.filter(p => p.name).map(p => {
    const line = document.createElement('div'); line.className = 'score-row';
    const name = document.createElement('span'); name.textContent = `${p.name} · ${statusText[p.state[Flight.status]]}`;
    const score = document.createElement('strong'); score.textContent = `${Math.round(p.state[Flight.score])} / 1000`;
    line.append(name, score); return line;
  }));
  $('rematch').textContent = practice ? 'Try again' : 'Ready for rematch';
  $('rematch').disabled = !practice && snapshot.phase !== 'finished';
  $('results').dataset.crash = String(mine.state[Flight.status] === 2 || mine.state[Flight.status] === 4);
  const docked=mine.state[Flight.status]===1;
  $('results').dataset.docked=String(docked);$('score-award').hidden=!docked;
  if(docked){awardStarted=now;awardScore=Math.round(mine.state[Flight.score]);$('award-value').textContent='0';}
  $('results').hidden = false;
}
function stateReceived(message) {
  const previousPhase = snapshot?.phase;
  if(!practice&&message.phase==='lobby'&&previousPhase!=='lobby')scene.resetSimulation();
  snapshot = message; lastSnapshotAt = performance.now();
  if (practice) return;
  const mine = message.pilots[slot], opponent = message.pilots[1 - slot];
  $('pilot-name').textContent = mine.name;
  restore(mine.state);
  opponent.state.forEach((v,i)=>sim.restore_opponent(i,v));sim.set_opponent(opponent.name?1:0);
  message.station?.forEach((v,i)=>sim.restore_station(i,v));
  if (message.phase === 'flight' && !mine.state[Flight.status]) {
    for (let i = 0; i < Math.min(12, Math.floor(latency / 2000 * 120)); i++) sim.step_flight(...controls(),slot);
  }
  $('mode').textContent = message.phase.toUpperCase();
  if(message.phase==='flight'&&previousPhase!=='flight'){$('session').hidden=true;$('multiplayer').setAttribute('aria-expanded','false');}
  $('opponent-name').textContent = opponent.name || 'Waiting for a second pilot';
  $('opponent-range').textContent = opponent.name ? Math.hypot(...opponent.state.slice(0, 3)).toFixed(1) : '—';
  $('opponent-status').textContent = !opponent.name ? 'Share the room link to invite a friend.'
    : opponent.state[Flight.status] ? statusText[opponent.state[Flight.status]]
    : !opponent.connected ? 'Disconnected. Waiting for reconnection.'
    : message.phase === 'lobby' ? (opponent.ready ? 'Ready' : 'Not ready yet') : statusText[0];
  $('ready').disabled = mine.ready || message.phase === 'countdown' || message.phase === 'flight';
  $('ready').textContent = mine.ready ? 'Waiting for the other pilot' : message.phase === 'finished' ? 'Ready for rematch' : 'Ready to fly';
  $('announcement').textContent = message.phase === 'countdown' ? `T − ${Math.ceil(message.countdown)}` : message.phase === 'lobby' ? 'Awaiting both pilots' : '';
  if (previousPhase !== message.phase) $('results').hidden = true;
  if (mine.state[Flight.status]) {
    if (previousPhase !== 'finished' && message.phase === 'finished') $('results').hidden = true;
    showResults(message.pilots);
  }
}
function connect() {
  clearTimeout(reconnectTimer);
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
  socket.addEventListener('open', () => {
    reconnectDelay = 500; $('connection').textContent = 'CONNECTED';
    $('create').disabled = false; $('join').disabled = false;
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem('approach-session')); } catch {}
    if (saved && !practice) send({ type: 'resume', ...saved });
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.type === 'joined') {
      room = message.room; slot = message.slot; sequence = Math.max(sequence, message.seq + 1);
      sessionStorage.setItem('approach-session', JSON.stringify({ room, token: message.token }));
      $('room-code').textContent = room; practice = false; showFlight();
    } else if (message.type === 'state') stateReceived(message);
    else if (message.type === 'pong') latency = performance.now() - pingAt;
    else if (message.type === 'error') {
      toast(message.message);
      if (/expired|unavailable|not found/.test(message.message)) {
        sessionStorage.removeItem('approach-session');
        if (active && !practice) startPractice(false);
      }
    }
  });
  socket.addEventListener('close', () => {
    held.clear(); $('connection').textContent = 'RECONNECTING';
    $('create').disabled = true; $('join').disabled = true;
    if (active && !practice) $('announcement').textContent = 'Connection lost. Reconnecting…';
    reconnectTimer = setTimeout(connect, reconnectDelay); reconnectDelay = Math.min(reconnectDelay * 2, 8000);
  });
}
function startPractice() {
  demo=undefined;$('tutorial').hidden=true;
  if(active&&!practice){if(socket?.readyState===WebSocket.OPEN)send({type:'leave'});sessionStorage.removeItem('approach-session');room='';}
  practice = true; slot = 0; snapshot = undefined; debriefKey = ''; held.clear(); sim.reset_flight(crypto.getRandomValues(new Uint32Array(1))[0]||1); accumulator = 0;
  $('results').hidden = true;$('score-award').hidden=true; $('mode').textContent = 'PRACTICE'; $('room-code').textContent = 'LOCAL';
  $('opponent-name').textContent = 'Solo practice'; $('opponent-range').textContent = '—';
  $('opponent-status').textContent = 'Solo practice';
  $('announcement').textContent = ''; showFlight();
}
function startLesson(index=0) {
  startPractice(false);
  if(scene.resetCamera())toggleCamera();
  demo={index,paused:false,clock:0,finishedAt:null};
  const lesson=tutorialLessons[index];
  for(const [field,value] of Object.entries(lesson.pose))sim.restore(Number(field),value);
  if(lesson.opponent){sim.set_opponent(1);for(const [field,value] of Object.entries(lesson.opponent))sim.restore_opponent(Number(field),value);}
  $('tutorial').hidden=false;$('mode').textContent='WATCHING TUTORIAL';
  $('tutorial-step').textContent=`FLIGHT SCHOOL · ${index+1} / ${tutorialLessons.length}`;
  $('tutorial-title').textContent=lesson.title;$('tutorial-tip').textContent=lesson.tip;
  $('tutorial-scene').value=String(index);
  $('tutorial-pause').textContent='Pause';$('tutorial-pause').setAttribute('aria-label','Pause tutorial');
  $('tutorial-next').textContent='Next example';
}
function tutorialCaption(state,axes) {
  const lesson=tutorialLessons[demo.index],cues=dockingIndicators(state);
  $('tutorial-tip').textContent=lesson.id!=='dock'?lesson.tip:state[Flight.status]===1
    ?`Soft capture. ${Math.round(state[Flight.score])} points from a real flight. Precision, fuel and time all count.`
    :cues.alignment>1?'Arrow keys turn the capsule. Opposite thrust stops the turn. First point the nose at the port.'
    :Math.hypot(state[Flight.x],state[Flight.y])>0.1?'A / D and R / F centre the capsule. Opposite thrust removes drift before the approach.'
    :state[Flight.z]<-5?'W accelerates toward the port. Releasing it lets you coast. Watch the closing speed.'
    :state[Flight.vz]>0.12?'S brakes the approach. Slow below 0.15 m/s before contact. Start braking while you still have room.'
    :'Use short, gentle pulses near the collar. Keep the nose straight and sideways drift close to zero.';
  const keys=[['A','D'],['F','R'],['S','W'],['↑','↓'],['←','→'],['E','Q']];
  $('tutorial-keys').textContent=state[Flight.status]?'COASTING · WATCH THE RESULT':axes.map((v,i)=>Math.abs(v)>0.008?keys[i][v>0?1:0]:'').filter(Boolean).join('  ')||'COASTING';
}
function ready() { debriefKey = ''; $('results').hidden = true; held.clear(); send({ type: 'ready' }); }
function resetCamera() { $('camera-mode').textContent = scene.resetCamera() ? 'DOCKING CAM' : 'CHASE CAM'; document.querySelector('.reticle').hidden = false; }
function toggleCamera() {
  $('camera-mode').textContent = scene.toggleCamera() ? 'DOCKING CAM' : 'CHASE CAM';
  document.querySelector('.reticle').hidden = false;
}
$('create').onclick = () => send({ type: 'create', name: $('callsign').value.trim() });
$('join').onclick = () => send({ type: 'join', room: $('join-code').value.trim().toUpperCase(), name: $('callsign').value.trim() });
$('practice').onclick = () => startPractice(); $('reset-practice').onclick = () => startPractice();
$('ready').onclick = ready; $('rematch').onclick = () => practice ? startPractice() : ready();
$('close-results').onclick = () => { $('results').hidden = true; };
$('leave').onclick = () => { if (!practice) send({ type: 'leave' }); sessionStorage.removeItem('approach-session'); location.href = '/'; };
$('copy-link').onclick = async () => {
  const link = `${location.origin}/?room=${encodeURIComponent(room)}`;
  try { await navigator.clipboard.writeText(link); toast('Invite link copied. Send it to your other pilot.'); }
  catch { toast(`Room ${room}. Invite link: ${link}`); }
};
$('camera').onclick = toggleCamera;
$('center-view').onclick = resetCamera;
$('watch-tutorial').onclick=()=>{$('manual').close();startLesson();};
$('crash-lab').onclick=()=>startLesson(4);
for(const [index,lesson] of tutorialLessons.entries()) {
  const option=document.createElement('option');option.value=String(index);option.textContent=lesson.title;$('tutorial-scene').append(option);
}
$('tutorial-scene').onchange=()=>startLesson(Number($('tutorial-scene').value));
$('tutorial-next').onclick=()=>startLesson((demo.index+1)%tutorialLessons.length);
$('tutorial-exit').onclick=()=>startPractice(false);
$('tutorial-pause').onclick=()=>{
  demo.paused=!demo.paused;accumulator=0;
  $('tutorial-pause').textContent=demo.paused?'Resume':'Pause';
  $('tutorial-pause').setAttribute('aria-label',demo.paused?'Resume tutorial':'Pause tutorial');
};
$('multiplayer').onclick=()=>{
  const panel=practice||!active?$('welcome'):$('session');
  panel.hidden=!panel.hidden;$('multiplayer').setAttribute('aria-expanded',String(!panel.hidden));held.clear();
};
$('fullscreen').onclick=async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
  catch{toast('Use your browser full-screen shortcut.');}
};
let cameraPointer, cameraX, cameraY;
const canvas = $('viewport');
canvas.addEventListener('contextmenu', event => { if (active) event.preventDefault(); });
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 2 || !active) return;
  event.preventDefault(); canvas.setPointerCapture(event.pointerId);
  cameraPointer = event.pointerId; cameraX = event.clientX; cameraY = event.clientY;
  canvas.style.cursor = 'grabbing';
});
canvas.addEventListener('pointermove', event => {
  if (event.pointerId !== cameraPointer || !(event.buttons & 2)) return;
  document.querySelector('.reticle').hidden = scene.moveCamera(event.clientX - cameraX, event.clientY - cameraY);
  cameraX = event.clientX; cameraY = event.clientY;
});
function stopCameraDrag() {
  if (cameraPointer !== undefined && canvas.hasPointerCapture(cameraPointer)) canvas.releasePointerCapture(cameraPointer);
  cameraPointer = undefined; canvas.style.cursor = '';
}
canvas.addEventListener('pointerup', stopCameraDrag);
canvas.addEventListener('pointercancel', stopCameraDrag);
canvas.addEventListener('lostpointercapture', stopCameraDrag);
$('help-button').onclick = () => { held.clear(); $('manual').showModal(); };
$('close-manual').onclick = () => $('manual').close();
const keys = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyR', 'KeyF', 'KeyQ', 'KeyE', 'Comma', 'Period', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'];
addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  if (active && keys.includes(event.code)) { event.preventDefault(); held.add(event.code); }
  if (!event.repeat && event.code === 'KeyC' && active) toggleCamera();
  if (!event.repeat && event.code === 'KeyV' && active && !$('manual').open) resetCamera();
  if (!event.repeat && event.code === 'KeyH') { held.clear(); $('manual').open ? $('manual').close() : $('manual').showModal(); }
  if (!event.repeat && event.code === 'KeyT' && practice && !$('manual').open) startPractice();
  if(event.code==='Escape'){$('welcome').hidden=true;$('session').hidden=true;$('multiplayer').setAttribute('aria-expanded','false');}
});
addEventListener('keyup', event => held.delete(event.code));
addEventListener('blur', () => { held.clear(); stopCameraDrag(); });
document.addEventListener('visibilitychange', () => { held.clear(); accumulator = 0; });
function instruments(state,thermal,axes) {
  const {altitude,heat,airspeed}=thermal;
  $('entry-telemetry').hidden=altitude>150000;
  $('entry-telemetry').textContent=`ALT ${(altitude/1000).toFixed(2)} km · AIR ${(airspeed/1000).toFixed(2)} km/s · HEATING ${(heat/1000).toFixed(1)} kW/m²`;
  const indicators = dockingIndicators(state);
  $('bank').textContent = indicators.roll.toFixed(1);
  $('attitude-command').textContent = axes[3] ? (axes[3] < 0 ? 'PITCH UP · TAIL DOWN' : 'PITCH DOWN · TAIL UP') : axes[4] ? (axes[4] > 0 ? 'YAW RIGHT · TAIL LEFT' : 'YAW LEFT · TAIL RIGHT') : axes[5] ? 'ROLL · OPPOSITE KEY TO STOP' : 'ARROWS TILT · , / . ROLL';
  $('docking-aid').dataset.state = indicators.ready ? 'ready' : !indicators.speed ? 'brake' : 'correct';
  $('capture-status').textContent = state[Flight.status] ? statusText[state[Flight.status]].toUpperCase() : indicators.ready ? 'WITHIN CAPTURE LIMITS' : !indicators.speed ? 'CORRECT CLOSING SPEED' : 'CORRECT ALIGNMENT / DRIFT';
  for (const id of ['speed', 'offset', 'drift', 'rotation']) {
    $('cue-' + id).dataset.good = String(indicators[id]);
    $('cue-' + id).setAttribute('aria-label', id + (indicators[id] ? ' within limit' : ' outside limit'));
  }
  $('range').textContent = Math.hypot(...state.slice(0, 3)).toFixed(2);
  $('closing').textContent = state[Flight.vz].toFixed(3); $('offset').textContent = Math.hypot(state[Flight.x], state[Flight.y]).toFixed(3);
  const drift = Math.hypot(state[Flight.vx], state[Flight.vy]);
  $('drift').textContent = drift.toFixed(3);
  const alignment = indicators.alignment, spin = indicators.spin;
  $('alignment').textContent = alignment.toFixed(2); $('spin').textContent = spin.toFixed(2);
  $('fuel').textContent = state[Flight.fuel].toFixed(2); $('fuel-bar').value = state[Flight.fuel];
  const seconds = Math.floor(state[Flight.elapsed]); $('clock').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')} / 15:00`;
  $('thrust-mode').textContent = held.has('ShiftLeft') || held.has('ShiftRight') ? 'FINE CONTROL · 20% PULSE DUTY' : 'FULL THRUST · HOLD SHIFT FOR FINE';
  for (const [id, good] of [['closing', state[Flight.vz] >= 0 && state[Flight.vz] <= 0.15], ['offset', Math.hypot(state[Flight.x], state[Flight.y]) <= 0.25], ['drift', drift <= 0.05], ['alignment', alignment <= 3], ['spin', spin <= 0.5]]) $(id).className = good ? 'good' : 'warn';
  const braking = Math.max(0, state[Flight.vz]) ** 2 / 1.6;
  $('guidance').textContent = state[Flight.status] ? statusText[state[Flight.status]]
    : !practice && snapshot?.phase !== 'flight' ? 'Both pilots must press Ready to fly.'
    : alignment > 15 ? 'Point at your port. Arrow keys turn; opposite arrows stop the turn.'
    : state[Flight.vz] > 0.15 && braking + 2 > Math.max(0, -state[Flight.z]) ? 'Release Shift and hold S to brake. Slow below 0.15 m/s.'
    : state[Flight.vz] > 0.35 ? 'Hold S to slow down. Releasing W does not stop the ship.'
    : spin > 0.5 ? 'Stop your rotation with the opposite arrow key, or Q / E for roll.'
    : alignment > 3 ? 'Use short arrow-key taps to point straight at the port.'
    : drift > 0.05 ? 'Sideways drift is too fast. Apply opposite thrust to slow it down.'
    : Math.hypot(state[Flight.x], state[Flight.y]) > 0.25 ? 'Use A / D to move sideways and R / F to move up or down. Centre the port.'
    : state[Flight.vz] < 0.03 ? 'Hold W briefly to move toward the port. Watch your closing speed.'
    : state[Flight.z] > -5 && state[Flight.vz] > 0.15 ? 'Hold S to slow below 0.15 m/s before docking.'
    : 'Release W to coast. Use S to slow down. Dock below 0.15 m/s.';
}
function frame(now) {
  const delta = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
  let axes = controls();
  if(demo&&!demo.paused)demo.clock+=delta*1000;
  if (active && !demo?.paused && (practice || snapshot?.phase === 'flight' || snapshot?.phase === 'finished') && (practice || performance.now() - lastSnapshotAt < 1000)) {
    accumulator += delta*(demo&&!sim.component(Flight.status)?2:1);
    const deadline=performance.now()+8;
    while (accumulator >= 1 / 120) {
      if(demo)axes=demo.index===0?pilotControls(current()):[0,0,demo.index===1?1:0,0,0,0];
      sim.step_flight(...axes,slot); if (practice) sim.judge_flight(slot); accumulator -= 1 / 120;
      if(performance.now()>=deadline)break;
    }
  }
  sim.read_frame(slot);
  const state=display.state;
  const thermal={altitude:display.thermal[0],heat:display.thermal[1],airspeed:display.thermal[2],guidance:display.guidance};
  if (active) instruments(display.guidance,thermal,axes);
  if (practice && state[Flight.status]) showResults([{ name: $('pilot-name').textContent, state }, { name: '', state: new Array(17).fill(0) }],now);
  if(demo) {
    tutorialCaption(state,axes);
    if(state[Flight.status]) {
      if(demo.index>0)$('results').hidden=true;
      if(demo.finishedAt===null)demo.finishedAt=demo.clock;
      if(demo.clock-demo.finishedAt>6000&&demo.index<tutorialLessons.length-1){startLesson(demo.index+1);requestAnimationFrame(frame);return;}
      if(demo.index===tutorialLessons.length-1)$('tutorial-next').textContent='Watch again';
    }
  }
  if(!$('score-award').hidden){const progress=Math.min(1,Math.max(0,(now-awardStarted)/1200));$('award-value').textContent=String(Math.round(awardScore*(1-(1-progress)**3)));}
  const opponent=demo&&tutorialLessons[demo.index].opponent?display.opponent:practice||!snapshot?.pilots[1-slot]?.name?null:display.opponent;
  scene.render(state,opponent,slot,active,axes,demo?demo.clock:now,display.station,thermal);
  requestAnimationFrame(frame);
}
try {
  scene = createScene($('viewport'),{pixelBudget:pixelBudgets.balanced});
  $('graphics-quality').onchange=()=>scene.setPixelBudget(pixelBudgets[$('graphics-quality').value]);
  const response=await fetch('/physics.wasm');
  if (!response.ok) throw new Error('Physics module is missing. Rebuild the project.');
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), { env: { acos: Math.acos, sin: Math.sin, cos: Math.cos, exp: Math.exp, log: Math.log } });
  sim = instance.exports;
  const size=Object.keys(Flight).length,stationSize=Object.keys(Station).length;
  if(sim.state_size()!==size||sim.station_size()!==stationSize||sim.frame_size?.()!==size*3+stationSize+3) throw new Error('Physics and display versions differ. Reload after rebuilding.');
  const values=new Float64Array(sim.memory.buffer,sim.read_frame(slot),sim.frame_size()),guideAt=size*2+stationSize;
  display={state:values.subarray(0,size),opponent:values.subarray(size,size*2),station:values.subarray(size*2,guideAt),guidance:values.subarray(guideAt,guideAt+size),thermal:values.subarray(guideAt+size)};
  sim.reset_flight();
  $('join-code').value = new URLSearchParams(location.search).get('room') || '';
  const saved=sessionStorage.getItem('approach-session');
  connect();
  await scene.ready;
  $('practice').disabled = false;$('crash-lab').disabled=false;
  if(!active&&new URLSearchParams(location.search).has('lab'))startLesson(4);
  else if(!active&&!$('join-code').value&&!saved)startPractice(false);
  else if($('join-code').value){$('welcome').hidden=false;$('multiplayer').setAttribute('aria-expanded','true');}
  requestAnimationFrame(frame);
  setInterval(() => {
    if (!practice && snapshot?.phase === 'flight' && !snapshot.pilots[slot].state[Flight.status] && socket?.readyState === WebSocket.OPEN)
      send({ type: 'input', seq: ++sequence, axes: controls() });
  }, 50);
  setInterval(() => { if (socket?.readyState === WebSocket.OPEN) { pingAt = performance.now(); send({ type: 'ping' }); } }, 3000);
} catch (error) {
  $('connection').textContent = 'UNABLE TO START'; toast(error.message, true);
}
