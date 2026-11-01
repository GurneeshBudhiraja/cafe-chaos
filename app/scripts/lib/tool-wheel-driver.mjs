/**
 * Driving the tool wheel from a headset recording (see headset-recorder.mjs):
 * aim the held pen at wheel segments, the options ring or the hub, and
 * open and pick with pen taps. Shared by check-tool-wheel.mjs and
 * record-tool-wheel.mjs.
 *
 * The constants mirror the app's (tool-catalog.ts, tool-wheel-system.ts,
 * tool-options-ring.ts); change them together.
 */

export const WHEEL_ITEMS = ['pen', 'marker', 'highlighter', 'eraser', 'lasso', 'undo', 'redo'];
const WHEEL_SCALE = 0.85;
const OPTIONS_RADIUS = 0.118;
const OPTIONS_SPACING_DEG = 22;
/** How far to slide the nib over the page to aim at a segment (metres; the hub is the first 3.9 cm). */
const SEGMENT_REACH_M = 0.06;
export const OPTIONS_REACH_M = OPTIONS_RADIUS * WHEEL_SCALE;

export function toolWheelDriver(rec) {
  const { page } = rec;

  /** The app's state the scripts read. */
  const state = () =>
    page.evaluate(() => {
      const { world, session } = window.__metaNotes;
      const tools = world.globals['metaNotes.tools'];
      const pen = world.globals['metaNotes.pen'];
      const wheel = world.getSystems().find((s) => s.constructor.name === 'ToolWheelSystem');
      return {
        tool: tools?.tool,
        wheelOpen: tools?.wheelOpen,
        penHeld: pen?.held,
        hovered: wheel?.hovered ?? null,
        wheelVisible: wheel?.wheel?.visible,
        strokes: session.active?.pages[0].strokes.length ?? 0,
      };
    });

  /** World point for the nib to aim in direction `angleDeg` (null: the hub), sliding `reach` metres over the page. */
  const aimToward = (angleDeg, reach) =>
    page.evaluate(
      ([deg, distance]) => {
        const { world } = window.__metaNotes;
        const system = world.getSystems().find((s) => s.constructor.name === 'ToolWheelSystem');
        const local = system.aimOrigin.clone();
        if (deg !== null) {
          local.x += Math.cos((deg * Math.PI) / 180) * distance;
          local.y += Math.sin((deg * Math.PI) / 180) * distance;
        }
        const p = system.surface.localToWorld(local);
        return { x: p.x, y: p.y, z: p.z };
      },
      [angleDeg, reach],
    );

  const aimPoint = (name) => aimToward(name ? 90 - (WHEEL_ITEMS.indexOf(name) * 360) / WHEEL_ITEMS.length : null, SEGMENT_REACH_M);
  const aimSwatch = (index, count) => aimToward(90 + ((count - 1) / 2 - index) * OPTIONS_SPACING_DEG, OPTIONS_REACH_M);
  const aimSize = (size) => aimToward(270 - (1 - ['fine', 'medium', 'bold'].indexOf(size)) * OPTIONS_SPACING_DEG, OPTIONS_REACH_M);
  const aimDelete = () => aimToward(270, OPTIONS_REACH_M);

  /** World point over page point (u, v), `lift` metres above the page. */
  const overPage = (u, v, lift) =>
    page.evaluate(
      ([pu, pv, l]) => {
        const s = window.__metaNotes.world.scene.getObjectByName('WritingSurface');
        const { width, height } = s.geometry.parameters;
        const p = s.localToWorld(new s.position.constructor((pu - 0.5) * width, (0.5 - pv) * height, l));
        return { x: p.x, y: p.y, z: p.z };
      },
      [u, v, lift],
    );

  /** Lift the nib off the page (as when pausing to change tools). */
  const liftPen = async (ms = 400) =>
    rec.moveNibTo(
      await page.evaluate(() => {
        const n = window.__metaNotes.world.globals['metaNotes.pen'].nib;
        return { x: n.x, y: n.y + 0.04, z: n.z };
      }),
      ms,
    );

  /**
   * Open the wheel with a double-tap (unless it is open), then aim at each
   * target in turn and tap to pick it. `aimMs` paces each aim; `dwellMs`
   * holds on each target before the tap, so it reads on video.
   */
  const pickOnWheel = async (targets, { aimMs = 450, dwellMs = 0 } = {}) => {
    if (!(await state()).wheelOpen) await rec.penTap(2);
    for (const target of targets) {
      await rec.moveNibTo(await target(), aimMs);
      if (dwellMs) await rec.pause(dwellMs);
      await rec.penTap(1);
    }
  };

  return { state, aimToward, aimPoint, aimSwatch, aimSize, aimDelete, overPage, liftPen, pickOnWheel };
}
