// render/entities.js — JOB: drawing what moves through the city: people, cars, the player and the aim line, bullets, mission markers, pickups, and the police helicopter with its searchlight.
// EXPORTS: drawMarkers, drawPickups, drawActors, drawBullets, drawHeli, drawBlockade
// DISTRICT PASS: drawBlockade draws the four-star closures: striped barriers with beacons at a roadblock
//   and the spike strips (a hinged bar of steel teeth) police/pursuit.js lays across the road; a car on
//   shredded tyres shows bare rims and flapping rubber.
// USES: draw.js
// MUST NOT: move, spawn or damage anything; it reads state and draws it.
// SPLIT PASS: code unchanged; outside render/ it is reached only through render.js, which boot/state.js, boot/loop.js, police/pursuit.js,
//   traffic/behaviour.js import after the split; loaded in the split-pass smoke run with no console errors.
import { roundRect, shade, visible } from './draw.js';

function drawCar(ctx, v, t) {
  const L = v.len, W = v.wid;
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.rotate(v.a);
  // soft shadow
  ctx.fillStyle = 'rgba(30,15,40,0.35)';
  roundRect(ctx, -L / 2 + 5, -W / 2 + 4, L, W, 7); ctx.fill();
  // shredded by a spike strip: bare rims and flapping rubber stick out at all four wheels
  if (v.flat > 0) {
    for (const [wx, wy] of [[L * 0.3, -W / 2], [L * 0.3, W / 2], [-L * 0.3, -W / 2], [-L * 0.3, W / 2]]) {
      ctx.fillStyle = '#1b1b1d'; ctx.fillRect(wx - 6, wy - 3, 12, 6);
      ctx.fillStyle = '#b8bec4'; ctx.fillRect(wx - 3, wy - 1.5, 6, 3);
      const flap = Math.sin(t * 40 + wx) * 3;
      ctx.strokeStyle = '#1b1b1d'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(wx - 6, wy); ctx.lineTo(wx - 12, wy + flap + Math.sign(wy) * 3); ctx.stroke();
    }
  }
  const dmg = Math.max(0, 1 - v.health / v.maxHealth);
  ctx.fillStyle = v.dead ? '#2a2526' : v.flash > 0 ? '#ffffff' : v.color;
  roundRect(ctx, -L / 2, -W / 2, L, W, 7); ctx.fill();
  if (!v.dead) {
    if (v.police) {
      ctx.fillStyle = '#f4f4f4';
      ctx.fillRect(-L * 0.14, -W / 2, L * 0.3, W);
    }
    if (v.taxi) { ctx.fillStyle = '#222'; ctx.fillRect(-4, -W / 2, 8, W); }
    // body highlight along the roofline
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(ctx, -L / 2 + 3, -W / 2 + 2, L - 6, W * 0.3, 4); ctx.fill();
    // glass
    ctx.fillStyle = v.open ? '#3a2b2b' : '#1d2b3a';
    roundRect(ctx, L * 0.06, -W / 2 + 3, L * 0.2, W - 6, 3); ctx.fill();       // windscreen
    ctx.fillRect(-L * 0.36, -W / 2 + 4, L * 0.1, W - 8);                        // rear window
    if (!v.open) {
      ctx.fillStyle = v.police ? '#f4f4f4' : shade(v.color, -0.12);
      roundRect(ctx, -L * 0.25, -W / 2 + 3, L * 0.31, W - 6, 3); ctx.fill();   // roof
    } else {
      ctx.fillStyle = '#5a3d33'; ctx.fillRect(-L * 0.24, -W / 2 + 4, L * 0.28, W - 8);   // seats
    }
    if (v.model === 'mule') { ctx.fillStyle = shade(v.color, -0.06); ctx.fillRect(-L / 2 + 2, -W / 2 + 2, L * 0.58, W - 4); }
    // lights
    ctx.fillStyle = '#fff6d0';
    ctx.fillRect(L / 2 - 3, -W / 2 + 2, 3, 5); ctx.fillRect(L / 2 - 3, W / 2 - 7, 3, 5);
    const braking = v.control.brake > 0 || v.control.handbrake;
    ctx.fillStyle = braking ? '#ff2a2a' : '#a01818';
    ctx.fillRect(-L / 2, -W / 2 + 2, 3, 5); ctx.fillRect(-L / 2, W / 2 - 7, 3, 5);
    if (braking) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,40,40,0.35)';
      ctx.beginPath(); ctx.arc(-L / 2 - 2, 0, 12, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (v.police) {
      const on = v.siren ? Math.sin(v.sirenPhase) > 0 : false;
      ctx.fillStyle = v.siren ? (on ? '#ff2b3a' : '#5a0d12') : '#7a1a20';
      ctx.fillRect(-L * 0.14, -W / 2 + 2, 5, W / 2 - 2);
      ctx.fillStyle = v.siren ? (!on ? '#2b6bff' : '#0d1c5a') : '#1a2a7a';
      ctx.fillRect(-L * 0.14, 0, 5, W / 2 - 2);
      if (v.siren) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = on ? 'rgba(255,40,60,0.30)' : 'rgba(40,90,255,0.30)';
        ctx.beginPath(); ctx.arc(-L * 0.1, on ? -W * 0.3 : W * 0.3, 46, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = on ? 'rgba(255,90,100,0.35)' : 'rgba(90,140,255,0.35)';
        ctx.beginPath(); ctx.arc(-L * 0.1, on ? -W * 0.3 : W * 0.3, 20, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    if (dmg > 0.35) {
      ctx.strokeStyle = 'rgba(20,20,20,0.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(L * 0.3, -W / 2 + 2); ctx.lineTo(L * 0.42, -2); ctx.lineTo(L * 0.35, W / 2 - 3); ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#141112'; ctx.fillRect(-L * 0.3, -W / 2 + 3, L * 0.6, W - 6);
  }
  ctx.restore();
}

function drawPerson(ctx, p, t) {
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.dead) {
    ctx.rotate(p.a);
    ctx.fillStyle = p.shirt;
    roundRect(ctx, -10, -6, 20, 12, 5); ctx.fill();
    ctx.fillStyle = p.skin;
    ctx.beginPath(); ctx.arc(12, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  ctx.fillStyle = 'rgba(30,15,40,0.3)';
  ctx.beginPath(); ctx.ellipse(3, 3, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(p.a);
  const swing = p.moving ? Math.sin(p.walk * 1) * 6 : 0;
  ctx.fillStyle = p.pants || '#2c3440';
  ctx.fillRect(-2 + swing, -6, 7, 4); ctx.fillRect(-2 - swing, 2, 7, 4);
  ctx.fillStyle = p.shirt;
  roundRect(ctx, -6, -9, 11, 18, 5); ctx.fill();
  if (p.armed) {
    ctx.fillStyle = '#1a1a1e';
    ctx.fillRect(4, 3, 12, 3);
  }
  ctx.fillStyle = p.skin;
  ctx.beginPath(); ctx.arc(1, 0, 5.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = p.hair;
  ctx.beginPath(); ctx.arc(0, 0, 4.6, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
  if (p.hat) { ctx.fillStyle = p.hat; ctx.beginPath(); ctx.arc(0, 0, 5.4, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(2, -4, 5, 8); }
  if (p.calling > 0) { ctx.fillStyle = '#9ab8ff'; ctx.fillRect(1, 4, 5, 3); }   // phone to the ear
  if (p.vip) { ctx.strokeStyle = '#7dff8a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.stroke(); }
  if (p.rival) { ctx.strokeStyle = '#ff3d7f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
}

// mission and pickup markers: pulsing rings on the ground
export function drawMarkers(ctx, state, t) {
  for (const m of state.fx.markers) {
    if (!visible(m.x, m.y, 80)) continue;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    ctx.fillStyle = m.color + '33';
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = m.color; ctx.lineWidth = 3 + pulse * 2;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r * (0.85 + pulse * 0.15), 0, Math.PI * 2); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = m.color + '22';
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r * 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    if (m.label) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(m.label, m.x, m.y - m.r - 8 - pulse * 4);
    }
  }
}

// pickups (cash, health, weapons)
export function drawPickups(ctx, state, t) {
  for (const p of state.pickups) {
    if (!visible(p.x, p.y, 30)) continue;
    const bob = Math.sin(t * 5 + p.x) * 2;
    ctx.fillStyle = p.kind === 'cash' ? '#4fdc6a' : p.kind === 'health' ? '#ff5a6a' : '#ffd36b';
    ctx.beginPath(); ctx.arc(p.x, p.y + bob, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#10301a'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.kind === 'cash' ? '$' : p.kind === 'health' ? '+' : 'A', p.x, p.y + bob + 1);
  }
}

// people, then cars, then the player
export function drawActors(ctx, state, t) {
  for (const p of state.peds) if (p.dead && visible(p.x, p.y, 30)) drawPerson(ctx, p, t);
  for (const p of state.peds) if (!p.dead && visible(p.x, p.y, 30)) drawPerson(ctx, p, t);
  for (const v of state.vehicles) if (visible(v.x, v.y, 60)) drawCar(ctx, v, t);
  const pl = state.player;
  if (!pl.car && state.mode !== 'title') {
    drawPerson(ctx, pl, t);
    if (state.input.mouse.active && pl.health > 0) {
      ctx.strokeStyle = 'rgba(255,80,80,0.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(pl.x, pl.y); ctx.lineTo(pl.x + Math.cos(pl.a) * 140, pl.y + Math.sin(pl.a) * 140); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

// bullets as tracers
export function drawBullets(ctx, state) {
  ctx.lineWidth = 2.2;
  for (const b of state.bullets) {
    ctx.strokeStyle = b.owner === 'player' ? 'rgba(255,240,170,0.95)' : 'rgba(255,150,120,0.9)';
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022); ctx.stroke();
  }
}

/** Roadblock barriers and spike strips, drawn on the road under the cars. */
export function drawBlockade(ctx, state, t) {
  const bk = state.blockade;
  if (!bk) return;
  for (const sp of bk.spikes) {
    if (!visible(sp.x, sp.y, sp.len)) continue;
    ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(sp.a);
    ctx.fillStyle = 'rgba(20,10,30,0.35)'; ctx.fillRect(-sp.len / 2 + 3, -3, sp.len, 10);
    ctx.fillStyle = sp.hit ? '#5a5a5e' : '#2b2b30'; ctx.fillRect(-sp.len / 2, -5, sp.len, 10);
    ctx.fillStyle = sp.hit ? '#8a8a8e' : '#d8dde2';
    for (let x = -sp.len / 2 + 4; x < sp.len / 2 - 4; x += 8) {
      ctx.beginPath(); ctx.moveTo(x, -5); ctx.lineTo(x + 4, -11); ctx.lineTo(x + 8, -5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, 5); ctx.lineTo(x + 4, 11); ctx.lineTo(x + 8, 5); ctx.closePath(); ctx.fill();
    }
    // hinge joints
    ctx.fillStyle = '#f2c230';
    for (let x = -sp.len / 2 + 22; x < sp.len / 2; x += 44) ctx.fillRect(x - 2, -5, 4, 10);
    ctx.restore();
  }
  for (const r of bk.roadblocks) {
    if (!visible(r.x, r.y, 200)) continue;
    // a sawhorse barrier at each kerb, beyond the cruisers' bumpers
    for (const side of [-1, 1]) {
      const bx = r.x + (r.horiz ? 0 : side * 66), by = r.y + (r.horiz ? side * 66 : 0);
      ctx.save(); ctx.translate(bx, by); ctx.rotate(r.a);
      for (let k = 0; k < 4; k += 1) { ctx.fillStyle = k % 2 ? '#f4f4f4' : '#e0312b'; ctx.fillRect(-14 + k * 7, -4, 7, 8); }
      ctx.restore();
      const on = Math.floor(t * 4 + side) % 2 === 0;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = on ? 'rgba(255,60,60,0.55)' : 'rgba(80,140,255,0.55)';
      ctx.beginPath(); ctx.arc(bx, by, 14, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}

// the police helicopter: its shadow on the ground, its spotlight, then the body above
export function drawHeli(ctx, state, t) {
  const heli = state.heli;
  if (heli && heli.active) {
    ctx.globalCompositeOperation = 'lighter';
    // the searchlight: a cone of light from the nose down to the pool on the ground
    const ca = Math.atan2(heli.spotY - heli.y, heli.spotX - heli.x) + Math.PI / 2;
    const cone = ctx.createLinearGradient(heli.x, heli.y, heli.spotX, heli.spotY);
    cone.addColorStop(0, 'rgba(255,250,220,0.32)'); cone.addColorStop(1, 'rgba(255,250,220,0.07)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(heli.x + Math.cos(ca) * 5, heli.y + Math.sin(ca) * 5);
    ctx.lineTo(heli.spotX + Math.cos(ca) * 88, heli.spotY + Math.sin(ca) * 88);
    ctx.lineTo(heli.spotX - Math.cos(ca) * 88, heli.spotY - Math.sin(ca) * 88);
    ctx.lineTo(heli.x - Math.cos(ca) * 5, heli.y - Math.sin(ca) * 5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,250,220,0.16)';
    ctx.beginPath(); ctx.arc(heli.spotX, heli.spotY, 90, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,250,220,0.12)';
    ctx.beginPath(); ctx.arc(heli.spotX, heli.spotY, 60, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(30,15,40,0.3)';
    ctx.beginPath(); ctx.ellipse(heli.x + 70, heli.y + 40, 30, 12, heli.a, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(heli.x, heli.y); ctx.rotate(heli.a);
    ctx.fillStyle = '#14213d'; roundRect(ctx, -26, -11, 46, 22, 10); ctx.fill();
    ctx.fillRect(-58, -3, 34, 6);
    ctx.fillStyle = '#f4f4f4'; ctx.fillRect(-12, -11, 12, 22);
    ctx.fillStyle = '#7fd0ff'; roundRect(ctx, 6, -8, 12, 16, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(40,40,40,0.55)'; ctx.lineWidth = 4;
    const ra = t * 30;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ra) * 48, Math.sin(ra) * 48); ctx.lineTo(-Math.cos(ra) * 48, -Math.sin(ra) * 48);
    ctx.moveTo(Math.cos(ra + 1.57) * 48, Math.sin(ra + 1.57) * 48); ctx.lineTo(-Math.cos(ra + 1.57) * 48, -Math.sin(ra + 1.57) * 48);
    ctx.stroke();
    ctx.fillStyle = Math.sin(t * 10) > 0 ? '#ff2b3a' : '#2b6bff';
    ctx.beginPath(); ctx.arc(-56, 0, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
