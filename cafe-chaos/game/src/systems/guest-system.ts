/**
 * GuestSystem: the guests who come to the café and wait.
 *
 * - Arrivals: once the café is placed, a guest appears on the path outside
 *   the gate every few seconds (at random, 3 to 8 s apart), as long as
 *   there is room in the queue. Adults and the odd child, each in their
 *   own colour. They fade in as they walk through the gate and take the
 *   first free spot: the four slots on the waiting bench, then two
 *   standing spots inside the gate.
 * - Waiting: a patience bubble over each head counts down from 90 seconds.
 * - Giving up: when the timer runs out the guest turns, walks back out
 *   through the gate and fades away on the path, and everyone behind moves
 *   up a spot.
 *
 * Guests are children of the café group, so they move and scale with it.
 * The models are rigid (no walk cycle), so walking is a small bob and
 * sway. Picking guests up and seating them is the next phase.
 */

import { AssetManager, createSystem, Mesh, MeshStandardMaterial, Vector3, type Object3D } from '@iwsdk/core';
import type { ModelName } from '../assets.js';
import { PatienceBubble } from '../guests/patience-bubble.js';
import { BENCH_SLOTS, MAX_WAITING, pathIn, pathOut, STANDING_SPOTS, yawDelta, yawToward, type QueueSpot } from '../guests/queue.js';
import { CafeSystem, copyModel } from './cafe-system.js';

/** How long a guest waits before giving up (seconds). */
export const PATIENCE_SECONDS = 90;
/** Arrivals: the next guest comes this long after the last, at random (seconds). */
const SPAWN_RANGE: [number, number] = [3, 8];
/** The first guest arrives this long after the café is placed. */
const FIRST_SPAWN_SECONDS = 1.5;
/** Walking speed in the café's space (metres per second: 7 cm/s is a brisk little walk at this scale). */
const WALK_SPEED = 0.07;
/** How quickly a guest turns to face its way (radians per second). */
const TURN_SPEED = 6;
/** A guest appears over this much of its walk in, and fades over this much of its walk out. */
const FADE_IN_M = 0.1;
const FADE_OUT_M = 0.14;
/** One child in this many arrivals. */
const KID_CHANCE = 0.3;
/** The guests' coats. */
const COLORS = [0xf2b36a, 0x7fb8e6, 0xe98a9a, 0x8fd19a, 0xc3a3e6, 0xf5d26c, 0x7fd6c8, 0xf0b8a0];

type GuestState = 'arriving' | 'waiting' | 'leaving';

export interface Guest {
  root: Object3D;
  kind: ModelName;
  state: GuestState;
  /** Seconds of patience left. */
  patience: number;
  /** Its spot in the queue (0..MAX_WAITING-1), or -1 while leaving. */
  spot: number;
  /** The walk under way: waypoints in the café's space, and how far along it is. */
  path: Vector3[];
  walked: number;
  pathLength: number;
  /** The way it faces, and the way it should (yaw about +Y). */
  yaw: number;
  targetYaw: number;
  opacity: number;
  phase: number;
  bubble: PatienceBubble;
  bubbleAnchor: Object3D;
  materials: MeshStandardMaterial[];
}

export class GuestSystem extends createSystem({}) {
  readonly guests: Guest[] = [];
  /** How long guests wait (seconds); the recording shortens it. */
  patienceSeconds = PATIENCE_SECONDS;
  /** Seconds between arrivals, at random within this range. */
  spawnRange: [number, number] = SPAWN_RANGE;
  /** Arrivals so far, and those who gave up. */
  arrived = 0;
  gaveUp = 0;
  private cafeSystem!: CafeSystem;
  /** The café placement the guests belong to: a new one starts a fresh queue. */
  private placement = -1;
  private nextSpawnIn = FIRST_SPAWN_SECONDS;
  private spots: QueueSpot[] = [];
  private readonly eye = new Vector3();
  private readonly at = new Vector3();
  private readonly scratch = new Vector3();

  init(): void {
    this.cafeSystem = this.world.getSystem(CafeSystem)!;
  }

  update(delta: number): void {
    const cafe = this.cafeSystem;
    if (!cafe.placed) {
      if (this.guests.length) this.clear();
      this.nextSpawnIn = FIRST_SPAWN_SECONDS;
      return;
    }
    if (cafe.placements !== this.placement) {
      // The café was (re)placed: everyone out, and the bench's spots read again where it now stands.
      this.clear();
      this.placement = cafe.placements;
      this.nextSpawnIn = FIRST_SPAWN_SECONDS;
    }
    if (!this.spots.length) this.readSpots();
    this.spawnTick(delta);
    this.world.camera.getWorldPosition(this.eye);
    for (const guest of [...this.guests]) {
      this.walk(guest, delta);
      if (guest.state === 'waiting') this.wait(guest, delta);
      this.show(guest);
    }
  }

  /** Take every guest away (a new session, or the café moving). */
  clear(): void {
    for (const guest of this.guests) this.remove(guest);
    this.guests.length = 0;
    this.spots = [];
  }

  // ------------------------------------------------------------- arrivals

  private spawnTick(delta: number): void {
    this.nextSpawnIn -= delta;
    if (this.nextSpawnIn > 0) return;
    const [min, max] = this.spawnRange;
    this.nextSpawnIn = min + Math.random() * (max - min);
    if (this.waitingCount() >= MAX_WAITING) return;
    this.spawn();
  }

  /** Those arriving or waiting (not the ones on their way out). */
  waitingCount(): number {
    return this.guests.filter((g) => g.state !== 'leaving').length;
  }

  private spawn(): void {
    const kind: ModelName = Math.random() < KID_CHANCE ? 'guest-kid' : 'guest';
    // The guest models load in the background: if this one is not in yet, try again shortly.
    if (!AssetManager.getGLTF(kind)) {
      this.nextSpawnIn = 0.5;
      return;
    }
    const root = copyModel(kind);
    root.name = `Guest-${++this.arrived}`;
    root.getObjectByName('Seated')!.visible = false;
    root.getObjectByName('Standing')!.visible = true;
    // Its own materials, so it can be tinted and faded on its own.
    const materials: MeshStandardMaterial[] = [];
    const tint = COLORS[(this.arrived * 5) % COLORS.length];
    root.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const material = (node.material as MeshStandardMaterial).clone();
      material.transparent = true;
      material.opacity = 0;
      if (material.name === 'GuestBody') material.color.setHex(tint);
      node.material = material;
      materials.push(material);
    });
    const spot = this.firstFreeSpot();
    const path = pathIn(this.spots[spot]);
    const bubble = new PatienceBubble();
    bubble.opacity = 0;
    const guest: Guest = {
      root,
      kind,
      state: 'arriving',
      patience: this.patienceSeconds,
      spot,
      path,
      walked: 0,
      pathLength: pathLength(path),
      yaw: yawToward(path[1].x - path[0].x, path[1].z - path[0].z),
      targetYaw: 0,
      opacity: 0,
      phase: Math.random() * 10,
      bubble,
      bubbleAnchor: root.getObjectByName('BubbleAnchor') ?? root,
      materials,
    };
    guest.targetYaw = guest.yaw;
    root.position.copy(path[0]);
    root.rotation.y = guest.yaw;
    const cafe = this.cafeSystem.cafe;
    cafe.add(root);
    cafe.add(bubble.mesh);
    this.guests.push(guest);
  }

  private firstFreeSpot(): number {
    const taken = new Set(this.guests.filter((g) => g.state !== 'leaving').map((g) => g.spot));
    for (let i = 0; i < MAX_WAITING; i++) if (!taken.has(i)) return i;
    return MAX_WAITING - 1;
  }

  /** The bench's slots (from its anchors, in the café's space) and the standing spots. */
  private readSpots(): void {
    const cafe = this.cafeSystem.cafe;
    cafe.updateWorldMatrix(true, true);
    const bench = this.cafeSystem.pieces.find((p) => p.name === 'waiting-bench');
    const slots: QueueSpot[] = [];
    for (let i = 1; i <= BENCH_SLOTS; i++) {
      const anchor = bench?.getObjectByName(`Slot-${i}`);
      if (!anchor) continue;
      const position = cafe.worldToLocal(anchor.getWorldPosition(new Vector3()));
      // The anchor faces the way a guest should: read its +Z in the café's space.
      const forward = cafe.worldToLocal(anchor.localToWorld(new Vector3(0, 0, 1))).sub(position);
      slots.push({ position, yaw: yawToward(forward.x, forward.z) });
    }
    this.spots = [...slots, ...STANDING_SPOTS];
  }

  // --------------------------------------------------------------- walking

  /** Move along the path at walking speed, turning to face the way; arrive, or vanish at the end. */
  private walk(guest: Guest, delta: number): void {
    const root = guest.root;
    if (guest.walked < guest.pathLength) {
      guest.walked = Math.min(guest.pathLength, guest.walked + WALK_SPEED * delta);
      const heading = pointAlong(guest.path, guest.walked, this.at, this.scratch);
      root.position.copy(this.at);
      if (heading.lengthSq() > 1e-8) guest.targetYaw = yawToward(heading.x, heading.z);
      // A little bob and sway stand in for a walk cycle.
      guest.phase += delta * 16;
      root.position.y += 0.002 * Math.abs(Math.sin(guest.phase));
      root.rotation.z = 0.06 * Math.sin(guest.phase / 2);
      // Fading in near the start of the way in; fading out toward the end of the way out.
      if (guest.state === 'arriving') guest.opacity = Math.min(1, guest.walked / FADE_IN_M);
      if (guest.state === 'leaving') guest.opacity = Math.max(0, Math.min(1, (guest.pathLength - guest.walked) / FADE_OUT_M));
    } else if (guest.state === 'arriving') {
      guest.state = 'waiting';
      guest.opacity = 1;
      root.rotation.z = 0;
      guest.targetYaw = this.spots[guest.spot].yaw;
    } else if (guest.state === 'leaving') {
      this.remove(guest);
      this.guests.splice(this.guests.indexOf(guest), 1);
      return;
    } else {
      root.rotation.z = 0;
      guest.targetYaw = this.spots[guest.spot].yaw;
    }
    const turn = yawDelta(guest.yaw, guest.targetYaw);
    guest.yaw += Math.sign(turn) * Math.min(Math.abs(turn), TURN_SPEED * delta);
    root.rotation.y = guest.yaw;
  }

  // --------------------------------------------------------------- waiting

  private wait(guest: Guest, delta: number): void {
    guest.patience -= delta;
    if (guest.patience > 0) return;
    this.giveUp(guest);
  }

  /** Out of patience: walk back out through the gate; those behind move up. */
  private giveUp(guest: Guest): void {
    guest.state = 'leaving';
    guest.patience = 0;
    guest.spot = -1;
    this.setPath(guest, pathOut(guest.root.position));
    this.gaveUp++;
    this.shuffleUp();
  }

  /** Everyone waiting takes the lowest spots, in the order they arrived; whoever moves walks there. */
  private shuffleUp(): void {
    const waiting = this.guests.filter((g) => g.state !== 'leaving');
    waiting.forEach((guest, i) => {
      if (guest.spot === i) return;
      guest.spot = i;
      const target = this.spots[i].position;
      if (guest.state === 'waiting') {
        this.setPath(guest, [guest.root.position.clone().setY(target.y), target.clone()]);
      } else {
        // Still on the way in: head for the new spot from here.
        const here = guest.root.position.clone();
        const ahead = guest.path.slice(indexAfter(guest.path, guest.walked), -1);
        this.setPath(guest, [here, ...ahead, target.clone()]);
        guest.opacity = Math.max(guest.opacity, 0);
      }
    });
  }

  private setPath(guest: Guest, path: Vector3[]): void {
    guest.path = path;
    guest.walked = 0;
    guest.pathLength = pathLength(path);
  }

  // ---------------------------------------------------------------- looks

  /** Opacity on the materials; the bubble over the head, facing the player, only while waiting. */
  private show(guest: Guest): void {
    for (const material of guest.materials) material.opacity = guest.opacity;
    const bubble = guest.bubble;
    const shown = guest.state === 'waiting' || (guest.state === 'arriving' && guest.walked > guest.pathLength * 0.5);
    bubble.mesh.visible = shown;
    if (!shown) return;
    bubble.update(guest.patience, this.patienceSeconds);
    bubble.opacity = guest.opacity;
    guest.bubbleAnchor.getWorldPosition(this.at);
    const cafe = this.cafeSystem.cafe;
    cafe.worldToLocal(this.at);
    bubble.mesh.position.set(this.at.x, this.at.y + 0.018, this.at.z);
    // Face the player: the eye in the café's space.
    cafe.worldToLocal(this.scratch.copy(this.eye));
    bubble.mesh.rotation.set(-0.2, yawToward(this.scratch.x - this.at.x, this.scratch.z - this.at.z), 0, 'YXZ');
  }

  private remove(guest: Guest): void {
    guest.root.removeFromParent();
    guest.bubble.dispose();
    for (const material of guest.materials) material.dispose();
  }
}

// ------------------------------------------------------------------ paths

function pathLength(path: Vector3[]): number {
  let length = 0;
  for (let i = 1; i < path.length; i++) length += path[i].distanceTo(path[i - 1]);
  return length;
}

/** The point `distance` along a path (into `out`) and the heading there (into `heading`). */
function pointAlong(path: Vector3[], distance: number, out: Vector3, heading: Vector3): Vector3 {
  let left = distance;
  for (let i = 1; i < path.length; i++) {
    const segment = path[i].distanceTo(path[i - 1]);
    if (left <= segment || i === path.length - 1) {
      const t = segment > 0 ? Math.min(1, left / segment) : 1;
      out.lerpVectors(path[i - 1], path[i], t);
      heading.subVectors(path[i], path[i - 1]);
      return heading;
    }
    left -= segment;
  }
  out.copy(path[path.length - 1]);
  heading.set(0, 0, 0);
  return heading;
}

/** The index of the first waypoint still ahead at `distance` along the path. */
function indexAfter(path: Vector3[], distance: number): number {
  let left = distance;
  for (let i = 1; i < path.length; i++) {
    const segment = path[i].distanceTo(path[i - 1]);
    if (left <= segment) return i;
    left -= segment;
  }
  return path.length - 1;
}
