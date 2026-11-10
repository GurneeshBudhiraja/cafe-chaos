/**
 * BaristaSystem: the staff. Six servers run the café from behind the
 * counter, and bring each guest its order.
 *
 * - Behind the counter each has a station on the duckboard. There they
 *   work (hands busy over the bar), and every few seconds do something
 *   else for a moment, as people do: shuffle a step along the bar, turn
 *   to the back bar for the kettle or the tins, look about, or wave when
 *   a guest joins the line.
 * - Orders. The moment a guest is seated it has an order. A server takes
 *   a tray (tea or coffee), comes round the end of the counter, carries
 *   it to that guest, serves with a lean, sets the tray down at the
 *   guest's own place, bows, and walks back. The guest eats from then on;
 *   the tray is cleared when the guest leaves.
 * - Who serves whom (the dispatcher, `plan`):
 *   1. From the bar it is first come, first served: the oldest waiting
 *      orders go first, as many as may set off (never more than `maxOut`
 *      servers out at once). Orders placed together count as equals, and
 *      among them the nearer goes first. Each order goes to the free
 *      server that makes the walking, in all, least.
 *   2. On the way: a server walking to one guest turns to a waiting guest
 *      that is nearer it, and the guest it was walking to goes back to
 *      the front of the queue for the next server. An order can be passed
 *      over like this only once, so nobody is starved; and a server only
 *      turns for a real saving, so nobody dithers.
 *   3. Two servers on their way swap guests if that is less walking in
 *      all.
 *   "Nearer" is always real walking distance on the navigation grid,
 *   round the tables, not a straight line: a guest just across a table
 *   can be far, one down the aisle near.
 *   The plan is made again whenever a guest is seated or leaves, a server
 *   comes free, or orders are still waiting.
 *
 * Servers and trays are children of the café group, so they move, turn
 * and scale with it. Each server is one draw call (baristas/barista.ts).
 * Nobody is told a route: the ways are found on the navigation grid.
 */

import { AssetManager, createSystem, Vector3, type Material, type Mesh, type Object3D } from '@iwsdk/core';
import { Barista, BARISTA_NAMES, baristaLoaded, type BaristaName } from '../baristas/barista.js';
import { BACK_BAR_YAW, servePointFor, servePointsForPlace, SHUFFLE_M, STATION_YAW, stationPoint, type ServePoint } from '../baristas/routes.js';
import { BACK_BAR_SECONDS, FIDGET_SECONDS, MAX_OUT, REPLAN_SECONDS, SAME_TIME_SECONDS, SET_DOWN_AT, SPEED, SWITCH_GAIN_M, TRAY_FADE_SECONDS, TRAY_SLIDE_SECONDS, TURN_SPEED, WAVE_CHANCE } from '../baristas/rules.js';
import type { Seat } from '../guests/seats.js';
import { Walk, yawDelta } from '../guests/walker.js';
import { CafeSystem } from './cafe-system.js';
import { GuestSystem } from './guest-system.js';

/**
 * working: at its station. shuffling: a step along the bar. backBar:
 * turned to the back bar. waving. out: carrying a tray to a guest.
 * serving: the lean at the table. bowing. back: walking home.
 */
export type BaristaState = 'working' | 'shuffling' | 'backBar' | 'waving' | 'out' | 'serving' | 'bowing' | 'back';

/** A guest's order, from the moment it is seated until it leaves the seat. */
export interface Order {
  id: number;
  /** The guest's id, and the seat it is on. */
  guest: number;
  seat: Seat;
  /** The places a server could stand to serve it (one on each open side of its place at the table)... */
  points: ServePoint[];
  /** ...and the one the server bringing it is making for (where its tray goes is the same for all). */
  point: ServePoint;
  /** When it was placed (seconds on the café's clock). */
  placedAt: number;
  /** The server bringing it, if one is. */
  server: Staff | null;
  served: boolean;
  /** How many times a server on its way to this order was sent to a nearer one instead (for the checks). */
  bumped: number;
}

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
  /** The order it is bringing, if out. */
  order: Order | null;
  /** Trips made (for the checks). */
  trips: number;
}

/** A tray set down for a guest: it slides into place, stays while the guest does, and fades when the guest has gone. */
interface Served {
  tray: Object3D;
  order: Order;
  from: Vector3;
  slide: number;
  /** Seconds since its guest left (negative: the guest is still there). */
  fading: number;
}

const TRAY_MODELS = ['tray-tea', 'tray-coffee'] as const;
const between = (range: [number, number]): number => range[0] + Math.random() * (range[1] - range[0]);
const lengthOf = (path: Vector3[]): number => path.reduce((sum, p, i) => (i ? sum + p.distanceTo(path[i - 1]) : 0), 0);
const atBar = (member: Staff): boolean => member.state === 'working' || member.state === 'shuffling' || member.state === 'backBar' || member.state === 'waving';

export class BaristaSystem extends createSystem({}) {
  readonly staff: Staff[] = [];
  /** Every order in the café now, oldest first. */
  readonly orders: Order[] = [];
  /** Trays on tables now. */
  readonly served: Served[] = [];
  /** How many servers may be out at once (the checks change it). */
  maxOut = MAX_OUT;
  /** Set false to keep everyone behind the counter. */
  serving = true;
  /** Counts, for the checks. */
  servedCount = 0;
  switches = 0;
  /** The guests served, in the order they were served. */
  readonly servedLog: number[] = [];
  /** Where to stand to serve each table (see `findTables`). */
  servePoints: ServePoint[] = [];
  private cafeSystem!: CafeSystem;
  private guests: GuestSystem | undefined;
  private placement = -1;
  private guestsSeen = 0;
  private clock = 0;
  private nextOrder = 1;
  /** True when something has changed that the plan should take in. */
  private dirty = false;
  private sinceplan = 0;
  private readonly seatPoints = new Map<number, ServePoint[]>();
  /** The shell's own copy of the bar palette, shared by the trays. */
  private palette: Material | null = null;
  private readonly at = new Vector3();

  init(): void {
    this.cafeSystem = this.world.getSystem(CafeSystem)!;
    this.guests = this.world.getSystem(GuestSystem);
    const cafe = this.cafeSystem.cafe;
    cafe.updateMatrixWorld(true);
    this.findTables();
    cafe.traverse((node) => {
      const material = (node as Mesh).material as Material | undefined;
      if (!this.palette && material && !Array.isArray(material) && material.name === 'CafeBarPalette') this.palette = material;
    });
  }

  /**
   * Find the tables and where to stand at each: any piece of the café
   * with a meal anchor is a table, its top is at that anchor's height,
   * and the navigation grid says where there is room to stand by it.
   * Call again after the furniture changes (and after `nav.rebuild()`).
   */
  findTables(): void {
    const cafe = this.cafeSystem.cafe;
    cafe.updateMatrixWorld(true);
    this.servePoints = [];
    this.seatPoints.clear();
    this.cafeSystem.pieces.forEach((piece, table) => {
      const anchor = piece.getObjectByName('Meal-1');
      if (!anchor) return;
      const top = cafe.worldToLocal(anchor.getWorldPosition(this.at)).y;
      const centre = cafe.worldToLocal(piece.getWorldPosition(new Vector3()));
      const point = servePointFor(this.cafeSystem.nav, table, centre, top);
      if (point) this.servePoints.push(point);
    });
  }

  update(frameDelta: number): void {
    const cafe = this.cafeSystem;
    const delta = Math.min(1, frameDelta) * cafe.timeScale;
    this.clock += delta;
    this.hire();
    if (cafe.placed && cafe.placements !== this.placement) {
      // The café has been put down afresh: everyone back to their station, the tables cleared.
      this.placement = cafe.placements;
      this.reset();
    }
    // In the desktop preview and while the café pops up they simply work; orders wait for the café to be down.
    if (cafe.placed && !cafe.arriving) {
      this.greet();
      this.takeOrders();
      this.sinceplan += delta;
      const waiting = this.orders.some((order) => !order.served && !order.server);
      if (this.serving && (this.dirty || (waiting && this.sinceplan >= REPLAN_SECONDS))) this.plan();
    }
    for (const member of this.staff) {
      this.act(member, delta);
      this.move(member, delta);
      member.barista.update(delta);
    }
    this.keepTrays(delta);
  }

  /** How many are out on the floor now. */
  get out(): number {
    return this.staff.filter((m) => !atBar(m)).length;
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
      this.staff.push({ barista, station, state: 'working', t: Math.random() * 2, lasts: between(FIDGET_SECONDS), walk: null, speed: SPEED.walk, yaw: STATION_YAW, targetYaw: STATION_YAW, shift: 0, order: null, trips: 0 });
      this.dirty = true;
    });
  }

  private reset(): void {
    for (const member of this.staff) {
      member.barista.hold(null);
      member.barista.root.position.copy(stationPoint(member.station));
      member.walk = null;
      member.order = null;
      member.shift = 0;
      member.yaw = member.targetYaw = STATION_YAW;
      this.work(member);
    }
    for (const served of this.served) served.tray.removeFromParent();
    this.served.length = 0;
    this.orders.length = 0;
  }

  private work(member: Staff): void {
    member.state = 'working';
    member.t = 0;
    member.lasts = between(FIDGET_SECONDS);
    member.targetYaw = STATION_YAW;
    member.barista.play('Work');
    // A server back at the bar can take the next order.
    this.dirty = true;
  }

  // --------------------------------------------------------------- orders

  /** A seated guest has an order; a guest that has left its seat has none. */
  private takeOrders(): void {
    const guests = this.guests;
    if (!guests) return;
    for (let i = this.orders.length - 1; i >= 0; i--) {
      const order = this.orders[i];
      const guest = guests.guests.find((g) => g.id === order.guest);
      if (guest && guest.state === 'seated' && guest.seat === order.seat) continue;
      // Gone (or moved to another seat): the order is off, and a server on its way to it is free to be sent elsewhere.
      if (order.server) order.server.order = null;
      this.orders.splice(i, 1);
      this.dirty = true;
    }
    for (const guest of guests.guests) {
      if (guest.state !== 'seated' || !guest.seat || guest.served || this.orders.some((o) => o.guest === guest.id)) continue;
      const points = this.pointsFor(guest.seat);
      if (points.length === 0) continue;
      this.orders.push({ id: this.nextOrder++, guest: guest.id, seat: guest.seat, points, point: points[0], placedAt: this.clock, server: null, served: false, bumped: 0 });
      this.dirty = true;
    }
  }

  /** The places to stand to serve the guest on a seat (worked out once a seat, from the navigation grid). */
  private pointsFor(seat: Seat): ServePoint[] {
    let points = this.seatPoints.get(seat.index);
    if (!points) {
      const table = this.servePoints.find((p) => p.table === seat.table);
      points = seat.meal ? servePointsForPlace(this.cafeSystem.nav, seat.table, seat.meal) : table ? [table] : [];
      this.seatPoints.set(seat.index, points);
    }
    return points;
  }

  /**
   * The shortest way for a server to an order: to whichever of the
   * order's standing places it can walk to soonest from `from`. Null if
   * it can reach none.
   */
  private wayTo(from: Vector3, order: Order): { way: Vector3[]; point: ServePoint; length: number } | null {
    let best: { way: Vector3[]; point: ServePoint; length: number } | null = null;
    for (const point of order.points) {
      const way = this.cafeSystem.nav.findPath(from, point.stand);
      if (!way) continue;
      const length = lengthOf(way);
      if (!best || length < best.length) best = { way, point, length };
    }
    return best;
  }

  /**
   * The dispatcher: decide who brings which order (see the notes at the
   * top of this file).
   */
  private plan(): void {
    this.dirty = false;
    this.sinceplan = 0;
    const enRoute = this.staff.filter((m) => m.state === 'out');
    const free = this.staff.filter(atBar);
    const busy = this.staff.filter((m) => m.state === 'serving' || m.state === 'bowing' || m.state === 'back').length;

    // The walking distance from a server to an order, worked out when asked for and remembered for this plan
    // (a free server's is from its station, which the grid remembers between plans too).
    const cost = new Map<Order, Map<Staff, number>>();
    const distance = (member: Staff, order: Order): number => {
      let row = cost.get(order);
      if (!row) cost.set(order, (row = new Map()));
      let d = row.get(member);
      if (d === undefined) {
        const from = atBar(member) ? stationPoint(member.station) : member.barista.root.position;
        d = this.wayTo(from, order)?.length ?? Infinity;
        row.set(member, d);
      }
      return d;
    };
    const waiting = (): Order[] => this.orders.filter((order) => !order.served && !order.server);

    // A server out with a tray but no order (its guest left) takes a waiting order if there is one, else goes home.
    for (const member of enRoute) {
      if (member.order) continue;
      const next = waiting().sort((a, b) => distance(member, a) - distance(member, b))[0];
      if (next && distance(member, next) < Infinity) this.send(member, next);
      else this.sendHome(member);
    }

    // 1. From the bar: first come, first served. The oldest waiting orders, as many as may set off now; orders
    //    placed together are equals, the nearer first. Each goes to a free server so the walking in all is least.
    const departures = Math.max(0, Math.min(free.length, this.maxOut - busy - this.staff.filter((m) => m.state === 'out').length));
    if (departures > 0 && free.length > 0) {
      const nearestFree = (order: Order): number => Math.min(...free.map((member) => distance(member, order)));
      const next = waiting()
        .filter((order) => nearestFree(order) < Infinity)
        .sort((a, b) => (Math.abs(a.placedAt - b.placedAt) > SAME_TIME_SECONDS ? a.placedAt - b.placedAt : nearestFree(a) - nearestFree(b)))
        .slice(0, departures);
      let best: Staff[] | null = null;
      let bestCost = Infinity;
      const pick: Staff[] = [];
      const match = (i: number, total: number): void => {
        if (total >= bestCost) return;
        if (i === next.length) {
          best = [...pick];
          bestCost = total;
          return;
        }
        for (const member of free) {
          if (pick.includes(member)) continue;
          const d = distance(member, next[i]);
          if (d === Infinity) continue;
          pick.push(member);
          match(i + 1, total + d);
          pick.pop();
        }
      };
      match(0, 0);
      const matched: Staff[] = best ?? [];
      next.forEach((order, i) => matched[i] && this.send(matched[i], order));
    }

    // 2. On the way: a server walking to one guest turns to a waiting guest that is nearer it (by a real margin).
    //    The guest it was walking to goes back to the front of the queue, and cannot be passed over again.
    const walking = this.staff.filter((m) => m.state === 'out' && m.order);
    for (const member of walking) {
      const mine = member.order!;
      if (mine.bumped > 0) continue;
      const nearer = waiting()
        .filter((order) => distance(member, order) + SWITCH_GAIN_M < distance(member, mine))
        .sort((a, b) => distance(member, a) - distance(member, b))[0];
      if (!nearer) continue;
      mine.server = null;
      mine.bumped++;
      this.switches++;
      this.send(member, nearer);
      // The one passed over wants a server as soon as one can go.
      this.dirty = true;
    }

    // 3. Two servers on their way swap guests if that is less walking in all (each then has the nearer of the two).
    for (let i = 0; i < walking.length; i++) {
      for (let j = i + 1; j < walking.length; j++) {
        const a = walking[i];
        const b = walking[j];
        if (!a.order || !b.order) continue;
        if (distance(a, b.order) + distance(b, a.order) + SWITCH_GAIN_M >= distance(a, a.order) + distance(b, b.order)) continue;
        const [first, second] = [a.order, b.order];
        this.switches++;
        this.send(a, second);
        this.send(b, first);
      }
    }
  }

  /** Send a server to an order: from the bar it takes a tray and sets off; already out, it turns to the new guest. */
  private send(member: Staff, order: Order): void {
    const route = this.wayTo(member.barista.root.position, order);
    if (!route) return;
    if (!member.barista.tray) {
      const model = TRAY_MODELS[Math.floor(Math.random() * TRAY_MODELS.length)];
      if (!AssetManager.getGLTF(model, { shared: true })) {
        // The trays are still loading: try again at the next plan.
        this.dirty = true;
        return;
      }
      member.barista.hold(this.makeTray(model));
      member.trips++;
    }
    member.order = order;
    order.server = member;
    order.point = route.point;
    member.state = 'out';
    member.walk = new Walk(route.way);
    member.speed = SPEED.carry;
  }

  /** Back to its station (with its tray, if it never served it). */
  private sendHome(member: Staff): void {
    member.order = null;
    member.state = 'back';
    const home = stationPoint(member.station);
    const way = this.cafeSystem.nav.findPath(member.barista.root.position, home) ?? [member.barista.root.position.clone()];
    member.walk = new Walk([...way, home]);
    member.speed = SPEED.walk;
    member.shift = 0;
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

  /** The tray leaves the hands and goes to the guest's place; the guest has its order. */
  private setDown(member: Staff): void {
    const tray = member.barista.tray;
    const order = member.order;
    if (!tray || !order) return;
    const cafe = this.cafeSystem.cafe;
    member.barista.tray = null;
    // From where the hands hold it, into the café's space, to slide to the guest's place.
    const from = cafe.worldToLocal(tray.getWorldPosition(new Vector3()));
    cafe.add(tray);
    tray.position.copy(from);
    tray.rotation.set(0, member.yaw, 0);
    tray.scale.setScalar(1);
    this.served.push({ tray, order, from, slide: 0, fading: -1 });
    order.served = true;
    order.server = null;
    this.guests?.serve(order.guest);
    this.servedCount++;
    this.servedLog.push(order.guest);
  }

  /** Trays slide into place, stay while their guest does, and fade once the guest has gone. */
  private keepTrays(delta: number): void {
    for (let i = this.served.length - 1; i >= 0; i--) {
      const served = this.served[i];
      if (served.slide < 1) {
        served.slide = Math.min(1, served.slide + delta / TRAY_SLIDE_SECONDS);
        const eased = served.slide * served.slide * (3 - 2 * served.slide);
        served.tray.position.lerpVectors(served.from, served.order.point.tray, eased);
      }
      if (served.fading < 0 && !this.orders.includes(served.order)) served.fading = 0;
      if (served.fading < 0) continue;
      served.fading += delta;
      served.tray.scale.setScalar(Math.max(0.001, 1 - served.fading / TRAY_FADE_SECONDS));
      if (served.fading < TRAY_FADE_SECONDS) continue;
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

  /** What a server does next, by its state. */
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
        if (barista.tray && member.order && member.t >= SET_DOWN_AT) this.setDown(member);
        if (member.t >= member.lasts) {
          member.state = 'bowing';
          member.t = 0;
          member.lasts = barista.seconds('Bow');
          barista.play('Bow', true);
          // It will be free again shortly: the next order can be planned for.
          this.dirty = true;
        }
        break;
      case 'bowing':
        if (member.t >= member.lasts) this.sendHome(member);
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
      if (!member.order) {
        // The guest left before it got there: back it goes.
        this.sendHome(member);
        return;
      }
      // At the guest's side: face its place, and serve.
      member.state = 'serving';
      member.t = 0;
      member.lasts = member.barista.seconds('Serve');
      member.targetYaw = member.order.point.yaw;
      member.barista.play('Serve', true);
      return;
    }
    // Home: a tray never served goes back on the bar.
    member.barista.hold(null);
    this.work(member);
  }
}
