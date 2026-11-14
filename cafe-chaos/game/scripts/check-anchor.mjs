/**
 * Pinning the café to the real world (AnchorSystem), from the seat:
 * 1. once the café has landed and stood still, it is pinned to an anchor;
 * 2. moved (as by the hand), the anchor is let go, and a new one is made
 *    where the café now stands once it is still again;
 * 3. when the headset corrects where the anchor's real point is (as it does
 *    while refining its map of the room), the café moves with it;
 * 4. standing still, it is not nudged frame after frame.
 * Usage: dev server running, then `node scripts/check-anchor.mjs`.
 * Output: PASS/FAIL lines.
 */

process.env.APP_URL = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const { startHeadset } = await import('./lib/headset.mjs');
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const LOOK = { x: -1.3, y: 0.79, z: 0.28 };
const h = await startHeadset({
  async prepare(h) {
    await h.head(SEAT, LOOK);
    await h.page.evaluate(() => window.__cafe.system.replace());
    await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving, null, { timeout: 60000 });
  },
});
const { page } = h;
const results = [];
const check = (name, pass, detail) => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${detail}`); };
const until = (fn, timeout = 30000) => page.waitForFunction(fn, null, { timeout, polling: 200 }).then(() => true, () => false);
const state = () => page.evaluate(() => {
  const { anchor, system } = window.__cafe;
  const c = system.cafe;
  // Where the café stands on its table, in the table's own space (the real-world relation).
  let onTable = null;
  for (const e of system.queries.planes.entities) {
    const o = e.object3D;
    if (!o) continue;
    const local = o.worldToLocal(c.position.clone());
    if (Math.abs(local.y) < 0.06) onTable = local.toArray().map((v) => +v.toFixed(4));
  }
  return { pinned: !!anchor.anchor, made: anchor.made, corrected: anchor.corrected, at: c.position.toArray().map((v) => +v.toFixed(4)), yaw: +c.rotation.y.toFixed(4), onTable };
});

// 1. Pinned once still.
const pinned = await until(() => !!window.__cafe.anchor.anchor);
let s = await state();
check('once the café has landed and stood still it is pinned to an anchor', pinned && s.made >= 1, JSON.stringify(s));
// 4. Still: not nudged.
const before = s.corrected;
await page.waitForTimeout(4000);
s = await state();
check('standing still it is not nudged frame after frame', s.corrected === before, `corrections ${before} -> ${s.corrected}`);
const made0 = s.made;
// 2. Moved as by the hand: let go, then pinned again where it now stands.
await page.evaluate(() => { const c = window.__cafe.system.cafe; c.position.x += 0.05; c.position.z -= 0.03; });
await page.waitForTimeout(300);
const during = await state();
const again = await page.waitForFunction((m) => window.__cafe.anchor.made > m && !!window.__cafe.anchor.anchor, made0, { timeout: 30000, polling: 200 }).then(() => true, () => false);
s = await state();
check('moved, the anchor is let go and a new one made where it now stands', again && !during.pinned && s.made === during.made + 1 && Math.abs(s.at[0] - during.at[0]) < 0.002, `${JSON.stringify(during)} -> ${JSON.stringify(s)}`);
// 3. The headset corrects the anchor's real point (here: 2 cm along x, as a refined room map would).
const at0 = s.at;
await page.evaluate(() => {
  const space = window.__cafe.anchor.anchor.anchorSpace;
  const key = Object.getOwnPropertySymbols(space).find((k) => space[k]?.offsetMatrix);
  space[key].offsetMatrix[12] += 0.02;
});
await page.waitForTimeout(3000);
s = await state();
const moved = s.at[0] - at0[0];
check('when the headset corrects the anchor, the café moves with it', s.corrected > 0 && Math.abs(moved - 0.02) < 0.002 && s.pinned, `x ${at0[0]} -> ${s.at[0]} (moved ${(moved * 1000).toFixed(1)} mm), corrections ${s.corrected}`);
const errors = await h.finish();
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
