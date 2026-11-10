/**
 * BaristaSystem: the staff. Six baristas run the café from behind the
 * counter.
 *
 * - Behind the counter each has a station on the duckboard. There they
 *   work (hands busy over the bar), and every few seconds do something
 *   else for a moment, as people do: shuffle a step along the bar, turn
 *   to the back bar for the kettle or the tins, look about, or wave when
 *   a guest joins the line.
 * - Every few seconds one of them, picked at random, takes a tray (tea or
 *   coffee), slips along the lane behind the others, comes round the end
 *   of the counter, and carries it out to a table (picked at random,
 *   likelier one with a guest at it). It serves with a lean, leaves the
 *   tray on the table, bows, and walks back to its station.
 * - A tray stays on its table for a while and is then cleared away.
 *
 * Baristas and trays are children of the café group, so they move, turn
 * and scale with it. Each barista is one draw call (see baristas/barista.ts).
 */

import { AssetManager, createSystem, Vector3, type Material, type Mesh, type Object3D } from '@iwsdk/core';
import { Barista, BARISTA_NAMES, baristaLoaded, type BaristaName } from '../baristas/barista.js';
import { BACK_BAR_YAW, pathBack, pathOut, SERVE_POINTS, SHUFFLE_M, STATION_YAW, stationPoint, type ServePoint } from '../baristas/routes.js';
import { BACK_BAR_SECONDS, FIDGET_SECONDS, FIRST_TRIP_SECONDS, GUEST_TABLE_WEIGHT, MAX_OUT, SET_DOWN_AT, SPEED, TRAY_FADE_SECONDS, TRAY_STAYS_SECONDS, TRIP_SECONDS, TURN_SPEED, WAVE_CHANCE } from '../baristas/rules.js';
import { FLOOR_TOP_M } from '../cafe/layout.js';
import { Walk, yawDelta } from '../guests/walker.js';
import { CafeSystem } from './cafe-system.js';
import { GuestSystem } from './guest-system.js';

/**
 * working: at its station. shuffling: a step along the bar. backBar:
 * turned to the back bar. waving. out: carrying a tray to a table.
 * serving: the lean at the table. bowing. back: walking home.
 */
export type BaristaState = 'working' | 'shuffling' | 'backBar' | 'waving' | 'out' | 'serving' | 'bowing' | 'back';

export interface Staff {
  barista: Barista;
  station: number;
  state: BaristaState;
  /** Seconds in the current state, and how long it lasts (for the timed ones). */
  t: number;
  lasts: number;
  walk: Walk | null;
  speed: number;
  yaw: number;
  targetYaw: number;
  /** Where along the bar it stands, relative to its station (metres). */
  shift: number;
  /** The table it is serving, if out. */
  serving: ServePoint | null;
  /** Trips made (for the checks). */
  trips: number;
}

/** A tray left on a table. */
interface Served {
  tray: Object3D;
  table: number;
  age: number;
}

const TRAY_MODELS = ['tray-tea', 'tray-coffee'] as const;
const between = (range: [number, number]): number => range[0] + Math.random() * (range[1] - range[0]);

export class BaristaSystem extends createSystem({}) {
  readonly staff: Staff[] = [];
  /** Trays on tables now. */
  readonly served: Served[] = [];
  /** Tunables (the checks and recordings change them). */
  tripSeconds: [number, number] = [...TRIP_SECONDS];
  trayStaysSeconds = TRAY_STAYS_SECONDS;
  /** Set false to keep everyone behind the counter. */
  trips = true;
  /** Counts, for the checks. */
  servedCount = 0;
  private cafeSystem!: CafeSystem;
  private guests: GuestSystem | undefined;
  private nextTripIn = FIRST_TRIP_SECONDS;
  private placement = -1;
  private guestsSeen = 0;
  /** The table tops' heights, by layout index. */
  private readonly tableTop = new Map<number, number>();
  /** The shell's own copy of the bar palette, shared by the trays. */
  private palette: Material | null = null;
  private readonly at = new Vector3();

  init(): void {
    this.cafeSystem = this.world.getSystem(CafeSystem)!;
    this.guests = this.world.getSystem(GuestSystem);
    const cafe = this.cafeSystem.cafe;
    cafe.updateMatrixWorld(true);
    // A table's top is where its meal anchors are.
    for (const point of SERVE_POINTS) {
      const anchor = this.cafeSystem.pieces[point.table]?.getObjectByName('Meal-1');
      this.tableTop.set(point.table, anchor ? cafe.worldToLocal(anchor.getWorldPosition(this.at)).y : FLOOR_TOP_M + 0.022);
    }
    cafe.traverse((node) => {
      const material = (node as Mesh).material as Material | undefined;
      if (!this.palette && material && !Array.isArray(material) && material.name === 'CafeBarPalette') this.palette = material;
    });
  }

  update(frameDelta: number): void {
    const cafe = this.cafeSystem;
    const delta = Math.min(1, frameDelta) * cafe.timeScale;
    this.hire();
    if (cafe.placed && cafe.placements !== this.placement) {
      // The café has been put down afresh: everyone back to their station, the tables cleared.
      this.placement = cafe.placements;
      this.reset();
    }
    // In the desktop preview and while the café pops up they simply work; trips wait for the café to be down.
    const open = cafe.placed && !cafe.arriving;
    if (open) {
      this.greet();
      this.dispatch(delta);
    }
    for (const member of this.staff) {
      this.act(member, delta);
      this.move(member, delta);
      member.barista.update(delta);
    }
    this.clearTables(delta);
  }

  /** How many are out on the floor now. */
  get out(): number {
    return this.staff.filter((m) => m.state === 'out' || m.state === 'serving' || m.state === 'bowing' || m.state === 'back').length;
  }

  // ------------------------------------------------------------- the staff

  /** Bring on every barista whose model has loaded (they load in the background). */
  private hire(): void {
    if (this.staff.length === BARISTA_NAMES.length) return;
    BARISTA_NAMES.forEach((name: BaristaName, station) => {
      if (this.staff.some((m) => m.barista.name === name) || !baristaLoaded(name)) return;
      const barista = new Barista(name);
      barista.root.position.copy(stationPoint(station));
      barista.root.rotation.y = STATION_YAW;
      this.cafeSystem.cafe.add(barista.root);
      barista.play('Work');
      this.staff.push({ barista, station, state: 'working', t: Math.random() * 2, lasts: between(FIDGET_SECONDS), walk: null, speed: SPEED.walk, yaw: STATION_YAW, targetYaw: STATION_YAW, shift: 0, serving: null, trips: 0 });
    });
  }

  private reset(): void {
    for (const member of this.staff) {
      member.barista.hold(null);
      member.barista.root.position.copy(stationPoint(member.station));
      member.walk = null;
      member.serving = null;
      member.shift = 0;
      member.yaw = member.targetYaw = STATION_YAW;
      this.work(member);
    }
    for (const served of this.served) served.tray.removeFromParent();
    this.served.length = 0;
    this.nextTripIn = FIRST_TRIP_SECONDS;
  }

  private work(member: Staff): void {
    member.state = 'working';
    member.t = 0;
    member.lasts = between(FIDGET_SECONDS);
    member.targetYaw = STATION_YAW;
    member.barista.play('Work');
  }

  // --------------------------------------------------------------- trips

  /** Every few seconds, send someone out with a tray. */
  private dispatch(delta: number): void {
    this.nextTripIn -= delta;
    if (this.nextTripIn > 0) return;
    this.nextTripIn = 0.5;
    if (!this.trips || this.out >= MAX_OUT) return;
    const trayModel = TRAY_MODELS[Math.floor(Math.random() * TRAY_MODELS.length)];
    if (!AssetManager.getGLTF(trayModel, { shared: true })) return;
    const free = this.staff.filter((m) => m.state === 'working');
    const table = this.pickTable();
    if (free.length === 0 || !table) return;
    const member = free[Math.floor(Math.random() * free.length)];
    member.barista.hold(this.makeTray(trayModel));
    member.serving = table;
    member.state = 'out';
    member.walk = new Walk(pathOut(member.station, member.shift, table));
    member.speed = SPEED.carry;
    member.trips++;
    this.nextTripIn = between(this.tripSeconds);
  }

  /** A table nobody is heading for and with no tray on it, at random; likelier one with a guest seated at it. */
  private pickTable(): ServePoint | null {
    const busy = new Set<number>([...this.served.map((s) => s.table), ...this.staff.filter((m) => m.serving).map((m) => m.serving!.table)]);
    const options = SERVE_POINTS.filter((point) => !busy.has(point.table));
    if (options.length === 0) return null;
    const weights = options.map((point) => (this.guestAt(point) ? GUEST_TABLE_WEIGHT : 1));
    let roll = Math.random() * weights.reduce((sum, w) => sum + w, 0);
    for (let i = 0; i < options.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return options[i];
    }
    return options[options.length - 1];
  }

  /** Is a guest seated within a table's reach of this serve point's table? */
  private guestAt(point: ServePoint): boolean {
    return !!this.guests?.seats.some((seat) => seat.occupant !== 0 && Math.hypot(seat.position.x - point.tray.x, seat.position.z - point.tray.z) < 0.06);
  }

  /** A fresh tray, painted with the shell's own bar palette (the same atlas; one material for all the bar props and trays). */
  private makeTray(model: (typeof TRAY_MODELS)[number]): Object3D {
    const scene = AssetManager.getGLTF(model)!.scene;
    const tray = scene.getObjectByName(model) ?? scene;
    tray.removeFromParent();
    tray.userData.dynamic = true;
    tray.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      if (this.palette) mesh.material = this.palette;
    });
    return tray;
  }

  /** The tray leaves the hands and stays on the table. */
  private setDown(member: Staff): void {
    const tray = member.barista.tray;
    const point = member.serving;
    if (!tray || !point) return;
    member.barista.tray = null;
    this.cafeSystem.cafe.add(tray);
    tray.position.set(point.tray.x, this.tableTop.get(point.table) ?? FLOOR_TOP_M + 0.022, point.tray.z);
    tray.rotation.set(0, member.yaw, 0);
    tray.scale.setScalar(1);
    this.served.push({ tray, table: point.table, age: 0 });
    this.servedCount++;
  }

  private clearTables(delta: number): void {
    for (let i = this.served.length - 1; i >= 0; i--) {
      const served = this.served[i];
      served.age += delta;
      const left = this.trayStaysSeconds + TRAY_FADE_SECONDS - served.age;
      if (left < TRAY_FADE_SECONDS) served.tray.scale.setScalar(Math.max(0.001, left / TRAY_FADE_SECONDS));
      if (left > 0) continue;
      served.tray.removeFromParent();
      this.served.splice(i, 1);
    }
  }

  // ------------------------------------------------------------ behaviour

  /** When a guest joins the line, someone behind the counter may wave. */
  private greet(): void {
    const arrived = this.guests?.arrived ?? 0;
    if (arrived === this.guestsSeen) return;
    this.guestsSeen = arrived;
    if (Math.random() > WAVE_CHANCE) return;
    const free = this.staff.filter((m) => m.state === 'working');
    if (free.length === 0) return;
    const member = free[Math.floor(Math.random() * free.length)];
    member.state = 'waving';
    member.t = 0;
    member.lasts = member.barista.seconds('Wave');
    member.barista.play('Wave', true);
  }

  /** What a barista does next, by its state. */
  private act(member: Staff, delta: number): void {
    member.t += delta;
    const barista = member.barista;
    switch (member.state) {
      case 'working':
        if (member.t >= member.lasts) this.fidget(member);
        break;
      case 'backBar':
      case 'waving':
        if (member.t >= member.lasts) this.work(member);
        break;
      case 'serving':
        if (barista.tray && member.t >= SET_DOWN_AT) this.setDown(member);
        if (member.t >= member.lasts) {
          member.state = 'bowing';
          member.t = 0;
          member.lasts = barista.seconds('Bow');
          barista.play('Bow', true);
        }
        break;
      case 'bowing':
        if (member.t >= member.lasts) {
          member.state = 'back';
          member.walk = new Walk(pathBack(member.serving!, member.station));
          member.speed = SPEED.walk;
          member.shift = 0;
          member.serving = null;
        }
        break;
      default:
        break;
    }
  }

  /** Behind the counter: a step along the bar, a turn to the back bar, or a look about. */
  private fidget(member: Staff): void {
    const roll = Math.random();
    if (roll < 0.45) {
      const shift = (Math.random() * 2 - 1) * SHUFFLE_M;
      member.state = 'shuffling';
      member.walk = new Walk([member.barista.root.position, stationPoint(member.station, shift)]);
      member.speed = SPEED.shuffle;
      member.shift = shift;
    } else if (roll < 0.75) {
      member.state = 'backBar';
      member.t = 0;
      member.lasts = between(BACK_BAR_SECONDS);
      member.targetYaw = BACK_BAR_YAW;
      member.barista.play('Work');
    } else {
      member.state = 'backBar';
      member.t = 0;
      member.lasts = member.barista.seconds('Idle');
      member.targetYaw = STATION_YAW;
      member.barista.play('Idle');
    }
  }

  // ----------------------------------------------------------------- moving

  /** Advance along a walk, facing the way of travel; finish the walk when it ends. */
  private move(member: Staff, delta: number): void {
    const root = member.barista.root;
    const walk = member.walk;
    if (walk) {
      const done = walk.advance(member.speed * delta);
      walk.position(root.position);
      // A shuffle along the bar is a sidestep: it keeps facing the counter.
      if (member.state !== 'shuffling') member.targetYaw = walk.heading(member.targetYaw);
      member.barista.play(member.barista.tray ? 'Carry' : 'Walk');
      if (done) this.arrive(member);
    }
    const turn = yawDelta(member.yaw, member.targetYaw);
    member.yaw += Math.sign(turn) * Math.min(Math.abs(turn), TURN_SPEED * delta);
    root.rotation.y = member.yaw;
  }

  private arrive(member: Staff): void {
    member.walk = null;
    if (member.state === 'out') {
      // At the table: face it, and serve.
      member.state = 'serving';
      member.t = 0;
      member.lasts = member.barista.seconds('Serve');
      member.targetYaw = member.serving!.yaw;
      member.barista.play('Serve', true);
      return;
    }
    this.work(member);
  }
}
