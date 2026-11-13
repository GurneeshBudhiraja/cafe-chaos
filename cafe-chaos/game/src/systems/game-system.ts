/**
 * GameSystem: the evening, from the title card to the café closing.
 *
 * - Title. Once the café is on the table, a card shows: Café Chaos, the
 *   bank, the longest the café has stayed open, and its buttons. The café
 *   is quiet behind it (the staff work, no guests come).
 * - How to play, and Back.
 * - The first run teaches by doing: short steps on a small coach card
 *   (pick up the guest at the gate; seat it; watch the server bring its
 *   tea). Every step has Skip. The guest's patience is held, so nothing
 *   goes wrong while the player learns.
 * - The run: one endless evening. The clock counts up from 0:00; guests
 *   come faster and wait less patiently as it goes on (game/rules.ts
 *   RAMP); the café closes when its happiness reaches zero. Coins go to
 *   the bank and hire servers (ShopSystem), who stay hired.
 * - Pause: everything in the café stops where it is (Resume, or End the
 *   run). Pause, hiring and How to play are on the wrist menu
 *   (WristMenuSystem: turn the left palm toward you); a small pause tab
 *   at the table's edge does the same for anyone who never tries it. The game pauses itself when the headset comes off or another
 *   app takes over, and the bank is saved then too.
 * - Closing card: how long the café stayed open, the record, guests fed,
 *   coins earned; Play again or Menu.
 *
 * The bank, the staff, the records and whether the first run has been
 * seen are kept between sessions (game/save.ts).
 *
 * In test mode (`?test`: the checks and recordings) none of this shows:
 * guests come at once and all six servers work, as before there was a
 * game around the café.
 */

import { createSystem, Vector3 } from '@iwsdk/core';
import { arrivalPace, MEAL_SECONDS, patienceShare, WISH, wishChance } from '../game/rules.js';
import { loadSave, TEST_MODE, writeSave, type Save } from '../game/save.js';
import { PATIENCE_SECONDS } from '../guests/rules.js';
import { HANDS, type Hand } from '../lib/hand-pinch.js';
import { coin, INK, moodFace, Panel, paragraph, roundRect, write, type Button } from '../ui/panel.js';
import { castLoaded } from '../guests/actor.js';
import { randomLook } from '../guests/cast.js';
import { BaristaSystem } from './barista-system.js';
import { clockText } from '../game/clock.js';
import { sketchButton } from '../ui/sketch-button.js';
import { sketchFontReady } from '../ui/sketch.js';
import { StripSystem } from './strip-system.js';
import { CafeSystem } from './cafe-system.js';
import { GuestSystem } from './guest-system.js';
import { HoldSystem } from './hold-system.js';
import { ScoreSystem } from './score-system.js';
import { ShopSystem } from './shop-system.js';

export type GamePhase = 'waiting' | 'title' | 'rules' | 'tutorial' | 'run' | 'paused' | 'closed' | 'test';

/**
 * The cards: the big one (title, pause, closing), How to play, and the
 * first run's coach card. Sizes are real metres (ui/panel.ts); places are
 * in the café's space. The coach card stands over the back of the café,
 * clear of the gate and the seats the player is working at.
 */
const CARD = { width: 0.34, height: 0.24, position: [0, 0.22, 0.1] as const };
const HOW = { width: 0.5, height: 0.255, position: [0, 0.23, 0.1] as const };
const COACH = { width: 0.34, height: 0.12, position: [-0.08, 0.34, -0.2] as const };
/** The pause tab at the table's edge: its size (real metres), and how far out from the café's front-right corner it stands (café space). */
const TAB = { width: 0.06, height: 0.045, inX: 0.06, outZ: 0.05 };
/** Canvas pixels per millimetre of card (ui/panel.ts draws at 2400 px a metre). */
const MM = 2.4;

/**
 * The game in three pictures, taken from the game itself
 * (scripts/shoot-howto.mjs). How to play shows all three; the first run's
 * coach card shows the one for the step in hand.
 */
const MOVES = [
  { picture: 'howto-pinch.jpg', title: 'Pinch a guest', text: 'Hold your fingers over a guest at the gate. When it lights up, pinch.' },
  { picture: 'howto-seat.jpg', title: 'Seat them', text: 'Carry them over the café and let go. They take the glowing seat.' },
  { picture: 'howto-hire.jpg', title: 'Your menu', text: 'Turn your left palm toward you: pause and hire servers from the menu by your wrist.' },
];
/** The bank is saved this often during a run (seconds), so little is lost if the page is closed. */
const AUTOSAVE_SECONDS = 20;

/** The first run: what each step says, and what moves it on (besides Next). */
interface Step {
  title: string;
  text: string;
  /** True once the player has done what the step asks. */
  done?: (game: GameSystem) => boolean;
  /** A Next button (steps that are read rather than done). */
  next?: boolean;
  /** Which of the MOVES pictures goes with it. */
  picture: number;
}

export class GameSystem extends createSystem({}) {
  phase: GamePhase = 'waiting';
  /** The first run's step (0-based) while in it. */
  step = 0;
  /** Seconds the café has been open this run. */
  clock = 0;
  /** The last run beat the record for staying open. */
  record = false;
  readonly save: Save = loadSave();
  readonly card = new Panel('GameCard', CARD.width, CARD.height);
  readonly how = new Panel('HowCard', HOW.width, HOW.height);
  readonly coach = new Panel('CoachCard', COACH.width, COACH.height);
  /** The MOVES pictures, once loaded. */
  private readonly pictures: (HTMLImageElement | null)[] = MOVES.map(() => null);
  /** Buttons pressed (for the checks and sounds). */
  clicks = 0;
  readonly steps: Step[] = firstRun();
  guests!: GuestSystem;
  score!: ScoreSystem;
  baristas!: BaristaSystem;
  shop!: ShopSystem;
  /** The pause tab at the table's edge: the menu for those who never turn their palm. */
  readonly tab = new Panel('PauseTab', TAB.width, TAB.height);
  /** Times the wrist menu has been opened (WristMenuSystem counts them; the first run waits for one). */
  wristOpens = 0;
  /** Where How to play was opened from: back there when it is closed. */
  private rulesFrom: GamePhase = 'title';
  strip!: StripSystem;
  private cafe!: CafeSystem;
  private hold: HoldSystem | null = null;
  private readonly previous: Record<Hand, boolean> = { left: false, right: false };
  private readonly head = new Vector3();
  /** Counts when the step began (to tell when the player has done it). */
  mark = { pickedUp: 0, seated: 0, served: 0, wristOpens: 0 };
  /** The first run's guest is still to come (its model may still be loading). */
  private needGuest = false;
  private placement = -1;
  /** The café's own speed, kept while paused. */
  private speed = 1;
  private sinceSave = 0;
  /** Every card with buttons, and the button lit on each this frame. */
  private panels: Panel[] = [];
  private readonly hovers: (string | null)[] = [];

  init(): void {
    this.cafe = this.world.getSystem(CafeSystem)!;
    this.guests = this.world.getSystem(GuestSystem)!;
    this.baristas = this.world.getSystem(BaristaSystem)!;
    this.shop = this.world.getSystem(ShopSystem)!;
    this.score = this.world.getSystem(ScoreSystem)!;
    this.strip = this.world.getSystem(StripSystem)!;
    this.hold = this.world.getSystem(HoldSystem) ?? null;
    for (const panel of [this.card, this.how, this.coach]) this.cafe.cafe.add(panel.mesh);
    this.card.mesh.position.set(...CARD.position);
    this.how.mesh.position.set(...HOW.position);
    MOVES.forEach((move, i) => {
      const image = new Image();
      image.onload = () => {
        this.pictures[i] = image;
        // Cards already up are drawn again with it.
        this.how.paint();
        this.coach.paint();
      };
      image.src = `${import.meta.env.BASE_URL}ui/${move.picture}`;
    });
    this.coach.mesh.position.set(...COACH.position);
    // A pinch on a card is the card's, never the café's or a guest's.
    this.hold?.claims.push((point) => this.card.covers(point) || this.how.covers(point) || this.coach.covers(point));
    this.cafe.cafe.add(this.tab.mesh);
    this.tab.frame = false;
    this.tab.turn = 2.5;
    this.layoutTab();
    void sketchFontReady.then(() => this.layoutTab());
    this.panels = [this.card, this.how, this.coach, this.tab];
    this.hovers.length = this.panels.length;
    this.shop.bought.push(() => this.keep());
    if (TEST_MODE) {
      this.phase = 'test';
      return;
    }
    // The café as it was left: its bank and its staff.
    this.score.bank = this.save.bank;
    this.shop.restore(this.save.hires);
    this.guests.mealSeconds = MEAL_SECONDS;
    this.quiet();
    // The headset taken off, or another app in front: pause and save.
    const xr = this.world.renderer.xr;
    const onVisibility = (): void => {
      if (xr.getSession()?.visibilityState !== 'visible') this.pause();
    };
    xr.addEventListener('sessionstart', () => xr.getSession()?.addEventListener('visibilitychange', onVisibility));
    xr.addEventListener('sessionend', () => this.pause());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });
  }

  update(frameDelta: number): void {
    if (this.phase === 'test') return;
    const cafe = this.cafe;
    const delta = Math.min(1, frameDelta) * cafe.timeScale;
    // The café put down (afresh): back to the title.
    if (cafe.placed && cafe.placements !== this.placement) {
      this.placement = cafe.placements;
      this.toTitle();
    }
    this.player.head.getWorldPosition(this.head);
    // The cards move at their own speed, paused or not.
    const cardDelta = Math.min(0.1, frameDelta);
    this.card.update(cardDelta, this.head);
    this.how.update(cardDelta, this.head);
    this.coach.update(cardDelta, this.head);
    if (!cafe.placed || cafe.arriving) return;
    this.press();
    if (this.phase === 'tutorial') this.coachTick();
    if (this.phase === 'run') this.runTick(delta);
  }

  // ------------------------------------------------------------- the phases

  /** The title card. */
  toTitle(): void {
    this.unpause();
    this.phase = 'title';
    this.quiet();
    this.coach.show(false);
    this.score.clock = 0;
    this.tab.show(false);
    this.strip.best = this.save.bestSeconds;
    this.strip.live = false;
    this.strip.settle();
    this.strip.panel.show(true);
    this.how.show(false);
    const cw = this.card.width;
    const ch = this.card.height;
    this.card.set(
      (ctx, w, h) => {
        write(ctx, 'Café Chaos', w / 2, h * 0.2, 24 * MM, { weight: 800, font: 'Georgia, serif' });
        write(ctx, 'How long can you keep the café open?', w / 2, h * 0.36, 6.5 * MM, { weight: 600, color: INK.inkSoft });
        if (this.save.bestSeconds > 0) write(ctx, `Longest evening  ${clockText(this.save.bestSeconds)}`, w / 2, h * 0.47, 6.5 * MM, { weight: 800, color: INK.amberDeep });
      },
      [
        { id: 'open', label: 'Open the café', x: cw * 0.2, y: ch * 0.56, w: cw * 0.6, h: 36 * MM, primary: true },
        { id: 'rules', label: 'How to play', x: cw * 0.3, y: ch * 0.79, w: cw * 0.4, h: 26 * MM },
      ],
    );
    this.card.show(true);
  }

  /** How to play: the game in three pictures, each with a line. */
  toRules(): void {
    this.rulesFrom = this.phase;
    this.phase = 'rules';
    this.card.show(false);
    const hw = this.how.width;
    const hh = this.how.height;
    this.how.set(
      (ctx, w, h) => {
        write(ctx, 'How to play', w / 2, h * 0.1, 11.5 * MM, { weight: 800, font: 'Georgia, serif' });
        const pw = w * 0.285;
        const ph = pw * 0.72;
        const gap = w * 0.025;
        const x0 = (w - 3 * pw - 2 * gap) / 2;
        const y0 = h * 0.18;
        MOVES.forEach((move, i) => {
          const x = x0 + i * (pw + gap);
          picture(ctx, this.pictures[i], x, y0, pw, ph, 5 * MM);
          badge(ctx, i + 1, x + 6.5 * MM, y0 + 6.5 * MM, 6.5 * MM);
          write(ctx, move.title, x + pw / 2, y0 + ph + 10 * MM, 8.5 * MM, { weight: 800 });
          paragraph(ctx, move.text, x + pw / 2, y0 + ph + 20 * MM, pw * 0.98, 6.2 * MM, { align: 'center', color: INK.inkSoft });
        });
      },
      [{ id: 'back', label: 'Got it', x: hw / 2 - 40 * MM, y: hh - 37 * MM, w: 80 * MM, h: 28 * MM, primary: true }],
    );
    this.how.show(true);
  }

  /** The first run's teaching: a guest waits at the gate, its patience held, and the coach card says what to do. */
  toTutorial(): void {
    this.unpause();
    this.phase = 'tutorial';
    this.card.show(false);
    this.how.show(false);
    this.guests.clear();
    this.guests.arrivals = false;
    this.guests.patienceFrozen = true;
    this.needGuest = true;
    this.goToStep(0);
  }

  /** Open the café: guests come, the clock runs up from 0:00, the board is live. */
  toRun(): void {
    this.unpause();
    if (this.phase !== 'tutorial') this.guests.clear();
    this.phase = 'run';
    this.card.show(false);
    this.how.show(false);
    this.coach.show(false);
    this.guests.arrivals = true;
    this.guests.patienceFrozen = false;
    this.clock = 0;
    this.sinceSave = 0;
    this.record = false;
    this.pace();
    this.score.startRun();
    this.score.clock = 0;
    this.tab.show(true);
    this.layoutTab();
    this.strip.best = this.save.bestSeconds;
    this.strip.live = true;
    this.strip.settle();
    this.strip.panel.show(true);
  }

  /** Stop everything in the café where it is, and save. No-op unless a run is on. */
  pause(): void {
    if (this.phase !== 'run') return;
    this.phase = 'paused';
    this.speed = this.cafe.timeScale;
    this.cafe.timeScale = 0;
    this.guests.handsOff = true;
    this.keep();
    this.showPauseCard();
    this.layoutTab();
  }

  /** The pause card over the café: Resume, or End the evening. */
  private showPauseCard(): void {
    this.card.set(
      (ctx, w, h) => {
        write(ctx, 'Paused', w / 2, h * 0.2, h * 0.12, { weight: 800, font: 'Georgia, serif' });
        write(ctx, `Open for ${clockText(this.clock)}`, w / 2, h * 0.36, h * 0.06, { weight: 600, color: INK.inkSoft });
      },
      [
        { id: 'resume', label: 'Resume', x: this.card.width * 0.25, y: this.card.height * 0.5, w: this.card.width * 0.5, h: this.card.height * 0.14, primary: true },
        { id: 'end', label: 'End the evening', x: this.card.width * 0.27, y: this.card.height * 0.72, w: this.card.width * 0.46, h: this.card.height * 0.11 },
      ],
    );
    this.card.show(true);
  }

  /** Carry on from a pause. */
  resume(): void {
    if (this.phase !== 'paused') return;
    this.unpause();
    this.phase = 'run';
    this.card.show(false);
    this.layoutTab();
  }

  /** The café closes: the run is over. The time it stayed open is the score. */
  toClosed(): void {
    this.unpause();
    this.phase = 'closed';
    this.tab.show(false);
    this.strip.live = false;
    this.quiet();
    const s = this.score;
    const seconds = this.clock;
    this.record = seconds > this.save.bestSeconds;
    if (this.record) this.save.bestSeconds = seconds;
    this.save.bestCoins = Math.max(this.save.bestCoins, s.takings);
    this.save.runs++;
    this.keep();
    const record = this.record;
    this.card.set(
      (ctx, w, h) => {
        write(ctx, 'The café is closed', w / 2, h * 0.14, h * 0.085, { weight: 800, font: 'Georgia, serif' });
        write(ctx, record ? 'Your longest evening yet!' : `Longest evening: ${clockText(this.save.bestSeconds)}`, w / 2, h * 0.24, h * 0.045, { weight: 500, color: record ? INK.amberDeep : INK.inkSoft });
        write(ctx, `Open for ${clockText(seconds)}`, w / 2, h * 0.39, h * 0.1, { weight: 800 });
        coin(ctx, w * 0.3, h * 0.54, h * 0.035);
        write(ctx, `+${s.takings} coins`, w * 0.34, h * 0.54, h * 0.055, { weight: 700, align: 'left' });
        moodFace(ctx, w * 0.62, h * 0.54, h * 0.035, 0.6);
        write(ctx, `${s.servedGuests} fed`, w * 0.66, h * 0.54, h * 0.055, { weight: 700, align: 'left' });
        write(ctx, `Bank: ${s.bank}`, w / 2, h * 0.66, h * 0.042, { weight: 600, color: INK.inkSoft });
      },
      [
        { id: 'again', label: 'Play again', x: this.card.width * 0.16, y: this.card.height * 0.77, w: this.card.width * 0.36, h: this.card.height * 0.12, primary: true },
        { id: 'menu', label: 'Menu', x: this.card.width * 0.56, y: this.card.height * 0.77, w: this.card.width * 0.28, h: this.card.height * 0.12 },
      ],
    );
    this.card.show(true);
  }

  // --------------------------------------------------------------- running

  private runTick(delta: number): void {
    this.clock += delta;
    this.score.clock = this.clock;
    this.pace();
    this.sinceSave += delta;
    if (this.sinceSave >= AUTOSAVE_SECONDS) this.keep();
    if (this.score.happiness <= 0) this.toClosed();
  }

  /** The evening's pace now: how often guests come and how long they wait (game/rules.ts RAMP). */
  private pace(): void {
    this.guests.spawnPace = arrivalPace(this.clock);
    this.guests.patienceSeconds = PATIENCE_SECONDS * patienceShare(this.clock);
    this.guests.wishChance = wishChance(this.clock);
    this.guests.singerChance = this.clock >= WISH.after ? WISH.singer : 0;
  }

  /** Write the bank and the staff to the save. */
  private keep(): void {
    this.sinceSave = 0;
    this.save.bank = this.score.bank;
    this.save.hires = this.shop.hires;
    writeSave(this.save);
  }

  /** Let the café move again after a pause (a no-op when it is not paused). */
  private unpause(): void {
    if (this.phase !== 'paused') return;
    this.cafe.timeScale = this.speed;
    this.guests.handsOff = false;
  }

  /** The café with nobody coming: before a run and after it. Guests still about keep their patience (they wait politely). */
  private quiet(): void {
    this.guests.arrivals = false;
    this.guests.patienceFrozen = true;
    this.guests.spawnPace = 1;
    this.guests.patienceSeconds = PATIENCE_SECONDS;
    this.guests.wishChance = 0;
    this.guests.singerChance = 0;
    this.score.running = false;
    if (this.phase === 'title') this.guests.clear();
  }

  // ------------------------------------------------------------ first run

  private goToStep(index: number): void {
    this.step = index;
    this.mark = { pickedUp: this.guests.pickedUp, seated: this.guests.seated, served: this.baristas.servedCount, wristOpens: this.wristOpens };
    const step = this.steps[index];
    const last = index === this.steps.length - 1;
    const bw = this.coach.width;
    const bh = this.coach.height;
    const buttons: Button[] = [];
    if (step.next) buttons.push({ id: last ? 'start' : 'next', label: last ? 'Open!' : 'Next', x: bw - 96 * MM, y: bh * 0.09, w: 44 * MM, h: 22 * MM, primary: true });
    buttons.push({ id: 'skip', label: 'Skip', x: bw - 48 * MM, y: bh * 0.09, w: 40 * MM, h: 22 * MM });
    this.coach.set((ctx, w, h) => {
      // The picture of the move, and beside it which step this is, what to do, and how.
      const ph = h * 0.74;
      const pw = ph * 1.33;
      picture(ctx, this.pictures[step.picture], h * 0.13, h * 0.13, pw, ph, 4 * MM);
      const x = h * 0.13 + pw + 8 * MM;
      write(ctx, `${index + 1} of ${this.steps.length}`, x, h * 0.2, 5.5 * MM, { weight: 800, color: INK.amberDeep, align: 'left' });
      write(ctx, step.title, x, h * 0.37, 9.5 * MM, { weight: 800, align: 'left', font: 'Georgia, serif' });
      paragraph(ctx, step.text, x, h * 0.56, w - x - 8 * MM, 6 * MM, { color: INK.inkSoft });
    }, buttons);
    this.coach.show(true);
  }

  private coachTick(): void {
    // The first run's guest walks up to the gate as soon as a guest model is in.
    if (this.needGuest) {
      const look = randomLook(Math.random);
      if (castLoaded(look)) {
        this.guests.spawn(look);
        this.needGuest = false;
      }
    }
    const step = this.steps[this.step];
    if (step.done?.(this)) this.next();
  }

  private next(): void {
    if (this.step + 1 < this.steps.length) this.goToStep(this.step + 1);
    else this.finishTutorial();
  }

  private finishTutorial(): void {
    this.save.tutorialDone = true;
    writeSave(this.save);
    this.toRun();
  }

  // ---------------------------------------------------------------- buttons

  /** The pause tab: two bars while the café is open, a play arrow while it is paused; at the café's front-right corner. */
  private layoutTab(): void {
    const tab = this.tab;
    const bounds = this.hold?.bounds;
    const right = bounds && bounds.max.x > 0 ? bounds.max.x : 0.46;
    const front = bounds && bounds.max.z > 0 ? bounds.max.z : 0.31;
    tab.mesh.position.set(right - TAB.inX, TAB.height / 2 + 0.004, front + TAB.outZ);
    const paused = this.phase === 'paused';
    const { width: w, height: h, canvas } = tab;
    tab.set(() => {}, [
      sketchButton(canvas, 'tab', '', w * 0.04, h * 0.05, w * 0.92, h * 0.9, 901, paused ? 'go' : 'plain', (ctx, b) => {
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const r = b.h * 0.26;
        ctx.fillStyle = paused ? '#fbeee2' : '#1c2036';
        ctx.beginPath();
        if (paused) {
          ctx.moveTo(cx - r * 0.7, cy - r);
          ctx.lineTo(cx + r, cy);
          ctx.lineTo(cx - r * 0.7, cy + r);
        } else {
          ctx.rect(cx - r * 0.75, cy - r, r * 0.5, r * 2);
          ctx.rect(cx + r * 0.25, cy - r, r * 0.5, r * 2);
        }
        ctx.fill();
      }),
    ]);
  }

  /**
   * Buttons, on the cards and the side board: an index fingertip near
   * one lights it, and pushing through the card's face presses it; a
   * pinch closing on one presses it too. A hand carrying a guest or the
   * café presses nothing.
   */
  private press(): void {
    const hold = this.hold;
    if (!hold) return;
    const panels = this.panels;
    for (let i = 0; i < panels.length; i++) this.hovers[i] = null;
    for (const hand of HANDS) {
      const pinch = hold.pinch[hand];
      const fresh = pinch.closed && !this.previous[hand];
      this.previous[hand] = pinch.closed;
      const busy = pinch.gap === Infinity || pinch.ghost || hold.holding.includes(hand) || !!this.guests.carriedBy(hand);
      const tip = hold.tip[hand];
      let done = false;
      for (let i = 0; i < panels.length; i++) {
        const panel = panels[i];
        // The fingertip: every card keeps track of it, so a press needs a push through this card's own face.
        const touch = panel.touch(hand, busy || !tip.tracked ? null : tip.point);
        if (busy || done) continue;
        const pinched = panel.hit(pinch.point);
        const over = touch.over ?? pinched;
        if (over) this.hovers[i] = over.id;
        const button = touch.pressed ?? (fresh ? pinched : null);
        if (button) {
          panel.press(button.id);
          this.click(button.id);
          // One press a hand a frame, and the cards may have changed under it.
          done = true;
        }
      }
    }
    for (let i = 0; i < panels.length; i++) panels[i].setHover(this.hovers[i]);
  }

  /** What a button does (the checks call this directly too). */
  click(id: string): void {
    this.clicks++;
    switch (id) {
      case 'open':
        if (this.save.tutorialDone) this.toRun();
        else this.toTutorial();
        break;
      case 'walkthrough':
        this.toTutorial();
        break;
      case 'rules':
        this.toRules();
        break;
      case 'back':
        if (this.rulesFrom === 'paused') {
          this.how.show(false);
          this.phase = 'paused';
          this.showPauseCard();
        } else this.toTitle();
        break;
      case 'menu':
        this.toTitle();
        break;
      case 'how':
        // From the wrist menu: pause first, then How to play; Got it comes back to the pause.
        this.pause();
        if (this.phase === 'paused') this.toRules();
        break;
      case 'tab':
        if (this.phase === 'run') this.pause();
        else if (this.phase === 'paused') this.resume();
        break;
      case 'again':
        this.toRun();
        break;
      case 'next':
        this.next();
        break;
      case 'skip':
      case 'start':
        this.finishTutorial();
        break;
      case 'pause':
        this.pause();
        break;
      case 'resume':
        this.resume();
        break;
      case 'end':
        this.toClosed();
        break;
      case 'hire':
        this.shop.hire();
        break;
    }
  }
}

/**
 * The first run's steps, each done rather than read: pick up the guest,
 * seat it, watch its tea come, and open the wrist menu once (or press
 * Next). Then the café opens.
 */
function firstRun(): Step[] {
  return [
    { picture: 0, title: MOVES[0].title, text: 'Hold your fingers over the guest at the gate. When it lights up, pinch.', done: (g) => g.guests.pickedUp > g.mark.pickedUp },
    { picture: 1, title: MOVES[1].title, text: 'Carry them over the café and let go. They take the glowing seat.', done: (g) => g.guests.seated > g.mark.seated },
    { picture: 2, title: 'Here comes their tea', text: 'Fed guests pay. Keep them happy: the board above the café shows how they feel.', done: (g) => g.baristas.servedCount > g.mark.served },
    { picture: 2, title: 'Your menu', text: 'Turn your left palm toward you and hold it: your menu appears by your wrist. Pause and hire servers there.', next: true, done: (g) => g.wristOpens > g.mark.wristOpens },
  ];
}

/** A picture with rounded corners and a walnut rim; a paper blank until it has loaded. */
function picture(ctx: CanvasRenderingContext2D, image: HTMLImageElement | null, x: number, y: number, w: number, h: number, r: number): void {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  if (image) {
    const k = Math.max(w / image.width, h / image.height);
    ctx.drawImage(image, x + (w - image.width * k) / 2, y + (h - image.height * k) / 2, image.width * k, image.height * k);
  } else {
    ctx.fillStyle = INK.paperDeep;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
  roundRect(ctx, x, y, w, h, r);
  ctx.lineWidth = 1.2 * MM;
  ctx.strokeStyle = INK.rim;
  ctx.stroke();
}

/** A step's number in an amber disc. */
function badge(ctx: CanvasRenderingContext2D, n: number, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = INK.amberDeep;
  ctx.fill();
  write(ctx, `${n}`, x, y + r * 0.06, r * 1.25, { weight: 800, color: '#fffaf0' });
}
