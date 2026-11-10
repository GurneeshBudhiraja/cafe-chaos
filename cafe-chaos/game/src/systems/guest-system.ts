/**
 * GuestSystem: the guests who come to the café.
 *
 * - Arrivals: once the café is placed, guests appear out along the table
 *   to the right, one every few seconds (slower as the café fills, never
 *   more than MAX_GUESTS on stage), each a random species, colour and
 *   outfit. They fade in as they walk up to the back of the line.
 * - The line: single file outside the door, its head on the deck. When
 *   someone leaves the line, everyone behind steps up a place.
 * - Waiting: each guest in the line has its own patience. Past the
 *   halfway mark it shows (foot tapping, side-eye); when it runs out the
 *   guest gives up.
 * - Picking up: a pinch closing on a guest lifts it. It hangs from the
 *   fingers, kicking, turned to face the player. The seat it would land
 *   on glows blue (guests/seat-glow.ts); letting go over that seat sits
 *   it down, letting go anywhere else sends it back where it came from.
 * - Sitting: happy at first, then eating, then idle; after a minute it
 *   hops off its chair and leaves.
 * - Leaving: every guest who leaves goes out toward the front, then
 *   marches off left or right (at random) along the table in front of
 *   the café, in lanes so they do not bunch, and fades out at the end.
 *
 * Guests are children of the café group, so they move, turn and scale
 * with it.
 */

import { createSystem, Vector3 } from '@iwsdk/core';
import { castLoaded, GuestActor, WALK_CLIP_SPEED } from '../guests/actor.js';
import { Blobs } from '../guests/blobs.js';
import { randomLook, type Look } from '../guests/cast.js';
import { ARRIVAL_POINT, MARCH_LANES_Z, pathFromInside, pathFromQueue, pathOffSeat, QUEUE_SPOTS, QUEUE_YAW, type Side } from '../guests/paths.js';
import {
  CARRY_FOLLOW, CLAIM_RADII, FADE_IN_M, FADE_OUT_M, FIRST_SPAWN_SECONDS, FOLLOW_GAP_M, GRIP_HEIGHT_M, HAPPY_SECONDS, HOP, IDLE_LAST_SECONDS, IMPATIENT_AFTER, MAX_GUESTS, MAX_QUEUE,
  PATIENCE_SECONDS, PATIENCE_SPREAD, PICK_RADIUS_M, PICK_RADIUS_WORLD_MIN_M, SEAT_REACH_M, SEATED_SECONDS, SPAWN_SECONDS, SPAWN_STRETCH, SPEED, TURN_SPEED,
} from '../guests/rules.js';
import { SeatGlow } from '../guests/seat-glow.js';
import { collectSeats, seatUnder, type Seat } from '../guests/seats.js';
import { Walk, yawDelta } from '../guests/walker.js';
import { CafeSystem } from './cafe-system.js';
import { HandleSystem } from './handle-system.js';
import { HANDS, type Hand } from '../lib/hand-pinch.js';
import { HoldSystem } from './hold-system.js';

/**
 * arriving: walking up to the line. queued: in the line. held: in the
 * player's fingers. hop: in the air between two places (onto a seat,
 * back to the line, off a seat). seated. leaving: on the way out.
 */
export type GuestState = 'arriving' | 'queued' | 'held' | 'hop' | 'seated' | 'leaving';

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
  /** Seconds of patience left in the line, and what it started with. */
  patience: number;
  patienceFull: number;
  /** Leaving: the side it marches off to, and its lane. */
  side: Side;
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
  hop: Hop | null;
}

/** Leavers march once they are out on the table in front of the plate (z beyond this, café space). */
const MARCH_FROM_Z = 0.33;
/** A step down or up of more than this is hopped, not walked (metres). */
const HOP_STEP_M = 0.01;
const HOP_HEIGHT_M = 0.014;

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
  private nextLane = 0;
  private holdSystem: HoldSystem | undefined;
  private handles: HandleSystem | undefined;
  private readonly pinched: Record<Hand, boolean> = { left: false, right: false };
  private readonly blobs = new Blobs(MAX_GUESTS + 2);
  private readonly at = new Vector3();
  private readonly head = new Vector3();
  private readonly targets: (Seat | null)[] = [null, null];

  init(): void {
    this.cafeSystem = this.world.getSystem(CafeSystem)!;
    this.holdSystem = this.world.getSystem(HoldSystem);
    this.handles = this.world.getSystem(HandleSystem);
    const cafe = this.cafeSystem.cafe;
    cafe.add(this.blobs.mesh);
    this.seats = collectSeats(cafe, this.cafeSystem.seats);
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
      if (guest.state === 'seated') this.sitting(guest, delta);
      if (guest.state === 'hop') this.hopping(guest, delta);
      else if (guest.state !== 'held') this.step(guest, delta);
      this.show(guest, delta);
    }
    this.blobs.end();
    this.glow.show(this.seats, this.targets, this.targets.some((t, i) => t !== null || this.carriedBy(HANDS[i]) !== undefined), delta);
    this.peak = Math.max(this.peak, this.guests.length);
  }

  /** Take every guest away (a new session, or the café placed afresh). */
  clear(): void {
    for (const guest of this.guests) guest.actor.dispose();
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
    const awayFromLine = this.guests.filter((g) => (g.state === 'held' || g.state === 'hop') && g.home && 'line' in g.home).length;
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
      side: 'left',
      lane: 0,
      ground: ARRIVAL_POINT.y,
      hand: null,
      home: null,
      target: null,
      seat: null,
      seatedFor: 0,
      hop: null,
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
      if (guest.spot === index) return;
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

  /** Out of the line and away (given up). */
  private leaveFromLine(guest: Guest): void {
    this.line.splice(this.line.indexOf(guest), 1);
    guest.spot = -1;
    this.startLeaving(guest, (side, lane) => pathFromQueue(guest.actor.root.position, side, lane));
  }

  /** Send a guest away along a path built for its side and lane. */
  private startLeaving(guest: Guest, path: (side: Side, lane: number) => Vector3[]): void {
    guest.state = 'leaving';
    guest.side = Math.random() < 0.5 ? 'left' : 'right';
    // Lanes are dealt in turn, so two guests leaving together walk side by side, not through each other.
    guest.lane = this.nextLane++ % MARCH_LANES_Z.length;
    guest.walk = new Walk(path(guest.side, guest.lane));
    guest.speed = SPEED.leave;
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
      // A pinch closing now, on a guest, with the hand free (not on the café's handles).
      if (!fresh || hold.holding.includes(hand) || this.handles?.near(pinch.point)) return;
      const guest = this.nearestGuest(pinch.point, 1);
      if (guest) this.pickUp(guest, hand);
    });
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
    guest.actor.play('Lifted');
    this.pickedUp++;
  }

  /** A carried guest hangs from the pinch by its grip, faces the player, and looks for a seat below. Returns the seat it would land on. */
  private carry(guest: Guest, pinch: Vector3, delta: number): Seat | null {
    const cafe = this.cafeSystem.cafe;
    const root = guest.actor.root;
    cafe.worldToLocal(this.at.copy(pinch));
    this.at.y -= GRIP_HEIGHT_M;
    root.position.lerp(this.at, 1 - Math.exp(-CARRY_FOLLOW * delta));
    // Face the player, so the face shows.
    cafe.worldToLocal(this.player.head.getWorldPosition(this.head));
    guest.targetYaw = Math.atan2(this.head.x - root.position.x, this.head.z - root.position.z);
    this.turn(guest, delta);
    const own = guest.home && 'seat' in guest.home ? guest.home.seat : null;
    // The seat the other hand's guest is aimed at is spoken for.
    const spoken = this.guests.find((g) => g !== guest && g.state === 'held')?.target ?? null;
    guest.target = seatUnder(this.seats, root.position, SEAT_REACH_M, own, spoken);
    return guest.target;
  }

  /** Let go: onto the glowing seat if there is one, else back where it came from. */
  private letGo(guest: Guest): void {
    const home = guest.home;
    const homeSeat = home && 'seat' in home ? home.seat : null;
    const seat = guest.target ?? homeSeat;
    guest.hand = null;
    guest.target = null;
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
      this.seated++;
    }
    guest.actor.play(fresh ? 'SitHappy' : 'SitIdle');
  }

  /** A seated guest: pleased, then eating, then idle; when its time is up it gets down and leaves. */
  private sitting(guest: Guest, delta: number): void {
    guest.seatedFor += delta;
    if (guest.seatedFor >= this.seatedSeconds) {
      this.standUp(guest);
      return;
    }
    const last = guest.seatedFor > this.seatedSeconds - Math.min(IDLE_LAST_SECONDS, this.seatedSeconds * 0.25);
    guest.actor.play(guest.seatedFor < HAPPY_SECONDS ? 'SitHappy' : last ? 'SitIdle' : 'SitEating');
  }

  /** Off the chair with a hop, to the nearest aisle, out of the door and away. */
  private standUp(guest: Guest): void {
    const seat = guest.seat!;
    seat.occupant = 0;
    guest.seat = null;
    this.hoppedOff++;
    const down = pathOffSeat(seat.position, seat.yaw);
    const landing = down[0];
    const next = down[1] ?? landing;
    // In the air it kicks its legs (the Lifted clip), as when carried.
    guest.actor.play('Lifted');
    this.startHop(guest, landing, Math.atan2(next.x - landing.x, next.z - landing.z), HOP.off, () => {
      this.startLeaving(guest, (side, lane) => [...down, ...pathFromInside(down[down.length - 1], side, lane).slice(1)]);
    });
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
    root.rotation.y = guest.yaw;
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
        // Out on the open table in front the walk becomes a march; and nobody treads on the heels of the one ahead.
        if (root.position.z > MARCH_FROM_Z) speed = SPEED.march;
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

  /** True if another leaver in the same lane and on the same side is just ahead. */
  private crowded(guest: Guest): boolean {
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
    guest.actor.setOpacity(opacity);
    guest.actor.update(delta);
    // A blob under everyone on their feet (not the seated, nor the carried).
    const p = guest.actor.root.position;
    if (guest.state !== 'seated' && guest.state !== 'held') this.blobs.add(p.x, guest.ground, p.z, opacity);
  }

  private remove(guest: Guest): void {
    for (const seat of this.seats) if (seat.occupant === guest.id) seat.occupant = 0;
    guest.actor.dispose();
    const i = this.guests.indexOf(guest);
    if (i >= 0) this.guests.splice(i, 1);
    const j = this.line.indexOf(guest);
    if (j >= 0) this.line.splice(j, 1);
  }
}
