/**
 * Pinches with the emulated hands at world points, the way a person takes
 * hold of something: each hand's pinch point (between thumb and index tip)
 * is measured once, then the hand is moved so its pinch lands where asked,
 * and closed or opened there. Used to pan and zoom the page's canvas.
 */

export function handGrab(rec) {
  const { page } = rec;
  let installed = false;
  const install = () =>
    page.evaluate(() => {
      const device = window.IWER_DEVICE;
      const { world } = window.__metaNotes;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const frame = () => world.renderer.info.render.frame;
      const nextFrame = async () => {
        const f = frame();
        while (frame() === f) await sleep(8);
      };
      const call = (method, params) => device.remote.dispatch(method, params);
      const offsets = {};
      window.__grab = {
        /** Where `hand`'s pinch closes relative to the hand: pinch once where the hand is (somewhere a pinch takes nothing). */
        async measure(hand) {
          const id = `hand-${hand}`;
          await call('set_select_value', { device: id, value: 1 });
          for (let i = 0; i < 3; i++) await nextFrame();
          const at = (await call('get_transform', { device: id })).position;
          const p = await window.__rec.pinchPoint(hand);
          offsets[hand] = { x: p.x - at.x, y: p.y - at.y, z: p.z - at.z };
          await call('set_select_value', { device: id, value: 0 });
          for (let i = 0; i < 3; i++) await nextFrame();
        },
        /** Move `hand` so its pinch point travels to `to` over `ms` (of video). */
        async move(hand, to, ms, speedUp) {
          const id = `hand-${hand}`;
          const from = (await call('get_transform', { device: id })).position;
          const o = offsets[hand] ?? { x: 0, y: 0, z: 0 };
          const target = { x: to.x - o.x, y: to.y - o.y, z: to.z - o.z };
          const t0 = performance.now();
          for (;;) {
            const t = Math.min(1, (performance.now() - t0) / (ms * speedUp));
            const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
            await call('set_transform', {
              device: id,
              position: { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, z: from.z + (target.z - from.z) * e },
            });
            if (t >= 1) break;
            await nextFrame();
          }
          await nextFrame();
        },
        async pinch(hand, value) {
          await call('set_select_value', { device: `hand-${hand}`, value });
          for (let i = 0; i < 3; i++) await nextFrame();
        },
      };
    });
  const ready = async () => {
    if (!installed) await install();
    installed = true;
  };
  return {
    measure: async (hand) => (await ready(), page.evaluate((h) => window.__grab.measure(h), hand)),
    /** Move a hand's pinch point to a world point; `ms` of video. */
    move: async (hand, to, ms = 600) => (await ready(), page.evaluate(([h, t, m, s]) => window.__grab.move(h, t, m, s), [hand, to, ms, rec.speedUp])),
    /** Close (1) or open (0) a hand's pinch. */
    pinch: async (hand, value) => (await ready(), page.evaluate(([h, v]) => window.__grab.pinch(h, v), [hand, value])),
  };
}
