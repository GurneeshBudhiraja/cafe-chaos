/**
 * Phase 3 check: the pads, the hover ring, the wrist panel, the scoreboard
 * and the sound.
 *
 * 1. Sound starts with the session; the music schedules; a cut and a snap
 *    land in the sound log; an offline render of the soundtrack is not
 *    silent.
 * 2. The right hand near the cake shows a hover ring under it.
 * 3. The left hand raised in view shows the wrist panel on it.
 * 4. Poking the Hard pad with the index finger starts a hard level.
 *
 * Usage: dev server running, then `node scripts/test-ui.mjs`.
 * Output: artifacts/ui-*.png, artifacts/ui-sound.wav, and a pass/fail line.
 */

import { writeFileSync } from 'node:fs';
import { startHeadset } from './lib/headset.mjs';

const turnAbout = (axis, deg) => {
  const r = (deg * Math.PI) / 360;
  return { x: axis[0] * Math.sin(r), y: axis[1] * Math.sin(r), z: axis[2] * Math.sin(r), w: Math.cos(r) };
};
const PALM_DOWN = turnAbout([1, 0, 0], -90);
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

const h = await startHeadset({
  async prepare(h) {
    await h.head({ x: 0, y: 1.6, z: 0.15 }, { x: 0, y: 0.95, z: -0.62 });
    await h.hand({ x: 0.1, y: 0.95, z: -0.1 }, PALM_DOWN);
    await h.pause(500);
  },
});
const { pause, page } = h;
const send = (method, params) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [method, params]);

// --- 1. Sound is running (the session start is the gesture).
const soundState = await page.evaluate(() => ({ running: window.__cake.game.sound.running, logged: window.__cake.game.sound.log.length }));
check('sound starts with the session', soundState.running, JSON.stringify(soundState));
await h.screenshot('artifacts/ui-0-scene.png');

// --- 2. Hover: the right hand just above the cake shows the ring.
const cake = await h.objectPosition('CakePiece');
await h.hand({ x: cake.x, y: cake.y + 0.13, z: cake.z }, PALM_DOWN, 900);
await pause(400);
const hovered = await page.evaluate(() => window.__cake.world.scene.getObjectsByProperty('name', 'HoverRing').some((r) => r.visible));
check('a hand near the cake shows the hover ring', hovered, `ring visible ${hovered}`);
await h.head({ x: -0.2, y: 1.4, z: -0.15 }, { x: cake.x, y: cake.y, z: cake.z }, 600);
await pause(300);
await h.screenshot('artifacts/ui-1-hover.png');

// --- 3. The wrist panel: raise the left hand, back of the hand toward the face.
await h.head({ x: 0, y: 1.6, z: 0.15 }, { x: -0.15, y: 1.25, z: -0.25 }, 600);
await send('set_transform', { device: 'hand-left', position: { x: -0.15, y: 1.25, z: -0.3 }, orientation: turnAbout([1, 0, 0], -110) });
await pause(600);
const hud = await page.evaluate(() => {
  const g = window.__cake.world.scene.getObjectByName('WristHud');
  return { visible: g?.visible, at: g ? g.position.toArray().map((v) => +v.toFixed(2)) : null };
});
check('the wrist panel rides the raised left hand', !!hud.visible && hud.at[1] > 1.1, JSON.stringify(hud));
await h.screenshot('artifacts/ui-2-wrist.png');
await send('set_transform', { device: 'hand-left', position: { x: -0.35, y: 0.8, z: 0.15 }, orientation: PALM_DOWN });

// --- 4. Poke the Hard pad with the index fingertip.
const pad = await h.objectPosition('Pad:hard');
// Where the index tip sits relative to the hand's pose (measured once, palm down).
await h.hand({ x: pad.x, y: pad.y + 0.15, z: pad.z + 0.05 }, PALM_DOWN, 800);
await pause(200);
const tipOffset = await page.evaluate(async () => {
  const w = window.__cake.world;
  const hand = await window.IWER_DEVICE.remote.dispatch('get_transform', { device: 'hand-right' });
  const tip = w.input.xr.visualAdapters.hand.right.visual.joints[9];
  const V = w.camera.position.constructor;
  const p = tip.getWorldPosition(new V());
  return { x: p.x - hand.position.x, y: p.y - hand.position.y, z: p.z - hand.position.z };
});
const handFor = (tip) => ({ x: tip.x - tipOffset.x, y: tip.y - tipOffset.y, z: tip.z - tipOffset.z });
// Down onto the pad's face from above, in a few steps, then back up.
for (const dy of [0.04, 0.02, 0.008, 0.0, -0.006]) {
  const p = handFor({ x: pad.x, y: pad.y + 0.012 + dy, z: pad.z });
  await send('set_transform', { device: 'hand-right', position: p, orientation: PALM_DOWN });
  await pause(120);
}
await pause(300);
await h.screenshot('artifacts/ui-3-poke.png');
const level = await page.evaluate(() => window.__cake.game.level.difficulty);
check('poking the Hard pad starts a hard level', level === 'hard', `level is ${level}`);
const p = handFor({ x: pad.x, y: pad.y + 0.08, z: pad.z });
await send('set_transform', { device: 'hand-right', position: p, orientation: PALM_DOWN });
await pause(300);
await h.head({ x: 0.1, y: 1.45, z: -0.05 }, { x: 0.36, y: 0.95, z: -0.75 }, 700);
await pause(300);
await h.screenshot('artifacts/ui-4-scoreboard.png');

// --- 5. A cut, for the sound log, then render the soundtrack offline.
const knife = await h.objectPosition('Knife');
await h.hand({ x: knife.x, y: knife.y + 0.03, z: knife.z }, PALM_DOWN, 800);
await h.pinch(1);
await h.noteHold('Knife');
await h.hand({ x: knife.x, y: knife.y + 0.3, z: knife.z }, null, 500);
const cake2 = await h.objectPosition('CakePiece');
const over = { x: cake2.x + 0.15 * Math.cos(0), y: 0.92 + 0.004 + 0.1 + 0.07 + 0.034, z: cake2.z };
await h.carry({ x: cake2.x - 0.15, y: over.y, z: cake2.z }, { yaw: 0, pitch: 0, roll: 0 }, 800);
await h.carry({ x: cake2.x - 0.15, y: 0.92 + 0.004 + 0.034 + 0.003, z: cake2.z }, { yaw: 0, pitch: 0, roll: 0 }, 700);
await h.carry({ x: cake2.x - 0.19, y: 0.92 + 0.004 + 0.034 + 0.003, z: cake2.z }, { yaw: 0, pitch: 0, roll: 0 }, 400);
await h.carry({ x: cake2.x - 0.11, y: 0.92 + 0.004 + 0.034 + 0.003, z: cake2.z }, { yaw: 0, pitch: 0, roll: 0 }, 500);
await pause(300);
const log = await page.evaluate(() => window.__cake.game.sound.log.map((e) => e.kind));
check('cutting and the cut reach the sound log', log.includes('cutting') && log.includes('cut'), `log: ${[...new Set(log)].join(', ')} (${log.length} events)`);

const wav = await page.evaluate(async () => {
  const { Soundscape, game } = window.__cake;
  const events = game.sound.log;
  const origin = events[0]?.t ?? 0;
  const buffer = await Soundscape.renderOffline(events, 12, origin, 1);
  const data = buffer.getChannelData(0);
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  const bytes = new Uint8Array(Soundscape.toWav(buffer));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { rms: Math.sqrt(sum / data.length), base64: btoa(binary) };
});
writeFileSync('artifacts/ui-sound.wav', Buffer.from(wav.base64, 'base64'));
check('the offline soundtrack is not silent', wav.rms > 0.01 && wav.rms < 0.3, `rms ${wav.rms.toFixed(4)}`);

const errors = await h.finish();
console.log(`${h.fps.toFixed(1)} fps; errors ${errors.length}; ${results.filter((r) => r.ok).length}/${results.length} checks passed`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
process.exit(results.every((r) => r.ok) && errors.length === 0 ? 0 : 1);
