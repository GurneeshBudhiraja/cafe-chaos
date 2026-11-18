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
 * - The run: the café never closes. The player passes a level by serving
 *   a set number of guests; each level guests come a little faster and
 *   wait a little less in the line (game/rules.ts LEVEL). The goal met,
 *   the café eases to a stop and the level card goes up (confetti, a
 *   chime, CONTINUE). The café's happiness at zero loses the level: the
 *   retry card, TRY AGAIN from the level's start, coins kept. Coins go to
 *   the bank and hire servers (ShopSystem), who stay hired.
 * - Pause and Shop are on the bar (the scoreboard over the café), out of
 *   reach: the hand points at one and pinches (the hand ray, Meta's way to
 *   reach what is far; near the café or a card the ray is off and hands
 *   work directly). Pause stops everything in the café where it is and
 *   puts the pause card in front of the eyes (Resume, How to play,
 *   Settings, End the evening). Shop pauses too and shows the baristas to
 *   hire. The game pauses itself when the headset comes off or another
 *   app takes over, and the bank is saved then too.
 *
 * The bank, the staff, the level (and how far into it) and whether the
 * first run has been seen are kept between sessions (game/save.ts).
 *
 * In test mode (`?test`: the checks and recordings) none of this shows:
 * guests come at once and all six servers work, as before there was a
 * game around the café.
 */

import { createSystem, Matrix4, Quaternion, Vector3 } from '@iwsdk/core';
import { HandRays } from '../hands/hand-ray.js';
import { arrivalGap, COLD, coldChance, HAPPINESS, HURRY, hurryChance, STORM, JANITOR2_PRICE, JANITOR_PRICE, pairChance, PAIRS, LEVEL, levelBonus, levelGoal, linePatience, MAX_STAFF, MEAL_SECONDS, queueCap, startTables } from '../game/rules.js';
import { CAFE_NAMES, CANADA_PRICE, current, isCanada, TRIAL_LEVELS, type CafeId } from '../cafe/style.js';
import { howToPlay } from '../game/how-to-play.js';
import { forecastFor } from '../game/forecast.js';
import { CafeEvents } from '../game/events.js';
import { Snow } from '../ambience/snow.js';
import type { Forecast } from '../game/rules.js';
import { TABLE_RINGS } from '../cafe/layout.js';
import { CANADA_TABLE_RINGS } from '../cafe/canada-layout.js';
import { newSeed, tableOrder } from '../game/table-order.js';
import { PLACES, type WishId } from '../guests/wishes.js';
import { freshProgress, SaveBook, TEST_MODE, type Save } from '../game/save.js';
import { PATIENCE_SECONDS, SPAWN_SECONDS } from '../guests/rules.js';
import { HANDS, type Hand } from '../lib/hand-pinch.js';
import { coin, INK, moodFace, Panel, paragraph, roundRect, write, type Button } from '../ui/panel.js';
import type { PlaneGeometry } from '@iwsdk/core';
import { castLoaded } from '../guests/actor.js';
import { randomLook } from '../guests/cast.js';
import { BaristaSystem } from './barista-system.js';
import { sketchFontReady } from '../ui/sketch.js';
import { StripSystem } from './strip-system.js';
import { SoundSystem } from './sound-system.js';
import { LEVELS, StartMenu, type CafeTile } from '../ui/start-menu.js';
import type { DrawerRow } from '../ui/shop-drawer.js';
import { TipCard, TIP } from '../ui/tip-card.js';
import { TIP_GAP, TIP_ORDER, TIPS, tipIcon, WISH_TIPS, type TipId } from '../game/tips.js';
import { CafeSystem } from './cafe-system.js';
import { GuestSystem } from './guest-system.js';
import { HandleSystem } from './handle-system.js';
import { HoldSystem } from './hold-system.js';
import { ScoreSystem } from './score-system.js';
import { ShopSystem } from './shop-system.js';
import { MessSystem } from './mess-system.js';

/**
 * A level reached is not a phase: the bar shows it for a moment and the
 * café keeps going (`levelUp`). 'shopping': the shop drawer is down under
 * the bar (staff and tables are bought there), the café still and in view. 'closed': the café's happiness ran
 * out; the card offers the level again.
 */
export type GamePhase = 'waiting' | 'title' | 'opening' | 'rules' | 'tutorial' | 'run' | 'paused' | 'shopping' | 'closed' | 'test';

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
/** The hand ray: a hand within `awayFromCafe` of the café's footprint, up to well over its roof, is working over it and has no ray (HoldSystem.overCafe); `reach` metres at most; `edge` of a card's height round it still hits. */
const RAY = { awayFromCafe: 0.04, reach: 4, edge: 0.15 };
/**
 * A pinch counts the target the ray was on `before` seconds earlier if it
 * changed just as the fingers closed: a pinch nudges the hand, and a ray
 * magnifies it (the Heisenberg effect, Wolf et al. CHI 2020).
 */
const PINCH_NUDGE = { before: 0.12 };
/**
 * A free hand raised and pointing shows the short beam (hands/hand-ray.ts)
 * even before the ray is on anything, so pointing is discoverable: a hand
 * away from the café, no lower than `below` metres under the eyes, its ray
 * not tipped more than `down` (the sine of the angle) below level (a hand
 * reaching for the café, or resting, shows none).
 */
const BEAM = { below: 0.45, down: 0.5 };
/** The café's size in Settings (percent of what fits the table): the range and the step. */
const SIZE = { min: 60, max: 140, step: 10 };
/**
 * The menu cards (start, pause, shop, How to play, and the sheet opened in
 * front of them) stand where Quest's own panels do and are pressed the way
 * Quest's own panels are: out of reach, pointed at with the hand ray and
 * pinched. Pressing a card held in reach meant placing it for the arm as
 * well as the eyes, and no one place suited both (tried on the headset:
 * too high, then too close). So, as Meta, Apple and Google all do:
 *
 * - `distance`: 1 m from the eyes. Meta places objects "at a roughly 1
 *   meter distance slightly below the user's line of sight", and indirect
 *   (ray) panels no nearer than 0.8 m.
 * - `size`: the cards stand twice as big as made, so at 1 m they look the
 *   size they would at 50 cm: the same text, and buttons over 3 degrees
 *   (Meta asks 2.5 to 3 at least) for the ray.
 * - `top`: the top edge 4 degrees under the level line of sight, so the
 *   card hangs just under where the eyes look and never covers them (the
 *   eyes rest 10 to 20 degrees down, Microsoft). A taller card hangs lower,
 *   its centre never past `lowest` degrees.
 *
 * A card glides back in front when the player turns more than `follow`
 * degrees away, or when the head has moved more than `shift` metres from
 * where it was when the card was put there and stayed moved for `dwell`
 * seconds (a lean in, or sitting back).
 */
/** The notes under the bar: how long each stays (seconds), the gap between two, and how far under the bar's edge (metres). */
const NOTE = { seconds: 4, gap: 0.4, below: 0.012 };
const MENU_SPOT = { distance: 1, size: 2, top: 4, lowest: 30, follow: 35, glide: 4, shift: 0.12, dwell: 0.6 };
/** Canvas pixels per millimetre of card (ui/panel.ts draws at 2400 px a metre). */
const MM = 2.4;

/**
 * The first run's coach card: a picture for each move, taken from the game
 * itself (scripts/shoot-howto.mjs). How to play has its own list of steps,
 * with videos (game/how-to-play.ts).
 */
const MOVES = [
  { picture: 'howto-pinch.jpg', title: 'Pinch a guest', text: 'Put your fingers above a guest at the gate. When the guest glows, pinch.' },
  { picture: 'howto-seat.jpg', title: 'Seat the guest', text: 'Move the guest above the café. Open your fingers. The guest goes to the seat that glows.' },
  { picture: 'howto-happy.jpg', title: 'Keep guests happy', text: 'Seat guests quickly. The bar above the café shows how happy the guests are.' },
  { picture: 'howto-pause.jpg', title: 'Open a table', text: 'Point at Shop on the bar and pinch, then OPEN.' },
];
/** The pieces of the main room (cafe/layout.ts): the shell and the twelve places to sit; the extension's come after. */
const MAIN_PIECES = 13;
/** The bank is saved this often during a run (seconds), so little is lost if the page is closed. */
const AUTOSAVE_SECONDS = 20;

/** The first run: what each step says, and what moves it on (besides Next). */
interface Step {
  /** The table lesson: the Shop can be opened from the first run, to open a table (see GameSystem.tableLesson). */
  lesson?: boolean;
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
  /** Seconds played since the café was last opened (it stops while paused). */
  clock = 0;
  /** The level (1-based), and guests served in it so far. */
  level = 1;
  levelServed = 0;
  /** The happiness last written to the save (a leaver changes it; it is saved then). */
  private savedHappiness = -1;
  /** `score.servedGuests` when this level's count stood at zero. */
  private servedMark = 0;
  /**
   * Short notes under the middle of the bar, one at a time (a level's
   * next goal, a table that can open): each for its `seconds`, shown only
   * in a run, with a short gap between. Not tips: they come every time.
   */
  readonly note = new TipCard();
  private readonly notes: { title: string; icon: TipId; seconds: number; text: string }[] = [];
  /** The table price "TABLE READY" was last shown on the bar for (it comes once a price). */
  private readyAt = -1;
  /** Notes shown (the sound system pops for each). */
  notesShown = 0;
  private noteLeft = 0;
  private noteRest = 0;
  /** The tip card (game/tips.ts), the tip it shows (null: none), how long it has been up, and how long since the last went. */
  readonly tip = new TipCard();
  tipShown: TipId | null = null;
  tipsShown = 0;
  private tipAge = 0;
  private tipRest = 0;
  /** What the tip is next to: a guest's id, a table's index, or the bar's Shop button. */
  private tipAt: { guest?: number; table?: number; shop?: boolean; bar?: boolean } = {};
  /** Counts when the tip went up, to tell when the player has done it. */
  private tipMark = 0;
  /** Every café's save and the shared part (game/save.ts). */
  readonly book = new SaveBook();
  /** The café up now: its save, with the shared part (written back by `persist`). */
  save: Save = this.book.load('japan');
  /**
   * The Canadian café's free trial is on: TRIAL_LEVELS levels, its progress
   * not saved (only the shared part is), unless the café is bought during it.
   */
  trial = false;
  /** A café chosen on the start card whose models are still loading: it opens once they are in. */
  private pending: { id: CafeId; how: 'continue' | 'fresh' | 'trial' } | null = null;
  /** Where the Buy question was asked from: the start card, or the Shop (a run goes on after it). */
  private buyFrom: 'title' | 'shop' = 'title';
  /** The café the New game question is about. */
  private newFor: CafeId = 'japan';
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
  mess!: MessSystem;
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
  /** Where the shop was opened from: CLOSE goes back there (a run carries on). */
  private shopFrom: 'run' | 'paused' | 'tutorial' = 'run';
  private readonly at = new Vector3();
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
  private rulesFrom: GamePhase = 'title';
  strip!: StripSystem;
  private cafe!: CafeSystem;
  private hold: HoldSystem | null = null;
  private handles: HandleSystem | null = null;
  private readonly spot = new Vector3();
  private readonly previous: Record<Hand, boolean> = { left: false, right: false };
  private readonly head = new Vector3();
  /** Counts when the step began (to tell when the player has done it). */
  mark = { pickedUp: 0, seated: 0, served: 0, wristOpens: 0, tables: 0 };
  /** The first run's last step is up: open a table from the Shop with the hand ray (the Shop opens in the tutorial). */
  private tableLesson = false;
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
    this.mess = this.world.getSystem(MessSystem)!;
    this.score = this.world.getSystem(ScoreSystem)!;
    this.strip = this.world.getSystem(StripSystem)!;
    this.hold = this.world.getSystem(HoldSystem) ?? null;
    this.handles = this.world.getSystem(HandleSystem) ?? null;
    for (const panel of [this.card, this.coach]) this.cafe.cafe.add(panel.mesh);
    this.cafe.cafe.add(this.snow.points);
    this.world.createTransformEntity(this.how.mesh);
    this.card.mesh.position.set(...CARD.position);
    MOVES.forEach((move, i) => {
      const image = new Image();
      image.onload = () => {
        this.pictures[i] = image;
        // The coach card, if it is up, is drawn again with it.
        this.coach.paint();
      };
      image.src = `${import.meta.env.BASE_URL}ui/${move.picture}`;
    });
    this.coach.mesh.position.set(...COACH.position);
    // A pinch on a card is the card's, never the café's or a guest's.
    this.hold?.claims.push((point) => this.card.covers(point) || this.how.covers(point) || this.coach.covers(point));
    this.world.createTransformEntity(this.rays.group);
    this.cafe.cafe.add(this.tip.panel.mesh);
    this.cafe.cafe.add(this.note.panel.mesh);
    // A carried guest held over a locked table's seat: the tag there says where tables are opened.
    this.guests.lockedNote = () => 'Open tables in the Shop';
    // The start menu stands in the world (the café is hidden until it is opened).
    // The menu cards stand a metre away, twice as big (MENU_SPOT).
    for (const p of [this.menu.card, this.menu.sheet, this.menu.how]) p.size = MENU_SPOT.size;
    this.world.createTransformEntity(this.menu.card.mesh);
    this.world.createTransformEntity(this.menu.sheet.mesh);
    this.hold?.claims.push((point) => this.menu.card.covers(point) || this.menu.sheet.covers(point));
    // Test mode has no start card to open the café, so it comes straight up.
    if (!TEST_MODE) this.cafe.hold = true;
    this.applySettings();
    void sketchFontReady.then(() => {
      if (this.menu.card.open) this.menu.card.paint();
      if (this.menu.sheet.open) this.menu.sheet.paint();
    });
    this.rebuildPanels();
    this.shop.bought.push(() => this.keep());
    if (TEST_MODE) {
      this.phase = 'test';
      return;
    }
    // The café as it was left: its bank and its staff.
    this.restoreCafe();
    this.guests.mealSeconds = MEAL_SECONDS;
    this.quiet();
    // The headset taken off, or another app in front: pause and save.
    const xr = this.world.renderer.xr;
    const onVisibility = (): void => {
      if (xr.getSession()?.visibilityState === 'visible') return;
      // The headset off: a shop opened from a run closes into the pause.
      this.closeShop();
      this.pause();
    };
    xr.addEventListener('sessionstart', () => {
      xr.getSession()?.addEventListener('visibilitychange', onVisibility);
      // Look and pinch (Meta VR Glasses): the pinch's gaze ray presses the button looked at.
      xr.getSession()?.addEventListener('selectstart', (e) => this.lookAndPinch(e as XRInputSourceEvent));
      // The card was put from the page's head: put it again from the real one once tracking settles.
      this.menuSettle = GameSystem.MENU_SETTLE_S;
      this.menuPlaced = false;
      // Back in the headset mid-run: the pause card is there again.
      if (this.phase === 'paused') this.showPauseCard();
      if (this.phase === 'closed') this.showFailedCard();
      // How to play was up (opened from the pause card): back, so there is something to press.
      if (this.phase === 'rules') this.menu.showHow(howToPlay(current.id), this.menu.howIndex);
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
    this.awayWhilePaused();
    this.menu.tick(cardDelta);
    this.menu.card.update(cardDelta, this.head);
    this.menu.sheet.update(cardDelta, this.head);
    this.turnSheet();
    // A café chosen while its models were loading: open it once they are in.
    if (this.pending && this.phase === 'title' && this.cafe.cafeLoaded(this.pending.id)) {
      const { id, how } = this.pending;
      this.pending = null;
      this.startCafe(id, how);
    }
    if (this.opening && cafe.placed && !cafe.waiting && !cafe.arriving) {
      const what = this.opening;
      this.opening = null;
      if (what === 'run') this.toRun();
      else this.toTutorial();
    }
    this.tendTables();
    this.tendTips(cardDelta);
    this.tendNotes(cardDelta);
    this.strip.controls = this.phase === 'run' || this.phase === 'shopping' ? 'live' : this.phase === 'paused' ? 'paused' : 'off';
    if (!cafe.placed || cafe.arriving) {
      for (const hand of HANDS) this.rays.update(hand, null, null, null, cardDelta);
      return;
    }
    this.press(cardDelta);
    if (this.phase === 'tutorial') this.coachTick();
    if (this.phase === 'run') this.runTick(delta);
    // The storm's snow: it falls while the storm blows (held still in a pause), and fades when it ends or the café is left.
    if (this.events.storming && (current.id !== 'canada' || this.phase === 'title' || this.phase === 'tutorial')) this.calm();
    this.snow.update(delta, this.events.storming, delta > 0);
  }

  /** The Canadian café's events (game/events.ts): the snowstorm. Today's forecast, from the local date. */
  readonly events = new CafeEvents();
  readonly snow = new Snow();
  /** Today's forecast for the Canadian café (read again at each run's start: the date may have turned). */
  forecast: Forecast = forecastFor();

  /** One frame of a run's events: a storm blows in (a note, snow, cold guests, nobody wishes for outdoors) and out. */
  private tendEvents(delta: number): void {
    if (current.id !== 'canada') return;
    const change = this.events.update(delta, this.level, this.levelServed / levelGoal(this.level), this.forecast);
    if (change === 'stormStart') {
      const t = TIPS.storm;
      this.notes.unshift({ title: t.title, icon: 'storm', seconds: t.seconds, text: t.text });
      this.pace();
    } else if (change === 'stormEnd') {
      this.addNote('The storm has passed', 'storm', NOTE.seconds * 0.6);
      this.pace();
    }
  }

  /** End a storm at once (the café left, or a fresh run). */
  private calm(): void {
    this.events.reset();
    this.guests.storm = false;
  }

  // ------------------------------------------------------------- the phases

  /** The title card. */
  toTitle(): void {
    this.unpause();
    if (this.tipShown) this.endTip();
    this.clearNotes();
    this.strip.drawer.hide();
    this.phase = 'title';
    // The café away, as before it was first opened: the start card stands clear of it (it was inside the roof and
    // the cherry tree after MAIN MENU), and CONTINUE brings it up again with its rise.
    this.cafe.putAway();
    this.quiet();
    this.coach.show(false);
    this.card.show(false);
    this.card.dimmed = false;
    this.showLevelOnBar(this.save.level, this.save.levelServed);
    this.strip.live = false;
    this.strip.settle();
    // The scoreboard comes up with the café.
    this.strip.panel.show(false);
    this.how.show(false);
    this.menu.closeSheet();
    this.menu.card.dimmed = false;
    this.menuPlaced = false;
    // Back from a trial: its progress goes (it was never saved); the café played last stays first.
    if (this.trial) this.endTrial();
    this.showPicker();
  }

  /**
   * The start card: the cafés side by side, the one played last first
   * (ui/start-menu.ts). One press plays: Start, Continue, or the Canadian
   * café's Try free.
   */
  private showPicker(): void {
    const last = this.book.last;
    const ids: CafeId[] = last === 'canada' ? ['canada', 'japan'] : ['japan', 'canada'];
    const tiles: CafeTile[] = ids.map((id) => {
      const p = this.book.load(id);
      return {
        id,
        name: CAFE_NAMES[id].name,
        line: CAFE_NAMES[id].line,
        owned: this.book.owns(id),
        started: this.book.started(id),
        level: p.level,
        coins: p.bank,
        loading: this.pending?.id === id,
        // Today's weather at the Canadian café (read afresh each time the card shows: the date may have turned).
        forecast: id === 'canada' ? { id: forecastFor().id, line: forecastFor().line } : undefined,
      };
    });
    this.menu.showStart({ tiles, price: CANADA_PRICE, lesson: !this.save.tutorialDone });
  }

  /** A save worth continuing: the first run done, or anything earned. */
  private get returning(): boolean {
    return this.book.started(current.id);
  }

  /** Write the café up now: the shared part always, its progress only outside the trial. */
  private persist(): void {
    this.book.write(this.save, current.id, !this.trial);
  }

  /** Put the café's own bank, staff, tables, musicians and level into play (after loading or a fresh start). */
  private restoreCafe(): void {
    const s = this.save;
    this.score.bank = s.bank;
    this.shop.restore(s.hires, s.tables, s.janitor, s.janitor2, s.musicians);
    // A game with no table order yet (a new game, or a save from before there was one): its seed, drawn once and kept.
    if (!s.tableSeed) {
      s.tableSeed = newSeed() || 1;
      this.persist();
    }
    this.readyAt = -1;
    this.applyLocks();
    // The game's wish types met so far, and its guest count (new types come in by count: guests/wish-plan.ts).
    this.guests.gameGuests = s.wishGuests;
    this.guests.seenWishes = new Set(s.wishSeen as WishId[]);
    this.guests.seatHints = s.seatHints;
    this.score.trial = this.trial ? (s.level > TRIAL_LEVELS ? 'done' : 'on') : 'off';
    this.score.trialLevels = TRIAL_LEVELS;
  }

  /**
   * Open a café from the start card. `how`: 'continue' (its save),
   * 'fresh' (its progress dropped: a new game, or just bought), 'trial'
   * (the Canadian café, not owned: a fresh start never saved). Its models
   * still loading, it waits (the tile says so) and opens once they are in.
   */
  private startCafe(id: CafeId, how: 'continue' | 'fresh' | 'trial'): void {
    this.closeSheet();
    if (!this.cafe.setCafe(id)) {
      this.pending = { id, how };
      this.showPicker();
      return;
    }
    this.pending = null;
    this.trial = how === 'trial';
    if (how === 'fresh') this.book.reset(id);
    this.book.setLast(id);
    this.save = this.book.load(id);
    if (this.trial) Object.assign(this.save, freshProgress(id));
    this.restoreCafe();
    this.openCafe(this.save.tutorialDone ? 'run' : 'tutorial');
  }

  /** The trial is over (left, or back to the start card): nothing of it is kept. */
  private endTrial(): void {
    this.trial = false;
    this.score.trial = 'off';
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
   * not by how it tilts), MENU_SPOT.distance from the eyes with its top
   * edge MENU_SPOT.top degrees under the level line of sight, tilted back
   * to face them. It faces the player
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
      // The centre is half the card's height further down than its top edge.
      const tall = (card.mesh.geometry as PlaneGeometry).parameters.height;
      const top = (MENU_SPOT.top * Math.PI) / 180;
      const below = Math.min((MENU_SPOT.lowest * Math.PI) / 180, top + Math.atan((tall * MENU_SPOT.size) / 2 / MENU_SPOT.distance));
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
    sheet.mesh.position.copy(this.spot).addScaledVector(this.toMenu, 0.06);
  }

  /**
   * While the pause card is up (paused, or in How
   * to play or the shop from a pause), the café is hidden: it stands between
   * the eyes and the card a metre away, and hidden it is not drawn at all
   * (its guests, staff, lights and bar are all in it), so a pause costs the
   * headset next to nothing. Nothing is unloaded, so it is back at once
   * on RESUME.
   */
  private awayWhilePaused(): void {
    // The buy card is not here: the café stays in view under it, the table in question among it. Waiting for the
    // start card (put away, or not yet opened) it is hidden too; rising, its arrival shows it when it is time.
    // The Buy question asked from the Shop stands a metre away like the pause card, so the café, between it and the
    // eyes, goes away under it too.
    const buying = this.phase === 'shopping' && this.menu.sheetKind === 'buy';
    const away = this.phase === 'paused' || this.phase === 'closed' || (this.phase === 'rules' && this.rulesFrom === 'paused') || this.cafe.waiting || buying;
    if (away === this.cafeAway) return;
    this.cafeAway = away;
    if (away) this.cafe.cafe.visible = false;
    else if (!this.cafe.arriving) this.cafe.cafe.visible = true;
  }
  /** True while the café is hidden behind the pause card. */
  private cafeAway = false;

  /** After the cards have turned: the sheet takes the turn of the card behind it (it never turns on its own). */
  private turnSheet(): void {
    const sheet = this.menu.sheet;
    if (!sheet.open) return;
    this.menu.card.mesh.getWorldQuaternion(sheet.mesh.quaternion);
  }

  /** Settings as the menu shows them. */
  private settingsState(): { music: number; sounds: number; hints: boolean } {
    return { music: this.save.music, sounds: this.save.sounds, hints: this.save.seatHints };
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
    this.persist();
    this.menu.updateSettings(this.settingsState());
  }

  /** DELETE AND START: everything earned in that café goes (the settings stay), and a fresh evening opens there. */
  private startFresh(): void {
    this.startCafe(this.newFor, 'fresh');
  }

  // ------------------------------------------------------------ buying

  /** The Canadian café's Buy question: what it costs, and what the Japanese café has left after. */
  private askBuy(from: 'title' | 'shop'): void {
    this.buyFrom = from;
    const coins = current.id === 'japan' && !this.trial && this.phase !== 'title' ? this.score.bank : this.book.bank('japan');
    if (from === 'title') this.menu.card.dimmed = true;
    else this.strip.drawer.hide();
    this.menu.openBuy({ price: CANADA_PRICE, coins, trial: this.trial, fromJapan: current.id === 'japan' && from === 'shop' });
  }

  /**
   * Buy the Canadian café with the Japanese café's coins. From the start
   * card it opens fresh at once; in its trial the trial's progress is kept
   * and saved from now on; from the Japanese café's Shop the run goes on,
   * and a note says where to find it.
   */
  private buyCanada(): void {
    const inJapan = current.id === 'japan' && this.phase !== 'title';
    const coins = inJapan ? this.score.bank : this.book.bank('japan');
    if (coins < CANADA_PRICE || this.book.owns('canada')) {
      this.shop.refused++;
      return;
    }
    if (inJapan) {
      this.score.spend(CANADA_PRICE);
      this.keep();
    } else this.book.change('japan', (p) => (p.bank -= CANADA_PRICE));
    this.book.setOwned('canada');
    this.shop.purchases++;
    this.closeSheet();
    if (this.buyFrom === 'title') {
      this.startCafe('canada', 'fresh');
      return;
    }
    if (this.trial) {
      // Bought in the trial: what was played is the café's own now, and saved from here on.
      this.trial = false;
      this.score.trial = 'off';
      this.persist();
      this.addNote('The Canadian café is yours', 'shop', NOTE.seconds, 'Your progress is saved.');
    } else {
      this.book.reset('canada');
      this.addNote('You bought the Canadian café', 'shop', NOTE.seconds, 'Play it from the main menu.');
    }
    this.backToShop();
  }

  /** Leaving the trial asks first: its progress is not saved. */
  private askLeave(): void {
    this.menu.card.dimmed = true;
    this.menu.openLeave();
  }

  /** From the Buy question back to the Shop drawer (the run still stopped under it). */
  private backToShop(): void {
    this.closeSheet();
    if (this.phase === 'shopping') this.showShop();
  }

  /** How to play: the steps one at a time, each a looping video and a line (game/how-to-play.ts). */
  toRules(): void {
    this.rulesFrom = this.phase;
    this.phase = 'rules';
    this.card.show(false);
    this.menu.hideAll();
    this.menu.showHow(howToPlay(current.id));
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

  /**
   * Open the café: guests come and the board is live. The level is the
   * saved one, carried on from where it was left (the guests served in
   * it and the café's happiness; nobody is in the café). `again`: the
   * level from its start, the happiness full (after it ran out).
   */
  toRun(again = false): void {
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
    this.clearNotes();
    // A clean café to start: tables get dirty from here on.
    this.mess.clear();
    this.mess.enabled = true;
    this.score.startRun();
    this.guests.startRun();
    this.calm();
    this.forecast = forecastFor();
    this.level = Math.max(1, Math.floor(this.save.level));
    this.levelServed = again ? 0 : Math.max(0, Math.min(levelGoal(this.level) - 1, Math.floor(this.save.levelServed)));
    this.servedMark = this.score.servedGuests - this.levelServed;
    // Carried on: the happiness it had (saved on every change). From a level's start, after it was lost: full.
    if (!again && this.save.happiness > 0) this.score.happiness = Math.min(HAPPINESS.max, this.save.happiness);
    this.pace();
    this.menu.hideAll();
    this.strip.live = true;
    this.strip.settle();
    this.strip.panel.show(true);
    this.keep();
  }

  /** Stop everything in the café where it is, and save. No-op unless a run is on (mid-count, it holds the pause). */
  pause(): void {
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
   * level and the guests served in it, RESUME, How to play and Settings,
   * and MAIN MENU (the level is saved as it stands). Hiring is in the shop
   * (the bar's Shop button).
   */
  private showPauseCard(): void {
    if (!this.menu.card.open) this.menuPlaced = false;
    this.menu.card.dimmed = false;
    this.menu.showPause({ level: this.level, served: this.levelServed, goal: levelGoal(this.level) });
  }

  /**
   * The shop, on the same card: the bank and the three baristas (working,
   * hire now, or not yet). Opened from the bar in a run, it pauses first;
   * CLOSE then carries on. Opened while paused, CLOSE goes back to the
   * pause card.
   */
  /**
   * Shop on the bar: the shop drawer comes down under the bar and the café
   * stands still, in view (phase 'shopping'). From a run, closing it goes
   * back to the run; from the pause card, back to the pause card. Shop
   * again closes it.
   */
  private openShop(): void {
    if (this.phase === 'shopping') {
      this.closeShop();
      return;
    }
    if (this.phase === 'run' || (this.phase === 'tutorial' && this.tableLesson)) {
      this.shopFrom = this.phase === 'run' ? 'run' : 'tutorial';
      this.speed = this.cafe.timeScale || this.speed;
      this.cafe.timeScale = 0;
      this.guests.handsOff = true;
      // The coach card steps aside while the drawer is down.
      if (this.shopFrom === 'tutorial') this.coach.show(false);
    } else if (this.phase === 'paused') {
      this.shopFrom = 'paused';
      this.closeSheet();
      this.menu.hideAll();
    } else return;
    this.phase = 'shopping';
    this.showShop();
  }

  /** The drawer's hires as they stand: the next barista at its price (one row however many), and the janitor. */
  private showShop(): void {
    const price = this.shop.price;
    const table = this.shop.tablePrice;
    const left = this.cafe.lockedTables.size;
    this.strip.drawer.show([
      { kind: 'barista', name: 'Barista', hired: this.shop.staff, most: MAX_STAFF, price, canPay: price !== null && this.score.bank >= price, id: 'hire', word: 'HIRE' },
      this.janitorRow(),
      // The tables: OPEN opens the next (nearest the front first); how many are left beside its name.
      { kind: 'table', name: 'Table', hired: 0, most: 0, price: left > 0 ? table : null, canPay: left > 0 && this.score.bank >= table, id: 'open-table', word: 'OPEN', note: left > 0 ? `${left} left` : undefined },
      ...this.canadaRows(),
    ]);
  }

  /** The janitor: one in the Japanese café; in the Canadian café a second (barista-cedar) after the first. */
  private janitorRow(): DrawerRow {
    const shop = this.shop;
    if (current.id !== 'canada') return { kind: 'janitor', name: 'Janitor', hired: shop.janitor ? 1 : 0, most: 1, price: shop.janitor ? null : JANITOR_PRICE, canPay: this.score.bank >= JANITOR_PRICE, id: 'hire-janitor', word: 'HIRE' };
    const price = !shop.janitor ? JANITOR_PRICE : !shop.janitor2 ? JANITOR2_PRICE : null;
    return { kind: 'janitor', name: 'Janitor', hired: (shop.janitor ? 1 : 0) + (shop.janitor2 ? 1 : 0), most: 2, price, canPay: price !== null && this.score.bank >= price, id: shop.janitor ? 'hire-janitor2' : 'hire-janitor', word: 'HIRE', picture: 'ui/shop-birch.jpg' };
  }

  /** The Canadian café's rows: its musicians; and the café itself while it is for sale (its trial, or the Japanese café once it can be bought). */
  private canadaRows(): DrawerRow[] {
    const rows: DrawerRow[] = [];
    const shop = this.shop;
    if (current.id === 'canada') {
      const price = shop.musicianPrice;
      rows.push({ kind: 'musician', name: 'Musician', hired: shop.musicians, most: 2, price, canPay: price !== null && this.score.bank >= price, id: 'buy-musician', word: 'BUY', picture: shop.musicians === 0 ? 'ui/shop-fiddler.jpg' : 'ui/shop-pianist.jpg', done: price === null ? 'Both play now' : undefined });
    }
    const forSale = !this.book.owns('canada') && (this.trial || (current.id === 'japan' && (this.save.forSaleSeen || this.score.bank >= CANADA_PRICE)));
    if (forSale) {
      const coins = current.id === 'japan' ? this.score.bank : this.book.bank('japan');
      const can = coins >= CANADA_PRICE;
      rows.push({ kind: 'cafe', name: 'Canadian café', hired: 0, most: 0, price: can || current.id === 'japan' ? CANADA_PRICE : null, canPay: can, id: 'buy-cafe', word: 'BUY', picture: 'ui/canada-cover.jpg', note: can ? undefined : `${coins} / ${CANADA_PRICE}`, done: 'Earn it in the Japanese café' });
    }
    return rows;
  }

  private closeShop(): void {
    if (this.phase !== 'shopping') return;
    this.strip.drawer.hide();
    if (this.shopFrom === 'run' || this.shopFrom === 'tutorial') {
      this.phase = this.shopFrom;
      this.cafe.timeScale = this.speed;
      this.guests.handsOff = false;
      if (this.phase === 'tutorial') this.coach.show(true);
    } else {
      this.phase = 'paused';
      this.showPauseCard();
    }
  }

  /** Carry on from a pause: the café shows and moves again at once. */
  resume(): void {
    if (this.phase !== 'paused') return;
    this.unpause();
    this.phase = 'run';
    this.menu.hideAll();
  }

  /**
   * The café's happiness ran out: the level is lost. Everything stops,
   * the card says how far it got, and TRY AGAIN starts the level afresh.
   * The coins and the staff are kept; only the level's count goes back to
   * zero (a small setback, so trying again is easy).
   */
  toClosed(): void {
    this.unpause();
    this.phase = 'closed';
    this.clearNotes();
    this.strip.live = false;
    this.quiet();
    this.save.runs++;
    const served = this.levelServed;
    // Saved as the level from its start: closing the page here comes back to the same place.
    this.levelServed = 0;
    this.servedMark = this.score.servedGuests;
    this.score.refill();
    this.keep();
    this.failed = { level: this.level, served, goal: levelGoal(this.level), left: this.score.down };
    this.showFailedCard();
  }
  private failed = { level: 1, served: 0, goal: 1, left: 0 };

  private showFailedCard(): void {
    if (!this.menu.card.open) this.menuPlaced = false;
    this.menu.card.dimmed = false;
    this.menu.showFailed(this.failed);
  }

  // --------------------------------------------------------------- running

  private runTick(delta: number): void {
    this.clock += delta;
    this.tendEvents(delta);
    const served = this.score.servedGuests - this.servedMark;
    if (served !== this.levelServed) {
      // A guest served: counted, the pace moved on, and saved (a level left part-way is carried on from here).
      this.levelServed = served;
      this.pace();
      this.keep();
    }
    this.sinceSave += delta;
    if (this.score.happiness !== this.savedHappiness || this.sinceSave >= AUTOSAVE_SECONDS) this.keep();
    if (this.score.happiness <= 0) {
      this.toClosed();
      return;
    }
    if (this.levelServed >= levelGoal(this.level)) this.levelUp();
    // Once, in the Japanese café: its coins can buy the Canadian café now.
    if (current.id === 'japan' && !this.save.forSaleSeen && !this.book.owns('canada') && this.score.bank >= CANADA_PRICE) {
      this.save.forSaleSeen = true;
      this.persist();
      this.addNote('The Canadian café is for sale', 'shop', NOTE.seconds * 1.5, `Buy it in the Shop for ${CANADA_PRICE} coins.`);
    }
  }

  /**
   * A level reached. It is counted and saved at once (the next level, none
   * served yet, its bonus in the bank, the happiness full), and the café
   * keeps going: the bar shows "LEVEL n!" and its coins for a moment with
   * confetti and the chime, a one-line note under it gives the next goal,
   * and no new guest comes for LEVEL.breather seconds. Nothing stops the
   * play (a full-screen card broke the flow, and someone who took the
   * headset off came back to a card, not the café); a real rest is one
   * pinch away on Pause (Meta: let players go at their own pace).
   */
  private levelUp(): void {
    const goal = levelGoal(this.level);
    this.level++;
    this.servedMark += goal;
    this.levelServed = Math.max(0, this.score.servedGuests - this.servedMark);
    this.score.award(levelBonus(this.level));
    this.score.refill();
    this.save.bestLevel = Math.max(this.save.bestLevel, this.level);
    this.pace();
    this.keep();
    this.guests.holdArrivals(LEVEL.breather);
    // The trial's levels played: the café goes on, and the bar and a note say it can be bought. "TRIAL DONE!" once,
    // then no more level numbers (the bar reads "Trial done" until the café is bought).
    if (this.trial && this.level > TRIAL_LEVELS) {
      if (this.score.trial !== 'done') {
        this.score.trial = 'done';
        this.strip.showLevel(this.level, levelBonus(this.level), 'TRIAL DONE!');
        this.addNote('Trial done', 'shop', NOTE.seconds * 1.5, 'Buy the café in the Shop to keep it.');
      }
      return;
    }
    this.strip.showLevel(this.level, levelBonus(this.level));
    this.addNote(`Next: serve ${levelGoal(this.level)} guests`, 'goal', NOTE.seconds);
  }

  /** Queue a note under the bar (see `note`): one line, or with `text` a second. */
  addNote(title: string, icon: TipId, seconds: number, text = ''): void {
    this.notes.push({ title, icon, seconds, text });
  }

  private clearNotes(): void {
    this.notes.length = 0;
    this.noteLeft = 0;
    this.note.hide();
  }

  /** The notes under the bar: the first in the queue for its seconds, then a short gap, then the next. Only in a run. */
  private tendNotes(delta: number): void {
    const panel = this.note.panel;
    panel.update(delta, this.head);
    if (this.phase !== 'run') {
      if (panel.open) panel.show(false);
      return;
    }
    if (this.noteLeft > 0) {
      this.noteLeft -= delta;
      if (this.noteLeft <= 0) {
        this.notes.shift();
        this.note.hide();
        this.noteRest = NOTE.gap;
        return;
      }
      if (!panel.open) panel.show(true);
      this.placeNote();
      return;
    }
    this.noteRest -= delta;
    const next = this.notes[0];
    // One thing under the bar at a time: a tip there (the level's goal, More hands) goes first.
    if (!next || this.noteRest > 0 || this.tipUnderBar()) return;
    this.noteLeft = next.seconds;
    this.note.show(next.title, next.text, tipIcon(next.icon));
    this.notesShown++;
    if (this.sound) this.sound.notes = this.notesShown;
    this.placeNote();
    panel.faceNow();
  }

  /** Is a tip up under the bar (by its level count or its Shop button)? Notes wait for it, and it for them. */
  private tipUnderBar(): boolean {
    return this.tipShown !== null && (!!this.tipAt.bar || !!this.tipAt.shop);
  }

  /** Under the middle of the bar, clear of its bottom edge (café space). */
  private placeNote(): void {
    const bar = this.strip.panel;
    const g = (bar.mesh.geometry as PlaneGeometry).parameters;
    const tall = (this.note.panel.mesh.geometry as PlaneGeometry).parameters.height;
    bar.mesh.localToWorld(this.spot.set(0, -g.height / 2 - NOTE.below - tall / 2, 0.01));
    this.cafe.cafe.worldToLocal(this.spot);
    this.note.panel.mesh.position.copy(this.spot);
  }

  /** The level's pace now: how often guests come, how many may queue, how long they wait, how many wishes (game/rules.ts LEVEL). */
  private pace(): void {
    const g = this.guests;
    const goal = levelGoal(this.level);
    const gap = arrivalGap(this.level, this.levelServed / goal);
    // The gaps are the level's own: a little either side of `gap`, not stretched as the café fills.
    g.spawnSeconds[0] = gap * 0.85;
    g.spawnSeconds[1] = gap * 1.15;
    g.spawnPace = 1;
    g.spawnStretch = 1;
    g.queueCap = queueCap(this.level);
    g.patienceSeconds = linePatience(this.level);
    g.seatedPatience = LEVEL.seatedPatience;
    g.level = this.level;
    g.singerChance = this.level >= LEVEL.singerFrom ? LEVEL.singer : 0;
    g.hurryChance = hurryChance(this.level);
    g.pairChance = pairChance(this.level);
    g.hurry = { line: HURRY.line, lineMin: HURRY.lineMin, seated: HURRY.seated };
    // The Canadian café's cold guests, the storm and the day's leanings (docs/CANADA-CHALLENGES.md; none in the Japanese café).
    const canada = current.id === 'canada';
    const storm = canada && this.events.storming;
    g.storm = storm;
    g.stormOutside = STORM.outside;
    g.coldChance = !canada ? 0 : storm ? STORM.cold : coldChance(this.level, this.forecast);
    g.cold = { line: COLD.line, outside: COLD.outside };
    g.forecastLean = canada ? [...this.forecast.lean] : [];
    // The first hurried guest and the first pair come on cue, so every player meets them early (the competition's
    // "satisfying in 10 minutes"): the third arrival once hurried guests begin, the first arrival once pairs do.
    if (this.phase === 'run' && this.level >= HURRY.from && !this.save.metHurry) {
      this.save.metHurry = true;
      g.hurryIn(3);
    }
    // The first singer too (the Japanese café, from level 3): the music and quiet wishes need one to come in.
    if (this.phase === 'run' && !isCanada() && this.level >= LEVEL.singerFrom && !this.save.metSinger) {
      this.save.metSinger = true;
      g.forceSinger = true;
    }
    if (this.phase === 'run' && this.level >= PAIRS.from && !this.save.metPair) {
      this.save.metPair = true;
      g.forcePair = true;
    }
    this.showLevelOnBar(this.level, this.levelServed);
  }

  private showLevelOnBar(level: number, served: number): void {
    this.score.level = level;
    this.score.levelServed = served;
    this.score.levelGoal = levelGoal(level);
  }

  /** Write the bank, the staff and the level (how far into it, and the café's happiness) to the save. */
  private keep(): void {
    this.sinceSave = 0;
    this.save.bank = this.score.bank;
    this.save.hires = this.shop.hires;
    this.save.janitor = this.shop.janitor;
    this.save.janitor2 = this.shop.janitor2;
    this.save.musicians = this.shop.musicians;
    this.save.tables = [...this.shop.tables];
    this.save.wishGuests = this.guests.gameGuests;
    this.save.wishSeen = [...this.guests.seenWishes];
    if (this.phase === 'run' || this.phase === 'paused' || this.phase === 'shopping' || this.phase === 'closed') {
      this.save.level = this.level;
      this.save.levelServed = this.levelServed;
      this.save.happiness = this.score.happiness;
      this.savedHappiness = this.score.happiness;
    }
    this.persist();
  }

  /** Let the café move again after a pause (a no-op when it is not paused). */
  private unpause(): void {
    if (this.phase !== 'paused') return;
    this.cafe.timeScale = this.speed;
    this.guests.handsOff = false;
  }

  /** The café with nobody coming: before a run and after it. Guests still about keep their patience (they wait politely). */
  private quiet(): void {
    this.mess.enabled = false;
    this.guests.arrivals = false;
    this.guests.patienceFrozen = true;
    this.guests.spawnPace = 1;
    this.guests.spawnSeconds = [...SPAWN_SECONDS];
    this.guests.patienceSeconds = PATIENCE_SECONDS;
    this.guests.level = 1;
    this.guests.singerChance = 0;
    this.guests.hurryChance = 0;
    this.guests.pairChance = 0;
    this.score.running = false;
    if (this.phase === 'title') this.guests.clear();
  }

  // ------------------------------------------------------------ first run

  private goToStep(index: number): void {
    this.step = index;
    this.mark = { pickedUp: this.guests.pickedUp, seated: this.guests.seated, served: this.baristas.servedCount, wristOpens: this.wristOpens, tables: this.shop.tablesBought };
    // The table lesson: the Shop opens from the first run; if the first guest's coins fall short of a table, the house
    // makes up the rest, so the lesson always ends in a table opened (a reward, not a chore).
    this.tableLesson = !!this.steps[index].lesson;
    if (this.tableLesson) {
      const short = this.shop.tablePrice - this.score.bank;
      if (short > 0) this.score.award(short);
    }
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
        // The first run teaches the pinch and the seat, not wishes: its guest is happy anywhere.
        this.guests.spawn(look, true);
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
    this.tableLesson = false;
    // The ray to a padlock has been learned here: the one-time "Open a table" tip is not needed.
    if (this.shop.tablesBought > this.mark.tables && !this.save.tips.includes('table')) this.save.tips.push('table');
    this.save.tutorialDone = true;
    this.persist();
    this.toRun();
  }

  // ---------------------------------------------------------------- buttons

  /**
   * Buttons. On the cards in reach: an index fingertip near one lights it,
   * and touching the card's face presses it; a pinch closing on one
   * presses it too. On the menu cards and the bar, out of reach: the hand
   * ray (`aimRay`) lights the button it points at, and a pinch presses it. A hand
   * carrying a guest or the café presses nothing and has no ray.
   */
  private press(delta: number): void {
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
      let near = false;
      for (let i = 0; i < panels.length; i++) {
        const panel = panels[i];
        // The fingertip: every card keeps track of it, so a press needs a push through this card's own face.
        // A card dimmed behind another, or the bar hidden with the café while paused, takes no press.
        const off = busy || panel.dimmed || (this.cafeAway && panel === this.strip.panel);
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
      // The ray: a free hand away from every card in reach points at the menu cards (out of
      // reach, in front) and, away from the café, at the bar.
      const toBar = this.strip.controls !== 'off' && !hold.overCafe(pinch.point, RAY.awayFromCafe);
      const aimed = !busy && !done && !near ? this.aimRay(hand, toBar, !hold.overCafe(pinch.point, RAY.awayFromCafe)) : null;
      this.aim[hand] = aimed ? (aimed.button?.id ?? '') : null;
      // Pointing at nothing yet: the short beam, so the ray can be found (BEAM).
      let idle: Vector3 | null = null;
      if (!aimed && !busy && !done && !near && pinch.gap !== Infinity && !hold.overCafe(pinch.point, RAY.awayFromCafe) && pinch.point.y > this.head.y - BEAM.below) {
        this.castRay(hand);
        if (this.rayDir.y > -BEAM.down) idle = this.rayDir;
      }
      this.rays.update(hand, aimed || idle ? this.rayFrom : null, aimed ? this.rayHit : null, aimed ? this.barNormal : null, delta, idle);
      // What the ray is on, and what it was on before (for a pinch that nudged it: PINCH_NUDGE).
      const now = performance.now();
      const was = this.aimNow[hand];
      const on = aimed?.button ? { panel: aimed.panel, button: aimed.button } : null;
      if ((on?.button.id ?? null) !== (was?.button.id ?? null) || on?.panel !== was?.panel) {
        if (was) this.aimBefore[hand] = { panel: was.panel, button: was.button };
        this.aimNow[hand] = on ? { ...on, since: now } : null;
      }
      const nudged = fresh && this.aimBefore[hand] && now - (this.aimNow[hand]?.since ?? 0) < PINCH_NUDGE.before * 1000 ? this.aimBefore[hand] : null;
      const target = nudged ?? on;
      if (!target) continue;
      if (on) this.hovers[panels.indexOf(on.panel)] = on.button.id;
      if (fresh && now - this.gazePressAt > 250 && (target.panel.open || target === on)) {
        target.panel.press(target.button.id);
        this.click(target.button.id);
      }
    }
    for (let i = 0; i < panels.length; i++) panels[i]?.setHover(this.hovers[i] ?? null);
  }

  private rebuildPanels(): void {
    this.panels = [this.card, this.how, this.coach, this.menu.card, this.menu.sheet, this.strip.panel, this.strip.drawer.panel];
    this.hovers.length = this.panels.length;
    this.hovers.fill(null);
  }

  // ---------------------------------------------------------------- tables

  /**
   * The tables: the ones bought (and the starting ones) open, the next in
   * this game's order a ghost, every other hidden (cafe/ghost-table.ts);
   * and the guests told which seats are off.
   */
  private applyLocks(): void {
    const cafe = this.cafe;
    cafe.setTables(this.shop.tables, this.nextTable() ?? -1);
    cafe.setGhostReady(this.shop.tableAffordable, this.shop.tablePrice);
    this.guests.setLockedTables(cafe.lockedTables, this.hiddenTables());
    this.rebuildPanels();
  }

  /** The tables not open and not the ghost: not drawn, so their seats are not there either. */
  private hiddenTables(): Set<number> {
    const next = this.nextTable();
    return new Set([...this.cafe.lockedTables].filter((t) => t !== next));
  }

  /**
   * The ghost's look follows the bank (faint, or ready with its price tag);
   * and when the bank first reaches the next table's price (once a price:
   * buying one raises it), "TABLE READY" and the price show on the bar for
   * a moment, as a level does: mid-rush nobody looks anywhere else.
   */
  private tendTables(): void {
    this.cafe.setGhostReady(this.shop.tableAffordable, this.shop.tablePrice);
    if (this.phase !== 'run' || !this.cafe.placed || this.cafe.arriving) return;
    const price = this.shop.tablePrice;
    if (!this.shop.tableAffordable || price === this.readyAt || this.nextTable() === null) return;
    this.readyAt = price;
    this.strip.showTableReady(price);
  }

  /**
   * This game's table order (game/table-order.ts): the café's rings by
   * reach, shuffled with the seed kept in its save, so Continue shows the
   * same next table and a new game a new order.
   */
  tableOrder(): number[] {
    const cafe = this.cafe;
    const rings = current.id === 'canada' ? CANADA_TABLE_RINGS : TABLE_RINGS;
    const key = `${current.id}|${this.save.tableSeed}`;
    if (key !== this.orderKey) {
      this.orderKey = key;
      this.order = tableOrder(this.save.tableSeed, rings, (index) => {
        const piece = cafe.pieces[index];
        const x = piece?.position.x ?? 0;
        // Window and gate sides are the Japanese café's (its wishes); the Canadian café's rings are its places.
        const side = current.id === 'canada' ? 'middle' : x < PLACES.windowX ? 'window' : x > PLACES.doorX ? 'gate' : 'middle';
        return { index, kind: piece?.name ?? '', side };
      });
    }
    return this.order;
  }
  private order: number[] = [];
  private orderKey = '';

  /** The table OPEN in the Shop opens next (null: all open). */
  nextTable(): number | null {
    const open = this.shop.tables;
    return this.tableOrder().find((t) => !open.includes(t)) ?? null;
  }

  /**
   * OPEN in the Shop (only when the bank can pay: the drawer's button is
   * pale and refused otherwise): no question, it opens at once. The ghost
   * fades into the real table with a sparkle and the unlock sound, the
   * coins count down on the bar, and the next ghost fades in.
   */
  private openTable(): void {
    const index = this.nextTable();
    if (index === null || !this.shop.buyTable(index)) return;
    this.cafe.revealTable(index);
    this.applyLocks();
    if (this.cafe.tableTop(index, this.at)) this.strip.sparkle(this.cafe.cafe.localToWorld(this.at.clone()));
    this.keep();
    if (this.phase === 'shopping') this.showShop();
    // The first run's lesson is done: back to it, and on to the café.
    if (this.shopFrom === 'tutorial') this.closeShop();
  }

  // ------------------------------------------------------------------ tips

  /**
   * The tips (game/tips.ts): in a run, the first time each new thing turns
   * up, a few words next to it; one at a time, each once a save, gone
   * when done or after its seconds. A hurried guest's clock waits while
   * its tip is up.
   */
  private tendTips(delta: number): void {
    const tip = this.tip;
    tip.panel.update(delta, this.head);
    if (this.tipShown) {
      this.tipAge += delta;
      const done = this.tipDone(this.tipShown);
      const t = TIPS[this.tipShown];
      if (done || this.tipAge >= t.seconds || this.phase !== 'run') {
        if (this.phase === 'run' || done) this.endTip();
        else tip.hide();
        return;
      }
      if (this.phase !== 'run') return;
      // Back in a run after a pause or a level card: the tip that was up shows again.
      if (!tip.panel.open) tip.panel.show(true);
      this.placeTip();
      return;
    }
    if (this.phase !== 'run' || TEST_MODE) return;
    this.tipRest += delta;
    if (this.tipRest < TIP_GAP) return;
    for (const id of TIP_ORDER) {
      if (this.save.tips.includes(id) || !this.tipDue(id)) continue;
      // A note up under the bar: a tip that would stand there waits for it.
      if ((id === 'goal' || id === 'shop') && this.note.panel.open) continue;
      this.startTip(id);
      return;
    }
    // Nothing due: look again in a quarter of a second, not every frame.
    this.tipRest = TIP_GAP - 0.25;
  }

  /** Is this tip's moment here (and is there something to put it next to)? */
  /** The guest the card tip was shown next to (it does not get the "new wish" tip as well). */
  private cardGuest = 0;

  private tipDue(id: TipId): boolean {
    const guests = this.guests.guests;
    switch (id) {
      case 'goal':
        // Level 1, nobody served yet: what the bar's count is for.
        this.tipAt = { bar: true };
        return this.level === 1 && this.levelServed === 0 && this.strip.panel.open;
      case 'hurry': {
        const g = guests.find((x) => x.hurried && x.state === 'queued');
        this.tipAt = g ? { guest: g.id } : {};
        return !!g;
      }
      case 'cold': {
        const g = guests.find((x) => x.cold && x.state === 'queued');
        this.tipAt = g ? { guest: g.id } : {};
        return !!g;
      }
      case 'storm':
        // Not a tip: the storm's note (tendEvents).
        return false;
      case 'card': {
        // The first guest with a wish: read its card.
        const g = guests.find((x) => x.state === 'queued' && x.wishes.length > 0);
        this.tipAt = g ? { guest: g.id } : {};
        return !!g;
      }
      case 'company':
      case 'music':
      case 'kind':
      case 'meet':
      case 'avoid': {
        const kinds = WISH_TIPS[id] ?? [];
        const g = guests.find((x) => x.state === 'queued' && x.wishes.some((w) => kinds.includes(w)));
        this.tipAt = g ? { guest: g.id } : {};
        return !!g;
      }
      case 'newwish': {
        // A guest bringing any other wish type for the first time (a new place, a hat): "A new wish. Read the card."
        const covered = Object.values(WISH_TIPS).flat();
        const g = guests.find((x) => x.state === 'queued' && x.firstWish && x.firstWish !== 'friend' && !covered.includes(x.firstWish) && this.save.tips.includes('card') && x.id !== this.cardGuest);
        this.tipAt = g ? { guest: g.id } : {};
        return !!g;
      }
      case 'pair': {
        const g = guests.find((x) => x.friend && x.state === 'queued' && guests.some((y) => y.id === x.friend && y.state === 'queued'));
        this.tipAt = g ? { guest: g.id } : {};
        return !!g;
      }
      case 'table':
        // Tables are opened in the Shop now; "TABLE READY" on the bar says when (tendTables).
        return false;
      case 'dirty': {
        if (!this.mess.dirtyCount) return false;
        const table = this.mess.dirtyTables()[0];
        this.tipAt = table !== undefined ? { table } : {};
        return table !== undefined;
      }
      case 'shop':
        this.tipAt = { shop: true };
        return this.shop.affordable && this.strip.panel.open;
    }
  }

  /** Has the player done what the tip says? */
  private tipDone(id: TipId): boolean {
    switch (id) {
      case 'goal':
        return this.levelServed > 0;
      case 'table':
        return this.shop.tablesBought > this.tipMark;
      case 'shop':
        return this.shop.purchases > this.tipMark || this.phase === 'shopping';
      case 'storm':
        return true;
      case 'hurry':
      case 'cold':
      case 'pair':
      case 'card':
      case 'company':
      case 'music':
      case 'kind':
      case 'meet':
      case 'avoid':
      case 'newwish': {
        const g = this.guests.guests.find((x) => x.id === this.tipAt.guest);
        // Picked up is enough: the player has it in hand (the card would hang over the hand).
        return !g || g.state === 'seated' || g.state === 'leaving' || g.state === 'held' || g.state === 'hop';
      }
      case 'dirty':
        return this.tipAt.table === undefined || !this.mess.isDirty(this.tipAt.table);
    }
  }

  private startTip(id: TipId): void {
    this.tipShown = id;
    this.tipAge = 0;
    this.tipsShown++;
    if (this.sound) this.sound.tips = this.tipsShown;
    this.save.tips.push(id);
    if (id === 'card') this.cardGuest = this.tipAt.guest ?? 0;
    this.tipMark = id === 'table' ? this.shop.tablesBought : id === 'shop' ? this.shop.purchases : 0;
    const t = TIPS[id];
    this.tip.show(t.title.replace('{n}', `${levelGoal(this.level)}`), t.text, tipIcon(id));
    // Reading the tip costs a hurried guest nothing: its clock is held while the tip is up.
    if ((id === 'hurry' || id === 'cold') && this.tipAt.guest) {
      const g = this.guests.guests.find((x) => x.id === this.tipAt.guest);
      if (g) g.clockHeld = true;
    }
    this.placeTip();
    this.tip.panel.faceNow();
    this.keep();
  }

  private endTip(): void {
    if ((this.tipShown === 'hurry' || this.tipShown === 'cold') && this.tipAt.guest) {
      const g = this.guests.guests.find((x) => x.id === this.tipAt.guest);
      if (g) g.clockHeld = false;
    }
    this.tipShown = null;
    this.tipRest = 0;
    this.tip.hide();
  }

  /** Over what it is about (café space): a guest's head, a table's top, or just below the bar (its Shop button, or its level count). */
  private placeTip(): void {
    const mesh = this.tip.panel.mesh;
    const at = this.tipAt;
    if (at.guest !== undefined) {
      const g = this.guests.guests.find((x) => x.id === at.guest);
      if (!g) return;
      mesh.position.copy(g.actor.root.position);
      mesh.position.y += g.actor.bubbleAnchor.position.y + TIP.above;
    } else if (at.table !== undefined) {
      if (!this.cafe.tableTop(at.table, this.spot)) return;
      // Clear of a padlock tag whatever the café's size (the tag keeps its real size; the café's space scales).
      mesh.position.set(this.spot.x, this.spot.y + (TIP.above + 0.03) / Math.max(0.5, this.cafe.cafe.scale.x), this.spot.z);
    } else if (at.shop || at.bar) {
      const bar = this.strip.panel;
      const b = bar.buttons.find((x) => x.id === (at.shop ? 'bar-shop' : 'bar-pause'));
      if (!b) return;
      // Under the Shop button; or under the level and its count, which follow Pause and a divider (strip-system.ts draws them at
      // 0.15 of the bar's height either side of the divider, in a block 1.35 heights wide).
      const h = bar.height;
      const cx = at.shop ? b.x + b.w / 2 : b.x + b.w + h * 0.3 + h * 1.35 / 2;
      const g = (bar.mesh.geometry as PlaneGeometry).parameters;
      bar.mesh.localToWorld(this.spot.set((cx / bar.width - 0.5) * g.width, -g.height / 2 - TIP.height * 0.7, 0.01));
      this.cafe.cafe.worldToLocal(this.spot);
      mesh.position.copy(this.spot);
    }
  }

  /**
   * What a hand's ray points at: the nearest of the menu cards that take
   * presses (the sheet, How to play, the menu card; not one dimmed behind
   * the sheet) and, with `toBar`, the bar. Null when it meets none; else the
   * card and the button under it (null between buttons). Sets rayFrom (at
   * the hand), rayHit and barNormal (the face it meets, for the cursor).
   */
  private aimRay(hand: Hand, toBar: boolean, awayFromCafe = toBar): { panel: Panel; button: Button | null } | null {
    const m = this.menu;
    const targets = [m.sheet, m.how, m.card].filter((p) => p.open && !p.dimmed);
    if (toBar && this.strip.panel.open && !this.cafeAway) targets.push(this.strip.panel);
    // The first run's coach card stands over the back of the café, beyond a seated reach: its Next and Skip take the
    // ray, from a hand away from the café (a hand reaching for a guest never presses Skip).
    if (this.coach.open && awayFromCafe) targets.push(this.coach);
    // The padlock tags over the locked tables, in a run (pointed at from anywhere: they stand in the café).
    if (this.phase === 'shopping' && this.strip.drawer.panel.open) targets.push(this.strip.drawer.panel);
    if (!targets.length) return null;
    this.castRay(hand);
    let best: { panel: Panel; button: Button | null; t: number } | null = null;
    for (const panel of targets) {
      const hit = this.rayAt(panel);
      if (hit && (!best || hit.t < best.t)) {
        best = { panel, button: hit.button, t: hit.t };
        this.bestHit.copy(this.rayHit);
        this.bestNormal.copy(this.barNormal);
      }
    }
    if (!best) return null;
    this.rayHit.copy(this.bestHit);
    this.barNormal.copy(this.bestNormal);
    return best;
  }
  /** What each hand's ray was on before its current target, and since when it has been on that (ms): PINCH_NUDGE. */
  private readonly aimBefore: Record<Hand, { panel: Panel; button: Button } | null> = { left: null, right: null };
  private readonly aimNow: Record<Hand, { panel: Panel; button: Button; since: number } | null> = { left: null, right: null };
  private readonly bestHit = new Vector3();
  private readonly bestNormal = new Vector3();
  private readonly rayScratch = new Vector3();

  /**
   * A hand's ray: the headset's own pointer for the hand (its target ray,
   * steadied by the system as in its own menus), or, where there is none,
   * a line from the shoulder through the pinch. Sets rayFrom and rayDir.
   */
  private castRay(hand: Hand): void {
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
  }

  /** Where the ray (castRay) meets a card's face, from the front: how far, and the button there; null if it misses. Sets rayHit and barNormal. */
  private rayAt(panel: Panel, edgeShare = RAY.edge): { t: number; button: Button | null } | null {
    const mesh = panel.mesh;
    mesh.getWorldPosition(this.spot);
    mesh.getWorldQuaternion(this.headQ);
    this.barNormal.set(0, 0, 1).applyQuaternion(this.headQ);
    const facing = this.rayDir.dot(this.barNormal);
    // It must come at the card's face from the front.
    if (facing > -0.05) return null;
    const t = this.rayScratch.copy(this.spot).sub(this.rayFrom).dot(this.barNormal) / facing;
    if (t <= 0 || t > RAY.reach) return null;
    this.rayHit.copy(this.rayFrom).addScaledVector(this.rayDir, t);
    const local = mesh.worldToLocal(this.rayScratch.copy(this.rayHit));
    const g = (mesh.geometry as PlaneGeometry).parameters;
    const edge = g.height * edgeShare;
    if (Math.abs(local.x) > g.width / 2 + edge || Math.abs(local.y) > g.height / 2 + edge) return null;
    return { t, button: panel.hit(this.rayHit) };
  }

  /**
   * Look and pinch, the main input on Meta VR Glasses ("eyes and hands are
   * the primary inputs"): a browser with eye tracking gives a pinch as a
   * transient pointer whose ray runs from the eyes to where they look. It
   * presses the menu card or bar button under that ray, as the hand ray
   * does. Quest sends no transient pointers (its hands are tracked
   * pointers), so there nothing changes. A hand-ray press in the same moment
   * is skipped (`gazePressAt`), so one pinch never presses twice.
   */
  private lookAndPinch(e: XRInputSourceEvent): void {
    if (e.inputSource.targetRayMode !== 'transient-pointer') return;
    const space = this.xrManager.getReferenceSpace();
    const pose = space ? e.frame.getPose(e.inputSource.targetRaySpace, space) : null;
    if (!pose) return;
    this.rayMatrix.fromArray(pose.transform.matrix).premultiply(this.player.matrixWorld);
    this.rayFrom.setFromMatrixPosition(this.rayMatrix);
    this.rayDir.set(0, 0, -1).transformDirection(this.rayMatrix);
    const m = this.menu;
    const targets = [m.sheet, m.how, m.card].filter((p) => p.open && !p.dimmed);
    if (this.strip.panel.open && !this.cafeAway && this.strip.controls !== 'off') targets.push(this.strip.panel);
    if (this.coach.open) targets.push(this.coach);
    if (this.phase === 'shopping' && this.strip.drawer.panel.open) targets.push(this.strip.drawer.panel);
    let best: { panel: Panel; button: Button; t: number } | null = null;
    for (const panel of targets) {
      const hit = this.rayAt(panel);
      if (hit?.button && (!best || hit.t < best.t)) best = { panel, button: hit.button, t: hit.t };
    }
    if (!best) return;
    this.gazePressAt = performance.now();
    best.panel.press(best.button.id);
    this.click(best.button.id);
  }
  /** When look and pinch last pressed a button (ms): a hand-ray press in the same moment is the same pinch. */
  private gazePressAt = -Infinity;

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
      case 'play-japan':
      case 'play-canada': {
        // One press plays: the café's save (Continue), its first evening (Start), or the Canadian café's trial.
        const cafeId = id_(id);
        this.startCafe(cafeId, this.book.owns(cafeId) ? 'continue' : 'trial');
        break;
      }
      case 'new-japan':
      case 'new-canada': {
        // A new game asks first, naming the café and what goes.
        this.newFor = id_(id);
        const p = this.book.load(this.newFor);
        this.menu.card.dimmed = true;
        this.menu.openWarn({ cafe: CAFE_NAMES[this.newFor].name, coins: p.bank, staff: 1 + p.hires, level: p.level });
        break;
      }
      case 'buy-canada':
        this.askBuy('title');
        break;
      case 'buy-cafe':
        this.askBuy('shop');
        break;
      case 'buy-cafe-later':
        // Not enough coins yet: the question says how many more.
        this.askBuy('shop');
        break;
      case 'buy-yes':
        this.buyCanada();
        break;
      case 'buy-no':
        if (this.buyFrom === 'shop') this.backToShop();
        else this.closeSheet();
        break;
      case 'leave-yes':
        // Out of the trial: nothing of it is kept.
        this.closeSheet();
        this.endTrial();
        this.toTitle();
        break;
      case 'leave-no':
        this.closeSheet();
        break;
      case 'hire-janitor2':
        this.shop.hireJanitor2();
        if (this.phase === 'shopping') this.showShop();
        break;
      case 'buy-musician':
        this.shop.buyMusician();
        if (this.phase === 'shopping') this.showShop();
        break;
      case 'hire-janitor2-later':
      case 'buy-musician-later':
        this.shop.refused++;
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
      case 'hints':
        // Seat hints (Settings): the seats meeting a carried guest's wishes glow.
        this.save.seatHints = !this.save.seatHints;
        this.guests.seatHints = this.save.seatHints;
        this.persist();
        this.menu.updateSettings(this.settingsState());
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
      case 'how-prev':
        this.menu.howStep(-1);
        break;
      case 'how-next':
        this.menu.howStep(1);
        break;
      case 'how-done':
      case 'back':
        // Closing How to play (its close button, or DONE on the last step): back where it was opened from.
        if (this.rulesFrom === 'paused') {
          this.how.show(false);
          this.phase = 'paused';
          this.showPauseCard();
        } else this.toTitle();
        break;
      case 'menu':
        if (this.trial) this.askLeave();
        else this.toTitle();
        break;
      case 'how':
        // From the pause card, Settings or the wrist menu: pause first (in a run), then How to play; Got it comes back.
        this.closeSheet();
        this.pause();
        if (this.phase === 'paused' || this.phase === 'title') this.toRules();
        break;
      case 'bar-pause':
        // The bar's Pause: pauses a run (the shop drawer, if down, closes first); while paused (the card up) it carries
        // on, as RESUME does.
        this.closeShop();
        if (this.phase === 'run') this.pause();
        else if (this.phase === 'paused') this.resume();
        break;
      case 'bar-shop':
        this.openShop();
        break;
      case 'shop-close':
        this.closeShop();
        break;
      case 'open-table':
        this.openTable();
        break;
      case 'hire-janitor-later':
      case 'hire-later':
      case 'open-table-later':
        // Not yet: the bank cannot pay, or another comes first. The shop says no.
        this.shop.refused++;
        break;
      case 'again':
        // TRY AGAIN: the level from its start.
        this.toRun(true);
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
          this.persist();
        } else this.finishTutorial();
        break;
      case 'pause':
        this.pause();
        break;
      case 'resume':
        this.resume();
        break;
      case 'end':
        // MAIN MENU from the pause card: the level is saved as it stands; CONTINUE carries it on.
        if (this.phase === 'paused' && this.trial) this.askLeave();
        else if (this.phase === 'paused') {
          this.keep();
          this.toTitle();
        }
        break;
      case 'hire-janitor':
        this.shop.hireJanitor();
        if (this.phase === 'shopping') this.showShop();
        break;
      case 'hire':
        this.shop.hire();
        // In the shop: show the new staff and bank.
        if (this.phase === 'shopping') this.showShop();
        break;
    }
  }
}

/** The café a button is about, from its id ('play-canada' and so on). */
function id_(button: string): CafeId {
  return button.endsWith('canada') ? 'canada' : 'japan';
}

/**
 * The first run's steps, each done rather than read: pick up the guest,
 * seat it, watch its tea come, then open a table with the hand ray (the
 * first thing the ray is needed for: pointing is learned by doing it, for
 * a reward, as the playtest asked; the house tops up the coins if the
 * first guest paid too little). Open! skips on. Then the café opens.
 * Pause and the Shop are not taught here: the ray learned on a padlock
 * finds the bar's buttons (the short beam shows a raised hand pointing),
 * and the "More hands" tip points at the Shop the moment it matters.
 */
function firstRun(): Step[] {
  return [
    { picture: 0, title: MOVES[0].title, text: 'Put your fingers above the guest at the gate. When the guest glows, pinch.', done: (g) => g.guests.pickedUp > g.mark.pickedUp },
    { picture: 1, title: MOVES[1].title, text: MOVES[1].text, done: (g) => g.guests.seated > g.mark.seated },
    { picture: 2, title: 'The guest gets tea', text: 'Guests pay when they get their tea. The bar above the café shows how happy the guests are.', next: true, done: (g) => g.baristas.servedCount > g.mark.served },
    { picture: 3, lesson: true, title: 'Open a table', text: 'Your first coins! Point your hand at Shop on the bar and pinch, then OPEN a table.', next: true, done: (g) => g.shop.tablesBought > g.mark.tables },
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
