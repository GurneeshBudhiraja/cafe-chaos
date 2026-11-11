/**
 * GameSystem: the evening, from the title card to closing time.
 *
 * - Title. Once the café is on the table, a paper card floats over it:
 *   Café Chaos, the bank and the best night so far, and three buttons:
 *   Open the café, How to play, and the Walkthrough. The café is quiet
 *   behind it (the staff work, no guests come).
 * - How to play: the rules on one card, and Back.
 * - The walkthrough: the first time the café is opened, five short steps
 *   on a small coach card that the player does rather than reads: pick
 *   up the guest waiting at the gate; seat it on a glowing seat; watch its
 *   dial until the server brings its tea; what makes the café happy (the
 *   scoreboard comes up); and the shop. Every step has Skip, and the last
 *   opens the café. The walkthrough guest's patience is held, so nothing
 *   goes wrong while the player learns.
 * - The shift: four minutes. Guests come, the scoreboard keeps the
 *   happiness, the money and the clock, and the shop is open. It ends at
 *   closing time, or early if the café's happiness reaches zero.
 * - Closing card: closed (or closed early), the night's takings, guests
 *   served, thumbs up and down; Next shift or Menu.
 *
 * Buttons are pressed with a pinch on them (a hand over one lights it).
 * The bank, what has been bought, the best night and whether the
 * walkthrough has been seen are kept between sessions (game/save.ts).
 *
 * In test mode (`?test`: the checks and recordings) none of this shows:
 * guests come at once, all six servers work and the shop is free, as
 * before there was a game around the café.
 */

import { createSystem, Vector3 } from '@iwsdk/core';
import { HAPPINESS, PAY_TIERS, SHIFT_SECONDS, STARTING_STAFF } from '../game/rules.js';
import { loadSave, TEST_MODE, writeSave, type Save } from '../game/save.js';
import { HANDS, type Hand } from '../lib/hand-pinch.js';
import { coin, INK, moodFace, Panel, paragraph, write, type Button } from '../ui/panel.js';
import { castLoaded } from '../guests/actor.js';
import { randomLook } from '../guests/cast.js';
import { BaristaSystem } from './barista-system.js';
import { CafeSystem } from './cafe-system.js';
import { GuestSystem } from './guest-system.js';
import { HoldSystem } from './hold-system.js';
import { ScoreSystem } from './score-system.js';
import { UnlockSystem } from './unlock-system.js';

export type GamePhase = 'waiting' | 'title' | 'rules' | 'tutorial' | 'shift' | 'closed' | 'test';

/** The big card (title, rules, closing) and the walkthrough's coach card: sizes and places (café space, metres). */
const CARD = { width: 0.32, height: 0.21, position: [0, 0.2, 0.1] as const };
const COACH = { width: 0.27, height: 0.1, position: [0.08, 0.25, 0.02] as const };

/** The walkthrough: what each step says, and what moves it on (besides Next). */
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
  /** The walkthrough step (0-based) while in it. */
  step = 0;
  /** Seconds left in the shift. */
  clock = 0;
  /** Why the last shift ended. */
  endedEarly = false;
  readonly save: Save = loadSave();
  readonly card = new Panel('GameCard', CARD.width, CARD.height);
  readonly coach = new Panel('CoachCard', COACH.width, COACH.height);
  /** Buttons pressed (for the checks and sounds). */
  clicks = 0;
  readonly steps: Step[] = walkthrough();
  guests!: GuestSystem;
  score!: ScoreSystem;
  private cafe!: CafeSystem;
  baristas!: BaristaSystem;
  private unlocks!: UnlockSystem;
  private hold: HoldSystem | null = null;
  private readonly previous: Record<Hand, boolean> = { left: false, right: false };
  private readonly head = new Vector3();
  /** Counts when the step began (to tell when the player has done it). */
  mark = { pickedUp: 0, seated: 0, served: 0 };
  /** The walkthrough's guest is still to come (its model may still be loading). */
  private needGuest = false;
  private placement = -1;

  init(): void {
    this.cafe = this.world.getSystem(CafeSystem)!;
    this.guests = this.world.getSystem(GuestSystem)!;
    this.baristas = this.world.getSystem(BaristaSystem)!;
    this.unlocks = this.world.getSystem(UnlockSystem)!;
    this.score = this.world.getSystem(ScoreSystem)!;
    this.hold = this.world.getSystem(HoldSystem) ?? null;
    for (const panel of [this.card, this.coach]) this.cafe.cafe.add(panel.mesh);
    this.card.mesh.position.set(...CARD.position);
    this.coach.mesh.position.set(...COACH.position);
    // A pinch on a card is the card's, never the café's or a guest's.
    this.hold?.claims.push((point) => this.card.covers(point) || this.coach.covers(point));
    this.unlocks.bought.push(() => {
      this.save.owned = [...this.unlocks.owned];
      this.save.bank = this.score.bank;
      writeSave(this.save);
    });
    if (TEST_MODE) {
      this.phase = 'test';
      return;
    }
    // The café as it was left: its bank, its staff and what it has bought.
    this.score.bank = this.save.bank;
    this.baristas.staffSize = STARTING_STAFF;
    for (const id of this.save.owned) this.unlocks.restore(id);
    this.quiet();
  }

  update(frameDelta: number): void {
    if (this.phase === 'test') return;
    const cafe = this.cafe;
    const delta = Math.min(0.1, frameDelta) * cafe.timeScale;
    // The café put down (afresh): back to the title.
    if (cafe.placed && cafe.placements !== this.placement) {
      this.placement = cafe.placements;
      this.toTitle();
    }
    this.player.head.getWorldPosition(this.head);
    this.card.update(delta, this.head);
    this.coach.update(delta, this.head);
    if (!cafe.placed || cafe.arriving) return;
    this.press();
    if (this.phase === 'tutorial') this.coachTick();
    if (this.phase === 'shift') this.shiftTick(delta);
  }

  // ------------------------------------------------------------- the phases

  /** The title card. */
  toTitle(): void {
    this.phase = 'title';
    this.quiet();
    this.coach.show(false);
    this.score.board.show(false);
    this.card.set(
      (ctx, w, h) => {
        write(ctx, 'Café Chaos', w / 2, h * 0.2, h * 0.15, { weight: 800, font: 'Georgia, serif' });
        write(ctx, 'a tiny café on your table', w / 2, h * 0.32, h * 0.055, { weight: 500, color: INK.inkSoft });
        coin(ctx, w * 0.36, h * 0.44, h * 0.03);
        write(ctx, `${this.save.bank} in the bank`, w * 0.39, h * 0.44, h * 0.05, { weight: 700, align: 'left' });
        if (this.save.best > 0) write(ctx, `Best night: ${this.save.best} coins`, w / 2, h * 0.52, h * 0.042, { weight: 500, color: INK.inkSoft });
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
      'Pinch a guest at the gate, carry it over the café and let go above a glowing seat.',
      'Each guest has a dial: its patience. It runs from the gate until a server brings its food. Out of patience in the line, it leaves; at the table, it storms out.',
      `Guests pay as they leave: ${quick.coins} coins if seated within the first quarter of their wait, ${fair.coins} if a bit later, ${late.coins} at the last moment.`,
      "Happy guests fill the café's happiness; guests who leave unhappy drain it and cost a few coins. At zero the café closes early.",
      `A shift lasts ${SHIFT_SECONDS / 60} minutes. Spend your coins on the stone plaques: more servers, the garden room.`,
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

  /** The walkthrough: a guest waits at the gate, its patience held, and the coach card says what to do. */
  toTutorial(): void {
    this.phase = 'tutorial';
    this.card.show(false);
    this.guests.clear();
    this.guests.arrivals = false;
    this.guests.patienceFrozen = true;
    this.unlocks.open = false;
    this.needGuest = true;
    this.goToStep(0);
  }

  /** Open the café for a shift: guests come, the clock runs, the scoreboard and the shop are live. */
  toShift(): void {
    if (this.phase !== 'tutorial') this.guests.clear();
    this.phase = 'shift';
    this.card.show(false);
    this.coach.show(false);
    this.guests.arrivals = true;
    this.guests.patienceFrozen = false;
    this.unlocks.open = true;
    this.clock = SHIFT_SECONDS;
    this.score.startShift();
    this.score.clock = this.clock;
    this.score.board.show(true);
    this.endedEarly = false;
  }

  /** Closing time (or closed early): the night's card. */
  toClosed(early: boolean): void {
    this.phase = 'closed';
    this.endedEarly = early;
    this.quiet();
    this.score.running = false;
    const s = this.score;
    this.save.bank = s.bank;
    this.save.shifts++;
    const best = s.takings > this.save.best;
    if (best) this.save.best = s.takings;
    writeSave(this.save);
    this.card.set(
      (ctx, w, h) => {
        write(ctx, early ? 'The café closed early' : 'Closing time!', w / 2, h * 0.14, h * 0.085, { weight: 800, font: 'Georgia, serif' });
        write(ctx, early ? 'Everyone left unhappy. Seat them faster next time!' : best ? 'Your best night yet!' : 'Lanterns down, chairs up.', w / 2, h * 0.24, h * 0.045, { weight: 500, color: INK.inkSoft });
        coin(ctx, w * 0.3, h * 0.38, h * 0.04);
        write(ctx, `${s.takings >= 0 ? '+' : ''}${s.takings} coins tonight`, w * 0.34, h * 0.38, h * 0.06, { weight: 800, align: 'left' });
        moodFace(ctx, w * 0.3, h * 0.5, h * 0.035, s.happiness / HAPPINESS.max);
        write(ctx, `Happiness ${Math.round(s.happiness)}%`, w * 0.34, h * 0.5, h * 0.05, { weight: 700, align: 'left' });
        write(ctx, `${s.servedGuests} guests served   ▲ ${s.up}   ▼ ${s.down}`, w / 2, h * 0.61, h * 0.045, { weight: 600 });
        write(ctx, `Bank: ${s.bank}`, w / 2, h * 0.69, h * 0.042, { weight: 600, color: INK.inkSoft });
      },
      [
        { id: 'again', label: 'Next shift', x: this.card.width * 0.16, y: this.card.height * 0.77, w: this.card.width * 0.36, h: this.card.height * 0.12, primary: true },
        { id: 'menu', label: 'Menu', x: this.card.width * 0.56, y: this.card.height * 0.77, w: this.card.width * 0.28, h: this.card.height * 0.12 },
      ],
    );
    this.card.show(true);
  }

  // --------------------------------------------------------------- running

  private shiftTick(delta: number): void {
    this.clock = Math.max(0, this.clock - delta);
    this.score.clock = this.clock;
    if (this.score.happiness <= 0) this.toClosed(true);
    else if (this.clock <= 0) this.toClosed(false);
  }

  /** The café with nobody coming: before a shift and after it. Guests still about keep their patience (they wait politely). */
  private quiet(): void {
    this.guests.arrivals = false;
    this.guests.patienceFrozen = true;
    this.unlocks.open = this.phase !== 'tutorial';
    this.score.running = false;
    if (this.phase === 'title') this.guests.clear();
  }

  // ----------------------------------------------------------- walkthrough

  private goToStep(index: number): void {
    this.step = index;
    this.mark = { pickedUp: this.guests.pickedUp, seated: this.guests.seated, served: this.baristas.servedCount };
    const step = this.steps[index];
    const last = index === this.steps.length - 1;
    // The scoreboard comes up when the walkthrough talks about it; the shop opens at its own step.
    this.score.board.show(index >= 3);
    this.unlocks.open = index >= 4;
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
    // The walkthrough's guest walks up to the gate as soon as a guest model is in.
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
    this.toShift();
  }

  // ---------------------------------------------------------------- buttons

  /** A hand over a button lights it; a pinch closing on it presses it. */
  private press(): void {
    const hold = this.hold;
    if (!hold) return;
    let hoverCard: string | null = null;
    let hoverCoach: string | null = null;
    for (const hand of HANDS) {
      const pinch = hold.pinch[hand];
      const fresh = pinch.closed && !this.previous[hand];
      this.previous[hand] = pinch.closed;
      if (pinch.gap === Infinity || pinch.ghost || hold.holding.includes(hand) || this.guests.carriedBy(hand)) continue;
      const onCard = this.card.hit(pinch.point);
      const onCoach = onCard ? null : this.coach.hit(pinch.point);
      if (onCard) hoverCard = onCard.id;
      if (onCoach) hoverCoach = onCoach.id;
      const button = onCard ?? onCoach;
      if (fresh && button) {
        (onCard ? this.card : this.coach).press(button.id);
        this.click(button.id);
      }
    }
    this.card.setHover(hoverCard);
    this.coach.setHover(hoverCoach);
  }

  /** What a button does (the checks call this directly too). */
  click(id: string): void {
    this.clicks++;
    switch (id) {
      case 'open':
        if (this.save.tutorialDone) this.toShift();
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
        this.toShift();
        break;
      case 'next':
        this.next();
        break;
      case 'skip':
      case 'start':
        this.finishTutorial();
        break;
    }
  }
}

/** The walkthrough's five steps. */
function walkthrough(): Step[] {
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
      text: `Guests seated quickly tip best (up to ${top} coins) and leave a thumbs up. Guests who give up or storm out drain the café's happiness. If it empties, the café closes.`,
      next: true,
    },
    { title: 'Grow your café', text: 'Spend coins on the stone plaques at the front: hire servers and open the garden room. Ready?', next: true },
  ];
}
