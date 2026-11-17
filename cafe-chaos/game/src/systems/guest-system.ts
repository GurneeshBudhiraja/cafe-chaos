/**
 * GuestSystem: the guests who come to the café.
 *
 * - Arrivals: once the café is placed, guests appear out along the table
 *   to the right, one every few seconds (slower as the café fills, never
 *   more than MAX_GUESTS on stage), each a random species, colour and
 *   outfit. They fade in as they walk up to the back of the line.
 * - The line: single file outside the door, its head on the deck. When
 *   someone leaves the line, everyone behind steps up a place.
 * - Waiting: each guest in the line has its own patience, shown by a
 *   little dial over its head (guests/patience-dial.ts). Past the
 *   halfway mark it shows in the guest too (foot tapping, side-eye);
 *   when it runs out the guest gives up.
 * - In the hand a guest from the line is still waiting: its dial keeps
 *   running, and if its patience runs out there it fades away from the
 *   hand.
 * - Picking up: a pinch closing on a guest lifts it. It hangs from the
 *   fingers, kicking, turned to face the player, with one steady face
 *   at a time (guests/expressions.ts): surprised for a second, then
 *   looking at the seat below it, calm, uneasy or worried as its dial
 *   runs down; held right up to the player's face, puzzled, its head on
 *   one side. The seat it would land on glows violet
 *   (guests/seat-glow.ts); letting go over that seat sits it down,
 *   letting go anywhere else sends it back where it came from.
 * - Watching: a guest on its feet or in a seat follows a hand that comes
 *   close with wide eyes, so it is plain they can be picked up.
 * - Sitting: happy at first, then waiting for its order (the servers
 *   bring it: systems/barista-system.ts), eating once served, then idle; after a minute it
 *   hops off its chair and leaves.
 * - Giving up: a guest whose patience runs out turns round and walks
 *   back the way it came, beside the line, and fades out.
 * - Leaving: a guest who has eaten walks out through the exit in the
 *   room's left wall (under the 出口 sign) and down the walkout path,
 *   fading out at the plate's edge; once the annex is open, on through
 *   the annex and out of its own exit. Nobody is told the way: each
 *   finds it on the navigation grid (nav/nav-grid.ts), which is read
 *   from the café's geometry.
 *
 * Guests are children of the café group, so they move, turn and scale
 * with it.
 */

import { createSystem, Vector3, type Sprite } from '@iwsdk/core';
import { castLoaded, GuestActor, WALK_CLIP_SPEED, type Face } from '../guests/actor.js';
import { Blobs } from '../guests/blobs.js';
import { randomLook, type Look } from '../guests/cast.js';
import { HeldAct, watchingFace, type Held } from '../guests/expressions.js';
import { ANNEX_EXIT_LANES, ANNEX_OUTSIDE_X, ARRIVAL_FROM, ARRIVAL_POINT, arrivalPoint, EXIT_LANES, OUTSIDE_X, pathBack, QUEUE_SPOTS, QUEUE_YAW } from '../guests/paths.js';
import {
  CARRY_FOLLOW, CLAIM_RADII, FADE_IN_M, FADE_OUT_M, FIRST_SPAWN_SECONDS, PAIR_FOLLOW_SECONDS, FOLLOW_GAP_M, GRIP_HEIGHT_M, HAPPY_SECONDS, HOP, IDLE_LAST_SECONDS, IMPATIENT_AFTER, LEAN_FOLLOW, MAX_GUESTS, MAX_QUEUE,
  PATIENCE_SECONDS, PATIENCE_SPREAD, DROP_MARGIN_M, AIM_SNAP_M, HOVER_EXIT_RADII, HOVER_SWITCH, PICK_MEMORY_S, PICK_RADIUS_M, SIGHT, PICK_RADIUS_WORLD_MIN_M, PICK_STICKY_RADII, PICK_WINDOW_S, RELEASE_HOLD_S, SEAT_REACH_M, SEATED_SECONDS, FUME_SECONDS, SERVICE_TOPUP_SECONDS, SERVICE_MAX_SECONDS, EAT_SECONDS, SPAWN_SECONDS, SPAWN_STRETCH, SPEED, TURN_SPEED, VANISH_SECONDS, WATCH_RADIUS_M,
  EYE_HEIGHT_M,
} from '../guests/rules.js';
import { PickRings } from '../guests/pick-ring.js';
import { grants, pickName, pickWishes, tablesOf, type Sitter, type WishId, openWishes, type Friendship } from '../guests/wishes.js';
import { payFor, wishCount } from '../game/rules.js';
import { BUBBLE, feelingFor, Reactions, type Reacting } from '../guests/reactions.js';
import { WishCards } from '../ui/wish-card.js';
import { Popups } from '../guests/popups.js';
import { SeatGlow } from '../guests/seat-glow.js';
import { DIAL, PatienceDial } from '../guests/patience-dial.js';
import { collectSeats, LANDING_REACH_M, seatUnder, type Seat } from '../guests/seats.js';
import { Walk, yawDelta } from '../guests/walker.js';
import { CafeSystem } from './cafe-system.js';
import { HandleSystem } from './handle-system.js';
import { HANDS, type Hand } from '../lib/hand-pinch.js';
import { HoldSystem } from './hold-system.js';

/**
 * arriving: walking up to the line. queued: in the line. held: in the
 * player's fingers. hop: in the air between two places (onto a seat,
 * back to the line, off a seat). seated. leaving: on the way out.
 * vanishing: its patience ran out in the player's hand, and it is
 * fading away there.
 */
export type GuestState = 'arriving' | 'queued' | 'held' | 'hop' | 'seated' | 'leaving' | 'vanishing';

/** A short jump from one place to another, and what happens on landing. */
interface Hop {
  from: Vector3;
  to: Vector3;
  yawFrom: number;
  yawTo: number;
  t: number;
  seconds: number;
  height: number;
  then: () => void;
}

export interface Guest {
  id: number;
  actor: GuestActor;
  state: GuestState;
  /** The walk under way (null while standing), and its speed (m/s). */
  walk: Walk | null;
  speed: number;
  /** The spot in the line it is standing at or walking to (-1: not in the line). */
  spot: number;
  /** The way it faces, and the way it should (yaw about +Y, café space). */
  yaw: number;
  targetYaw: number;
  /** Seconds of patience left in the line, and what it started with; and the dial over its head that shows it. */
  patience: number;
  patienceFull: number;
  dial: PatienceDial;
  /** Leaving by the exit: 'exit', and which spot across the path it is making for (null and -1 for one walking back from the line). */
  side: 'exit' | null;
  lane: number;
  /** How lit up it is (0 to 1): up while a free hand is close enough that a pinch would pick it up. */
  highlight: number;
  /** The ground under it (café space), for its blob. */
  ground: number;
  /** Held: the hand carrying it, where it was taken from, and the seat it would land on now. */
  hand: Hand | null;
  home: { line: number } | { seat: Seat } | null;
  target: Seat | null;
  /** Seated: its seat, and for how long (seconds). */
  seat: Seat | null;
  seatedFor: number;
  /** True once a server has brought its order (it eats from then on). */
  served: boolean;
  /** Seconds it has been eating. */
  eaten: number;
  /** How much of its patience it had used when it was seated (0 quick to 1 at the last moment); -1 until seated. */
  seatShare: number;
  /** Seconds it has been fuming at the table, its patience gone before its food came (-1: not fuming). */
  fuming: number;
  /** The vein mark over its head while it fumes. */
  anger: Sprite | null;
  /** In a hurry (game/rules.ts HURRY): a shorter wait, served first, pays more; an hourglass on its dot. */
  hurried: boolean;
  /** The friend it came with (a pair: each wishes to share a table with the other); 0 if none. */
  friend: number;
  /** Its own name; what it wishes for (1 to 3 wishes); and whether it sings while it sits. */
  name: string;
  wishes: WishId[];
  sings: boolean;
  /** Each wish met (true) or not (false), judged once as it sat down (its seat is final); null before it sits. */
  wishMet: boolean[] | null;
  /** Vanishing: how long it has been fading (seconds). */
  vanishing: number;
  hop: Hop | null;
  /** Held: its performance; and the lean of its body (radians), eased. */
  act: HeldAct | null;
  roll: number;
  pitch: number;
  /** True while it is watching a hand (its face is set by hand). */
  watching: boolean;
}

/** The face of a guest losing its temper at the table. */
const ANGRY_FACE: Face = { eyes: 'EyesCross', mouth: 'MouthFrown', lookX: 0, lookY: 0 };

/** A step down or up of more than this is hopped, not walked (metres). */
const HOP_STEP_M = 0.01;
const HOP_HEIGHT_M = 0.014;

/** Was this guest taken from the line (and so is still waiting to be seated)? */
/** Seats that may be added after the start (the annex has ten), for the seat dots' room. */
const SEAT_HEADROOM = 24;
const fromLine = (guest: Guest): boolean => !!guest.home && 'line' in guest.home;

/**
 * How a visit ended, for the score (systems/score-system.ts). `paid`: it
 * ate and left; `gaveUp`: its patience ran out before it was seated;
 * `stormedOff`: it ran out at the table, before its food came. `share` is
 * how much of its patience it had used when seated (-1 if never seated);
 * `at` is over its head, in café space.
 */
export interface Outcome {
  kind: 'paid' | 'gaveUp' | 'stormedOff';
  guest: number;
  share: number;
  at: Vector3;
  /** Its wishes as it left: how many were met, of how many (`of` 0 if it never sat). */
  wishes: { met: number; of: number };
  /** It was in a hurry (it pays more). */
  hurried: boolean;
}

export class GuestSystem extends createSystem({}) {
  /** Everyone on stage. */
  readonly guests: Guest[] = [];
  /** The line, front to back (those walking up to it included). */
  readonly line: Guest[] = [];
  /** Tunables (the checks and recordings shorten them). */
  patienceSeconds = PATIENCE_SECONDS;
  seatedSeconds = SEATED_SECONDS;
  spawnSeconds: [number, number] = [...SPAWN_SECONDS];
  /** In the game a guest gets down once it has eaten for this long, whatever `seatedSeconds` says, so quick service frees the table sooner (game/rules.ts MEAL_SECONDS). */
  mealSeconds = Infinity;
  /** Where the last newcomer appeared (café space), and how much further out than the usual spot that was (metres): the real table's edge. */
  readonly arrival = ARRIVAL_POINT.clone();
  fromEdge = 0;
  /** The level: the higher, the more wishes a new guest may have (game/rules.ts LEVEL). The game sets it. */
  level = 1;
  /** How many may stand in the line (the game sets it by level). */
  queueCap = MAX_QUEUE;
  /** The share of new guests in a hurry, and of arrivals that are pairs (the game sets them by level). */
  hurryChance = 0;
  pairChance = 0;
  /** A hurried guest's patience in the line as a share of the others', its floor, and its seconds for its food (the game sets them). */
  hurry = { line: 1, lineMin: 0, seated: 0 };
  /** How much the gap between arrivals grows as the café fills (the game, which sets the gaps itself, turns it off with 1). */
  spawnStretch = SPAWN_STRETCH;
  /**
   * Seconds a guest waits for its food once seated: a fresh amount, whatever
   * it had left in the line (the game sets it). Null: the old top-up
   * (SERVICE_TOPUP_SECONDS), for the checks that run without the game.
   */
  seatedPatience: number | null = null;
  /** The share of new guests who sing (the game sets it). */
  singerChance = 0;
  /** The cards beside the hands: who the lit or carried guest is and what it wants. */
  cards!: WishCards;
  /** Which table each seat is at (guests/wishes.ts), the quiet corner's, and who is seated now. */
  private tables = new Map<number, number>();
  private quietCorner = -1;
  private readonly sitters: Sitter[] = [];
  private readonly granting = new Set<Seat>();
  private lastWishes: WishId[] = [];
  private readonly cardAt = new Vector3();
  private readonly headLocal = new Vector3();
  /** Pinch what you see (guests/rules.ts SIGHT). Off: only a pinch right at a guest, or a guest held right over a seat, counts. */
  sight = true;
  /** True while the game is paused: hands take and move nothing. */
  handsOff = false;
  /** The gaps between arrivals are this many times longer (the game paces arrivals to the staff: game/rules.ts ARRIVAL_PACE). */
  spawnPace = 1;
  /** Set false to stop new arrivals. */
  arrivals = true;
  /** Set true to hold every guest's patience where it is (the walkthrough). */
  patienceFrozen = false;
  /** Told how each visit ends (the score listens). */
  readonly outcomes: ((outcome: Outcome) => void)[] = [];
  /** Thumbs, coins and vein marks over the guests' heads. */
  readonly popups = new Popups();
  /** Guests who stormed out of their seats before their food came (for the checks). */
  stormedOff = 0;
  /** The seats guests can use, and the glow that marks where a carried guest would land. */
  seats: Seat[] = [];
  glow!: SeatGlow;
  /** Counts, for the checks. */
  arrived = 0;
  gaveUp = 0;
  left = 0;
  seated = 0;
  pickedUp = 0;
  hoppedOff = 0;
  /** The most guests ever on stage at once. */
  peak = 0;
  private cafeSystem!: CafeSystem;
  private placement = -1;
  private nextSpawnIn = FIRST_SPAWN_SECONDS;
  private lastLook: Look | undefined;
  /** The exit's spots across the path are dealt in turn. */
  private nextLane = 0;
  private holdSystem: HoldSystem | undefined;
  private handles: HandleSystem | undefined;
  private readonly pinched: Record<Hand, boolean> = { left: false, right: false };
  /** How long each hand's pinch has been closed (seconds); Infinity while it is open. */
  private readonly closedFor: Record<Hand, number> = { left: Infinity, right: Infinity };
  /** How long each hand's pinch has been open (seconds): a carried guest is let go only after RELEASE_HOLD_S. */
  private readonly openFor: Record<Hand, number> = { left: Infinity, right: Infinity };
  /** The guest each hand last lit up while open, and how long ago (PICK_MEMORY_S). */
  private readonly lastLit: Record<Hand, { guest: Guest | null; age: number }> = { left: { guest: null, age: Infinity }, right: { guest: null, age: Infinity } };
  /** The player's eyes this frame (world): the head's position. */
  private readonly eye = new Vector3();
  private readonly feet = new Vector3();
  private readonly crown = new Vector3();
  private readonly blobs = new Blobs(MAX_GUESTS + 2);
  private readonly at = new Vector3();
  private readonly head = new Vector3();
  private readonly targets: (Seat | null)[] = [null, null];
  private readonly watchFace: Face = { eyes: 'EyesWide', mouth: 'MouthO', lookX: 0, lookY: 0 };
  /** The ring round the guest each hand would pick up now, and that guest (null: none). */
  readonly rings = new PickRings();
  readonly hovered: (Guest | null)[] = [null, null];
  /** How many seat anchors the café had when the seats were last taken in, and the furniture count then. */
  private seatAnchors = 0;
  private furniture = 0;
  private firstSeatCount = 0;
  /** What a held guest is told each frame (reused). */
  private readonly held: Held = { distance: 1, patience: 1, lookX: 0, lookY: -1 };

  init(): void {
    this.cafeSystem = this.world.getSystem(CafeSystem)!;
    this.holdSystem = this.world.getSystem(HoldSystem);
    this.handles = this.world.getSystem(HandleSystem);
    const cafe = this.cafeSystem.cafe;
    cafe.add(this.blobs.mesh);
    cafe.add(this.rings.group);
    this.cards = new WishCards(cafe);
    cafe.add(this.popups.group);
    cafe.add(this.reactions.mesh);
    this.seats = collectSeats(cafe, this.cafeSystem.seats, this.cafeSystem.nav, this.cafeSystem.pieces);
    this.seatAnchors = this.cafeSystem.seats.length;
    this.firstSeatCount = this.seats.length;
    this.furniture = this.cafeSystem.furniture;
    // Room for the dots of seats that come later (the annex's).
    this.glow = new SeatGlow(cafe, this.seats.length + SEAT_HEADROOM);
    // A pinch on or just around a guest is the guests' business, never the café's.
    this.holdSystem?.claims.push((point) => this.nearestGuest(point, CLAIM_RADII) !== null);
  }

  update(frameDelta: number): void {
    this.frame++;
    const cafe = this.cafeSystem;
    const delta = Math.min(1, frameDelta) * cafe.timeScale;
    // New furniture (the annex's) is taken in whether or not the café is down yet.
    if (cafe.furniture !== this.furniture) this.takeInSeats();
    if (!cafe.placed || cafe.placements !== this.placement) {
      // No café, or it has just been put down afresh: everyone out, and the line starts again.
      if (this.guests.length) this.clear();
      this.placement = cafe.placed ? cafe.placements : -1;
      this.nextSpawnIn = FIRST_SPAWN_SECONDS;
      if (!cafe.placed) return;
    }
    if (cafe.arriving) return;
    this.spawnTick(delta);
    this.hands(delta);
    this.keepLine();
    this.seatedNow();
    this.blobs.begin();
    for (const guest of [...this.guests]) {
      if (guest.state === 'queued') this.wait(guest, delta);
      if (guest.state === 'held') this.waitInHand(guest, delta);
      if (guest.state === 'vanishing') this.vanish(guest, delta);
      if (guest.state === 'seated') this.sitting(guest, delta);
      if (guest.state === 'queued' || guest.state === 'seated') this.watch(guest);
      if (guest.state === 'hop') this.hopping(guest, delta);
      else if (guest.state !== 'held' && guest.state !== 'vanishing') this.step(guest, delta);
      this.show(guest, delta);
    }
    this.blobs.end();
    this.popups.update(delta);
    for (let i = 0; i < 2; i++) this.rings.show(i, this.hovered[i]?.actor.root.position ?? null, delta);
    // The dot at the fingertips turns mint while a guest is lit under that hand.
    if (this.holdSystem) HANDS.forEach((hand, i) => (this.holdSystem!.cursor.aiming[hand] = this.hovered[i] !== null));
    this.wishesShown(frameDelta);
    // After the wishes: the head is this frame's, so the bubbles turn to where the eyes are now.
    this.react(delta);
    this.glow.show(this.seats, this.targets, this.targets.some((t, i) => t !== null || this.carriedBy(HANDS[i]) !== undefined), delta, this.granting);
    this.peak = Math.max(this.peak, this.guests.length);
  }

  // ----------------------------------------------------------------- wishes

  /** Who is seated this frame, for judging wishes; and which table each seat is at (worked out when the seats change). */
  private seatedNow(): void {
    if (this.tables.size !== this.seats.length) {
      const pieces = this.cafeSystem.pieces;
      this.tables = tablesOf(this.seats, pieces);
      this.quietCorner = pieces.findIndex((piece) => /quiet/i.test(piece.name));
    }
    this.collectSitters();
  }

  /** Would this seat meet each of this guest's wishes, as things stand? */
  grantsEach(guest: Guest, seat: Seat): boolean[] {
    let friendship: Friendship | null = null;
    if (guest.friend) {
      const friend = this.guests.find((g) => g.id === guest.friend);
      const waiting = !!friend && (friend.state === 'arriving' || friend.state === 'queued' || friend.state === 'held' || (friend.state === 'hop' && !friend.seat));
      friendship = { friend: guest.friend, free: this.freeSeats(), waiting };
    }
    return guest.wishes.map((wish) => grants(wish, seat, guest.id, this.sitters, this.tables, this.quietCorner, friendship));
  }

  /** Would this seat meet every one of this guest's wishes? */
  wouldGrant(guest: Guest, seat: Seat): boolean {
    return this.grantsEach(guest, seat).every(Boolean);
  }

  /**
   * A guest has just sat down: its wishes are judged now, once (it cannot
   * be moved after this), and the result pops up over its head.
   */
  private judge(guest: Guest): void {
    const seat = guest.seat;
    if (!seat || guest.wishes.length === 0) return;
    // Judged with itself among the sitters, so its friend, seated already, is judged against it too.
    this.collectSitters();
    guest.wishMet = this.grantsEach(guest, seat);
    this.judgeFriend(guest);
    const over = this.at.copy(guest.actor.root.position);
    over.y += guest.actor.bubbleAnchor.position.y + DIAL.above + 0.02;
    this.popups.result(guest.wishMet.filter(Boolean).length, guest.wishes.length, over.clone());
    this.wishesJudged++;
  }

  /** A singer sends up a note now and then while it sits. */
  private sing(guest: Guest, delta: number): void {
    // Once served its bubble shows the notes (guests/reactions.ts): no floating ones over it then.
    if (!guest.sings || (guest.served && guest.eaten < BUBBLE.servedFor + BUBBLE.moodFor) || Math.floor(guest.seatedFor / 1.6) === Math.floor((guest.seatedFor - delta) / 1.6)) return;
    const over = this.at.copy(guest.actor.root.position);
    over.y += guest.actor.bubbleAnchor.position.y + DIAL.above + 0.02;
    over.x += (Math.random() - 0.5) * 0.02;
    this.popups.show('note', over.clone());
  }
  /** Wishes judged so far, granted or not (for the checks). */
  wishesJudged = 0;

  /**
   * The request cards beside the hands (the guest lit under each hand, or
   * carried by it: its wishes and its patience; carried over a seat, which
   * wishes that seat meets), and the seats that would meet every wish of a
   * carried guest, for the seat glow.
   */
  private wishesShown(delta: number): void {
    const cafe = this.cafeSystem.cafe;
    const scale = cafe.scale.x || 1;
    this.granting.clear();
    this.headLocal.copy(this.eye);
    cafe.worldToLocal(this.headLocal);
    HANDS.forEach((hand, i) => {
      const carried = this.carriedBy(hand) ?? null;
      const guest = this.handsOff ? null : (carried ?? this.hovered[i]);
      let at: Vector3 | null = null;
      if (guest) {
        at = this.cardAt.copy(guest.actor.root.position);
        at.y += guest.actor.bubbleAnchor.position.y;
      }
      const preview = carried && carried.target && !carried.target.dirty ? this.grantsEach(carried, carried.target) : null;
      this.cards.update(
        i,
        guest ? { id: guest.id, name: guest.name, wishes: guest.wishes, sings: guest.sings, hurried: guest.hurried, friend: this.guests.find((g) => g.id === guest.friend)?.name ?? null, left: guest.patience / guest.patienceFull, seconds: guest.patience, preview } : null,
        at,
        this.eye,
        this.headLocal,
        scale,
        Math.min(0.1, delta),
      );
      if (carried) for (const seat of this.seats) if (seat.occupant === 0 && !seat.locked && !seat.dirty && this.wouldGrant(carried, seat)) this.granting.add(seat);
    });
  }

  /** New furniture (the annex's): its seats join the others, numbered on from them; the seats already in use are untouched. */
  private takeInSeats(): void {
    const cafe = this.cafeSystem;
    this.furniture = cafe.furniture;
    const fresh = collectSeats(cafe.cafe, cafe.seats.slice(this.seatAnchors), cafe.nav, cafe.pieces);
    this.seatAnchors = cafe.seats.length;
    for (const seat of fresh.slice(0, SEAT_HEADROOM - (this.seats.length - this.firstSeatCount))) {
      seat.index = this.seats.length;
      seat.locked = this.lockedTables.has(seat.table);
      this.seats.push(seat);
    }
    if (this.wishPool) this.wishPool = openWishes(this.seats.filter((x) => !x.locked), this.quietCorner);
  }

  /**
   * Which tables are locked (indices into the café's pieces): their seats
   * are offered to nobody, and no new guest wishes for a place only a
   * locked seat could give it. The game sets it (and again after a
   * purchase, and after the extension's tables come).
   */
  setLockedTables(locked: ReadonlySet<number>): void {
    this.lockedTables = locked;
    for (const seat of this.seats) seat.locked = locked.has(seat.table);
    this.wishPool = openWishes(this.seats.filter((s) => !s.locked), this.quietCorner);
  }
  private lockedTables: ReadonlySet<number> = new Set();
  /** The wishes an open seat can meet (all of them until the game says which tables are locked). */
  private wishPool: WishId[] | null = null;

  /** Guests let go over a dirty table and sent back to the line (for the checks). */
  refusedDirty = 0;

  /** True while a hand is carrying a guest. */
  get carrying(): boolean {
    return this.guests.some((g) => g.state === 'held');
  }

  /** Take every guest away (a new session, or the café placed afresh). */
  clear(): void {
    this.reactions.clear();
    for (const guest of this.guests) {
      guest.dial.dispose();
      guest.actor.dispose();
    }
    this.guests.length = 0;
    this.line.length = 0;
    this.popups.clear();
    for (const seat of this.seats) seat.occupant = 0;
    this.targets.fill(null);
    this.blobs.begin();
    this.blobs.end();
  }

  // ------------------------------------------------------------- arrivals

  private spawnTick(delta: number): void {
    this.nextSpawnIn -= delta;
    if (this.nextSpawnIn > 0) return;
    // A guest lifted out of the line keeps its place: it may be put back.
    const awayFromLine = this.guests.filter((g) => (g.state === 'held' || g.state === 'hop') && fromLine(g)).length;
    if (!this.arrivals || this.guests.length >= MAX_GUESTS || this.line.length + awayFromLine >= this.queueCap) {
      // No room just now: look again shortly.
      this.nextSpawnIn = 0.5;
      return;
    }
    const look = randomLook(Math.random, this.lastLook);
    // The guest models load in the background: if this one is not in yet, try again shortly.
    if (!castLoaded(look)) {
      this.nextSpawnIn = 0.5;
      return;
    }
    // A friend following one just arrived (a pair): it comes now, a moment behind, and they are paired.
    const leader = this.pendingFriend ? this.guests.find((g) => g.id === this.pendingFriend) : undefined;
    this.pendingFriend = 0;
    const first = this.spawn(look);
    if (leader && leader.state !== 'leaving' && leader.state !== 'vanishing') {
      this.pair(leader, first);
      this.nextSpawnIn = this.lastGap;
      return;
    }
    // Now and then two friends come together (if the line has room for both): each wishes to share a table with
    // the other. The second walks up a moment behind the first, so the two are never in one place at once.
    const forced = this.forcePair;
    if ((forced || Math.random() < this.pairChance) && this.line.length + awayFromLine < this.queueCap && this.guests.length < MAX_GUESTS) {
      this.forcePair = false;
      this.pendingFriend = first.id;
      first.hurried = false;
      first.patience = first.patienceFull = this.patienceSeconds;
    }
    // The fuller the café, the longer until the next one.
    const [min, max] = this.spawnSeconds;
    const fullness = this.guests.length / MAX_GUESTS;
    this.nextSpawnIn = (min + Math.random() * (max - min)) * (1 + (this.spawnStretch - 1) * fullness) * this.spawnPace;
    if (this.pendingFriend) {
      this.lastGap = this.nextSpawnIn;
      this.nextSpawnIn = PAIR_FOLLOW_SECONDS;
    }
  }

  /** Bring a new guest on at the arrival point and send it to the back of the line. */
  spawn(look: Look = randomLook(Math.random, this.lastLook)): Guest {
    this.lastLook = look;
    const actor = new GuestActor(look);
    actor.root.name = `Guest-${++this.arrived}`;
    // On a real table it comes from the table's real edge (CafeSystem.tableRun); else from the usual spot.
    this.arrival.copy(arrivalPoint(this.cafeSystem.tableRun(ARRIVAL_FROM.x, ARRIVAL_FROM.z, 1)));
    this.fromEdge = this.arrival.x - ARRIVAL_POINT.x;
    actor.root.position.copy(this.arrival);
    actor.setOpacity(0);
    this.cafeSystem.cafe.add(actor.root);
    // In a hurry (now and then, by level): a shorter wait in the line.
    if (this.forceHurryIn > 0) this.forceHurryIn--;
    const hurried = this.forceHurryIn === 0 && this.forcedHurry ? ((this.forcedHurry = false), true) : Math.random() < this.hurryChance;
    const usual = this.patienceSeconds * (1 + (Math.random() * 2 - 1) * PATIENCE_SPREAD);
    const patience = hurried ? Math.max(this.hurry.lineMin, usual * this.hurry.line) : usual;
    const dial = new PatienceDial();
    dial.sprite.position.set(0, actor.bubbleAnchor.position.y + DIAL.above, 0);
    actor.root.add(dial.sprite);
    // Its name, its wishes, and perhaps a song.
    const taken = new Set(this.guests.map((g) => g.name));
    const singerAbout = this.guests.some((g) => g.sings);
    const sings = !singerAbout && Math.random() < this.singerChance;
    // 1 to 3 wishes, more as the evening goes on; a singer wants company (an audience).
    const wishes: WishId[] = sings ? ['company'] : pickWishes(wishCount(this.level), singerAbout, this.lastWishes, Math.random, this.wishPool ?? undefined);
    this.lastWishes = wishes;
    const guest: Guest = {
      id: this.arrived,
      actor,
      state: 'arriving',
      walk: null,
      speed: SPEED.arrive,
      spot: -1,
      yaw: -Math.PI / 2,
      targetYaw: -Math.PI / 2,
      patience,
      patienceFull: patience,
      dial,
      side: null,
      lane: -1,
      highlight: 0,
      ground: ARRIVAL_POINT.y,
      hand: null,
      home: null,
      target: null,
      seat: null,
      seatedFor: 0,
      served: false,
      eaten: 0,
      seatShare: -1,
      fuming: -1,
      anger: null,
      hurried,
      friend: 0,
      name: pickName(taken),
      wishes,
      sings,
      wishMet: null,
      vanishing: 0,
      hop: null,
      act: null,
      roll: 0,
      pitch: 0,
      watching: false,
    };
    actor.root.rotation.y = guest.yaw;
    this.guests.push(guest);
    this.line.push(guest);
    return guest;
  }

  /**
   * Make two new guests a pair: friends, neither in a hurry, each with the
   * `friend` wish and up to two more (none that clash with sharing a
   * table), and the same patience, so they wait together.
   */
  pair(a: Guest, b: Guest): void {
    a.friend = b.id;
    b.friend = a.id;
    // One draw for the pair: the friend wish, and the same other wishes for both (a place, so one table can meet
    // both; never alone, company or quiet, which clash with sharing a table).
    const count = wishCount(this.level);
    const pool = (this.wishPool ?? ['window', 'door', 'counter']).filter((w) => w === 'window' || w === 'door' || w === 'counter');
    const others = count > 1 && pool.length > 0 ? [pool[Math.floor(Math.random() * pool.length)]] : [];
    for (const g of [a, b]) {
      g.hurried = false;
      g.sings = false;
      g.wishes = ['friend', ...others];
    }
    this.lastWishes = a.wishes;
    // Their own usual wait (not a hurried one), the same for both.
    b.patience = b.patienceFull = a.patienceFull = a.patience = this.patienceSeconds;
  }
  /** A pair's first guest, whose friend arrives next (0: none waiting); and the gap that friend's arrival put off. */
  private pendingFriend = 0;
  private lastGap = 0;
  /** The game's cues: the next arrival is a pair, and in this many arrivals one is in a hurry (0: not forced). */
  forcePair = false;
  forceHurryIn = 0;
  /** Set with `forceHurryIn`: a forced hurried guest is still to come. */
  forcedHurry = false;

  /** Make the `n`-th arrival from now one in a hurry (the first the player meets comes on cue, not by chance). */
  hurryIn(n: number): void {
    this.forceHurryIn = Math.max(1, n);
    this.forcedHurry = true;
  }

  // ---------------------------------------------------------------- the line

  /** Everyone in the line walks to the spot that matches their place in it. */
  private keepLine(): void {
    this.line.forEach((guest, index) => {
      // One in the air on its way back to the line lands first, then steps to its place if that has changed.
      if (guest.spot === index || guest.state === 'hop') return;
      guest.spot = index;
      guest.walk = new Walk([guest.actor.root.position, QUEUE_SPOTS[index]]);
      // One coming all the way from the table's edge steps out, so the walk is not a long wait.
      guest.speed = guest.state === 'arriving' ? (this.fromEdge > 0.1 ? SPEED.march : SPEED.arrive) : SPEED.shuffle;
    });
  }

  /** A guest standing in the line: its patience runs down, shows, and runs out. */
  private wait(guest: Guest, delta: number): void {
    if (!this.patienceFrozen) guest.patience -= delta;
    if (guest.patience <= 0) {
      this.gaveUp++;
      this.tell('gaveUp', guest);
      this.leaveFromLine(guest);
      return;
    }
    if (guest.walk) return;
    const impatient = guest.patience < guest.patienceFull * (1 - IMPATIENT_AFTER);
    guest.actor.play(impatient ? 'Impatient' : 'Idle');
  }

  /**
   * A guest picked up out of the line is still waiting: its patience
   * keeps running down in the player's hand (its dial still showing), and
   * if it runs out there, the guest fades away from the hand.
   */
  private waitInHand(guest: Guest, delta: number): void {
    if (!fromLine(guest)) return;
    if (!this.patienceFrozen) guest.patience -= delta;
    if (guest.patience > 0) return;
    this.gaveUp++;
    this.tell('gaveUp', guest);
    guest.state = 'vanishing';
    guest.vanishing = 0;
    guest.target = null;
    guest.act = null;
    guest.actor.setFace(null);
  }

  /** Fading away where it is (in the hand, if the hand still holds it); gone when the fade ends. */
  private vanish(guest: Guest, delta: number): void {
    guest.vanishing += delta;
    if (guest.vanishing < VANISH_SECONDS) return;
    this.remove(guest);
    this.left++;
  }

  /** Out of the line (given up): it turns round and walks back the way it came, beside the line. */
  private leaveFromLine(guest: Guest): void {
    this.line.splice(this.line.indexOf(guest), 1);
    guest.spot = -1;
    guest.state = 'leaving';
    guest.side = null;
    guest.lane = -1;
    guest.walk = new Walk(pathBack(guest.actor.root.position, this.arrival));
    guest.speed = SPEED.leave;
  }

  /**
   * Send a guest who has eaten away: out through the exit in the left
   * wall and down the walkout path to the plate's edge (on through the
   * annex and out of its exit, once it is open). The way there is
   * whatever the navigation grid finds from where the guest is.
   */
  private startLeaving(guest: Guest): void {
    guest.state = 'leaving';
    const lanes = this.cafeSystem.annexOpen ? ANNEX_EXIT_LANES : EXIT_LANES;
    const lane = this.nextLane++ % lanes.length;
    guest.side = 'exit';
    guest.lane = lane;
    const nav = this.cafeSystem.nav;
    const from = guest.actor.root.position;
    const end = lanes[lane];
    const way = nav.findPath(from, new Vector3(end.x, nav.heightAt(end.x, end.z), end.z));
    // With no way out (it should not happen) the guest simply fades where it stands.
    guest.walk = new Walk(way ?? [from, from.clone().setX(from.x - FADE_OUT_M)]);
    guest.speed = SPEED.leave;
  }

  // ------------------------------------------------------------- the hands

  /** Pinches pick guests up, carry them, and let them go. */
  private hands(delta: number): void {
    if (this.handsOff) return;
    const hold = this.holdSystem;
    this.targets.fill(null);
    if (!hold || !this.world.renderer.xr.isPresenting) {
      for (const guest of this.guests) if (guest.state === 'held') this.letGo(guest);
      return;
    }
    this.player.head.getWorldPosition(this.eye);
    HANDS.forEach((hand, i) => {
      const pinch = hold.pinch[hand];
      this.hovered[i] = null;
      this.closedFor[hand] = pinch.closed ? (this.pinched[hand] ? this.closedFor[hand] + delta : 0) : Infinity;
      this.openFor[hand] = pinch.closed ? 0 : (this.pinched[hand] ? 0 : Math.min(this.openFor[hand], 1e6) + delta);
      this.pinched[hand] = pinch.closed;
      const lit = this.lastLit[hand];
      lit.age += delta;
      // A pinch that closed just now, or a moment ago on its way in (PICK_WINDOW_S).
      const recent = this.closedFor[hand] <= PICK_WINDOW_S;
      const carried = this.carriedBy(hand);
      if (carried) {
        // Let go only once the fingers have stayed open a moment (RELEASE_HOLD_S): a flicker never drops it.
        if (!pinch.closed && (this.openFor[hand] >= RELEASE_HOLD_S || pinch.gap === Infinity)) this.letGo(carried);
        else this.targets[i] = this.carry(carried, pinch.point, delta);
        return;
      }
      // One fading away in this hand stays in it while the fingers stay closed; it lands nowhere.
      const fading = this.guests.find((g) => g.state === 'vanishing' && g.hand === hand);
      if (fading) {
        if (pinch.closed) this.follow(fading, pinch.point, delta);
        else fading.hand = null;
        return;
      }
      // The guest a pinch here would take: the nearest within reach of this free hand (not on the café's handles).
      // It lights up while the hand is open, and a pinch closing now (or just before reaching it) takes exactly it.
      if (pinch.gap === Infinity || pinch.ghost || hold.holding.includes(hand) || this.handles?.near(pinch.point)) return;
      if (pinch.closed && !recent) return;
      let near = this.nearestGuest(pinch.point, 1);
      if (!recent) {
        // Open: light up the guest a pinch would take, and remember it for a moment. The one already lit stays
        // lit a little further out, and is only given up for a neighbour that is clearly nearer.
        const was = lit.age <= delta * 1.5 + 0.05 && lit.guest && this.pickable(lit.guest) ? lit.guest : null;
        if (was && was !== near) {
          const hold = this.aimAt(was, pinch.point);
          if (hold <= HOVER_EXIT_RADII && (!near || this.aimAt(near, pinch.point) > hold * HOVER_SWITCH)) near = was;
        }
        this.hovered[i] = near;
        if (near) {
          lit.guest = near;
          lit.age = 0;
        }
        return;
      }
      // Closing: the guest that was lit just now, if the closing fingers have not moved far from it
      // (the pinch point shifts as they close); otherwise the nearest within reach.
      const remembered = lit.age <= PICK_MEMORY_S && lit.guest && this.pickable(lit.guest) && this.aimAt(lit.guest, pinch.point) <= PICK_STICKY_RADII ? lit.guest : null;
      const guest = remembered ?? near;
      if (!guest) return;
      lit.guest = null;
      lit.age = Infinity;
      this.pickUp(guest, hand);
    });
  }

  /** The pick radius now (world metres): grows with the café, never below the world floor. */
  private pickRadius(): number {
    return Math.max(PICK_RADIUS_WORLD_MIN_M, PICK_RADIUS_M * this.cafeSystem.cafe.scale.x);
  }

  /** Can this guest be picked up (in the line or walking up to it, fully faded in)? A seated guest stays where it was put. */
  private pickable(guest: Guest): boolean {
    return (guest.state === 'queued' || guest.state === 'arriving') && guest.actor.opacity >= 0.99;
  }

  /**
   * How far a world point is from a guest's body: the nearest point on the
   * line from its feet to the top of its head (world metres). A pinch at the
   * head, the middle or the feet is equally close.
   */
  private reachTo(guest: Guest, point: Vector3): number {
    const feet = guest.actor.root.getWorldPosition(this.feet);
    const crown = guest.actor.bubbleAnchor.getWorldPosition(this.crown);
    // The bubble floats a little above the head: stop at the grip's height plus the same again above it, at most.
    const grip = guest.actor.grip.getWorldPosition(this.at);
    const top = Math.min(crown.y, grip.y + (grip.y - feet.y));
    crown.set(feet.x, top, feet.z);
    const dy = crown.y - feet.y;
    const t = dy > 1e-6 ? Math.min(1, Math.max(0, (point.y - feet.y) / dy)) : 0;
    return Math.hypot(point.x - feet.x, point.y - (feet.y + dy * t), point.z - feet.z);
  }

  /** A server has brought this guest its order: it eats from now on (one already fuming is past caring). */
  serve(id: number): void {
    const guest = this.guests.find((g) => g.id === id);
    if (guest && guest.fuming < 0) guest.served = true;
  }

  /** Is this guest sitting waiting for its order (seated, not served, not fuming)? */
  waitingForFood(guest: Guest): boolean {
    return guest.state === 'seated' && !guest.served && guest.fuming < 0;
  }

  /**
   * A pair: once both are seated, each one's `friend` wish is judged
   * again (it was judged before the other sat, by whether there was room
   * for it): met if they share a table. A friend who gave up instead
   * leaves the wish unmet.
   */
  private judgeFriend(guest: Guest): void {
    const friend = guest.friend ? this.guests.find((g) => g.id === guest.friend) : undefined;
    if (!friend || !friend.wishMet || !friend.seat || !guest.seat) return;
    const same = (this.tables.get(friend.seat.index) ?? -1) === (this.tables.get(guest.seat.index) ?? -2);
    const i = friend.wishes.indexOf('friend');
    if (i >= 0) friend.wishMet[i] = same;
    const j = guest.wishes.indexOf('friend');
    if (j >= 0 && guest.wishMet) guest.wishMet[j] = same;
  }

  /** A friend gave up before it sat: the one seated has its `friend` wish unmet. */
  private friendLost(guest: Guest): void {
    const friend = guest.friend ? this.guests.find((g) => g.id === guest.friend) : undefined;
    if (!friend?.wishMet) return;
    const i = friend.wishes.indexOf('friend');
    if (i >= 0) friend.wishMet[i] = false;
  }

  /** The bubbles over the seated guests (guests/reactions.ts): how each feels, read at a glance. */
  readonly reactions = new Reactions();
  private readonly reacting: Reacting[] = [];
  private readonly reactingPool: Reacting[] = [];

  /**
   * What each guest's bubble says now: its food just come ("!"), then how
   * it feels by what it is about to pay (the pay's own sum), notes for a
   * singer, and a storm as one who lost its temper walks out. A guest
   * still waiting for its food has its dot instead.
   */
  private react(delta: number): void {
    const out = this.reacting;
    out.length = 0;
    for (const guest of this.guests) {
      let feeling: Reacting['feeling'] = null;
      if (guest.fuming >= 0 && (guest.state === 'leaving' || guest.state === 'hop')) feeling = 'storming';
      else if (guest.state === 'seated' && guest.served && guest.fuming < 0) {
        if (guest.eaten < BUBBLE.servedFor) feeling = 'served';
        else if (guest.eaten >= BUBBLE.servedFor + BUBBLE.moodFor) feeling = null;
        else if (guest.sings) feeling = 'singing';
        else {
          let met = 0;
          if (guest.wishMet) for (const m of guest.wishMet) if (m) met++;
          feeling = feelingFor(payFor(guest.seatShare, met, guest.wishMet?.length ?? 0));
        }
      }
      if (!feeling || guest.actor.opacity < 0.3) continue;
      const r = this.reactingPool[out.length] ?? (this.reactingPool[out.length] = { id: 0, at: new Vector3(), seat: 0, feeling: null });
      r.id = guest.id;
      r.feeling = feeling;
      // Seat-mates at two heights: its place among its table's seats (so two at one table never share a height).
      r.seat = guest.seat ? this.rankAtTable(guest.seat) : 0;
      r.at.copy(guest.actor.root.position);
      r.at.y += guest.actor.bubbleAnchor.position.y;
      out.push(r);
    }
    this.reactions.update(out, this.headLocal, delta);
  }

  /** A seat's place among its table's seats (0, 1, ...), worked out once. */
  private rankAtTable(seat: Seat): number {
    let rank = this.ranks.get(seat);
    if (rank === undefined) {
      rank = this.seats.filter((s) => s.table === seat.table && s.index < seat.index).length;
      this.ranks.set(seat, rank);
    }
    return rank;
  }
  private readonly ranks = new Map<Seat, number>();

  /** The seats free now (open, clean, nobody on them): worked out once a frame. */
  private freeSeats(): Seat[] {
    if (this.freeFrame !== this.frame) {
      this.freeFrame = this.frame;
      this.free.length = 0;
      for (const s of this.seats) if (s.occupant === 0 && !s.locked && !s.dirty) this.free.push(s);
    }
    return this.free;
  }
  private readonly free: Seat[] = [];
  private freeFrame = -1;
  private frame = 0;

  /** Who is seated now (for the wishes that depend on the other guests). */
  private collectSitters(): void {
    this.sitters.length = 0;
    for (const guest of this.guests) if (guest.state === 'seated' && guest.seat && guest.fuming < 0) this.sitters.push({ id: guest.id, seat: guest.seat, sings: guest.sings });
  }

  /** Tell the listeners how a guest's visit ended. */
  private tell(kind: Outcome['kind'], guest: Guest): void {
    if (kind === 'gaveUp') this.friendLost(guest);
    const at = guest.actor.root.position.clone();
    at.y += guest.actor.bubbleAnchor.position.y + DIAL.above + 0.012;
    const wishes = guest.wishMet ? { met: guest.wishMet.filter(Boolean).length, of: guest.wishMet.length } : { met: 0, of: 0 };
    for (const listen of this.outcomes) listen({ kind, guest: guest.id, share: guest.seatShare, at, wishes, hurried: guest.hurried });
  }

  /**
   * Seat a guest from the line on a free seat directly, as letting go
   * over that seat would (for the checks and for setting a scene). True
   * if it was seated.
   */
  seatGuest(id: number, seatIndex: number): boolean {
    const guest = this.guests.find((g) => g.id === id && (g.state === 'queued' || g.state === 'arriving'));
    const seat = this.seats[seatIndex];
    if (!guest || !seat || seat.occupant !== 0) return false;
    guest.home = { line: this.line.indexOf(guest) };
    this.line.splice(this.line.indexOf(guest), 1);
    guest.spot = -1;
    guest.walk = null;
    seat.occupant = guest.id;
    guest.actor.play('Lifted');
    this.startHop(guest, seat.position, seat.yaw, HOP.sit, () => this.sit(guest, seat, true));
    return true;
  }

  /** The guest a hand is carrying, if any. */
  carriedBy(hand: Hand): Guest | undefined {
    return this.guests.find((g) => g.state === 'held' && g.hand === hand);
  }

  /** The guest whose grip is nearest a world point, within `radii` pick radii; null if none. Only guests that can be picked up count. */
  private nearestGuest(point: Vector3, radii: number): Guest | null {
    let best: Guest | null = null;
    let bestAim = radii;
    for (const guest of this.guests) {
      if (!this.pickable(guest)) continue;
      const aim = this.aimAt(guest, point);
      if (aim < bestAim) {
        bestAim = aim;
        best = guest;
      }
    }
    return best;
  }

  /**
   * How well a pinch point (world) is on a guest, in pick radii (under 1
   * is on it): the lesser of how far the point is from its body, and how
   * far the guest is from the line of sight through the point (SIGHT), so
   * a pinch at the guest and a pinch held over it as the player sees it
   * both count.
   */
  private aimAt(guest: Guest, point: Vector3): number {
    const direct = this.reachTo(guest, point) / this.pickRadius();
    const sight = this.sight ? this.offSight(guest.actor.grip.getWorldPosition(this.at), point) / SIGHT.radiusM : Infinity;
    return Math.min(direct, sight);
  }

  /**
   * How far a world point `target` is from the line of sight through the
   * pinch `point` (metres); Infinity unless it lies beyond the hand, within
   * SIGHT's range. `this.head` must hold the head's world position.
   */
  private offSight(target: Vector3, point: Vector3): number {
    const head = this.eye;
    const dx = point.x - head.x;
    const dy = point.y - head.y;
    const dz = point.z - head.z;
    const reach = Math.hypot(dx, dy, dz);
    if (reach < 0.1) return Infinity;
    const tx = target.x - head.x;
    const ty = target.y - head.y;
    const tz = target.z - head.z;
    const along = (tx * dx + ty * dy + tz * dz) / reach;
    if (along < reach + SIGHT.nearM || along > reach + SIGHT.farM) return Infinity;
    return Math.hypot(tx - (dx / reach) * along, ty - (dy / reach) * along, tz - (dz / reach) * along);
  }

  private pickUp(guest: Guest, hand: Hand): void {
    if (guest.state === 'seated') guest.home = { seat: guest.seat! };
    else {
      guest.home = { line: this.line.indexOf(guest) };
      this.line.splice(this.line.indexOf(guest), 1);
      guest.spot = -1;
    }
    guest.state = 'held';
    guest.hand = hand;
    guest.walk = null;
    guest.target = null;
    guest.watching = false;
    guest.act = new HeldAct();
    guest.actor.play('Lifted');
    this.pickedUp++;
  }

  /** A carried guest hangs from the pinch by its grip, faces the player, and looks for a seat below. Returns the seat it would land on. */
  private carry(guest: Guest, pinch: Vector3, delta: number): Seat | null {
    const cafe = this.cafeSystem.cafe;
    const root = guest.actor.root;
    this.follow(guest, pinch, delta);
    // Face the player, so the face shows.
    cafe.worldToLocal(this.player.head.getWorldPosition(this.head));
    guest.targetYaw = Math.atan2(this.head.x - root.position.x, this.head.z - root.position.z);
    this.turn(guest, delta);
    const own = guest.home && 'seat' in guest.home ? guest.home.seat : null;
    // The seat the other hand's guest is aimed at is spoken for.
    const spoken = this.guests.find((g) => g !== guest && g.state === 'held')?.target ?? null;
    guest.target = seatUnder(this.seats, root.position, SEAT_REACH_M, own, spoken) ?? this.seatAimed(root.position, pinch, own, spoken);
    // How it takes being held: one steady face (see guests/expressions.ts), by its patience, the seat below it and
    // how near the player's face it is.
    const held = this.held;
    held.distance = guest.actor.grip.getWorldPosition(this.at).distanceTo(this.player.head.getWorldPosition(this.head));
    held.patience = fromLine(guest) ? Math.max(0, guest.patience / guest.patienceFull) : 1;
    // Where it looks: at the seat it would land on, from its own point of view; straight down when there is none.
    held.lookX = 0;
    held.lookY = -1;
    if (guest.target) {
      root.worldToLocal(cafe.localToWorld(this.at.copy(guest.target.position)));
      const reach = Math.hypot(this.at.x, this.at.y - EYE_HEIGHT_M) || 1;
      held.lookX = this.at.x / reach;
      held.lookY = (this.at.y - EYE_HEIGHT_M) / reach;
    }
    const acting = guest.act!.update(delta, held);
    guest.actor.setFace(acting.face);
    guest.actor.play('Lifted', acting.kick);
    const k = 1 - Math.exp(-LEAN_FOLLOW * delta);
    guest.roll += (acting.roll - guest.roll) * k;
    guest.pitch += (acting.pitch - guest.pitch) * k;
    root.rotation.set(guest.pitch, guest.yaw, guest.roll);
    return guest.target;
  }

  /** Hang a guest from the pinch by its grip. */
  private follow(guest: Guest, pinch: Vector3, delta: number): void {
    this.cafeSystem.cafe.worldToLocal(this.at.copy(pinch));
    this.at.y -= GRIP_HEIGHT_M;
    guest.actor.root.position.lerp(this.at, 1 - Math.exp(-CARRY_FOLLOW * delta));
  }

  /** Let go: onto the glowing seat if there is one, else back where it came from. */
  /**
   * The seat a carried guest is aimed at when it is not hanging right
   * over one: the free seat nearest where the player is pointing it. That
   * is the spot under the hand if the hand is low over the café; else the
   * spot on the café behind the fingers along the line of sight; else (the
   * line of sight running past the café) the spot under the hand again.
   * Null when the hand is clear of the café (DROP_MARGIN_M), or no free
   * seat is within AIM_SNAP_M of that spot: the guest goes back where it
   * came from.
   */
  private seatAimed(hang: Vector3, pinch: Vector3, own: Seat | null, spoken: Seat | null): Seat | null {
    if (this.seats.length === 0) return null;
    const cafe = this.cafeSystem.cafe;
    const bounds = this.holdSystem?.bounds;
    const level = this.seats[0].position.y;
    const spot = this.aimSpot;
    const inside = (p: Vector3): boolean =>
      !bounds || (p.x >= bounds.min.x - DROP_MARGIN_M && p.x <= bounds.max.x + DROP_MARGIN_M && p.z >= bounds.min.z - DROP_MARGIN_M && p.z <= bounds.max.z + DROP_MARGIN_M);
    const low = hang.y - level < 0.2 && hang.y - level > -0.03;
    let found = false;
    if (!low && this.sight) {
      // Where the line of sight through the pinch meets the seats' level (café space).
      const eye = cafe.worldToLocal(this.at.copy(this.eye));
      const through = cafe.worldToLocal(spot.copy(pinch));
      const fall = eye.y - through.y;
      const t = fall > 1e-4 ? (eye.y - level) / fall : 0;
      if (t >= 1) {
        spot.set(eye.x + (through.x - eye.x) * t, level, eye.z + (through.z - eye.z) * t);
        found = inside(spot);
      }
    }
    // Low over the café, or held high above it with the line of sight running past its far side: the spot under the hand.
    if (!found) {
      if (!low && !this.sight) return null;
      spot.copy(hang);
      if (!inside(spot)) return null;
    }
    // Only a seat near where the player points: a guest let go far from any free seat goes back to its
    // place in the line, it does not fly across the café to whichever seat happens to be free.
    let best: Seat | null = null;
    let bestDistance = AIM_SNAP_M;
    for (const seat of this.seats) {
      if ((seat.occupant !== 0 && seat !== own) || seat === spoken || seat.locked) continue;
      const d = Math.hypot(spot.x - seat.position.x, spot.z - seat.position.z);
      if (d < bestDistance) {
        bestDistance = d;
        best = seat;
      }
    }
    return best;
  }
  private readonly aimSpot = new Vector3();

  private letGo(guest: Guest): void {
    const home = guest.home;
    const homeSeat = home && 'seat' in home ? home.seat : null;
    // Let go over a dirty table: it will not sit there (the seat glowed amber); back to its place in the line.
    if (guest.target?.dirty) {
      guest.target = null;
      this.refusedDirty++;
    }
    const seat = guest.target ?? homeSeat;
    guest.hand = null;
    guest.target = null;
    guest.act = null;
    guest.actor.setFace(null);
    if (seat) {
      // A new seat: take it now so nobody else is aimed at it, and give the old one up.
      const moved = seat !== homeSeat;
      if (homeSeat && moved) homeSeat.occupant = 0;
      seat.occupant = guest.id;
      this.startHop(guest, seat.position, seat.yaw, HOP.sit, () => this.sit(guest, seat, moved));
      return;
    }
    // Back into the line, at the place it was taken from.
    const index = Math.min(home && 'line' in home ? Math.max(0, home.line) : this.line.length, this.line.length);
    this.line.splice(index, 0, guest);
    guest.spot = index;
    guest.actor.play('Lifted');
    this.startHop(guest, QUEUE_SPOTS[Math.min(index, QUEUE_SPOTS.length - 1)], QUEUE_YAW, HOP.back, () => {
      guest.state = 'queued';
      guest.targetYaw = QUEUE_YAW;
      guest.actor.play('Idle');
    });
  }

  /** A guest that can be picked up watches a free hand that comes close: wide eyes following it. */
  private watch(guest: Guest): void {
    const hold = this.holdSystem;
    let seen = false;
    if (hold && this.world.renderer.xr.isPresenting) {
      const reach = WATCH_RADIUS_M * Math.max(1, this.cafeSystem.cafe.scale.x);
      guest.actor.grip.getWorldPosition(this.at);
      for (const hand of HANDS) {
        const pinch = hold.pinch[hand];
        // A tracked hand, not busy carrying, near enough.
        if (pinch.gap === Infinity || this.carriedBy(hand) || pinch.point.distanceTo(this.at) > reach) continue;
        // Where the hand is from the guest's own point of view, about its eyes.
        guest.actor.root.worldToLocal(this.head.copy(pinch.point));
        guest.actor.setFace(watchingFace(this.head.x, this.head.y - EYE_HEIGHT_M, this.watchFace));
        seen = true;
        break;
      }
    }
    if (!seen && guest.watching) guest.actor.setFace(null);
    guest.watching = seen;
  }

  // ---------------------------------------------------------------- sitting

  private sit(guest: Guest, seat: Seat, fresh: boolean): void {
    guest.state = 'seated';
    guest.seat = seat;
    guest.home = null;
    guest.actor.root.position.copy(seat.position);
    guest.yaw = guest.targetYaw = seat.yaw;
    guest.actor.root.rotation.y = seat.yaw;
    if (fresh) {
      guest.seatedFor = 0;
      guest.served = false;
      guest.eaten = 0;
      // How long it waited to be seated, as a share of its patience; and a top-up for the wait for its food.
      guest.seatShare = Math.min(1, Math.max(0, 1 - guest.patience / guest.patienceFull));
      const seated = this.seatedPatience === null ? null : guest.hurried && this.hurry.seated > 0 ? this.hurry.seated : this.seatedPatience;
      guest.patience = seated ?? Math.min(SERVICE_MAX_SECONDS, Math.max(0, guest.patience) + SERVICE_TOPUP_SECONDS);
      // The second stage of its wait: the dot counts the fresh amount down (full again as it sits).
      if (seated !== null) guest.patienceFull = seated;
      this.seated++;
      this.judge(guest);
    }
    guest.actor.play(fresh ? 'SitHappy' : 'SitIdle');
  }

  /** A seated guest: pleased, then waiting for its order, eating once served, then idle; when its time is up it gets down and leaves. */
  private sitting(guest: Guest, delta: number): void {
    if (guest.fuming >= 0) {
      this.fume(guest, delta);
      return;
    }
    // Waiting for its food: its patience runs on, and if it runs out the guest loses its temper.
    if (!guest.served) {
      if (!this.patienceFrozen) guest.patience -= delta;
      if (guest.patience <= 0) {
        guest.fuming = 0;
        guest.actor.play('SitUnhappy');
        guest.actor.setFace(ANGRY_FACE);
        const at = guest.actor.root.position.clone();
        at.y += guest.actor.bubbleAnchor.position.y + DIAL.above;
        guest.anger = this.popups.show('anger', at, true);
        return;
      }
    }
    guest.seatedFor += delta;
    if (guest.served) guest.eaten += delta;
    this.sing(guest, delta);
    // It leaves once its time is up and it has had a fair while to eat (served late, it stays to finish).
    const stayed = guest.seatedFor >= this.seatedSeconds && guest.eaten >= Math.min(EAT_SECONDS, this.seatedSeconds * 0.25);
    if (guest.served && (stayed || guest.eaten >= this.mealSeconds)) {
      this.standUp(guest);
      return;
    }
    // Pleased to be seated; then it waits for its order, eats once a server has brought it, and sits back at the end.
    const last = guest.seatedFor > this.seatedSeconds - Math.min(IDLE_LAST_SECONDS, this.seatedSeconds * 0.25) || guest.eaten > this.mealSeconds * 0.8;
    guest.actor.play(guest.seatedFor < HAPPY_SECONDS ? 'SitHappy' : last || !guest.served ? 'SitIdle' : 'SitEating');
  }

  /** Fuming at the table: a cross face and the vein mark for a moment, then down and out without eating. */
  private fume(guest: Guest, delta: number): void {
    guest.fuming += delta;
    if (guest.fuming < FUME_SECONDS) return;
    if (guest.anger) this.popups.release(guest.anger);
    guest.anger = null;
    guest.actor.setFace(null);
    this.stormedOff++;
    this.tell('stormedOff', guest);
    this.standUp(guest);
  }

  /** Off the chair with a hop, to the nearest aisle, out of the door and away (paying first, if it ate). */
  private standUp(guest: Guest): void {
    if (guest.fuming < 0) this.tell('paid', guest);
    const seat = guest.seat!;
    seat.occupant = 0;
    guest.seat = null;
    this.hoppedOff++;
    // Down to the nearest place there is room to stand, facing away from the chair.
    const nav = this.cafeSystem.nav;
    const landing = nav.nearest(seat.position.x, seat.position.z, LANDING_REACH_M) ?? seat.position.clone();
    // In the air it kicks its legs (the Lifted clip), as when carried.
    guest.actor.play('Lifted');
    this.startHop(guest, landing, Math.atan2(landing.x - seat.position.x, landing.z - seat.position.z), HOP.off, () => this.startLeaving(guest));
  }

  // ------------------------------------------------------------------- hops

  private startHop(guest: Guest, to: Vector3, yawTo: number, hop: { seconds: number; height: number }, then: () => void): void {
    guest.state = 'hop';
    guest.walk = null;
    guest.hop = { from: guest.actor.root.position.clone(), to: to.clone(), yawFrom: guest.yaw, yawTo, t: 0, seconds: hop.seconds, height: hop.height, then };
  }

  private hopping(guest: Guest, delta: number): void {
    const hop = guest.hop!;
    hop.t = Math.min(1, hop.t + delta / hop.seconds);
    const eased = hop.t * hop.t * (3 - 2 * hop.t);
    const root = guest.actor.root;
    root.position.lerpVectors(hop.from, hop.to, eased);
    root.position.y += Math.sin(Math.PI * hop.t) * hop.height;
    guest.yaw = hop.yawFrom + yawDelta(hop.yawFrom, hop.yawTo) * eased;
    guest.targetYaw = hop.yawTo;
    // Any lean from being held straightens out on the way.
    guest.roll *= 1 - eased;
    guest.pitch *= 1 - eased;
    root.rotation.set(guest.pitch, guest.yaw, guest.roll);
    guest.ground = hop.to.y;
    if (hop.t < 1) return;
    guest.hop = null;
    hop.then();
  }

  // ----------------------------------------------------------------- moving

  /** Advance a guest along its walk, face it the right way, and finish the walk when it ends. */
  private step(guest: Guest, delta: number): void {
    const root = guest.actor.root;
    const walk = guest.walk;
    if (walk) {
      let speed = guest.speed;
      if (guest.state === 'leaving') {
        // Once through the exit the walk becomes a march; and nobody treads on the heels of the one ahead.
        if (root.position.x < (this.cafeSystem.annexOpen ? ANNEX_OUTSIDE_X : OUTSIDE_X)) speed = SPEED.march;
        if (this.crowded(guest)) speed *= 0.35;
      }
      const done = walk.advance(speed * delta);
      walk.position(root.position);
      guest.ground = root.position.y;
      // A step down off the plate (or up onto it) is a little hop.
      const { from, to, t } = walk.span();
      if (Math.abs(to.y - from.y) > HOP_STEP_M) root.position.y += Math.sin(Math.PI * t) * HOP_HEIGHT_M;
      guest.targetYaw = walk.heading(guest.targetYaw);
      guest.actor.play('Walk', speed / WALK_CLIP_SPEED);
      if (done) this.arrive(guest);
    }
    this.turn(guest, delta);
  }

  /** Ease a guest round to the way it should face. */
  private turn(guest: Guest, delta: number): void {
    const turn = yawDelta(guest.yaw, guest.targetYaw);
    guest.yaw += Math.sign(turn) * Math.min(Math.abs(turn), TURN_SPEED * delta);
    guest.actor.root.rotation.y = guest.yaw;
  }

  /** A walk has ended. */
  private arrive(guest: Guest): void {
    guest.walk = null;
    if (guest.state === 'leaving') {
      this.remove(guest);
      this.left++;
      return;
    }
    // In the line: stand, turned toward the door and a little to the player.
    guest.state = 'queued';
    guest.targetYaw = QUEUE_YAW;
    guest.actor.play('Idle');
  }

  /** True if another leaver making for the same spot at the same end is just ahead. */
  private crowded(guest: Guest): boolean {
    if (!guest.side) return false;
    const mine = guest.walk!.remaining;
    for (const other of this.guests) {
      if (other === guest || other.state !== 'leaving' || !other.walk || other.side !== guest.side || other.lane !== guest.lane) continue;
      const ahead = mine - other.walk.remaining;
      if (ahead > 0 && ahead < FOLLOW_GAP_M) return true;
    }
    return false;
  }

  /** Fade, animate, and lay the blob. */
  private show(guest: Guest, delta: number): void {
    const walk = guest.walk;
    let opacity = 1;
    if (guest.state === 'arriving' && walk) opacity = Math.min(1, walk.walked / FADE_IN_M);
    if (guest.state === 'leaving' && walk) opacity = Math.min(1, walk.remaining / FADE_OUT_M);
    if (guest.state === 'vanishing') opacity = Math.max(0, 1 - guest.vanishing / VANISH_SECONDS);
    guest.actor.setOpacity(opacity);
    // Lit up while a hand is over it, ready to pick it up.
    const want = this.hovered.includes(guest) ? 1 : 0;
    guest.highlight += (want - guest.highlight) * (1 - Math.exp(-(want ? 18 : 8) * delta));
    guest.actor.setHighlight(guest.highlight < 0.01 ? 0 : guest.highlight);
    guest.actor.update(delta);
    // The dot shows for as long as the guest is waiting: in the line, in the player's hand (or the air) on
    // its way from the line, and (in the game, where sitting gives a fresh amount) seated until its food
    // comes, so a full café shows who is still waiting (plan: one dot, two stages).
    const waiting = guest.state === 'queued' || guest.state === 'vanishing' || ((guest.state === 'held' || guest.state === 'hop') && fromLine(guest))
      || (this.seatedPatience !== null && guest.state === 'seated' && !guest.served && guest.fuming < 0);
    guest.dial.update(guest.patience / guest.patienceFull, guest.patience, guest.wishes.length, waiting, opacity, delta, this.hovered.includes(guest) || guest.state === 'held', guest.hurried, guest.friend !== 0);
    // A blob under everyone on their feet (not the seated, nor the carried).
    const p = guest.actor.root.position;
    if (guest.state !== 'seated' && guest.state !== 'held' && guest.state !== 'vanishing') this.blobs.add(p.x, guest.ground, p.z, opacity);
  }

  private remove(guest: Guest): void {
    if (guest.anger) this.popups.release(guest.anger);
    for (const seat of this.seats) if (seat.occupant === guest.id) seat.occupant = 0;
    guest.dial.dispose();
    guest.actor.dispose();
    const i = this.guests.indexOf(guest);
    if (i >= 0) this.guests.splice(i, 1);
    const j = this.line.indexOf(guest);
    if (j >= 0) this.line.splice(j, 1);
  }
}
