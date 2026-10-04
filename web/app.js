import { createScene } from './scene.js';

const $ = id => document.getElementById(id);
let sim, scene, socket, snapshot, slot = 0, practice = false, active = false;
let sequence = 0, room = '', lastFrame = performance.now(), accumulator = 0, toastTimer;
let reconnectTimer, reconnectDelay = 500, latency = 0, pingAt = 0, lastSnapshotAt = 0;
let debriefKey = '';
const held = new Set();
const statusText = ['Approaching', 'Docked', 'Approach failed', 'Time expired'];
function toast(message, persistent = false) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer);
  if (!persistent) toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6000);
}
function controls() {
  if ($('manual').open || !active) return [0, 0, 0, 0, 0, 0];
  const down = key => held.has(key) ? 1 : 0;
  const amount = held.has('ShiftLeft') || held.has('ShiftRight') ? 0.2 : 1;
  return [down('KeyD') - down('KeyA'), down('KeyR') - down('KeyF'), down('KeyW') - down('KeyS'),
    down('ArrowDown') - down('ArrowUp'), down('ArrowRight') - down('ArrowLeft'), down('KeyQ') - down('KeyE')].map(v => v * amount);
}
function send(message) {
  if (socket?.readyState === WebSocket.OPEN) { socket.send(JSON.stringify(message)); return true; }
  toast('Connecting to the server. Try again in a moment.'); return false;
}
function current() { return Array.from({ length: 17 }, (_, i) => sim.component(i)); }
function restore(state) { state.forEach((value, i) => sim.restore(i, value)); accumulator = 0; }
function showFlight() {
  resetCamera();
  active = true; $('welcome').hidden = true; $('station-label').hidden = true; $('flight-ui').hidden = false;
  $('reset-practice').hidden = !practice; $('copy-link').hidden = practice; $('ready').hidden = practice;
  $('pilot-name').textContent = $('callsign').value.trim() || 'Pilot';
  document.activeElement?.blur();
}
function showResults(pilots) {
  const mine = pilots[slot], theirs = pilots[1 - slot];
  const key = `${practice ? 'practice' : snapshot.phase}:${mine.state[15]}`;
  if (debriefKey === key) return;
  debriefKey = key;
  $('result-title').textContent = mine.state[15] === 1 ? 'Docked' : 'Approach failed';
  const successful = pilots.filter(p => p.state[15] === 1);
  if (practice) $('result-description').textContent = 'Practice complete. Reset to fly another approach.';
  else if (snapshot.phase !== 'finished') $('result-description').textContent = 'Your attempt is complete. The other pilot is still flying.';
  else if (!successful.length) $('result-description').textContent = 'Neither pilot docked. Try another approach together.';
  else if (mine.state[16] === theirs.state[16]) $('result-description').textContent = 'Equal scores. You share the win.';
  else $('result-description').textContent = `${mine.state[16] > theirs.state[16] ? mine.name : theirs.name} wins this round.`;
  $('scores').replaceChildren(...pilots.filter(p => p.name).map(p => {
    const line = document.createElement('div'); line.className = 'score-row';
    const name = document.createElement('span'); name.textContent = `${p.name} · ${statusText[p.state[15]]}`;
    const score = document.createElement('strong'); score.textContent = `${Math.round(p.state[16])} / 1000`;
    line.append(name, score); return line;
  }));
  $('rematch').textContent = practice ? 'Try again' : 'Ready for rematch';
  $('rematch').disabled = !practice && snapshot.phase !== 'finished';
  $('results').hidden = false;
}
function stateReceived(message) {
  const previousPhase = snapshot?.phase;
  snapshot = message; lastSnapshotAt = performance.now();
  if (practice) return;
  const mine = message.pilots[slot], opponent = message.pilots[1 - slot];
  $('pilot-name').textContent = mine.name;
  restore(mine.state);
  if (message.phase === 'flight' && !mine.state[15]) {
    for (let i = 0; i < Math.min(12, Math.floor(latency / 2000 * 120)); i++) sim.step_flight(...controls());
  }
  $('mode').textContent = message.phase.toUpperCase();
  $('opponent-name').textContent = opponent.name || 'Waiting for a second pilot';
  $('opponent-range').textContent = opponent.name ? Math.hypot(...opponent.state.slice(0, 3)).toFixed(1) : '—';
  $('opponent-status').textContent = !opponent.name ? 'Share the room link to invite a friend.'
    : opponent.state[15] ? statusText[opponent.state[15]]
    : !opponent.connected ? 'Disconnected. Waiting for reconnection.'
    : message.phase === 'lobby' ? (opponent.ready ? 'Ready' : 'Not ready yet') : statusText[0];
  $('ready').disabled = mine.ready || message.phase === 'countdown' || message.phase === 'flight';
  $('ready').textContent = mine.ready ? 'Waiting for the other pilot' : message.phase === 'finished' ? 'Ready for rematch' : 'Ready to fly';
  $('announcement').textContent = message.phase === 'countdown' ? `T − ${Math.ceil(message.countdown)}` : message.phase === 'lobby' ? 'Awaiting both pilots' : '';
  if (previousPhase !== message.phase) $('results').hidden = true;
  if (mine.state[15]) {
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
        if (active && !practice) { active = false; $('flight-ui').hidden = true; $('welcome').hidden = false; $('station-label').hidden = false; }
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
  practice = true; slot = 0; snapshot = undefined; debriefKey = ''; held.clear(); sim.reset_flight(); accumulator = 0;
  $('results').hidden = true; $('mode').textContent = 'PRACTICE'; $('room-code').textContent = 'LOCAL';
  $('opponent-name').textContent = 'Solo practice'; $('opponent-range').textContent = '—';
  $('opponent-status').textContent = 'Start with W and S. You are already lined up with the port. Reset whenever you need to.';
  $('announcement').textContent = ''; showFlight();
}
function ready() { debriefKey = ''; $('results').hidden = true; held.clear(); send({ type: 'ready' }); }
function resetCamera() { scene.resetCamera(); document.querySelector('.reticle').hidden = false; }
function toggleCamera() {
  $('camera-mode').textContent = scene.toggleCamera() ? 'DOCKING CAM' : 'CHASE CAM';
  document.querySelector('.reticle').hidden = false;
}
$('create').onclick = () => send({ type: 'create', name: $('callsign').value.trim() });
$('join').onclick = () => send({ type: 'join', room: $('join-code').value.trim().toUpperCase(), name: $('callsign').value.trim() });
$('practice').onclick = startPractice; $('reset-practice').onclick = startPractice;
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
const keys = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyR', 'KeyF', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'];
addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement) return;
  if (active && keys.includes(event.code)) { event.preventDefault(); held.add(event.code); }
  if (!event.repeat && event.code === 'KeyC' && active) toggleCamera();
  if (!event.repeat && event.code === 'KeyV' && active && !$('manual').open) resetCamera();
  if (!event.repeat && event.code === 'KeyH') { held.clear(); $('manual').open ? $('manual').close() : $('manual').showModal(); }
});
addEventListener('keyup', event => held.delete(event.code));
addEventListener('blur', () => { held.clear(); stopCameraDrag(); });
document.addEventListener('visibilitychange', () => { held.clear(); accumulator = 0; });
function instruments(state) {
  $('range').textContent = Math.hypot(...state.slice(0, 3)).toFixed(2);
  $('closing').textContent = state[5].toFixed(3); $('offset').textContent = Math.hypot(state[0], state[1]).toFixed(3);
  const drift = Math.hypot(state[3], state[4]);
  $('drift').textContent = drift.toFixed(3);
  const alignment = sim.flight_alignment(), spin = sim.flight_spin();
  $('alignment').textContent = alignment.toFixed(2); $('spin').textContent = spin.toFixed(2);
  $('fuel').textContent = state[13].toFixed(2); $('fuel-bar').value = state[13];
  const seconds = Math.floor(state[14]); $('clock').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')} / 15:00`;
  $('thrust-mode').textContent = held.has('ShiftLeft') || held.has('ShiftRight') ? 'FINE CONTROL · 20% PULSE DUTY' : 'FULL THRUST · HOLD SHIFT FOR FINE';
  for (const [id, good] of [['closing', state[5] >= 0 && state[5] <= 0.15], ['offset', Math.hypot(state[0], state[1]) <= 0.25], ['drift', drift <= 0.05], ['alignment', alignment <= 3], ['spin', spin <= 0.5]]) $(id).className = good ? 'good' : 'warn';
  const braking = Math.max(0, state[5]) ** 2 / 0.4;
  $('guidance').textContent = state[15] ? statusText[state[15]]
    : !practice && snapshot?.phase !== 'flight' ? 'Both pilots must press Ready to fly.'
    : alignment > 15 ? 'Point at your port. Arrow keys turn; opposite arrows stop the turn.'
    : state[5] > 0.15 && braking + 2 > Math.max(0, -state[2]) ? 'Release Shift and hold S to brake. Slow below 0.15 m/s.'
    : state[5] > 0.35 ? 'Hold S to slow down. Releasing W does not stop the ship.'
    : spin > 0.5 ? 'Stop your rotation with the opposite arrow key, or Q / E for roll.'
    : alignment > 3 ? 'Use short arrow-key taps to point straight at the port.'
    : drift > 0.05 ? 'Sideways drift is too fast. Apply opposite thrust to slow it down.'
    : Math.hypot(state[0], state[1]) > 0.25 ? 'Use A / D to move sideways and R / F to move up or down. Centre the port.'
    : state[5] < 0.03 ? 'Hold W briefly to move toward the port. Watch your closing speed.'
    : state[2] > -5 && state[5] > 0.15 ? 'Hold S to slow below 0.15 m/s before docking.'
    : 'Release W to coast. Use S to slow down. Dock below 0.15 m/s.';
}
function frame(now) {
  const delta = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
  const axes = controls();
  if (active && (practice || snapshot?.phase === 'flight') && (practice || performance.now() - lastSnapshotAt < 1000)) {
    accumulator += delta;
    while (accumulator >= 1 / 120) { sim.step_flight(...axes); if (practice) sim.judge_flight(); accumulator -= 1 / 120; }
  }
  const state = current();
  if (active) instruments(state);
  if (practice && state[15]) showResults([{ name: $('pilot-name').textContent, state }, { name: '', state: new Array(17).fill(0) }]);
  scene.render(state, practice || !snapshot?.pilots[1 - slot]?.name ? null : snapshot.pilots[1 - slot].state, slot, active, axes, now);
  requestAnimationFrame(frame);
}
try {
  scene = createScene($('viewport'));
  const response = await fetch('/physics.wasm');
  if (!response.ok) throw new Error('Physics module is missing. Rebuild the project.');
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), { env: { acos: Math.acos } });
  sim = instance.exports; sim.reset_flight();
  $('practice').disabled = false;
  $('join-code').value = new URLSearchParams(location.search).get('room') || '';
  connect(); requestAnimationFrame(frame);
  setInterval(() => {
    if (!practice && snapshot?.phase === 'flight' && !snapshot.pilots[slot].state[15] && socket?.readyState === WebSocket.OPEN)
      send({ type: 'input', seq: ++sequence, axes: controls() });
  }, 50);
  setInterval(() => { if (socket?.readyState === WebSocket.OPEN) { pingAt = performance.now(); send({ type: 'ping' }); } }, 3000);
} catch (error) {
  $('connection').textContent = 'UNABLE TO START'; toast(error.message, true);
}
