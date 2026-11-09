/**
 * Checks the guests' `Walk` clip: every adult species plays it when `walkTo()` is called,
 * the guest slides at the asked speed while the clip runs at the matching pace, and `Idle`
 * takes over at the end.
 *
 * Usage: dev server running, then
 *   CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/check-walk.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.APP_URL ?? 'https://localhost:8081/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--ignore-certificate-errors'] });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(URL);
await page.waitForFunction(() => window.__cafe, null, { timeout: 60000 });

const report = await page.evaluate(async () => {
  const { system } = window.__cafe;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const running = (g) => g.mixer?._actions.filter((a) => a.isRunning()).map((a) => `${a.getClip().name}@${a.timeScale}`) ?? [];
  const out = { species: {} };
  // Every adult species walks 6 cm sideways at 3 cm/s (2 s); the clip is retimed to that speed.
  const starts = system.guests.map((g) => g.root.position.clone());
  system.guests.forEach((g, i) => {
    if (g.mixer) system.walkTo(i, starts[i].x, starts[i].z + 0.06, 0.03);
  });
  // Tint check: each adult guest has its own skin material with its own colour.
  const skins = system.guests.slice(0, 3).map((g) => {
    let m = null;
    g.root.traverse((o) => { if (o.isMesh && o.material?.name?.startsWith('GuestSkin')) m = m ?? o.material; });
    return m;
  });
  out.tints = skins.map((m) => (m ? '#' + m.color.getHexString() : null));
  out.distinctSkinMaterials = new Set(skins.map((m) => m?.uuid)).size;
  // Node check: the three-part legs are there.
  out.legNodes = ['Leg-L', 'Shin-L', 'Foot-L', 'Leg-R', 'Shin-R', 'Foot-R'].every((n) => system.guests[0].root.getObjectByName('St-' + n) && system.guests[0].root.getObjectByName('Se-' + n));
  await sleep(700);
  system.guests.forEach((g, i) => {
    if (!g.mixer) return;
    out.species[g.model] = { midwayMoved: +g.root.position.distanceTo(starts[i]).toFixed(4), midway: running(g), yawDeg: Math.round((g.root.rotation.y * 180) / Math.PI) };
  });
  await sleep(1800);
  system.guests.forEach((g, i) => {
    if (!g.mixer) return;
    Object.assign(out.species[g.model], { endDist: +g.root.position.distanceTo(starts[i]).toFixed(4), end: running(g), standingVisible: g.root.getObjectByName('Standing').visible });
  });
  return out;
});
console.log(JSON.stringify({ errors, ...report }, null, 1));
await browser.close();
