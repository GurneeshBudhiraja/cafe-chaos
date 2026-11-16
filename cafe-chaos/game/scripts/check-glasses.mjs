/**
 * Meta VR Glasses check: the game fits the Glasses' narrow view, and the
 * Quest's wide view is unchanged.
 * 1. On a wide view (the emulator's Quest 3): the café at full size, the bar
 *    at full size over the back edge (as designed for Quest).
 * 2. On a narrow view (`?fov=narrow`, as the Glasses' own view triggers):
 *    looking at the café from the seat, the café and the bar are inside the
 *    Glasses' design area (58 x 54 degrees, so 29 to each side and 27 up and
 *    down from the gaze).
 * 3. Nothing on the console.
 *
 * Usage: dev server running, then `node scripts/check-glasses.mjs`.
 * Output: PASS/FAIL lines.
 */

const BASE = process.env.APP_URL_GAME ?? 'https://localhost:8082/';
const SEAT = { x: -0.85, y: 1.22, z: 0.28 };
const AREA = { h: 29, v: 27 };
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

/** Into a run from the seat, looking at the café's middle; the angles (degrees from the gaze) of the bar's and the café's edges. */
async function measure(query) {
  process.env.APP_URL = BASE + query;
  const { startHeadset } = await import(`./lib/headset.mjs?${query}`);
  const h = await startHeadset({
    async prepare(h) {
      await h.head(SEAT, { x: -1.3, y: 0.79, z: 0.28 });
      await h.page.evaluate(() => window.__cafe.system.replace());
      await h.page.waitForFunction(() => window.__cafe.system.placed && !window.__cafe.system.arriving && window.__cafe.game.phase === 'title', null, { timeout: 60000 });
    },
  });
  const { page } = h;
  const until = (fn) => page.waitForFunction(fn, null, { timeout: 60000, polling: 100 });
  await page.evaluate(() => window.__cafe.game.click('open'));
  await until(() => !window.__cafe.system.waiting && !window.__cafe.system.arriving);
  await page.evaluate(() => window.__cafe.game.click('skip'));
  await until(() => window.__cafe.game.phase === 'run');
  const mid = await page.evaluate(() => { const c = window.__cafe.system.cafe.position; return { x: c.x, y: c.y + 0.06, z: c.z }; });
  await h.head(SEAT, mid, 300);
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const { game, strip, system } = window.__cafe;
    const e = game.head.clone();
    const V = e.constructor;
    const f = new V(0, 0, -1).applyQuaternion(game.player.head.getWorldQuaternion(game.headQ.clone()));
    const right = f.clone().cross(new V(0, 1, 0)).normalize();
    const up = right.clone().cross(f).normalize();
    const ang = (p) => { const d = p.clone().sub(e); const z = d.dot(f); return [Math.atan2(d.dot(right), z) * 57.3, Math.atan2(d.dot(up), z) * 57.3]; };
    const bar = strip.panel.mesh;
    bar.updateWorldMatrix(true, false);
    const g = bar.geometry.parameters;
    const C = system.cafe;
    const fp = system.footprint;
    const pts = [
      bar.localToWorld(new V(-g.width / 2, g.height / 2, 0)), bar.localToWorld(new V(g.width / 2, g.height / 2, 0)),
      bar.localToWorld(new V(-g.width / 2, -g.height / 2, 0)), bar.localToWorld(new V(g.width / 2, -g.height / 2, 0)),
      system.frontEdge(new V()), C.localToWorld(new V(fp.minX, 0, 0)), C.localToWorld(new V(fp.maxX, 0, 0)), C.localToWorld(new V(0, 0.405, fp.minZ)),
    ].map(ang);
    return { narrow: strip.narrow, barSize: strip.panel.size, scale: C.scale.x, viewFactor: system.viewFactor, worstH: Math.max(...pts.map((p) => Math.abs(p[0]))), worstV: Math.max(...pts.map((p) => Math.abs(p[1]))) };
  });
  const errors = await h.finish();
  return { ...r, errors };
}

const wide = await measure('');
check('wide view (Quest): the café and the bar at full size, as designed', !wide.narrow && wide.viewFactor === 1 && wide.barSize === 1, JSON.stringify({ narrow: wide.narrow, viewFactor: wide.viewFactor, barSize: wide.barSize }));
const narrow = await measure('?fov=narrow');
check(`narrow view (Glasses): the café and the bar inside the design area (${AREA.h * 2} x ${AREA.v * 2} deg)`, narrow.narrow && narrow.worstH <= AREA.h && narrow.worstV <= AREA.v, `furthest ${narrow.worstH.toFixed(1)} deg across, ${narrow.worstV.toFixed(1)} deg up or down; café at ${(narrow.viewFactor * 100).toFixed(0)} %, bar at ${(narrow.barSize * 100).toFixed(0)} %`);
const errors = [...wide.errors, ...narrow.errors];
check('no console errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean');
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} FAILED` : `${results.length}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
