const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static('public'));

// Game constants
const TICK_RATE = 20; // server updates per second
const SNAPSHOT_RATE = 20; // how often we emit state to clients
const MAX_PLAYERS = 12;
const WORLD_SIZE = { w: 1600, h: 900 };

// Entities stores
const players = {}; // socketId -> player
const bullets = {}; // bulletId -> bullet
let nextBulletId = 1;

function createPlayer(id) {
  return {
    id,
    x: Math.random() * WORLD_SIZE.w,
    y: Math.random() * WORLD_SIZE.h,
    angle: 0,
    vx: 0,
    vy: 0,
    speed: 0,
    hp: 100,
    maxHp: 100,
    score: 0,
    lastShot: 0,
    inputSeq: 0
  };
}

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

// Basic physics tick
function physicsStep(dt) {
  // players
  for (const id in players) {
    const p = players[id];
    // integrate velocity
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    // simple drag
    p.vx *= 0.98;
    p.vy *= 0.98;
    // keep inside world
    p.x = clamp(p.x, 0, WORLD_SIZE.w);
    p.y = clamp(p.y, 0, WORLD_SIZE.h);
  }

  // bullets
  for (const bid in bullets) {
    const b = bullets[bid];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) {
      delete bullets[bid];
      continue;
    }
    // check collision with players
    for (const pid in players) {
      const p = players[pid];
      if (pid === b.owner) continue;
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const dist2 = dx*dx + dy*dy;
      if (dist2 < 20*20) {
        // hit
        p.hp -= b.damage;
        const owner = players[b.owner];
        if (owner) owner.score += 10;
        delete bullets[bid];
        if (p.hp <= 0) {
          // respawn
          p.hp = p.maxHp;
          p.x = Math.random() * WORLD_SIZE.w;
          p.y = Math.random() * WORLD_SIZE.h;
          const killer = players[b.owner];
          if (killer) killer.score += 50;
        }
        break;
      }
    }
  }
}

// Input handling
io.on('connection', socket => {
  console.log('connect', socket.id);
  // if too many players, refuse
  if (Object.keys(players).length >= MAX_PLAYERS) {
    socket.emit('server_full');
    socket.disconnect(true);
    return;
  }

  players[socket.id] = createPlayer(socket.id);

  // send initial world info
  socket.emit('welcome', { id: socket.id, world: WORLD_SIZE });

  socket.on('input', (data) => {
    // data: { seq, up, down, left, right, shoot, angle }
    const p = players[socket.id];
    if (!p) return;
    // apply rotation directly
    if (typeof data.angle === 'number') p.angle = data.angle;
    // movement thrust
    const thrust = 200; // pixels/sec^2
    if (data.up) {
      const ax = Math.cos(p.angle) * thrust;
      const ay = Math.sin(p.angle) * thrust;
      p.vx += ax / TICK_RATE;
      p.vy += ay / TICK_RATE;
    }
    if (data.down) {
      const ax = Math.cos(p.angle) * -thrust * 0.5;
      const ay = Math.sin(p.angle) * -thrust * 0.5;
      p.vx += ax / TICK_RATE;
      p.vy += ay / TICK_RATE;
    }
    // clamp speed
    const sp = Math.sqrt(p.vx*p.vx + p.vy*p.vy);
    const maxSp = 300;
    if (sp > maxSp) {
      p.vx = (p.vx / sp) * maxSp;
      p.vy = (p.vy / sp) * maxSp;
    }

    // shooting
    if (data.shoot) {
      const now = Date.now();
      if (now - p.lastShot > 250) { // fire rate
        p.lastShot = now;
        const speed = 600;
        const bx = p.x + Math.cos(p.angle)*20;
        const by = p.y + Math.sin(p.angle)*20;
        const bid = (nextBulletId++).toString();
        bullets[bid] = {
          id: bid,
          owner: socket.id,
          x: bx,
          y: by,
          vx: Math.cos(p.angle) * speed,
          vy: Math.sin(p.angle) * speed,
          life: 2.5,
          damage: 25
        };
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('disconnect', socket.id);
    delete players[socket.id];
  });
});

// Main loop
let accumulator = 0;
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - last) / 1000;
  last = now;
  accumulator += dt;
  const step = 1 / TICK_RATE;
  while (accumulator >= step) {
    physicsStep(step);
    accumulator -= step;
  }
}, 1000 / TICK_RATE);

// Snapshot broadcast
setInterval(() => {
  const snapshot = {
    players: Object.values(players).map(p => ({ id: p.id, x: p.x, y: p.y, angle: p.angle, hp: p.hp, score: p.score })),
    bullets: Object.values(bullets).map(b => ({ id: b.id, x: b.x, y: b.y }))
  };
  io.emit('snapshot', snapshot);
}, 1000 / SNAPSHOT_RATE);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server listening on', PORT));
