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
 *   guest's own place, and walks straight back. The guest eats from then on;
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
import { BACK_BAR_YAW, servePointFor, servePointsForPlace, SHUFFLE_M, STATION_X, STATION_YAW, stationPoint, type ServePoint } from '../baristas/routes.js';
import { CLEAN, MAX_STAFF } from '../game/rules.js';
import { Janitor, janitorLoaded } from '../baristas/janitor.js';
import { MessSystem } from './mess-system.js';
import { BACK_BAR_SECONDS, FIDGET_SECONDS, MAX_OUT, REPLAN_SECONDS, SAME_TIME_SECONDS, SET_DOWN_AT, SPEED, SWITCH_GAIN_M, TRAY_FADE_SECONDS, TRAY_SLIDE_SECONDS, TURN_SPEED, WAVE_CHANCE } from '../baristas/rules.js';
import type { Seat } from '../guests/seats.js';
import { Walk, yawDelta } from '../guests/walker.js';
import { CafeSystem } from './cafe-system.js';
import { GuestSystem } from './guest-system.js';

/**
 * working: at its station. shuffling: a step along the bar. backBar:
 * turned to the back bar. waving. out: carrying a tray to a guest.
 * serving: the lean at the table, until the order is down. back: walking
 * home. toClean: walking to a dirty table, empty-handed. cleaning: wiping
 * it (CLEAN.seconds).
 */
export type BaristaState = 'working' | 'shuffling' | 'backBar' | 'waving' | 'out' | 'serving' | 'back' | 'toClean' | 'cleaning';

/** What a member of staff is driven through: a barista's rig, or the janitor's made motion (baristas/janitor.ts). */
export type Figure = Barista | Janitor;

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
  /** Its guest is in a hurry: served before the others. */
  urgent: boolean;
}

export interface Staff {
  barista: Figure;
  /** 'barista': serves, and cleans when there is nothing to serve. 'janitor': only cleans. */
  role: 'barista' | 'janitor';
  station: number;
  /** Where it stands when idle (café space): a barista's station on the duckboard, the janitor's spot by the counter's end. */
  home: Vector3;
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
  /** The table it is going to clean, or cleaning (an index into the café's pieces); -1 if none. */
  chore: number;
  /** Trips made, and tables cleaned (for the checks). */
  trips: number;
  cleans: number;
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
const cleaningUp = (member: Staff): boolean => member.state === 'toClean' || member.state === 'cleaning';

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
  /**
   * How many servers are on the staff: the first this many baristas. The
   * game starts the café with one and hires more from the shop (three in
   * all); the checks and recordings (test mode) keep all three.
   */
  staffSize: number = MAX_STAFF;
  /** The janitor is on the staff (the shop hires it; the janitor only cleans). */
  janitorHired = false;
  /** Tables cleaned by the staff, and cleanings broken off for an order (for the checks). */
  cleanedCount = 0;
  cleaningsBrokenOff = 0;
  private mess: MessSystem | null = null;
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
    this.mess = this.world.getSystem(MessSystem) ?? null;
    this.guests = this.world.getSystem(GuestSystem);
    const cafe = this.cafeSystem.cafe;
    cafe.updateMatrixWorld(true);
    this.findTables();
    cafe.traverse((node) => {
      const material = (node as Mesh).material as Material | undefined;
      if (!this.palette && material && !Array.isArray(material) && material.name === 'CafeBarPalette') this.palette = material;
    });
  }

  /** The café's furniture count when the tables were last found. */
  private furniture = 0;

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
    // New furniture (the annex's tables): find where to stand at them too.
    if (cafe.furniture !== this.furniture) {
      this.furniture = cafe.furniture;
      this.findTables();
      this.dirty = true;
    }
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
      const chores = !!this.mess && this.mess.dirtyTables().length > 0 && this.staff.some((m) => m.state === 'working' && m.chore < 0);
      if (this.serving && (this.dirty || ((waiting || chores) && this.sinceplan >= REPLAN_SECONDS))) this.plan();
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
    return this.baristas.filter((m) => !atBar(m)).length;
  }

  // ------------------------------------------------------------- the staff

  /** Bring on every barista on the staff whose model has loaded (they load in the background); a new hire waves hello. */
  private hire(): void {
    this.hireJanitor();
    if (this.baristas.length >= this.staffSize) return;
    BARISTA_NAMES.slice(0, this.staffSize).forEach((name: BaristaName, station) => {
      if (this.staff.some((m) => m.barista.name === name) || !baristaLoaded(name)) return;
      const barista = new Barista(name);
      const home = stationPoint(station);
      barista.root.position.copy(home);
      barista.root.rotation.y = STATION_YAW;
      this.cafeSystem.cafe.add(barista.root);
      barista.play('Work');
      const fresh = this.cafeSystem.placed && this.staff.length > 0;
      this.staff.push({ barista, role: 'barista', station, home, state: 'working', t: Math.random() * 2, lasts: between(FIDGET_SECONDS), walk: null, speed: SPEED.walk, yaw: STATION_YAW, targetYaw: STATION_YAW, shift: 0, order: null, chore: -1, trips: 0, cleans: 0 });
      // One hired in the middle of the evening says hello to the player.
      if (fresh) this.greetPlayer(this.staff[this.staff.length - 1]);
      this.dirty = true;
    });
  }

  /** The baristas on the staff (not the janitor). */
  get baristas(): Staff[] {
    return this.staff.filter((m) => m.role === 'barista');
  }

  /** The janitor, once hired and its model is in. */
  get janitor(): Staff | null {
    return this.staff.find((m) => m.role === 'janitor') ?? null;
  }

  /** Bring the janitor on, by the counter's end, once it is hired and its model has loaded. */
  private hireJanitor(): void {
    if (!this.janitorHired || this.janitor || !janitorLoaded()) return;
    const nav = this.cafeSystem.nav;
    const home = nav.nearest(CLEAN.home.x, CLEAN.home.z, CLEAN.home.reach) ?? stationPoint(STATION_X.length - 1);
    const janitor = new Janitor();
    janitor.root.position.copy(home);
    janitor.root.rotation.y = STATION_YAW;
    this.cafeSystem.cafe.add(janitor.root);
    this.staff.push({ barista: janitor, role: 'janitor', station: -1, home, state: 'working', t: 0, lasts: Infinity, walk: null, speed: SPEED.walk, yaw: STATION_YAW, targetYaw: STATION_YAW, shift: 0, order: null, chore: -1, trips: 0, cleans: 0 });
    this.dirty = true;
  }

  private reset(): void {
    for (const member of this.staff) {
      member.barista.hold(null);
      member.barista.root.position.copy(member.home);
      member.walk = null;
      member.order = null;
      member.chore = -1;
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
    // The janitor stands still at its spot (no bar to fidget at) until a table needs it.
    member.lasts = member.role === 'janitor' ? Infinity : between(FIDGET_SECONDS);
    member.targetYaw = STATION_YAW;
    member.barista.play(member.role === 'janitor' ? 'Idle' : 'Work');
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
      if (guest && guest.state === 'seated' && guest.seat === order.seat && guest.fuming < 0) continue;
      // Gone (or moved to another seat): the order is off, and a server on its way to it is free to be sent elsewhere.
      if (order.server) order.server.order = null;
      this.orders.splice(i, 1);
      this.dirty = true;
    }
    for (const guest of guests.guests) {
      if (guest.state !== 'seated' || !guest.seat || guest.served || guest.fuming >= 0 || this.orders.some((o) => o.guest === guest.id)) continue;
      const points = this.pointsFor(guest.seat);
      if (points.length === 0) continue;
      this.orders.push({ id: this.nextOrder++, guest: guest.id, seat: guest.seat, points, point: points[0], placedAt: this.clock, server: null, served: false, bumped: 0, urgent: guest.hurried });
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
    const baristas = this.baristas;
    const enRoute = baristas.filter((m) => m.state === 'out');
    const free = baristas.filter(atBar);
    const busy = baristas.filter((m) => m.state === 'serving' || m.state === 'back' || cleaningUp(m)).length;

    // The walking distance from a server to an order, worked out when asked for and remembered for this plan
    // (a free server's is from its station, which the grid remembers between plans too).
    const cost = new Map<Order, Map<Staff, number>>();
    const distance = (member: Staff, order: Order): number => {
      let row = cost.get(order);
      if (!row) cost.set(order, (row = new Map()));
      let d = row.get(member);
      if (d === undefined) {
        const from = atBar(member) ? member.home : member.barista.root.position;
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
    const departures = Math.max(0, Math.min(free.length, this.maxOut - busy - enRoute.length));
    if (departures > 0 && free.length > 0) {
      const nearestFree = (order: Order): number => Math.min(...free.map((member) => distance(member, order)));
      const next = waiting()
        .filter((order) => nearestFree(order) < Infinity)
        // A guest in a hurry first; then first come, first served (orders placed together: the nearer first).
        .sort((a, b) => (a.urgent !== b.urgent ? (a.urgent ? -1 : 1) : Math.abs(a.placedAt - b.placedAt) > SAME_TIME_SECONDS ? a.placedAt - b.placedAt : nearestFree(a) - nearestFree(b)))
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
    const walking = baristas.filter((m) => m.state === 'out' && m.order);
    for (const member of walking) {
      const mine = member.order!;
      // A guest in a hurry is never passed over; a normal one only for another normal one.
      if (mine.bumped > 0 || mine.urgent) continue;
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
    this.chores();
  }

  // ------------------------------------------------------------- cleaning

  /**
   * The chores, after the orders (an order always comes first):
   * 4. Orders still waiting with nobody free at the bar: a barista off
   *    cleaning leaves the table (the mess stays) and comes back for a
   *    tray; the plan runs again when it is home.
   * 5. A barista at the bar with no order waiting goes to the nearest
   *    dirty table nobody is seeing to. The janitor goes to the one
   *    longest dirty, whatever the orders.
   */
  private chores(): void {
    const mess = this.mess;
    if (!mess) return;
    const waiting = this.orders.filter((order) => !order.served && !order.server);
    const baristas = this.baristas;
    // 4. Orders waiting, nobody at the bar: break off cleaning, one cleaner per waiting order.
    if (waiting.length > 0 && !baristas.some(atBar)) {
      const cleaners = baristas.filter(cleaningUp);
      for (const member of cleaners.slice(0, waiting.length)) {
        member.chore = -1;
        this.cleaningsBrokenOff++;
        this.sendHome(member);
        this.dirty = true;
      }
    }
    const claimed = new Set(this.staff.filter((m) => m.chore >= 0).map((m) => m.chore));
    const open = mess.dirtyTables().filter((t) => !claimed.has(t));
    if (open.length === 0) return;
    // The janitor: the longest dirty first.
    const janitor = this.janitor;
    if (janitor && janitor.state === 'working') {
      const table = this.nearestTable(janitor, open, Infinity) ?? open[0];
      if (this.goClean(janitor, table)) {
        claimed.add(table);
        open.splice(open.indexOf(table), 1);
      }
    }
    // 5. Baristas with nothing to serve: the nearest dirty table each.
    if (waiting.length > 0) return;
    for (const member of baristas) {
      if (member.state !== 'working' || open.length === 0) continue;
      const table = this.nearestTable(member, open, Infinity);
      if (table === null || !this.goClean(member, table)) continue;
      claimed.add(table);
      open.splice(open.indexOf(table), 1);
    }
  }

  /** Of `tables`, the one with the least walking from where `member` stands, within `within` metres of path; null if none. */
  private nearestTable(member: Staff, tables: number[], within: number): number | null {
    let best: number | null = null;
    let bestLength = within;
    for (const table of tables) {
      const point = this.servePoints.find((p) => p.table === table);
      if (!point) continue;
      const way = this.cafeSystem.nav.findPath(member.barista.root.position, point.stand);
      if (!way) continue;
      const length = lengthOf(way);
      if (length <= bestLength) {
        bestLength = length;
        best = table;
      }
    }
    return best;
  }

  /** Send a member of staff to clean a table: empty-handed, to where a server stands at it. */
  private goClean(member: Staff, table: number): boolean {
    const point = this.servePoints.find((p) => p.table === table);
    if (!point) return false;
    const way = this.cafeSystem.nav.findPath(member.barista.root.position, point.stand);
    if (!way) return false;
    member.barista.hold(null);
    member.order = null;
    member.chore = table;
    member.state = 'toClean';
    member.walk = new Walk(way);
    member.speed = SPEED.walk;
    member.shift = 0;
    return true;
  }

  /**
   * An order set down: with nothing waiting and a dirty table nobody is
   * seeing to within CLEAN.near of walking, clean it on the way; else home.
   */
  private afterServe(member: Staff): void {
    const mess = this.mess;
    const waiting = this.orders.some((order) => !order.served && !order.server);
    if (mess && !waiting) {
      const claimed = new Set(this.staff.filter((m) => m.chore >= 0).map((m) => m.chore));
      const table = this.nearestTable(member, mess.dirtyTables().filter((t) => !claimed.has(t)), CLEAN.near);
      if (table !== null && this.goClean(member, table)) return;
    }
    this.sendHome(member);
  }

  /** The table is wiped: cleaned, and on to the next (the janitor always; a barista only with nothing to serve), else home. */
  private finishCleaning(member: Staff): void {
    const mess = this.mess;
    const table = member.chore;
    member.chore = -1;
    if (mess && table >= 0 && mess.isDirty(table)) {
      mess.clean(table);
      member.cleans++;
      this.cleanedCount++;
    }
    const waiting = this.orders.some((order) => !order.served && !order.server);
    if (mess && (member.role === 'janitor' || !waiting)) {
      const claimed = new Set(this.staff.filter((m) => m.chore >= 0).map((m) => m.chore));
      const next = this.nearestTable(member, mess.dirtyTables().filter((t) => !claimed.has(t)), Infinity);
      if (next !== null && this.goClean(member, next)) return;
    }
    this.dirty = true;
    this.sendHome(member);
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
    member.chore = -1;
    member.state = 'back';
    const home = member.home;
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
    const free = this.baristas.filter((m) => m.state === 'working');
    if (free.length === 0) return;
    this.greetPlayer(free[Math.floor(Math.random() * free.length)]);
  }

  /** A server at the bar waves. */
  private greetPlayer(member: Staff): void {
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
        // Its guest lost its temper (or was moved) while it leant in: straighten up and take the tray back.
        // Without this it would wait there for good, tray in hand, and with one server nobody would be served again.
        if (barista.tray && !member.order) {
          this.dirty = true;
          this.sendHome(member);
          break;
        }
        if (barista.tray && member.order && member.t >= SET_DOWN_AT) this.setDown(member);
        // The order is down: straight back to the counter, no bow (or a dirty table on the way is cleaned first).
        if (!barista.tray && member.t >= SET_DOWN_AT) {
          this.dirty = true;
          this.afterServe(member);
        }
        break;
      case 'cleaning':
        // Someone else got there first: on to the next.
        if (member.chore < 0 || !this.mess?.isDirty(member.chore)) this.finishCleaning(member);
        else if (member.t >= CLEAN.seconds) this.finishCleaning(member);
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
    if (member.state === 'toClean') {
      // At the table: wipe it, facing it.
      member.state = 'cleaning';
      member.t = 0;
      member.lasts = CLEAN.seconds;
      const point = this.servePoints.find((p) => p.table === member.chore);
      if (point) member.targetYaw = point.yaw;
      member.barista.play('Work');
      return;
    }
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
