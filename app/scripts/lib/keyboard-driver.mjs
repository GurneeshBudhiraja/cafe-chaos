/**
 * Types on the desk keyboard with the emulated hands' index fingertips, the
 * way a person types on it: each fingertip hovers over its key, comes down
 * onto the cap and lifts clear again. Keys left of the keyboard's middle are
 * struck with the left hand, the rest with the right.
 *
 * Only characters the keyboard has can be typed: letters, digits, space,
 * comma and period, and the number row's shifted symbols (! @ # $ % ^ & * ( )).
 * '\n' is return, '\b' is delete.
 */

/** Hover this far over a cap between strikes, and come down this far over it (fingertip joint, metres). */
const HOVER_M = 0.024;
const STRIKE_M = 0.002;

const SHIFTED = { '!': 'Digit1', '@': 'Digit2', '#': 'Digit3', $: 'Digit4', '%': 'Digit5', '^': 'Digit6', '&': 'Digit7', '*': 'Digit8', '(': 'Digit9', ')': 'Digit0' };

/** The keys to strike for one character: [code, needs shift]. */
function keyFor(char) {
  if (char === ' ') return ['Space', false];
  if (char === '\n') return ['Enter', false];
  if (char === '\b') return ['Backspace', false];
  if (char === ',') return ['Comma', false];
  if (char === '.') return ['Period', false];
  if (/[0-9]/.test(char)) return [`Digit${char}`, false];
  if (/[a-z]/.test(char)) return [`Key${char.toUpperCase()}`, false];
  if (/[A-Z]/.test(char)) return [`Key${char}`, true];
  if (SHIFTED[char]) return [SHIFTED[char], true];
  throw new Error(`The desk keyboard has no key for ${JSON.stringify(char)}`);
}

export function keyboardDriver(rec) {
  const { page } = rec;
  let installed = false;
  const install = () =>
    page.evaluate(() => {
      const { world } = window.__metaNotes;
      const device = window.IWER_DEVICE;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const frame = () => world.renderer.info.render.frame;
      const nextFrame = async () => {
        const f = frame();
        while (frame() === f) await sleep(8);
      };
      const call = (method, params) => device.remote.dispatch(method, params);
      const system = () => world.getSystems().find((s) => s.constructor.name === 'DeskKeyboardSystem');
      const offsets = {};
      window.__keys = {
        /** Point both hands' fingers down at the keyboard and measure where each fingertip is relative to its hand. */
        async ready(rest) {
          for (const hand of ['left', 'right']) {
            const id = `hand-${hand}`;
            const side = hand === 'left' ? 'Digit3' : 'Digit8';
            const over = system().keyPoint(side, 0.06);
            await call('set_transform', { device: id, position: { x: over.x, y: over.y + 0.1, z: over.z } });
            // Aim the hand at a point below and ahead: its index finger then points down onto the keys.
            const below = system().keyPoint(hand === 'left' ? 'KeyX' : 'KeyM', -0.15);
            await call('look_at', { device: id, target: below });
            for (let i = 0; i < 3; i++) await nextFrame();
            const hand3 = await call('get_transform', { device: id });
            const tip = system().fingers[hand].tip;
            offsets[hand] = { x: tip.x - hand3.position.x, y: tip.y - hand3.position.y, z: tip.z - hand3.position.z };
            const p = rest[hand];
            if (p) await call('set_transform', { device: id, position: p });
          }
        },
        /** Move `hand`'s fingertip to a world point over `frames` frames. */
        async moveTip(hand, to, frames) {
          const id = `hand-${hand}`;
          const now = (await call('get_transform', { device: id })).position;
          const o = offsets[hand];
          const target = { x: to.x - o.x, y: to.y - o.y, z: to.z - o.z };
          for (let i = 1; i <= frames; i++) {
            const t = i / frames;
            const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
            await call('set_transform', {
              device: id,
              position: { x: now.x + (target.x - now.x) * e, y: now.y + (target.y - now.y) * e, z: now.z + (target.z - now.z) * e },
            });
            await nextFrame();
          }
        },
        /** Strike key `code` with `hand`: hover over it, come down, lift. */
        async strike(code, hand, hover, strike, travelFrames) {
          await this.moveTip(hand, system().keyPoint(code, hover), travelFrames);
          await this.moveTip(hand, system().keyPoint(code, strike), 1);
          await nextFrame();
          await this.moveTip(hand, system().keyPoint(code, hover), 1);
        },
        /** Keys left of the keyboard's middle are the left hand's. */
        handFor(code) {
          const LEFT = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'ShiftLeft', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'Symbols'];
          return LEFT.includes(code) ? 'left' : 'right';
        },
      };
    });

  return {
    /** Bring the hands over the keyboard, fingers down (call once the keyboard is out). `rest`: where each hand waits after. */
    async ready(rest = {}) {
      if (!installed) await install();
      installed = true;
      await page.evaluate((r) => window.__keys.ready(r), rest);
    },
    /** Type `text` on the desk keyboard, a key at a time. `travelFrames`: frames to move between keys. */
    async type(text, { travelFrames = 2 } = {}) {
      for (const char of text) {
        const [code, shift] = keyFor(char);
        if (shift) await page.evaluate(([h, s]) => window.__keys.strike('ShiftLeft', 'left', h, s, 2), [HOVER_M, STRIKE_M]);
        const hand = await page.evaluate((c) => window.__keys.handFor(c), code);
        await page.evaluate(([c, hd, h, s, f]) => window.__keys.strike(c, hd, h, s, f), [code, hand, HOVER_M, STRIKE_M, travelFrames]);
      }
    },
    /** Move a hand's fingertip to hover over a key (to start from, or to rest). */
    hover: (code, hand) => page.evaluate(([c, hd, h]) => window.__keys.moveTip(hd, window.__metaNotes.world.getSystems().find((s) => s.constructor.name === 'DeskKeyboardSystem').keyPoint(c, h), 3), [code, hand, HOVER_M]),
  };
}
