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
 * - Leaving: every guest who leaves goes toward the front, then marches
 *   off left or right (at random) along the table in front of the café,
 *   in lanes so they do not bunch, and fades out at the end.
 *
 * Guests are children of the café group, so they move, turn and scale
 * with it. Picking up and seating is in the second half of this file's
 * job (see `seat-system.ts` for the seats and the glow).
 */

import { createSystem, Vector3 } from '@iwsdk/core';
import { castLoaded, GuestActor, WALK_CLIP_SPEED } from '../guests/actor.js';
import { Blobs } from '../guests/blobs.js';
import { randomLook, type Look } from '../guests/cast.js';
import { ARRIVAL_POINT, MARCH_LANES_Z, pathFromQueue, QUEUE_SPOTS, QUEUE_YAW, type Side } from '../guests/paths.js';
import { FADE_IN_M, FADE_OUT_M, FIRST_SPAWN_SECONDS, FOLLOW_GAP_M, IMPATIENT_AFTER, MAX_GUESTS, MAX_QUEUE, PATIENCE_SECONDS, PATIENCE_SPREAD, SEATED_SECONDS, SPAWN_SECONDS, SPAWN_STRETCH, SPEED, TURN_SPEED } from '../guests/rules.js';
import { Walk, yawDelta } from '../guests/walker.js';
import { CafeSystem } from './cafe-system.js';

export type GuestState = 'arriving' | 'queued' | 'leaving';

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
}

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
  /** Counts, for the checks. */
  arrived = 0;
  gaveUp = 0;
  left = 0;
  /** The most guests ever on stage at once. */
  peak = 0;
  private cafeSystem!: CafeSystem;
  private placement = -1;
  private nextSpawnIn = FIRST_SPAWN_SECONDS;
  private lastLook: Look | undefined;
  private nextLane = 0;
  private readonly blobs = new Blobs(MAX_GUESTS + 2);
  private readonly at = new Vector3();

  init(): void {
    this.cafeSystem = this.world.getSystem(CafeSystem)!;
    this.cafeSystem.cafe.add(this.blobs.mesh);
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
    this.keepLine();
    this.blobs.begin();
    for (const guest of [...this.guests]) {
      if (guest.state === 'queued') this.wait(guest, delta);
      this.step(guest, delta);
      this.show(guest, delta);
    }
    this.blobs.end();
    this.peak = Math.max(this.peak, this.guests.length);
  }

  /** Take every guest away (a new session, or the café placed afresh). */
  clear(): void {
    for (const guest of this.guests) guest.actor.dispose();
    this.guests.length = 0;
    this.line.length = 0;
    this.blobs.begin();
    this.blobs.end();
  }

  // ------------------------------------------------------------- arrivals

  private spawnTick(delta: number): void {
    this.nextSpawnIn -= delta;
    if (this.nextSpawnIn > 0) return;
    if (!this.arrivals || this.guests.length >= MAX_GUESTS || this.line.length >= MAX_QUEUE) {
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

  // ----------------------------------------------------------------- moving

  /** Advance a guest along its walk, face it the right way, and finish the walk when it ends. */
  private step(guest: Guest, delta: number): void {
    const root = guest.actor.root;
    const walk = guest.walk;
    if (walk) {
      let speed = guest.speed;
      if (guest.state === 'leaving') {
        // Out on the open table the walk becomes a march; and nobody treads on the heels of the one ahead.
        if (walk.remaining < walk.length * 0.6) speed = SPEED.march;
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
    guest.yaw += Math.sign(yawDelta(guest.yaw, guest.targetYaw)) * Math.min(Math.abs(yawDelta(guest.yaw, guest.targetYaw)), TURN_SPEED * delta);
    root.rotation.y = guest.yaw;
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
    const p = guest.actor.root.position;
    this.blobs.add(p.x, guest.ground, p.z, opacity);
  }

  private remove(guest: Guest): void {
    guest.actor.dispose();
    const i = this.guests.indexOf(guest);
    if (i >= 0) this.guests.splice(i, 1);
    const j = this.line.indexOf(guest);
    if (j >= 0) this.line.splice(j, 1);
  }
}
