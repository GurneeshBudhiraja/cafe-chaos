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
 *   run). The game pauses itself when the headset comes off or another
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
import { arrivalPace, MEAL_SECONDS, PAY_TIERS, patienceShare } from '../game/rules.js';
import { loadSave, TEST_MODE, writeSave, type Save } from '../game/save.js';
import { PATIENCE_SECONDS } from '../guests/rules.js';
import { HANDS, type Hand } from '../lib/hand-pinch.js';
import { coin, INK, moodFace, Panel, paragraph, write, type Button } from '../ui/panel.js';
import { castLoaded } from '../guests/actor.js';
import { randomLook } from '../guests/cast.js';
import { BaristaSystem } from './barista-system.js';
import { BoardSystem, clockText } from './board-system.js';
import { CafeSystem } from './cafe-system.js';
import { GuestSystem } from './guest-system.js';
import { HoldSystem } from './hold-system.js';
import { ScoreSystem } from './score-system.js';
import { ShopSystem } from './shop-system.js';

export type GamePhase = 'waiting' | 'title' | 'rules' | 'tutorial' | 'run' | 'paused' | 'closed' | 'test';

/** The big card (title, rules, pause, closing) and the first run's coach card: sizes and places (café space, metres). */
const CARD = { width: 0.32, height: 0.21, position: [0, 0.2, 0.1] as const };
const COACH = { width: 0.27, height: 0.1, position: [0.08, 0.25, 0.02] as const };
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
  readonly coach = new Panel('CoachCard', COACH.width, COACH.height);
  /** Buttons pressed (for the checks and sounds). */
  clicks = 0;
  readonly steps: Step[] = firstRun();
  guests!: GuestSystem;
  score!: ScoreSystem;
  baristas!: BaristaSystem;
  shop!: ShopSystem;
  board!: BoardSystem;
  private cafe!: CafeSystem;
  private hold: HoldSystem | null = null;
  private readonly previous: Record<Hand, boolean> = { left: false, right: false };
  private readonly head = new Vector3();
  /** Counts when the step began (to tell when the player has done it). */
  mark = { pickedUp: 0, seated: 0, served: 0 };
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
    this.board = this.world.getSystem(BoardSystem)!;
    this.hold = this.world.getSystem(HoldSystem) ?? null;
    for (const panel of [this.card, this.coach]) this.cafe.cafe.add(panel.mesh);
    this.card.mesh.position.set(...CARD.position);
    this.coach.mesh.position.set(...COACH.position);
    // A pinch on a card is the card's, never the café's or a guest's.
    this.hold?.claims.push((point) => this.card.covers(point) || this.coach.covers(point));
    this.panels = [this.card, this.coach, this.board.panel];
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
    this.board.best = this.save.bestSeconds;
    this.board.live = false;
    this.board.panel.show(true);
    this.card.set(
      (ctx, w, h) => {
        write(ctx, 'Café Chaos', w / 2, h * 0.2, h * 0.15, { weight: 800, font: 'Georgia, serif' });
        write(ctx, 'How long can you keep it open?', w / 2, h * 0.32, h * 0.055, { weight: 500, color: INK.inkSoft });
        coin(ctx, w * 0.36, h * 0.44, h * 0.03);
        write(ctx, `${this.save.bank} in the bank`, w * 0.39, h * 0.44, h * 0.05, { weight: 700, align: 'left' });
        if (this.save.bestSeconds > 0) write(ctx, `Longest evening: ${clockText(this.save.bestSeconds)}`, w / 2, h * 0.52, h * 0.042, { weight: 500, color: INK.inkSoft });
      },
      [
        { id: 'open', label: 'Open the café', x: this.card.width * 0.25, y: this.card.height * 0.58, w: this.card.width * 0.5, h: this.card.height * 0.13, primary: true },
        { id: 'rules', label: 'How to play', x: this.card.width * 0.14, y: this.card.height * 0.76, w: this.card.width * 0.34, h: this.card.height * 0.11 },
        { id: 'walkthrough', label: 'Walkthrough', x: this.card.width * 0.52, y: this.card.height * 0.76, w: this.card.width * 0.34, h: this.card.height * 0.11 },
      ],
    );
    this.card.show(true);
  }

  /** The rules, on one card. */
  toRules(): void {
    this.phase = 'rules';
    const [quick, fair, late] = PAY_TIERS;
    const rules = [
      'Pinch a guest at the gate, carry it over the café and let go above a seat.',
      'Each guest has a dial: its patience. It runs from the gate until a server brings its food. Out of patience in the line, it leaves; at the table, it storms out.',
      `Guests pay as they leave: ${quick.coins} coins if seated within the first quarter of their wait, ${fair.coins} if a bit later, ${late.coins} at the last moment.`,
      "Happy guests fill the café's happiness; guests who leave unhappy drain it. At zero the café closes.",
      'The evening gets busier as it goes on. Hire more servers with your coins, and see how long you can stay open.',
    ];
    this.card.set(
      (ctx, w, h) => {
        write(ctx, 'How to play', w / 2, h * 0.13, h * 0.08, { weight: 800, font: 'Georgia, serif' });
        let y = h * 0.23;
        for (const line of rules) {
          ctx.beginPath();
          ctx.arc(w * 0.09, y + h * 0.002, h * 0.012, 0, Math.PI * 2);
          ctx.fillStyle = INK.amberDeep;
          ctx.fill();
          y = paragraph(ctx, line, w * 0.12, y, w * 0.8, h * 0.038) + h * 0.012;
        }
      },
      [{ id: 'back', label: 'Back', x: this.card.width * 0.36, y: this.card.height * 0.83, w: this.card.width * 0.28, h: this.card.height * 0.1, primary: true }],
    );
  }

  /** The first run's teaching: a guest waits at the gate, its patience held, and the coach card says what to do. */
  toTutorial(): void {
    this.unpause();
    this.phase = 'tutorial';
    this.card.show(false);
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
    this.coach.show(false);
    this.guests.arrivals = true;
    this.guests.patienceFrozen = false;
    this.clock = 0;
    this.sinceSave = 0;
    this.record = false;
    this.pace();
    this.score.startRun();
    this.score.clock = 0;
    this.board.best = this.save.bestSeconds;
    this.board.live = true;
    this.board.panel.show(true);
  }

  /** Stop everything in the café where it is, and save. No-op unless a run is on. */
  pause(): void {
    if (this.phase !== 'run') return;
    this.phase = 'paused';
    this.speed = this.cafe.timeScale;
    this.cafe.timeScale = 0;
    this.guests.handsOff = true;
    this.keep();
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
  }

  /** The café closes: the run is over. The time it stayed open is the score. */
  toClosed(): void {
    this.unpause();
    this.phase = 'closed';
    this.board.live = false;
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
    this.score.running = false;
    if (this.phase === 'title') this.guests.clear();
  }

  // ------------------------------------------------------------ first run

  private goToStep(index: number): void {
    this.step = index;
    this.mark = { pickedUp: this.guests.pickedUp, seated: this.guests.seated, served: this.baristas.servedCount };
    const step = this.steps[index];
    const last = index === this.steps.length - 1;
    const bw = this.coach.width;
    const bh = this.coach.height;
    const buttons: Button[] = [];
    if (last) buttons.push({ id: 'start', label: 'Open the café!', x: bw * 0.6, y: bh * 0.68, w: bw * 0.34, h: bh * 0.22, primary: true });
    else {
      if (step.next) buttons.push({ id: 'next', label: 'Next', x: bw * 0.74, y: bh * 0.68, w: bw * 0.2, h: bh * 0.22, primary: true });
      buttons.push({ id: 'skip', label: 'Skip', x: step.next ? bw * 0.52 : bw * 0.74, y: bh * 0.68, w: bw * 0.2, h: bh * 0.22 });
    }
    this.coach.set((ctx, w, h) => {
      write(ctx, step.title, w * 0.07, h * 0.2, h * 0.13, { weight: 800, align: 'left', font: 'Georgia, serif' });
      paragraph(ctx, step.text, w * 0.07, h * 0.38, w * 0.86, h * 0.082);
      // The step dots.
      for (let i = 0; i < this.steps.length; i++) {
        ctx.beginPath();
        ctx.arc(w * 0.08 + i * h * 0.1, h * 0.79, h * 0.03, 0, Math.PI * 2);
        ctx.fillStyle = i <= index ? INK.amberDeep : '#dcc7a4';
        ctx.fill();
      }
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
      case 'menu':
        this.toTitle();
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

/** The first run's steps. */
function firstRun(): Step[] {
  const top = PAY_TIERS[0].coins;
  return [
    { title: 'A guest!', text: 'Someone is waiting at the gate. Reach over and pinch them to pick them up.', done: (g) => g.guests.pickedUp > g.mark.pickedUp },
    { title: 'Find them a seat', text: 'Carry them over the café. A seat glows under them: let go there.', done: (g) => g.guests.seated > g.mark.seated },
    {
      title: 'Their tea is coming',
      text: 'The dial over their head is their patience. It runs from the gate until a server brings their tea, so seat guests fast and hire more servers.',
      next: true,
      done: (g) => g.baristas.servedCount > g.mark.served,
    },
    {
      title: 'Keep the café happy',
      text: `Guests seated quickly tip best (up to ${top} coins). Guests who give up or storm out drain the café's happiness. When it empties, the café closes.`,
      next: true,
    },
    { title: 'Stay open', text: 'The evening gets busier. Hire servers with your coins and see how long you can keep the café open. Ready?', next: true },
  ];
}
