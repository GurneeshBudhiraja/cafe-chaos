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

import { createSystem, Quaternion, Vector3 } from '@iwsdk/core';
import { arrivalPace, MEAL_SECONDS, patienceShare, WISH, wishChance } from '../game/rules.js';
import { loadSave, TEST_MODE, writeSave, type Save } from '../game/save.js';
import { PATIENCE_SECONDS } from '../guests/rules.js';
import { HANDS, type Hand } from '../lib/hand-pinch.js';
import { coin, INK, moodFace, Panel, paragraph, roundRect, write, type Button } from '../ui/panel.js';
import { castLoaded } from '../guests/actor.js';
import { randomLook } from '../guests/cast.js';
import { BaristaSystem } from './barista-system.js';
import { clockText } from '../game/clock.js';
import { sketchFontReady } from '../ui/sketch.js';
import { StripSystem } from './strip-system.js';
import { SoundSystem } from './sound-system.js';
import { LEVELS, MENU_SIZE, StartMenu } from '../ui/start-menu.js';
import { CafeSystem } from './cafe-system.js';
import { GuestSystem } from './guest-system.js';
import { HandleSystem } from './handle-system.js';
import { HoldSystem } from './hold-system.js';
import { ScoreSystem } from './score-system.js';
import { ShopSystem } from './shop-system.js';

export type GamePhase = 'waiting' | 'title' | 'opening' | 'rules' | 'tutorial' | 'run' | 'paused' | 'closed' | 'test';

/**
 * The cards: the big one (title, pause, closing), How to play, and the
 * first run's coach card. Sizes are real metres (ui/panel.ts); places are
 * in the café's space. The coach card stands over the back of the café,
 * clear of the gate and the seats the player is working at.
 */
const CARD = { width: 0.34, height: 0.24, position: [0, 0.22, 0.1] as const };
const HOW = { width: 0.5, height: 0.255, position: [0, 0.23, 0.1] as const };
const COACH = { width: 0.34, height: 0.12, position: [-0.08, 0.34, -0.2] as const };
/** The pause button beside the grab pill: its card's size (real metres); the round button fills its height, 36 mm across. */
/** The count back from a pause: 3, 2, 1 (seconds). */
const RESUME_COUNT = 3;
const TAB = { width: 0.045, height: 0.04 };
/** The café's size in Settings (percent of what fits the table): the range and the step. */
const SIZE = { min: 60, max: 140, step: 10 };
/**
 * The start card: this far from the eyes along the gaze (metres) and this
 * much below the line of sight, so it is centred in view and pressed
 * without reaching (Meta's direct touch range is about 42 to 46 cm).
 * It glides back in front when the player turns more than `follow` degrees away.
 */
const MENU_SPOT = { ahead: 0.38, drop: 0.15, follow: 35, glide: 4 };
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
  { picture: 'howto-hire.jpg', title: 'Pause & hire', text: 'Press the round button by the café to pause. Hire servers there too.' },
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
  /** The start card and the card that opens in front of it (Settings, the New Game warning). */
  readonly menu = new StartMenu();
  /** What to start once the café is up (it rises after CONTINUE or NEW GAME). */
  private opening: 'run' | 'tutorial' | null = null;
  /** Where Settings was opened from. */
  private settingsFrom: 'title' | 'pause' = 'title';
  private sound: SoundSystem | null = null;
  private readonly edge = new Vector3();
  private readonly menuSpot = new Vector3();
  private readonly wanted = new Vector3();
  private readonly forward = new Vector3();
  private readonly toMenu = new Vector3();
  private readonly headQ = new Quaternion();
  private menuPlaced = false;
  private menuFollowing = false;
  readonly tab = new Panel('PauseTab', TAB.width, TAB.height);
  /** Times the wrist menu has been opened (WristMenuSystem counts them; the first run waits for one). */
  wristOpens = 0;
  /** Where How to play was opened from: back there when it is closed. */
  /** Seconds left of the count back from a pause (0: none). */
  resuming = 0;
  private shownCount = 0;
  private rulesFrom: GamePhase = 'title';
  strip!: StripSystem;
  private cafe!: CafeSystem;
  private hold: HoldSystem | null = null;
  private handles: HandleSystem | null = null;
  private readonly spot = new Vector3();
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
    this.handles = this.world.getSystem(HandleSystem) ?? null;
    for (const panel of [this.card, this.coach]) this.cafe.cafe.add(panel.mesh);
    this.world.createTransformEntity(this.how.mesh);
    this.card.mesh.position.set(...CARD.position);
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
    // The start menu stands in the world (the café is hidden until it is opened).
    this.world.createTransformEntity(this.menu.card.mesh);
    this.world.createTransformEntity(this.menu.sheet.mesh);
    this.hold?.claims.push((point) => this.menu.card.covers(point) || this.menu.sheet.covers(point));
    this.cafe.hold = true;
    this.applySettings();
    void sketchFontReady.then(() => {
      if (this.menu.card.open) this.menu.card.paint();
      if (this.menu.sheet.open) this.menu.sheet.paint();
    });
    this.panels = [this.card, this.how, this.coach, this.tab, this.menu.card, this.menu.sheet];
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
    xr.addEventListener('sessionend', () => {
      this.pause();
      this.menu.hideAll();
    });
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
    this.placeTab();
    this.tab.update(cardDelta, this.head);
    if (!this.sound) this.applySettings();
    this.placeMenu(cardDelta);
    this.menu.tick(cardDelta);
    this.menu.card.update(cardDelta, this.head);
    this.menu.sheet.update(cardDelta, this.head);
    this.turnSheet();
    if (this.opening && cafe.placed && !cafe.waiting && !cafe.arriving) {
      const what = this.opening;
      this.opening = null;
      if (what === 'run') this.toRun();
      else this.toTutorial();
    }
    this.countDown(frameDelta);
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
    this.card.show(false);
    this.card.dimmed = false;
    this.score.clock = 0;
    this.tab.show(false);
    this.strip.best = this.save.bestSeconds;
    this.strip.live = false;
    this.strip.settle();
    // The scoreboard comes up with the café.
    this.strip.panel.show(false);
    this.how.show(false);
    this.menu.closeSheet();
    this.menu.card.dimmed = false;
    this.menuPlaced = false;
    this.menu.showStart({
      kind: this.returning ? 'returning' : 'first',
      coins: this.save.bank,
      staff: 1 + this.save.hires,
      best: this.save.bestSeconds > 0 ? clockText(this.save.bestSeconds) : null,
    });
  }

  /** A save worth continuing: the first run done, or anything earned. */
  private get returning(): boolean {
    const s = this.save;
    return s.tutorialDone || s.runs > 0 || s.bank > 0 || s.hires > 0;
  }

  /** CONTINUE or NEW GAME: the menu goes, the café rises (the outline, then the rise), then `what` starts. */
  private openCafe(what: 'run' | 'tutorial'): void {
    this.menu.hideAll();
    this.menu.card.dimmed = false;
    this.phase = 'opening';
    this.opening = what;
    this.cafe.release();
  }

  /**
   * Where the start card stands: straight ahead (by the way the head points,
   * not by how it tilts), MENU_SPOT.ahead out and MENU_SPOT.drop below the
   * eyes, so its top edge is a little under eye level and the eyes look down
   * at it (about 20 degrees), tilted back to face them. It faces the player
   * once, when it is put there, and then stays still: a nod or a lean while a
   * finger presses does not move or turn it. Only if the player turns well
   * away (over MENU_SPOT.follow degrees) with no fingertip near does it glide
   * back in front of them, and face them again (a lazy follow, never stuck
   * to the head). The card opened in front of it (Settings, the warning)
   * stands 4 cm nearer, turned the same way.
   */
  private placeMenu(delta: number): void {
    const card = this.menu.card;
    const sheet = this.menu.sheet;
    // How to play stands where it always did over the café (it is in the world so it shows before the café is up).
    if (this.how.open) this.cafe.cafe.localToWorld(this.how.mesh.position.set(...HOW.position));
    const onMenu = card.open || (sheet.open && this.settingsFrom === 'title');
    if (!onMenu && !sheet.open) {
      this.menuPlaced = false;
      return;
    }
    if (onMenu) {
      this.player.head.getWorldQuaternion(this.headQ);
      // Level ahead (heading only), then down: the same spot whether the player looks up or down.
      this.forward.set(0, 0, -1).applyQuaternion(this.headQ).setY(0);
      if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
      this.forward.normalize();
      this.wanted.copy(this.head).addScaledVector(this.forward, MENU_SPOT.ahead);
      this.wanted.y -= MENU_SPOT.drop;
      if (!this.menuPlaced) {
        this.menuSpot.copy(this.wanted);
        this.menuPlaced = true;
        this.menuFollowing = false;
        card.faceNow();
        card.turn = 0;
      } else {
        // Turned well away, and no finger at the card: glide back in front.
        this.toMenu.copy(this.menuSpot).sub(this.head).setY(0).normalize();
        const off = (Math.acos(Math.max(-1, Math.min(1, this.toMenu.dot(this.forward)))) * 180) / Math.PI;
        const tips = this.hold?.tip;
        const fingerNear = !!tips && HANDS.some((h) => tips[h].tracked && tips[h].point.distanceTo(this.menuSpot) < 0.15);
        if (off > MENU_SPOT.follow && !fingerNear) this.menuFollowing = true;
        if (this.menuFollowing) {
          card.turn = 3;
          this.menuSpot.lerp(this.wanted, 1 - Math.exp(-MENU_SPOT.glide * delta));
          if (this.menuSpot.distanceTo(this.wanted) < 0.01) {
            this.menuFollowing = false;
            card.turn = 0;
          }
        }
      }
      card.mesh.position.copy(this.menuSpot);
    }
    if (!sheet.open) return;
    // In front of the card it was opened from, 4 cm nearer the eyes, turned the same way.
    const from = this.settingsFrom === 'pause' ? this.card.mesh : card.mesh;
    from.getWorldPosition(this.spot);
    from.getWorldQuaternion(this.headQ);
    this.toMenu.set(0, 0, 1).applyQuaternion(this.headQ);
    sheet.mesh.position.copy(this.spot).addScaledVector(this.toMenu, 0.04);
  }

  /** After the cards have turned: the sheet takes the turn of the card behind it (it never turns on its own). */
  private turnSheet(): void {
    const sheet = this.menu.sheet;
    if (!sheet.open) return;
    const from = this.settingsFrom === 'pause' ? this.card.mesh : this.menu.card.mesh;
    from.getWorldQuaternion(sheet.mesh.quaternion);
  }

  /** Settings as the menu shows them. */
  private settingsState(): { music: number; sounds: number } {
    return { music: this.save.music, sounds: this.save.sounds };
  }

  private openSettings(from: 'title' | 'pause'): void {
    this.settingsFrom = from;
    (from === 'pause' ? this.card : this.menu.card).dimmed = true;
    this.menu.openSettings(this.settingsState());
  }

  private closeSheet(): void {
    this.menu.closeSheet();
    this.menu.card.dimmed = false;
    this.card.dimmed = false;
  }

  /** Music, sounds and the café's size, from the save. */
  private applySettings(): void {
    this.cafe.setSize(this.save.size / 100);
    // The sound system starts after this one: found on first use.
    this.sound ??= this.world.getSystem(SoundSystem) ?? null;
    if (this.sound) {
      this.sound.musicLevel = this.save.music;
      this.sound.soundLevel = this.save.sounds;
    }
  }

  /** A −/+ in Settings: one step, saved, heard at once. */
  private stepSetting(id: string): void {
    const s = this.save;
    const up = id.endsWith('+');
    if (id.startsWith('music')) s.music = Math.max(0, Math.min(LEVELS, s.music + (up ? 1 : -1)));
    else if (id.startsWith('sounds')) s.sounds = Math.max(0, Math.min(LEVELS, s.sounds + (up ? 1 : -1)));
    else s.size = Math.max(SIZE.min, Math.min(SIZE.max, s.size + (up ? SIZE.step : -SIZE.step)));
    this.applySettings();
    writeSave(s);
    this.menu.updateSettings(this.settingsState());
  }

  /** DELETE AND START: everything earned goes (the settings stay), and a fresh evening opens. */
  private startFresh(): void {
    const keep = { music: this.save.music, sounds: this.save.sounds, size: this.save.size, tutorialDone: this.save.tutorialDone };
    Object.assign(this.save, { bank: 0, hires: 0, bestSeconds: 0, bestCoins: 0, runs: 0 }, keep);
    writeSave(this.save);
    this.shop.restore(0);
    this.score.bank = 0;
    this.strip.best = 0;
    this.closeSheet();
    this.openCafe(this.save.tutorialDone ? 'run' : 'tutorial');
  }

  /** How to play: the game in three pictures, each with a line. */
  toRules(): void {
    this.rulesFrom = this.phase;
    this.phase = 'rules';
    this.card.show(false);
    this.menu.hideAll();
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
    this.strip.panel.show(true);
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

  /** Stop everything in the café where it is, and save. No-op unless a run is on (mid-count, it holds the pause). */
  pause(): void {
    if (this.phase === 'paused') return this.holdPause();
    if (this.phase !== 'run') return;
    this.phase = 'paused';
    this.speed = this.cafe.timeScale;
    this.cafe.timeScale = 0;
    this.guests.handsOff = true;
    this.keep();
    this.showPauseCard();
    this.layoutTab();
  }

  /**
   * The pause card over the café: Resume first, then Hire a server (its
   * price, or full staff; dimmed while the bank is short), How to play,
   * and End the evening last and smallest.
   */
  private showPauseCard(): void {
    const { width: w, height: h } = this.card;
    const price = this.shop.price;
    const canPay = price !== null && this.score.bank >= price;
    const hire = price === null ? 'Full staff' : canPay ? `Hire a server · ${price}` : `Hire at ${price} coins`;
    this.card.set(
      (ctx) => {
        write(ctx, 'Paused', w / 2, h * 0.12, h * 0.1, { weight: 800, font: 'Georgia, serif' });
        write(ctx, `Open for ${clockText(this.clock)}`, w / 2, h * 0.22, h * 0.05, { weight: 600, color: INK.inkSoft });
        if (this.save.bestSeconds > 0) write(ctx, `Longest evening ${clockText(this.save.bestSeconds)}`, w / 2, h * 0.29, h * 0.045, { weight: 600, color: INK.amberDeep });
      },
      [
        { id: 'resume', label: 'Resume', x: w * 0.2, y: h * 0.35, w: w * 0.6, h: h * 0.13, primary: true },
        { id: 'hire', label: hire, x: w * 0.12, y: h * 0.51, w: w * 0.76, h: h * 0.12, primary: canPay },
        { id: 'how', label: 'How to play', x: w * 0.12, y: h * 0.66, w: w * 0.37, h: h * 0.11 },
        { id: 'settings', label: 'Settings', x: w * 0.51, y: h * 0.66, w: w * 0.37, h: h * 0.11 },
        { id: 'end', label: 'End the evening', x: w * 0.27, y: h * 0.81, w: w * 0.46, h: h * 0.1 },
      ],
    );
    this.card.show(true);
  }

  /**
   * Carry on from a pause: a 3-2-1 first, on the card and the pause button,
   * with the café still frozen, so the hands can come back to the table
   * before guests move again. Pausing again during it cancels it.
   */
  resume(): void {
    if (this.phase !== 'paused' || this.resuming > 0) return;
    this.resuming = RESUME_COUNT;
    this.showCount();
  }

  /** The count is over: the café moves again. */
  private carryOn(): void {
    this.resuming = 0;
    this.unpause();
    this.phase = 'run';
    this.card.show(false);
    this.layoutTab();
  }

  /** Back to the pause card from the middle of a count. */
  private holdPause(): void {
    if (this.phase !== 'paused' || this.resuming <= 0) return;
    this.resuming = 0;
    this.showPauseCard();
    this.layoutTab();
  }

  /** The count on the card (one big number) and on the pause button. */
  private showCount(): void {
    const n = Math.ceil(this.resuming);
    this.shownCount = n;
    this.card.set((ctx, w, h) => {
      write(ctx, 'Back in', w / 2, h * 0.24, h * 0.08, { weight: 600, color: INK.inkSoft });
      write(ctx, `${n}`, w / 2, h * 0.6, h * 0.4, { weight: 800, font: 'Georgia, serif', color: INK.amberDeep });
    });
    this.card.show(true);
    this.layoutTab();
  }

  /** Each frame of a count: on real time (the café's own clock is stopped). */
  private countDown(frameDelta: number): void {
    if (this.resuming <= 0) return;
    this.resuming -= Math.min(0.25, frameDelta);
    if (this.resuming <= 0) this.carryOn();
    else if (Math.ceil(this.resuming) !== this.shownCount) this.showCount();
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
    this.resuming = 0;
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

  /**
   * The pause button: a round cream button, dark pause bars while the café
   * is open, a play arrow while it is paused, the number while counting
   * back in (3, 2, 1), no words. It stands beside
   * the grab pill (placeTab), the pair centred on the café's edge.
   */
  private layoutTab(): void {
    const tab = this.tab;
    const paused = this.phase === 'paused';
    const count = this.resuming > 0 ? Math.ceil(this.resuming) : 0;
    const { width: w, height: h } = tab;
    const draw = (ctx: CanvasRenderingContext2D, b: Button, hover?: boolean, pressed?: boolean): void => {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const r = b.h * 0.45 * (pressed ? 0.93 : 1);
      ctx.fillStyle = hover ? '#fff4e4' : '#f7e9d3';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = r * 0.08;
      ctx.strokeStyle = '#e3c9a4';
      ctx.stroke();
      ctx.fillStyle = '#1c2036';
      if (count > 0) {
        // Mid-count: the number, in the same ink.
        ctx.font = `800 ${Math.round(r * 1.25)}px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${count}`, cx, cy + r * 0.06);
        return;
      }
      ctx.beginPath();
      if (paused) {
        ctx.moveTo(cx - r * 0.28, cy - r * 0.42);
        ctx.lineTo(cx + r * 0.42, cy);
        ctx.lineTo(cx - r * 0.28, cy + r * 0.42);
      } else {
        const bw = r * 0.2;
        const bh = r * 0.84;
        ctx.rect(cx - bw * 1.6, cy - bh / 2, bw, bh);
        ctx.rect(cx + bw * 0.6, cy - bh / 2, bw, bh);
      }
      ctx.fill();
    };
    tab.set(() => {}, [{ id: 'tab', label: '', x: (w - h) / 2, y: 0, w: h, h, bare: true, draw }]);
  }

  /** Each frame: the pause button stands beside the pill, wherever the pill is. */
  private placeTab(): void {
    const handles = this.handles;
    const showing = this.tab.open;
    if (!handles) return;
    handles.paired = showing;
    if (!showing) return;
    const spot = handles.pairSpot(this.spot);
    spot.y += TAB.height / 2 + 0.004;
    this.tab.mesh.position.copy(this.cafe.cafe.worldToLocal(spot));
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
        const off = busy || panel.dimmed;
        const touch = panel.touch(hand, off || !tip.tracked ? null : tip.point);
        if (off || done) continue;
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
        // The checks' shortcut: as CONTINUE (or NEW GAME the first time).
        this.openCafe(this.save.tutorialDone ? 'run' : 'tutorial');
        break;
      case 'continue':
        this.openCafe('run');
        break;
      case 'new':
        if (this.returning) {
          this.menu.card.dimmed = true;
          this.menu.openWarn({ coins: this.save.bank, staff: 1 + this.save.hires, best: this.save.bestSeconds > 0 ? clockText(this.save.bestSeconds) : null });
        } else this.openCafe('tutorial');
        break;
      case 'keep':
        this.closeSheet();
        break;
      case 'fresh':
        this.startFresh();
        break;
      case 'gear':
        this.openSettings('title');
        break;
      case 'settings':
        this.openSettings('pause');
        break;
      case 'close':
        this.closeSheet();
        break;
      case 'music-':
      case 'music+':
      case 'sounds-':
      case 'sounds+':
      case 'size-':
      case 'size+':
        this.stepSetting(id);
        break;
      case 'move':
        // Before a run: put the café down again where you look.
        this.closeSheet();
        this.menu.hideAll();
        this.cafe.replace();
        break;
      case 'help':
        this.toRules();
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
        // From the pause card, Settings or the wrist menu: pause first (in a run), then How to play; Got it comes back.
        this.closeSheet();
        this.pause();
        if (this.phase === 'paused' || this.phase === 'title') this.toRules();
        break;
      case 'tab':
        if (this.phase === 'run' || this.resuming > 0) this.pause();
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
        // Still opening (the café rising): it opens straight into a run.
        if (this.opening) {
          this.opening = 'run';
          this.save.tutorialDone = true;
          writeSave(this.save);
        } else this.finishTutorial();
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
        // From the pause card: show the new price (or full staff).
        if (this.phase === 'paused' && this.resuming <= 0) this.showPauseCard();
        break;
    }
  }
}

/**
 * The first run's steps, each done rather than read: pick up the guest,
 * seat it, watch its tea come, then a word about the pause button (press
 * Open!). Then the café opens.
 */
function firstRun(): Step[] {
  return [
    { picture: 0, title: MOVES[0].title, text: 'Hold your fingers over the guest at the gate. When it lights up, pinch.', done: (g) => g.guests.pickedUp > g.mark.pickedUp },
    { picture: 1, title: MOVES[1].title, text: 'Carry them over the café and let go. They take the glowing seat.', done: (g) => g.guests.seated > g.mark.seated },
    { picture: 2, title: 'Here comes their tea', text: 'Fed guests pay. Keep them happy: the board above the café shows how they feel.', done: (g) => g.baristas.servedCount > g.mark.served },
    { picture: 2, title: 'Pause & hire', text: 'The round button by the café pauses it. Hire servers and see how to play there too.', next: true, done: () => false },
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
