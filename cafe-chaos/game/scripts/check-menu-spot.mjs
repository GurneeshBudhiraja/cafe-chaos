/**
 * Start card check: where the card stands and that it keeps still.
 * 1. it stands a metre away, straight ahead, facing the eyes, its top
 *    edge just under eye level; the hand ray presses its buttons;
 * 2. looking up when it is put there does not put it higher; a fingertip
 *    presses a button as soon as it touches it, and only lights it from 3 cm;
 * 3. a nod, a lean and a small turn of the head do not move or turn it;
 * 4. leaning well in and staying there brings it along, and sitting back
 *    brings it back;
 * 5. turning well away brings it back in front, below the eyes again.
 *
 * Usage: dev server running, then `node scripts/check-menu-spot.mjs`.
 * Output: artifacts/menu-spot.png, and a pass/fail line.
 */

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');

const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const AHEAD = { x: -1.85, y: 1.22, z: 0.28 };
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

const h = await startHeadset({
  async prepare(h) {
    // Looking up (30 degrees) when the card is put up.
    await h.head(SEAT, { x: -1.85, y: 1.22 + Math.tan(Math.PI / 6), z: 0.28 });
    await h.page.evaluate(() => window.__cafe.system.replace());
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving, null, { timeout: 30000 });
  },
});
const { page } = h;
const until = (fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).then(() => true, () => false);
await until(() => window.__cafe.game.phase === 'title' && window.__cafe.game.menu.card.open);
await page.waitForTimeout(800);
const pose = () => page.evaluate(() => {
  const m = window.__cafe.game.menu.card.mesh;
  m.updateWorldMatrix(true, false);
  const p = m.position;
  const e = window.__cafe.game.head;
  const top = m.localToWorld(m.position.clone().set(0, m.geometry.parameters.height / 2, 0));
  const n = m.getWorldDirection(m.position.clone());
  return { p: p.toArray(), q: m.quaternion.toArray(), top: top.toArray(), eye: e.toArray(), n: n.toArray() };
});
const a = await pose();
const dist = Math.hypot(...a.p.map((v, i) => v - a.eye[i]));
const down = (Math.atan2(a.eye[1] - a.p[1], Math.hypot(a.p[0] - a.eye[0], a.p[2] - a.eye[2])) * 180) / Math.PI;
const topDown = (Math.atan2(a.eye[1] - a.top[1], Math.hypot(a.top[0] - a.eye[0], a.top[2] - a.eye[2])) * 180) / Math.PI;
check('a metre away, its top edge just under eye level', topDown > 2 && topDown < 7 && dist > 0.85 && dist < 1.15, `top edge ${topDown.toFixed(1)}° down (${((a.top[1] - a.eye[1]) * 100).toFixed(1)} cm), centre ${down.toFixed(0)}° down, ${(dist * 100).toFixed(0)} cm away (looked up 30° when put there)`);
const toEye = a.eye.map((v, i) => v - a.p[i]);
const len = Math.hypot(...toEye);
const facing = (Math.acos(toEye.reduce((s, v, i) => s + (v / len) * a.n[i], 0)) * 180) / Math.PI;
check('faces the eyes', facing < 3, `${facing.toFixed(1)}° off`);
await page.screenshot({ path: 'artifacts/menu-spot.png' });

// The hand ray: a hand resting low on the right, pointed at Settings and pinched, opens Settings;
// pointed at CLOSE on the card in front and pinched, closes it.
const send = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const frames = (n) => page.evaluate((n) => new Promise((resolve) => { const info = window.__cafe.world.renderer.info.render; const target = info.frame + n; const t = setInterval(() => { if (info.frame >= target) { clearInterval(t); resolve(); } }, 8); }), n);
const REST = [SEAT.x - 0.25, SEAT.y - 0.35, SEAT.z - 0.15];
const aimAt = async (which, id) => {
  const target = await page.evaluate(([which, id]) => {
    const p = window.__cafe.game.menu[which];
    const b = p.buttons.find((x) => x.id === id);
    const g = p.mesh.geometry.parameters;
    const V = p.mesh.position.constructor;
    return p.mesh.localToWorld(new V(((b.x + b.w / 2) / p.width - 0.5) * g.width, (0.5 - (b.y + b.h / 2) / p.height) * g.height, 0)).toArray();
  }, [which, id]);
  const d = target.map((v, i) => v - REST[i]);
  const len = Math.hypot(...d);
  const n = d.map((v) => v / len);
  // A quaternion turning -Z to n.
  const ax = [0, 0, -1];
  const dot = ax[0] * n[0] + ax[1] * n[1] + ax[2] * n[2];
  const cr = [ax[1] * n[2] - ax[2] * n[1], ax[2] * n[0] - ax[0] * n[2], ax[0] * n[1] - ax[1] * n[0]];
  const w = 1 + dot;
  const ql = Math.hypot(cr[0], cr[1], cr[2], w);
  await send('set_transform', { device: 'hand-right', position: { x: REST[0], y: REST[1], z: REST[2] }, orientation: { x: cr[0] / ql, y: cr[1] / ql, z: cr[2] / ql, w: w / ql } });
  await frames(6);
  return page.evaluate(() => window.__cafe.game.aim.right);
};
const tap = async () => {
  await send('set_select_value', { device: 'hand-right', value: 1 });
  await frames(4);
  await send('set_select_value', { device: 'hand-right', value: 0 });
  await frames(4);
};
const litGear = await aimAt('card', 'gear');
await tap();
const opened = await page.evaluate(() => window.__cafe.game.menu.sheetKind);
await page.waitForTimeout(500);
const litClose = await aimAt('sheet', 'close');
await tap();
const closed = await page.evaluate(() => window.__cafe.game.menu.sheetKind);
check('the hand ray presses the menu: Settings opens, CLOSE closes', litGear === 'gear' && opened === 'settings' && litClose === 'close' && closed === 'none', JSON.stringify({ litGear, opened, litClose, closed }));
await page.waitForTimeout(500);

// A fingertip on a button: hovering 3 cm off lights it without pressing; the pad touching the face
// (the tip joint 1 cm out, a finger's radius) presses it at once, with no push past the face.
const poke = await page.evaluate(() => {
  const card = window.__cafe.game.menu.card;
  const m = card.mesh;
  m.updateWorldMatrix(true, false);
  const b = card.buttons[0];
  const g = m.geometry.parameters;
  const s = m.getWorldScale(m.position.clone());
  const at = (cm) => m.localToWorld(m.position.clone().set(((b.x + b.w / 2) / card.width - 0.5) * g.width, (0.5 - (b.y + b.h / 2) / card.height) * g.height, cm / 100 / s.z));
  const out = [];
  for (const cm of [6, 3, 1]) {
    const t = card.touch('check', at(cm));
    out.push({ cm, over: t.over?.id ?? null, pressed: t.pressed?.id ?? null });
  }
  card.touch('check', null);
  return out;
});
const [, hover3, touch1] = poke;
check('a fingertip touching presses at once', hover3.over && !hover3.pressed && touch1.pressed === touch1.over, JSON.stringify(poke));

// A nod down, a lean in, a small turn: it stays where it is, turned as it was.
await h.head(SEAT, { x: -1.85, y: 0.7, z: 0.28 }, 400);
await h.head({ x: -0.92, y: 1.17, z: 0.3 }, { x: -1.85, y: 0.9, z: 0.45 }, 400);
await page.waitForTimeout(600);
const b = await pose();
const moved = Math.hypot(...a.p.map((v, i) => v - b.p[i]));
const dot = Math.abs(a.q.reduce((s, v, i) => s + v * b.q[i], 0));
const turned = (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
check('keeps still while used', moved < 0.002 && turned < 0.5, `moved ${(moved * 1000).toFixed(1)} mm, turned ${turned.toFixed(2)}°`);

// Lean well in (20 cm) and stay there: it comes along; sit back: it comes back.
const LEAN = { x: SEAT.x - 0.2, y: SEAT.y - 0.03, z: SEAT.z };
await h.head(LEAN, { x: LEAN.x - 1, y: LEAN.y, z: LEAN.z }, 400);
await page.waitForTimeout(2500);
const l1 = await pose();
await h.head(SEAT, AHEAD, 400);
await page.waitForTimeout(2500);
const l2 = await pose();
const along = a.p[0] - l1.p[0];
const home = Math.hypot(...a.p.map((v, i) => v - l2.p[i]));
check('follows a lean and comes back', along > 0.15 && home < 0.02, `leaned 20 cm: card moved ${(along * 100).toFixed(1)} cm along; sat back: ${(home * 100).toFixed(1)} cm from where it started`);

// Turn well away: it glides back in front, below the eyes.
await h.head(SEAT, { x: -0.85, y: 1.22, z: -0.72 }, 600);
await page.waitForTimeout(2500);
const c = await pose();
const back = (Math.atan2(c.p[0] - c.eye[0], c.p[2] - c.eye[2]) * 180) / Math.PI;
check('follows a big turn', Math.abs(Math.abs(back) - 180) < 8 && c.top[1] < c.eye[1], `now at heading ${back.toFixed(0)}° (wanted ±180), top ${((c.top[1] - c.eye[1]) * 100).toFixed(1)} cm from eye level`);

await h.finish();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} FAILED` : `ALL ${results.length} PASSED`);
process.exit(failed ? 1 : 0);
