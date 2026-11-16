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
 * - Pause and Shop are on the bar (the scoreboard over the café), out of
 *   reach: the hand points at one and pinches (the hand ray, Meta's way to
 *   reach what is far; near the café or a card the ray is off and hands
 *   work directly). Pause stops everything in the café where it is and
 *   puts the pause card in front of the eyes (Resume, How to play,
 *   Settings, End the evening). Shop pauses too and shows the baristas to
 *   hire. The game pauses itself when the headset comes off or another
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

import { createSystem, Matrix4, Quaternion, Vector3 } from '@iwsdk/core';
import { HandRays } from '../hands/hand-ray.js';
import { arrivalPace, HIRE_PRICES, MEAL_SECONDS, patienceShare, STARTING_STAFF, WISH } from '../game/rules.js';
import { BARISTA_NAMES } from '../baristas/barista.js';
import { loadSave, TEST_MODE, writeSave, type Save } from '../game/save.js';
import { PATIENCE_SECONDS } from '../guests/rules.js';
import { HANDS, type Hand } from '../lib/hand-pinch.js';
import { coin, INK, moodFace, Panel, paragraph, roundRect, write, type Button } from '../ui/panel.js';
import type { PlaneGeometry } from '@iwsdk/core';
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
const COACH = { width: 0.34, height: 0.12, position: [-0.08, 0.34, -0.2] as const };
/**
 * The hand ray to the bar (Meta: rays for what is out of reach, direct
 * touch for what is near, and near wins). A hand points at the bar only
 * when it is this far (metres) from the café and not at a card in reach;
 * the ray reaches this far at most; and a ray this close to the bar's
 * edge (share of its height) still counts as on it, so a shaky hand does
 * not flicker off.
 */
const RAY = { awayFromCafe: 0.04, reach: 4, edge: 0.15 };
/** The count back from a pause: 3, 2, 1 (seconds). */
const RESUME_COUNT = 3;
/** The café's size in Settings (percent of what fits the table): the range and the step. */
const SIZE = { min: 60, max: 140, step: 10 };
/**
 * The start card: `distance` from the eyes (metres) and `below` degrees
 * under the level line of sight, centred there and turned to face the eyes.
 *
 * - Distance: 45 cm, at the far end of Meta's range for direct touch (42 to
 *   46 cm), so it is within easy reach without being up against the face,
 *   and well short of the 0.5 to 0.8 m Meta says to avoid (too far to
 *   touch, too near for a ray).
 * - Height: 25 degrees down. The eyes rest 10 to 20 degrees below the
 *   horizon (Microsoft), the line of sight sits 10 to 15 degrees down
 *   (Magic Leap), and content belongs 0 to 35 degrees below (Microsoft):
 *   25 puts the middle of the card just under the resting gaze, its top
 *   edge a little below eye level, and its buttons (in its lower half,
 *   as Meta asks) low enough to press with the arm relaxed.
 * It glides back in front when the player turns more than `follow` degrees away,
 * or when the head has moved more than `shift` metres from where it was when
 * the card was put there and stayed moved for `dwell` seconds (a lean in, or
 * sitting back): the card goes with the player, not left behind.
 */
const MENU_SPOT = { distance: 0.45, below: 25, follow: 35, glide: 4, shift: 0.12, dwell: 0.6 };
/** Canvas pixels per millimetre of card (ui/panel.ts draws at 2400 px a metre). */
const MM = 2.4;

/**
 * The game in three pictures, taken from the game itself
 * (scripts/shoot-howto.mjs). How to play shows the first three; the first run's
 * coach card shows the one for the step in hand.
 */
const MOVES = [
  { picture: 'howto-pinch.jpg', title: 'Pinch a guest', text: 'Put your fingers above a guest at the gate. When the guest glows, pinch.' },
  { picture: 'howto-seat.jpg', title: 'Seat the guest', text: 'Move the guest above the café. Open your fingers. The guest goes to the seat that glows.' },
  { picture: 'howto-happy.jpg', title: 'Keep guests happy', text: 'Seat guests quickly. The bar above the café shows how happy the guests are.' },
  // The coach card only (How to play shows the first three).
  { picture: 'howto-pause.jpg', title: 'Pause and shop', text: 'Point your hand at the bar and pinch. Pause is at the left end. Shop is at the right end.' },
];
/** How many of the MOVES How to play shows. */
const HOW_MOVES = 3;
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
  /** The start card and the card that opens in front of it (Settings, the New Game warning). */
  readonly menu = new StartMenu();
  /** How to play: the menu's card (ui/start-menu.ts), shown where the start card stands. */
  get how(): Panel {
    return this.menu.how;
  }
  /** The menu card in front just now (the start or pause card, or How to play): a new one is placed afresh. */
  private menuFront: Panel | null = null;
  /** What to start once the café is up (it rises after CONTINUE or NEW GAME). */
  private opening: 'run' | 'tutorial' | null = null;
  /** Where Settings was opened from. */
  private settingsFrom: 'title' | 'pause' = 'title';
  /** Where the shop was opened from: CLOSE goes back there (a run counts back in). */
  private shopFrom: 'run' | 'paused' = 'run';
  private sound: SoundSystem | null = null;
  private readonly edge = new Vector3();
  private readonly menuSpot = new Vector3();
  private readonly wanted = new Vector3();
  private readonly forward = new Vector3();
  private readonly toMenu = new Vector3();
  private readonly headQ = new Quaternion();
  private menuPlaced = false;
  private menuFollowing = false;
  /** Where the head was when the card was last put in front of it, and how long it has been well away from there (seconds). */
  private readonly menuHead = new Vector3();
  private menuAway = 0;
  /**
   * Seconds left in which the card is put afresh in front of the head every
   * frame: the first moments of the headset view, while the tracking
   * settles. The card goes up before the headset view starts, from the
   * page's own (made-up) head, so it is put again from the real head.
   */
  private menuSettle = 0;
  /** How long the card is put afresh after the headset view starts (seconds). */
  private static readonly MENU_SETTLE_S = 0.6;
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
  /** Each hand's ray to the bar, as drawn. */
  readonly rays = new HandRays();
  /** Each hand's ray is on the bar this frame (for the checks), and the button under it. */
  readonly aim: Record<Hand, string | null> = { left: null, right: null };
  private readonly rayFrom = new Vector3();
  private readonly rayDir = new Vector3();
  private readonly rayHit = new Vector3();
  private readonly barNormal = new Vector3();
  private readonly rayMatrix = new Matrix4();
  private readonly shoulder = new Vector3();

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
        if (i < HOW_MOVES) this.menu.howPictures[i] = image;
        // Cards already up are drawn again with it.
        this.how.paint();
        this.coach.paint();
      };
      image.src = `${import.meta.env.BASE_URL}ui/${move.picture}`;
    });
    this.coach.mesh.position.set(...COACH.position);
    // A pinch on a card is the card's, never the café's or a guest's.
    this.hold?.claims.push((point) => this.card.covers(point) || this.how.covers(point) || this.coach.covers(point));
    this.world.createTransformEntity(this.rays.group);
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
    this.panels = [this.card, this.how, this.coach, this.menu.card, this.menu.sheet, this.strip.panel];
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
    xr.addEventListener('sessionstart', () => {
      xr.getSession()?.addEventListener('visibilitychange', onVisibility);
      // The card was put from the page's head: put it again from the real one once tracking settles.
      this.menuSettle = GameSystem.MENU_SETTLE_S;
      this.menuPlaced = false;
      // Back in the headset mid-run: the pause card is there again.
      if (this.phase === 'paused' && this.resuming <= 0) this.showPauseCard();
    });
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
    this.strip.controls = this.phase === 'run' || this.resuming > 0 ? 'live' : this.phase === 'paused' ? 'paused' : 'off';
    if (!cafe.placed || cafe.arriving) {
      for (const hand of HANDS) this.rays.update(hand, null, null, null, cardDelta);
      return;
    }
    this.press(cardDelta);
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
   * not by how it tilts), MENU_SPOT.distance from the eyes and
   * MENU_SPOT.below degrees under the level line of sight, tilted back to
   * face them. It faces the player
   * once, when it is put there, and then stays still: a nod or a lean while a
   * finger presses does not move or turn it. Only if the player turns well
   * away (over MENU_SPOT.follow degrees) with no fingertip near does it glide
   * back in front of them, and face them again (a lazy follow, never stuck
   * to the head). The card opened in front of it (Settings, the warning)
   * stands 4 cm nearer, turned the same way.
   */
  private placeMenu(delta: number): void {
    // How to play stands where the start card does, in its place.
    const card = this.how.open ? this.how : this.menu.card;
    const sheet = this.menu.sheet;
    if (card !== this.menuFront) {
      this.menuFront = card;
      this.menuPlaced = false;
    }
    const onMenu = card.open || sheet.open;
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
      const below = (MENU_SPOT.below * Math.PI) / 180;
      this.wanted.copy(this.head).addScaledVector(this.forward, MENU_SPOT.distance * Math.cos(below));
      this.wanted.y -= MENU_SPOT.distance * Math.sin(below);
      // Outside the headset view, and in its first moments, the head is not yet the player's: keep putting it afresh.
      if (!this.world.renderer.xr.isPresenting || this.menuSettle > 0) {
        this.menuSettle = Math.max(0, this.menuSettle - delta);
        this.menuPlaced = false;
      }
      if (!this.menuPlaced) {
        this.menuSpot.copy(this.wanted);
        this.menuPlaced = true;
        this.menuFollowing = false;
        this.menuHead.copy(this.head);
        this.menuAway = 0;
        card.faceNow();
        card.turn = 0;
      } else {
        // Turned well away, and no finger at the card: glide back in front.
        this.toMenu.copy(this.menuSpot).sub(this.head).setY(0).normalize();
        const off = (Math.acos(Math.max(-1, Math.min(1, this.toMenu.dot(this.forward)))) * 180) / Math.PI;
        const tips = this.hold?.tip;
        const fingerNear = !!tips && HANDS.some((h) => tips[h].tracked && tips[h].point.distanceTo(this.menuSpot) < 0.15);
        if (off > MENU_SPOT.follow && !fingerNear) this.menuFollowing = true;
        // The head moved and stayed moved (a lean, sitting back): the card goes with it.
        const shifted = this.head.distanceTo(this.menuHead) > MENU_SPOT.shift;
        this.menuAway = shifted && !fingerNear ? this.menuAway + delta : 0;
        if (this.menuAway > MENU_SPOT.dwell) this.menuFollowing = true;
        if (this.menuFollowing) {
          card.turn = 3;
          this.menuSpot.lerp(this.wanted, 1 - Math.exp(-MENU_SPOT.glide * delta));
          if (this.menuSpot.distanceTo(this.wanted) < 0.01) {
            this.menuFollowing = false;
            this.menuHead.copy(this.head);
            this.menuAway = 0;
            card.turn = 0;
          }
        }
      }
      card.mesh.position.copy(this.menuSpot);
    }
    if (!sheet.open) return;
    // In front of the card it was opened from, 4 cm nearer the eyes, turned the same way.
    card.mesh.getWorldPosition(this.spot);
    card.mesh.getWorldQuaternion(this.headQ);
    this.toMenu.set(0, 0, 1).applyQuaternion(this.headQ);
    sheet.mesh.position.copy(this.spot).addScaledVector(this.toMenu, 0.04);
  }

  /** After the cards have turned: the sheet takes the turn of the card behind it (it never turns on its own). */
  private turnSheet(): void {
    const sheet = this.menu.sheet;
    if (!sheet.open) return;
    this.menu.card.mesh.getWorldQuaternion(sheet.mesh.quaternion);
  }

  /** Settings as the menu shows them. */
  private settingsState(): { music: number; sounds: number } {
    return { music: this.save.music, sounds: this.save.sounds };
  }

  private openSettings(from: 'title' | 'pause'): void {
    this.settingsFrom = from;
    this.menu.card.dimmed = true;
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
    this.menu.showHow(MOVES.slice(0, HOW_MOVES));
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
    this.menu.hideAll();
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
  }

  /**
   * The pause card, in front of the eyes like the start card: Paused, the
   * time open (and the best), RESUME, How to play and Settings, and End the
   * evening. Hiring is in the shop (the bar's Shop button).
   */
  private showPauseCard(): void {
    if (!this.menu.card.open) this.menuPlaced = false;
    this.menu.card.dimmed = false;
    this.menu.showPause({ time: clockText(this.clock), best: this.save.bestSeconds > 0 ? clockText(this.save.bestSeconds) : null });
  }

  /**
   * The shop, on the same card: the bank and the three baristas (working,
   * hire now, or not yet). Opened from the bar in a run, it pauses first;
   * CLOSE then counts back in. Opened while paused, CLOSE goes back to the
   * pause card.
   */
  private openShop(): void {
    if (this.phase === 'run') {
      this.pause();
      this.shopFrom = 'run';
    } else if (this.phase === 'paused') {
      if (this.resuming > 0) this.resuming = 0;
      this.shopFrom = this.menu.cardKind === 'shop' ? this.shopFrom : 'paused';
    } else return;
    this.closeSheet();
    this.showShop();
  }

  private showShop(): void {
    if (!this.menu.card.open) this.menuPlaced = false;
    const staff = this.shop.staff;
    this.menu.showShop({
      coins: this.score.bank,
      rows: BARISTA_NAMES.map((name, i) => {
        const label = name.charAt(0).toUpperCase() + name.slice(1);
        if (i < staff) return { name: label, status: 'working' as const };
        const price = HIRE_PRICES[i - STARTING_STAFF];
        if (i > staff) return { name: label, status: 'later' as const, price };
        return { name: label, status: this.score.bank >= price ? ('hire' as const) : ('short' as const), price };
      }),
    });
  }

  private closeShop(): void {
    if (this.shopFrom === 'run') this.resume();
    else this.showPauseCard();
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
    this.menu.hideAll();
  }

  /** Back to the pause card from the middle of a count. */
  private holdPause(): void {
    if (this.phase !== 'paused' || this.resuming <= 0) return;
    this.resuming = 0;
    this.showPauseCard();
  }

  /** The count on the card: one big number. */
  private showCount(): void {
    const n = Math.ceil(this.resuming);
    this.shownCount = n;
    this.closeSheet();
    this.menu.showCount(n);
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
    this.menu.hideAll();
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
    this.guests.evening = this.clock;
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
    this.guests.evening = 0;
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
   * Buttons. On the cards in reach: an index fingertip near one lights it,
   * and pushing through the card's face presses it; a pinch closing on one
   * presses it too. On the bar, out of reach: the hand ray (`aimAtBar`)
   * lights the button it points at, and a pinch presses it. A hand
   * carrying a guest or the café presses nothing and has no ray.
   */
  private press(delta: number): void {
    const hold = this.hold;
    if (!hold) return;
    const panels = this.panels;
    const bar = panels.indexOf(this.strip.panel);
    for (let i = 0; i < panels.length; i++) this.hovers[i] = null;
    for (const hand of HANDS) {
      const pinch = hold.pinch[hand];
      const fresh = pinch.closed && !this.previous[hand];
      this.previous[hand] = pinch.closed;
      const busy = pinch.gap === Infinity || pinch.ghost || hold.holding.includes(hand) || !!this.guests.carriedBy(hand);
      const tip = hold.tip[hand];
      let done = false;
      let near = false;
      for (let i = 0; i < panels.length; i++) {
        const panel = panels[i];
        // The fingertip: every card keeps track of it, so a press needs a push through this card's own face.
        const off = busy || panel.dimmed;
        const touch = panel.touch(hand, off || !tip.tracked ? null : tip.point);
        if (off || done) continue;
        if (tip.tracked && panel.covers(tip.point)) near = true;
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
      // The ray: only for a free hand away from the café and from every card in reach.
      const aimed = !busy && !done && !near && this.strip.controls !== 'off' && !hold.nearCafe(pinch.point, RAY.awayFromCafe) ? this.aimAtBar(hand) : null;
      this.aim[hand] = aimed ? (aimed.button?.id ?? '') : null;
      this.rays.update(hand, aimed ? this.rayFrom : null, aimed ? this.rayHit : null, aimed ? this.barNormal : null, delta);
      if (!aimed?.button) continue;
      this.hovers[bar] = aimed.button.id;
      if (fresh) {
        this.strip.panel.press(aimed.button.id);
        this.click(aimed.button.id);
      }
    }
    for (let i = 0; i < panels.length; i++) panels[i].setHover(this.hovers[i]);
  }

  /**
   * Where a hand's ray meets the bar: the headset's own pointer for the hand
   * (its target ray, steadied by the system as in its own menus), or, where
   * there is none, a line from the shoulder through the pinch. Null when it
   * does not meet the bar; else the button under it (null between buttons).
   * Sets rayFrom (at the hand), rayHit and barNormal.
   */
  private aimAtBar(hand: Hand): { button: Button | null } | null {
    const panel = this.strip.panel;
    if (!panel.open) return null;
    const pinch = this.hold!.pinch[hand];
    const source = this.world.input.xr.getPrimaryInputSource(hand) as XRInputSource | undefined;
    const frame = this.xrFrame as XRFrame | undefined;
    const space = this.xrManager.getReferenceSpace();
    const pose = source?.targetRaySpace && frame && space ? frame.getPose(source.targetRaySpace, space) : null;
    if (pose) {
      this.rayMatrix.fromArray(pose.transform.matrix).premultiply(this.player.matrixWorld);
      this.rayFrom.setFromMatrixPosition(this.rayMatrix);
      this.rayDir.set(0, 0, -1).transformDirection(this.rayMatrix);
    } else {
      // About where the shoulder is: below the eyes, to the hand's side.
      this.player.head.getWorldQuaternion(this.headQ);
      this.forward.set(1, 0, 0).applyQuaternion(this.headQ).setY(0).normalize();
      this.shoulder.copy(this.head).addScaledVector(this.forward, hand === 'right' ? 0.17 : -0.17);
      this.shoulder.y -= 0.2;
      this.rayFrom.copy(pinch.point);
      this.rayDir.copy(pinch.point).sub(this.shoulder).normalize();
    }
    const mesh = panel.mesh;
    mesh.getWorldPosition(this.spot);
    mesh.getWorldQuaternion(this.headQ);
    this.barNormal.set(0, 0, 1).applyQuaternion(this.headQ);
    const facing = this.rayDir.dot(this.barNormal);
    // It must come at the bar's face from the front.
    if (facing > -0.05) return null;
    const t = this.wanted.copy(this.spot).sub(this.rayFrom).dot(this.barNormal) / facing;
    if (t <= 0 || t > RAY.reach) return null;
    this.rayHit.copy(this.rayFrom).addScaledVector(this.rayDir, t);
    const local = mesh.worldToLocal(this.wanted.copy(this.rayHit));
    const g = (mesh.geometry as PlaneGeometry).parameters;
    const edge = g.height * RAY.edge;
    if (Math.abs(local.x) > g.width / 2 + edge || Math.abs(local.y) > g.height / 2 + edge) return null;
    return { button: panel.hit(this.rayHit) };
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
      case 'quit':
        // Asks first (KEEP PLAYING is the main button, so a stray press stays).
        this.menu.card.dimmed = true;
        this.menu.openQuit();
        break;
      case 'quit-no':
        this.closeSheet();
        break;
      case 'quit-yes':
        // Save, then leave the headset view: the page before the headset is back.
        this.keep();
        this.closeSheet();
        void this.world.renderer.xr.getSession()?.end();
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
      case 'bar-pause':
        // The bar's Pause: pauses a run; while paused (the card up) it carries on, as RESUME does.
        if (this.phase === 'run' || this.resuming > 0) this.pause();
        else if (this.phase === 'paused') this.resume();
        break;
      case 'bar-shop':
        this.openShop();
        break;
      case 'shop-close':
        this.closeShop();
        break;
      case 'hire-later':
        // Not yet: the bank cannot pay, or another comes first. The shop says no.
        this.shop.refused++;
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
        // In the shop: show the new staff and bank.
        if (this.menu.cardKind === 'shop' && this.menu.card.open) this.showShop();
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
    { picture: 0, title: MOVES[0].title, text: 'Put your fingers above the guest at the gate. When the guest glows, pinch.', done: (g) => g.guests.pickedUp > g.mark.pickedUp },
    { picture: 1, title: MOVES[1].title, text: MOVES[1].text, done: (g) => g.guests.seated > g.mark.seated },
    { picture: 2, title: 'The guest gets tea', text: 'Guests pay when they get their tea. The bar above the café shows how happy the guests are.', done: (g) => g.baristas.servedCount > g.mark.served },
    { picture: 3, title: MOVES[3].title, text: MOVES[3].text, next: true, done: () => false },
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
