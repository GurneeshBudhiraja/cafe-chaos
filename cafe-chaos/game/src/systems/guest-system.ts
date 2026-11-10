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
 *   fingers, kicking, turned to face the player, and acts out how it
 *   feels (guests/expressions.ts): startled, then wondering what is
 *   happening, and, held up to the player's face, curious, confused,
 *   looking for a way out and worried, by turns. The seat it would land on glows violet
 *   (guests/seat-glow.ts); letting go over that seat sits it down,
 *   letting go anywhere else sends it back where it came from.
 * - Watching: a guest on its feet or in a seat follows a hand that comes
 *   close with wide eyes, so it is plain they can be picked up.
 * - Sitting: happy at first, then waiting for its order (the servers
 *   bring it: systems/barista-system.ts), eating once served, then idle; after a minute it
 *   hops off its chair and leaves.
 * - Giving up: a guest whose patience runs out turns round and walks
 *   back the way it came, beside the line, and fades out.
 * - Leaving: a guest who has eaten comes out of the room's front
 *   opening, by the Meta stone, and turns left or right along the garden
 *   path (the quieter side, a coin toss when level), fading out at that
 *   end, never stepping off the platform. Nobody is told the way: each
 *   finds it on the navigation grid (nav/nav-grid.ts), which is read
 *   from the café's geometry.
 *
 * Guests are children of the café group, so they move, turn and scale
 * with it.
 */

import { createSystem, Vector3 } from '@iwsdk/core';
import { castLoaded, GuestActor, WALK_CLIP_SPEED, type Face } from '../guests/actor.js';
import { Blobs } from '../guests/blobs.js';
import { randomLook, type Look } from '../guests/cast.js';
import { HeldAct, watchingFace } from '../guests/expressions.js';
import { ARRIVAL_POINT, EXIT_ENDS, FRONT_OPENING, FRONT_PATH_Z, pathBack, QUEUE_SPOTS, QUEUE_YAW, type Side } from '../guests/paths.js';
import {
  CARRY_FOLLOW, CLAIM_RADII, FADE_IN_M, FADE_OUT_M, FIRST_SPAWN_SECONDS, FOLLOW_GAP_M, GRIP_HEIGHT_M, HAPPY_SECONDS, HOP, IDLE_LAST_SECONDS, IMPATIENT_AFTER, LEAN_FOLLOW, MAX_GUESTS, MAX_QUEUE,
  PATIENCE_SECONDS, PATIENCE_SPREAD, PICK_RADIUS_M, PICK_RADIUS_WORLD_MIN_M, SEAT_REACH_M, SEATED_SECONDS, SPAWN_SECONDS, SPAWN_STRETCH, SPEED, TURN_SPEED, VANISH_SECONDS, WATCH_RADIUS_M,
} from '../guests/rules.js';
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
  /** Leaving by the front: which end of the path it is making for, and which spot there (null and -1 for one walking back from the line). */
  side: Side | null;
  lane: number;
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

/** A step down or up of more than this is hopped, not walked (metres). */
const HOP_STEP_M = 0.01;
const HOP_HEIGHT_M = 0.014;

/** Was this guest taken from the line (and so is still waiting to be seated)? */
const fromLine = (guest: Guest): boolean => !!guest.home && 'line' in guest.home;

export class GuestSystem extends createSystem({}) {
  /** Everyone on stage. */
  readonly guests: Guest[] = [];
  /** The line, front to back (those walking up to it included). */
  readonly line: Guest[] = [];
  /** Tunables (the checks and recordings shorten them). */
  patienceSeconds = PATIENCE_SECONDS;
  seatedSeconds = SEATED_SECONDS;
  spawnSeconds: [number, number] = [...SPAWN_SECONDS];
  /** Set false to stop new arrivals. */
  arrivals = true;
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
  private readonly nextLane: Record<Side, number> = { left: 0, right: 0 };
  private lastSides: [Side | null, Side | null] = [null, null];
  private holdSystem: HoldSystem | undefined;
  private handles: HandleSystem | undefined;
  private readonly pinched: Record<Hand, boolean> = { left: false, right: false };
  private readonly blobs = new Blobs(MAX_GUESTS + 2);
  private readonly at = new Vector3();
  private readonly head = new Vector3();
  private readonly targets: (Seat | null)[] = [null, null];
  private readonly watchFace: Face = { eyes: 'EyesWide', mouth: 'MouthO', lookX: 0, lookY: 0 };

  init(): void {
    this.cafeSystem = this.world.getSystem(CafeSystem)!;
    this.holdSystem = this.world.getSystem(HoldSystem);
    this.handles = this.world.getSystem(HandleSystem);
    const cafe = this.cafeSystem.cafe;
    cafe.add(this.blobs.mesh);
    this.seats = collectSeats(cafe, this.cafeSystem.seats, this.cafeSystem.nav, this.cafeSystem.pieces);
    this.glow = new SeatGlow(cafe, this.seats.length);
    // A pinch on or just around a guest is the guests' business, never the café's.
    this.holdSystem?.claims.push((point) => this.nearestGuest(point, CLAIM_RADII) !== null);
  }

  update(frameDelta: number): void {
    const cafe = this.cafeSystem;
    const delta = Math.min(1, frameDelta) * cafe.timeScale;
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
    this.glow.show(this.seats, this.targets, this.targets.some((t, i) => t !== null || this.carriedBy(HANDS[i]) !== undefined), delta);
    this.peak = Math.max(this.peak, this.guests.length);
  }

  /** Take every guest away (a new session, or the café placed afresh). */
  clear(): void {
    for (const guest of this.guests) {
      guest.dial.dispose();
      guest.actor.dispose();
    }
    this.guests.length = 0;
    this.line.length = 0;
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
    if (!this.arrivals || this.guests.length >= MAX_GUESTS || this.line.length + awayFromLine >= MAX_QUEUE) {
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
    this.spawn(look);
    // The fuller the café, the longer until the next one.
    const [min, max] = this.spawnSeconds;
    const fullness = this.guests.length / MAX_GUESTS;
    this.nextSpawnIn = (min + Math.random() * (max - min)) * (1 + (SPAWN_STRETCH - 1) * fullness);
  }

  /** Bring a new guest on at the arrival point and send it to the back of the line. */
  spawn(look: Look = randomLook(Math.random, this.lastLook)): Guest {
    this.lastLook = look;
    const actor = new GuestActor(look);
    actor.root.name = `Guest-${++this.arrived}`;
    actor.root.position.copy(ARRIVAL_POINT);
    actor.setOpacity(0);
    this.cafeSystem.cafe.add(actor.root);
    const patience = this.patienceSeconds * (1 + (Math.random() * 2 - 1) * PATIENCE_SPREAD);
    const dial = new PatienceDial();
    dial.sprite.position.set(0, actor.bubbleAnchor.position.y + DIAL.above, 0);
    actor.root.add(dial.sprite);
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
      ground: ARRIVAL_POINT.y,
      hand: null,
      home: null,
      target: null,
      seat: null,
      seatedFor: 0,
      served: false,
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

  // ---------------------------------------------------------------- the line

  /** Everyone in the line walks to the spot that matches their place in it. */
  private keepLine(): void {
    this.line.forEach((guest, index) => {
      // One in the air on its way back to the line lands first, then steps to its place if that has changed.
      if (guest.spot === index || guest.state === 'hop') return;
      guest.spot = index;
      guest.walk = new Walk([guest.actor.root.position, QUEUE_SPOTS[index]]);
      guest.speed = guest.state === 'arriving' ? SPEED.arrive : SPEED.shuffle;
    });
  }

  /** A guest standing in the line: its patience runs down, shows, and runs out. */
  private wait(guest: Guest, delta: number): void {
    guest.patience -= delta;
    if (guest.patience <= 0) {
      this.gaveUp++;
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
    guest.patience -= delta;
    if (guest.patience > 0) return;
    this.gaveUp++;
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
    guest.walk = new Walk(pathBack(guest.actor.root.position));
    guest.speed = SPEED.leave;
  }

  /**
   * Send a guest who has eaten away: out of the room's front opening by
   * the Meta stone, then left or right along the garden path to its end.
   * The way to the opening, and from there to the end, is whatever the
   * navigation grid finds from where the guest is.
   */
  private startLeaving(guest: Guest): void {
    guest.state = 'leaving';
    const { side, lane } = this.pickExit();
    guest.side = side;
    guest.lane = lane;
    const nav = this.cafeSystem.nav;
    const from = guest.actor.root.position;
    const out = nav.findPath(from, FRONT_OPENING);
    const along = nav.findPath(FRONT_OPENING, EXIT_ENDS[side][lane]);
    // With no way out (it should not happen) the guest simply fades where it stands.
    guest.walk = new Walk(out && along ? [...out, ...along.slice(2)] : [from, from.clone().setX(from.x + FADE_OUT_M)]);
    guest.speed = SPEED.leave;
  }

  /**
   * Left or right at the front, so that neither end crowds: the side
   * with fewer guests on their way to it; a coin toss when they are
   * level; and never the same side three times running, so a run of
   * tosses cannot send a little crowd one way. At that end, the spots
   * are dealt in turn.
   */
  pickExit(): { side: Side; lane: number } {
    const going = (side: Side): number => this.guests.filter((g) => g.state === 'leaving' && g.side === side).length;
    const left = going('left');
    const right = going('right');
    let side: Side = left < right ? 'left' : right < left ? 'right' : Math.random() < 0.5 ? 'left' : 'right';
    const [last, before] = this.lastSides;
    if (last === before && last === side) side = side === 'left' ? 'right' : 'left';
    this.lastSides = [side, last];
    const lane = this.nextLane[side]++ % EXIT_ENDS[side].length;
    return { side, lane };
  }

  // ------------------------------------------------------------- the hands

  /** Pinches pick guests up, carry them, and let them go. */
  private hands(delta: number): void {
    const hold = this.holdSystem;
    this.targets.fill(null);
    if (!hold || !this.world.renderer.xr.isPresenting) {
      for (const guest of this.guests) if (guest.state === 'held') this.letGo(guest);
      return;
    }
    HANDS.forEach((hand, i) => {
      const pinch = hold.pinch[hand];
      const fresh = pinch.closed && !this.pinched[hand];
      this.pinched[hand] = pinch.closed;
      const carried = this.carriedBy(hand);
      if (carried) {
        if (!pinch.closed) this.letGo(carried);
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
      // A pinch closing now, on a guest, with the hand free (not on the café's handles).
      if (!fresh || hold.holding.includes(hand) || this.handles?.near(pinch.point)) return;
      const guest = this.nearestGuest(pinch.point, 1);
      if (guest) this.pickUp(guest, hand);
    });
  }

  /** A server has brought this guest its order: it eats from now on. */
  serve(id: number): void {
    const guest = this.guests.find((g) => g.id === id);
    if (guest) guest.served = true;
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
    const reach = Math.max(PICK_RADIUS_WORLD_MIN_M, PICK_RADIUS_M * this.cafeSystem.cafe.scale.x) * radii;
    let best: Guest | null = null;
    let bestDistance = reach;
    for (const guest of this.guests) {
      if (guest.state !== 'queued' && guest.state !== 'arriving' && guest.state !== 'seated') continue;
      if (guest.actor.opacity < 0.99) continue;
      const distance = guest.actor.grip.getWorldPosition(this.at).distanceTo(point);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = guest;
      }
    }
    return best;
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
    // Its performance: the face, how hard it kicks, and how it leans, by how near the player's face it is.
    const distance = guest.actor.grip.getWorldPosition(this.at).distanceTo(this.player.head.getWorldPosition(this.head));
    const acting = guest.act!.update(delta, distance);
    guest.actor.setFace(acting.face);
    guest.actor.play('Lifted', acting.kick);
    const k = 1 - Math.exp(-LEAN_FOLLOW * delta);
    guest.roll += (acting.roll - guest.roll) * k;
    guest.pitch += (acting.pitch - guest.pitch) * k;
    root.rotation.set(guest.pitch, guest.yaw + acting.shake, guest.roll);
    const own = guest.home && 'seat' in guest.home ? guest.home.seat : null;
    // The seat the other hand's guest is aimed at is spoken for.
    const spoken = this.guests.find((g) => g !== guest && g.state === 'held')?.target ?? null;
    guest.target = seatUnder(this.seats, root.position, SEAT_REACH_M, own, spoken);
    return guest.target;
  }

  /** Hang a guest from the pinch by its grip. */
  private follow(guest: Guest, pinch: Vector3, delta: number): void {
    this.cafeSystem.cafe.worldToLocal(this.at.copy(pinch));
    this.at.y -= GRIP_HEIGHT_M;
    guest.actor.root.position.lerp(this.at, 1 - Math.exp(-CARRY_FOLLOW * delta));
  }

  /** Let go: onto the glowing seat if there is one, else back where it came from. */
  private letGo(guest: Guest): void {
    const home = guest.home;
    const homeSeat = home && 'seat' in home ? home.seat : null;
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
        guest.actor.setFace(watchingFace(this.head.x, this.head.y - 0.045, this.watchFace));
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
      this.seated++;
    }
    guest.actor.play(fresh ? 'SitHappy' : 'SitIdle');
  }

  /** A seated guest: pleased, then waiting for its order, eating once served, then idle; when its time is up it gets down and leaves. */
  private sitting(guest: Guest, delta: number): void {
    guest.seatedFor += delta;
    if (guest.seatedFor >= this.seatedSeconds) {
      this.standUp(guest);
      return;
    }
    // Pleased to be seated; then it waits for its order, eats once a server has brought it, and sits back at the end.
    const last = guest.seatedFor > this.seatedSeconds - Math.min(IDLE_LAST_SECONDS, this.seatedSeconds * 0.25);
    guest.actor.play(guest.seatedFor < HAPPY_SECONDS ? 'SitHappy' : last || !guest.served ? 'SitIdle' : 'SitEating');
  }

  /** Off the chair with a hop, to the nearest aisle, out of the door and away. */
  private standUp(guest: Guest): void {
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
        // On the front path the walk becomes a march; and nobody treads on the heels of the one ahead.
        if (root.position.z > FRONT_PATH_Z) speed = SPEED.march;
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
    guest.actor.update(delta);
    // The dial shows for as long as the guest is waiting to be seated: in the line, and in the player's hand
    // (or the air) on its way from the line, where its patience is still running.
    const waiting = guest.state === 'queued' || guest.state === 'vanishing' || ((guest.state === 'held' || guest.state === 'hop') && fromLine(guest));
    guest.dial.update(guest.patience / guest.patienceFull, waiting, opacity, delta);
    // A blob under everyone on their feet (not the seated, nor the carried).
    const p = guest.actor.root.position;
    if (guest.state !== 'seated' && guest.state !== 'held' && guest.state !== 'vanishing') this.blobs.add(p.x, guest.ground, p.z, opacity);
  }

  private remove(guest: Guest): void {
    for (const seat of this.seats) if (seat.occupant === guest.id) seat.occupant = 0;
    guest.dial.dispose();
    guest.actor.dispose();
    const i = this.guests.indexOf(guest);
    if (i >= 0) this.guests.splice(i, 1);
    const j = this.line.indexOf(guest);
    if (j >= 0) this.line.splice(j, 1);
  }
}
