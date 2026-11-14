/**
 * Wrist menu check, in the real game from the seat:
 * 1. during a run, a left hand held low with its back to the eyes opens nothing;
 * 2. turned palm-to-face and held a moment, it opens the menu beside the wrist;
 * 3. the right fingertip on Hire (with the money) hires a server;
 * 4. on Pause it pauses; the button reads resume; pressed again it resumes;
 * 5. on How to play it pauses and shows How to play; Got it returns to the pause;
 * 6. lowering the hand closes the menu;
 * 7. the pause tab at the table's edge pauses and resumes.
 * Usage: dev server running, then `node scripts/check-wrist.mjs`.
 * Output: PASS/FAIL lines; artifacts/wrist-*.png.
 */

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => window.__cafe.system.replace());
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving && window.__cafe.game.phase === 'title', null, { timeout: 60000 });
  },
});
const { page } = h;
const results = [];
const check = (name, pass, detail) => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${detail}`); };
const send = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const frames = (n) => page.evaluate((n) => new Promise((resolve) => { const info = window.__cafe.world.renderer.info.render; const target = info.frame + n; const t = setInterval(() => { if (info.frame >= target) { clearInterval(t); resolve(); } }, 8); }), n);
const handTo = (hand, p, q = { x: 0, y: 0, z: 0, w: 1 }) => send('set_transform', { device: `hand-${hand}`, position: { x: p[0], y: p[1], z: p[2] }, orientation: q });
const state = () => page.evaluate(() => { const { game, wrist, baristas, score } = window.__cafe; return { phase: game.phase, open: wrist.open, facing: +wrist.facing.toFixed(2), staff: baristas.staff.length, bank: score.bank, how: game.how.open, card: game.card.open, opens: game.wristOpens }; });

await page.evaluate(() => { const { game } = window.__cafe; game.click('open'); game.click('skip'); window.__cafe.guests.patienceFrozen = true; });
await frames(4);
// Park the right hand out of the way.
const AWAY_R = [-0.6, 0.95, 0.75];
await handTo('right', AWAY_R);

// The left hand in front of the chest, about 35 cm out. Find a turn that shows the palm to the eyes, and one that shows the back.
const LEFT = [-1.05, 1.1, 0.42];
const turns = [];
for (let yaw = -180; yaw < 180; yaw += 30) for (const pitch of [-60, -30, 0, 30, 60]) turns.push([yaw, pitch]);
const quat = ([yaw, pitch]) => { const y = (yaw * Math.PI) / 360, p = (pitch * Math.PI) / 360; const [cy, sy, cp, sp] = [Math.cos(y), Math.sin(y), Math.cos(p), Math.sin(p)]; return { x: cy * sp, y: sy * cp, z: -sy * sp, w: cy * cp }; };
let best = null, worst = null;
for (const t of turns) {
  await handTo('left', LEFT, quat(t));
  await frames(2);
  const f = (await state()).facing;
  if (!best || f > best.f) best = { t, f };
  if (!worst || f < worst.f) worst = { t, f };
}
console.log('palm facing: best', JSON.stringify(best), 'worst', JSON.stringify(worst));

// 1. Back of the hand to the eyes: nothing.
await handTo('left', LEFT, quat(worst.t));
// The menu closes by game time (a grace after looking away), so wait on that, not on the wall clock.
await page.waitForFunction(() => !window.__cafe.wrist.open, null, { timeout: 30000 }).catch(() => {});
await frames(6);
let s = await state();
check('the back of the hand opens nothing', !s.open, JSON.stringify(s));
// 2. Palm to the face, held: the menu.
await handTo('left', LEFT, quat(best.t));
await page.waitForFunction(() => window.__cafe.wrist.open, null, { timeout: 30000 }).catch(() => {});
await frames(6);
s = await state();
check('a palm turned to the face and held opens the menu beside the wrist', s.open && s.opens >= 1, JSON.stringify(s));
await h.head(SEAT, { x: LEFT[0] - 0.05, y: LEFT[1] + 0.03, z: LEFT[2] - 0.05 }, 300);
await frames(4);
await h.screenshot('artifacts/wrist-1-open.png');

// The right fingertip, measured, then on a button.
await handTo('right', AWAY_R);
await frames(3);
const tipOff = (await page.evaluate(() => window.__cafe.hold.tip.right.point.toArray())).map((v, i) => v - AWAY_R[i]);
const buttonAt = (id, out) => page.evaluate(([id, out]) => { const p = window.__cafe.wrist.panel; const b = p.buttons.find((x) => x.id === id); const g = p.mesh.geometry.parameters; const V = p.mesh.position.constructor; const sc = p.mesh.getWorldScale(new V()).z; return p.mesh.localToWorld(new V(((b.x + b.w / 2) / p.width - 0.5) * g.width, (0.5 - (b.y + b.h / 2) / p.height) * g.height, out / sc)).toArray(); }, [id, out]);
async function poke(id) {
  await handTo('right', (await buttonAt(id, 0.04)).map((v, i) => v - tipOff[i]));
  await frames(3);
  await handTo('right', (await buttonAt(id, -0.004)).map((v, i) => v - tipOff[i]));
  await frames(3);
  await handTo('right', (await buttonAt(id, 0.05)).map((v, i) => v - tipOff[i]));
  await frames(2);
}
// 3. Hire.
await page.evaluate(() => (window.__cafe.score.bank = 100));
await frames(3);
await poke('w-hire');
await page.waitForFunction(() => window.__cafe.baristas.staff.length >= 2, null, { timeout: 60000 }).catch(() => {});
s = await state();
check('the right fingertip on Hire hires a server', s.staff === 2 && s.bank === 40, JSON.stringify(s));
await h.screenshot('artifacts/wrist-2-hired.png');
// 4. Pause, then resume.
await poke('w-pause');
s = await state();
const label = await page.evaluate(() => window.__cafe.wrist.panel.buttons.find((b) => b.id === 'w-pause').label);
check('Pause pauses, and the button then reads resume', s.phase === 'paused' && label === 'resume', `${JSON.stringify(s)} label ${label}`);
await h.screenshot('artifacts/wrist-3-paused.png');
await poke('w-pause');
s = await state();
check('pressed again it resumes', s.phase === 'run', JSON.stringify(s));
// 5. How to play pauses, Got it comes back to the pause.
await poke('w-how');
s = await state();
const howOpen = s.phase === 'rules' && s.how;
await page.evaluate(() => window.__cafe.game.click('back'));
const back = await state();
check('How to play pauses first; Got it returns to the pause', howOpen && back.phase === 'paused' && back.card && !back.how, `${JSON.stringify(s)} -> ${JSON.stringify(back)}`);
await page.evaluate(() => window.__cafe.game.click('resume'));
// 6. Lower the hand: closed.
await handTo('left', [-1.0, 0.85, 0.5], quat(worst.t));
await page.waitForFunction(() => !window.__cafe.wrist.open, null, { timeout: 30000 }).catch(() => {});
s = await state();
check('lowering the hand closes the menu', !s.open, JSON.stringify(s));
// 7. The pause tab.
const tab = await page.evaluate(() => { const p = window.__cafe.game.tab; const V = p.mesh.position.constructor; const sc = p.mesh.getWorldScale(new V()).z; return [0.04, -0.004, 0.05].map((out) => p.mesh.localToWorld(new V(0, 0, out / sc)).toArray()); });
for (const p of tab) { await handTo('right', p.map((v, i) => v - tipOff[i])); await frames(3); }
const t1 = await state();
await h.head(SEAT, LOOK, 200);
await frames(3);
await h.screenshot('artifacts/wrist-4-tab-paused.png');
for (const p of tab) { await handTo('right', p.map((v, i) => v - tipOff[i])); await frames(3); }
const t2 = await state();
check('the pause tab at the table edge pauses and resumes', t1.phase === 'paused' && t2.phase === 'run', `${t1.phase} -> ${t2.phase}`);
const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
