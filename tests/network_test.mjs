import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const server = spawn(process.argv[2], ['--port', '18765', '--web', process.argv[3]], { stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stderr.on('data', b => { log += b; });
const sockets = [];
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch('http://127.0.0.1:18765/health')).ok) break; } catch {}
    if (server.exitCode !== null) throw new Error(log);
    await new Promise(r => setTimeout(r, 50));
  }
  assert.equal((await fetch('http://127.0.0.1:18765/physics.wasm')).headers.get('content-type'), 'application/wasm');
  async function client() {
    const ws = new WebSocket('ws://127.0.0.1:18765/ws');
    sockets.push(ws);
    const messages = [];
    ws.addEventListener('message', e => messages.push(JSON.parse(e.data)));
    await once(ws, 'open');
    return { ws, messages, send: message => ws.send(JSON.stringify(message)) };
  }
  async function wait(c, predicate) {
    for (let i = 0; i < 120; i++) {
      const found = c.messages.find(predicate);
      if (found) return found;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error('Timed out waiting for message: ' + JSON.stringify(c.messages.slice(-2)));
  }
  const a = await client(), b = await client();
  a.send({ type: 'create', name: 'Alice' });
  const joined = await wait(a, m => m.type === 'joined');
  b.send({ type: 'join', room: joined.room, name: 'Bob' });
  await wait(b, m => m.type === 'joined');
  a.send({ type: 'ready' }); b.send({ type: 'ready' });
  await wait(a, m => m.type === 'state' && m.phase === 'flight');
  a.send({ type: 'input', seq: 1, axes: [0, 0, 1, 0, 0, 0] });
  await wait(b, m => m.type === 'state' && m.pilots[0].state[5] > 0.01);
  a.send({ type: 'input', seq: 2, axes: [0, 0, 999, 0, 0, 0] });
  await wait(a, m => m.type === 'error' && m.message.includes('Thrust'));
  a.ws.close();
  await wait(b, m => m.type === 'state' && !m.pilots[0].connected);
  const resumed = await client();
  resumed.send({ type: 'resume', room: joined.room, token: joined.token });
  await wait(resumed, m => m.type === 'joined' && m.slot === 0);
  console.log('PASS two real WebSocket clients, shared thrust state, rejected cheat, reconnect');
} finally {
  for (const ws of sockets) ws.close();
  server.kill('SIGTERM');
  await once(server, 'exit');
}
