/**
 * The navigation grid: how the café's characters find their own way.
 *
 * Nothing about the café's layout is written down for them. At start-up
 * the grid looks at the café's actual geometry (every static mesh under
 * the café group: the shell, the furniture, anything added later) and
 * works out, for each half-centimetre square of the plan:
 *
 * 1. Height: the highest surface there below head height. Triangles are
 *    sampled into the grid, edges included, so thin things (fence rails,
 *    chair legs) are not missed.
 * 2. Ground: the squares a character can stand on, found by spreading
 *    out from a known piece of floor across every step small enough to
 *    walk, and no higher than a little above that floor (the engawa
 *    step, the deck, the duckboard behind the counter). A chair seat or
 *    a table top is too high and is never ground. The player's table beyond the plate is ground too,
 *    reached by a hop where the plate's edge is low and open.
 * 3. Clearance: how far each ground square is from the nearest thing
 *    that is not ground. A character needs its own half-width of it,
 *    and only squares with that much room, joined to the rest of the
 *    floor by squares with as much, count as places it can get to.
 *
 * A path is then a search (A*) over the squares with enough clearance,
 * preferring the middle of the way, pulled straight wherever there is a
 * clear line, and given the ground's height along it so feet follow the
 * steps. Paths are remembered, so asking for the same one again is free.
 *
 * Put a new table in the café and call `rebuild()`: it becomes an
 * obstacle, and everyone walks round it.
 */

import { Matrix4, Vector3, type Mesh, type Object3D } from '@iwsdk/core';

export interface NavOptions {
  /** The plan covered (café space, metres) and the size of a square. */
  min: { x: number; z: number };
  max: { x: number; z: number };
  cell: number;
  /** Head height: geometry wholly above this is overhead and ignored (metres above the café's origin). */
  top: number;
  /** The biggest step a character walks up or down without a hop (metres). */
  step: number;
  /**
   * Nothing higher than this above the seed's floor is ground (metres).
   * Steps alone are not enough to tell: a chair's rungs and seat make a
   * staircase of small steps up onto a table. A real raised floor (the
   * duckboard) is within this; a seat is not.
   */
  rise: number;
  /** The player's table beyond the plate is at this height or below; the plate's edge can be hopped where it is no higher than `hop`. */
  table: number;
  hop: number;
  /** A character's half-width (metres): it keeps this far from anything that is not ground. */
  radius: number;
  /** Lines nobody walks across (x1, z1, x2, z2), such as the open front of the room, so the door is the way in and out. */
  barriers: [number, number, number, number][];
  /** A point known to be ground, to spread out from. */
  seed: { x: number; z: number };
  /** Walking on the player's table costs this many times walking on the plate: characters stay on the platform when they can. */
  tableCost: number;
}

/** How strongly paths keep to the middle of the way (0: shortest regardless). */
const CENTRE_PULL = 1.6;
/** Clearance beyond this many squares makes no difference to the pull. */
const OPEN = 10;
/** A hop on or off the plate costs this much extra path (metres): only where it is needed. */
const HOP_COST = 0.25;

export class NavGrid {
  readonly nx: number;
  readonly nz: number;
  /** Per square: the highest surface below head height (0 where there is nothing: the player's table). */
  readonly height: Float32Array;
  /** Per square: 1 if a character can stand there. */
  readonly ground: Uint8Array;
  /** Per square: the distance to the nearest square that is not ground, in squares. */
  readonly clearance: Float32Array;
  /**
   * Per square: 1 if a character can get there: ground, with room for its
   * width, and joined to the rest by squares that are the same. (A gap
   * between two chairs can be wide enough to stand in and still be cut
   * off by gaps too tight to walk through; nobody is ever sent there.)
   */
  readonly reachable: Uint8Array;
  /** How long the last build took (milliseconds), and how many triangles it read. */
  buildMs = 0;
  triangles = 0;
  /** Paths found (not from memory), for the checks. */
  searches = 0;
  private readonly blocked: Uint8Array;
  /** The highest that ground can be (the seed's floor plus the allowed rise). */
  private ceiling = Infinity;
  private readonly cache = new Map<string, Vector3[]>();
  /**
   * Walking lengths by square pair (`distance`): `kept` for the ones asked
   * to be kept (from a station, which does not move), until the next
   * rebuild; `lengths` for the rest, emptied when it grows large.
   */
  private readonly kept = new Map<number, number>();
  private readonly lengths = new Map<number, number>();
  // Search scratch, reused.
  private readonly g: Float32Array;
  private readonly from: Int32Array;
  private readonly state: Uint8Array;
  private readonly heap: Int32Array;
  private readonly f: Float32Array;

  constructor(
    private readonly root: Object3D,
    readonly options: NavOptions,
  ) {
    this.nx = Math.ceil((options.max.x - options.min.x) / options.cell);
    this.nz = Math.ceil((options.max.z - options.min.z) / options.cell);
    const n = this.nx * this.nz;
    this.height = new Float32Array(n);
    this.ground = new Uint8Array(n);
    this.clearance = new Float32Array(n);
    this.reachable = new Uint8Array(n);
    this.blocked = new Uint8Array(n);
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.from = new Int32Array(n);
    this.state = new Uint8Array(n);
    this.heap = new Int32Array(n);
    this.rebuild();
  }

  // ---------------------------------------------------------------- building

  /** Read the café's geometry again (after furniture is added, moved or taken away). */
  rebuild(): void {
    const started = performance.now();
    this.cache.clear();
    this.lengths.clear();
    this.kept.clear();
    this.rasterise();
    this.drawBarriers();
    this.spread();
    this.measure();
    this.join();
    this.buildMs = performance.now() - started;
  }

  /** Sample every static triangle below head height into the height map. */
  private rasterise(): void {
    const { min, cell, top } = this.options;
    const { nx, nz, height } = this;
    height.fill(-1);
    this.triangles = 0;
    this.root.updateWorldMatrix(true, true);
    const toRoot = new Matrix4().copy(this.root.matrixWorld).invert();
    const local = new Matrix4();
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    const mark = (x: number, y: number, z: number): void => {
      const ix = Math.floor((x - min.x) / cell);
      const iz = Math.floor((z - min.z) / cell);
      if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) return;
      // Something passing up through head height is as good as a wall.
      const h = Math.min(y, top);
      const i = iz * nx + ix;
      if (h > height[i]) height[i] = h;
    };
    const edge = (p: Vector3, q: Vector3): void => {
      const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / (cell * 0.5)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        mark(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t, p.z + (q.z - p.z) * t);
      }
    };
    this.root.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh || !isStatic(mesh, this.root)) return;
      const position = mesh.geometry.attributes.position;
      if (!position) return;
      const index = mesh.geometry.index;
      local.multiplyMatrices(toRoot, mesh.matrixWorld);
      const count = index ? index.count : position.count;
      for (let i = 0; i + 2 < count; i += 3) {
        a.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(local);
        b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1).applyMatrix4(local);
        c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2).applyMatrix4(local);
        if (Math.min(a.y, b.y, c.y) > top || Math.max(a.y, b.y, c.y) < -0.02) continue;
        this.triangles++;
        // Its edges (so slivers thinner than a square still count)...
        edge(a, b);
        edge(b, c);
        edge(c, a);
        // ...and its inside, at four points a square.
        const ix0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - min.x) / cell));
        const ix1 = Math.min(nx - 1, Math.floor((Math.max(a.x, b.x, c.x) - min.x) / cell));
        const iz0 = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - min.z) / cell));
        const iz1 = Math.min(nz - 1, Math.floor((Math.max(a.z, b.z, c.z) - min.z) / cell));
        if (ix1 - ix0 < 1 && iz1 - iz0 < 1) continue;
        const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
        if (Math.abs(d) < 1e-12) continue;
        for (let iz = iz0; iz <= iz1; iz++) {
          for (let ix = ix0; ix <= ix1; ix++) {
            for (let s = 0; s < 4; s++) {
              const x = min.x + (ix + (s & 1 ? 0.75 : 0.25)) * cell;
              const z = min.z + (iz + (s & 2 ? 0.75 : 0.25)) * cell;
              const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d;
              const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
              const w = 1 - u - v;
              if (u < 0 || v < 0 || w < 0) continue;
              const y = u * a.y + v * b.y + w * c.y;
              const h = Math.min(y, top);
              const i = iz * nx + ix;
              if (h > height[i]) height[i] = h;
            }
          }
        }
      }
    });
    // Where there is nothing at all, there is the player's table.
    for (let i = 0; i < height.length; i++) if (height[i] < 0) height[i] = 0;
  }

  private drawBarriers(): void {
    const { cell } = this.options;
    this.blocked.fill(0);
    for (const [x1, z1, x2, z2] of this.options.barriers) {
      const steps = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / (cell * 0.4));
      for (let s = 0; s <= steps; s++) {
        const i = this.cellAt(x1 + ((x2 - x1) * s) / steps, z1 + ((z2 - z1) * s) / steps);
        if (i >= 0) this.blocked[i] = 1;
      }
    }
  }

  /** Can a character go from one square to its neighbour? */
  private passes(i: number, j: number): boolean {
    if (this.blocked[j] || this.height[j] > this.ceiling) return false;
    const { step, table, hop } = this.options;
    const hi = this.height[i];
    const hj = this.height[j];
    if (Math.abs(hi - hj) <= step) return true;
    // On and off the plate, where its edge is low.
    return (hi <= table && hj <= hop) || (hj <= table && hi <= hop);
  }

  /** Spread out from the seed over every walkable step: that is the ground. */
  private spread(): void {
    const { nx, nz, ground } = this;
    ground.fill(0);
    const seed = this.cellAt(this.options.seed.x, this.options.seed.z);
    if (seed < 0) return;
    this.ceiling = this.height[seed] + this.options.rise;
    const queue = this.from;
    let head = 0;
    let tail = 0;
    queue[tail++] = seed;
    ground[seed] = 1;
    while (head < tail) {
      const i = queue[head++];
      const ix = i % nx;
      const iz = (i - ix) / nx;
      for (let k = 0; k < 4; k++) {
        const jx = ix + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const jz = iz + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
        const j = jz * nx + jx;
        if (ground[j] || !this.passes(i, j)) continue;
        ground[j] = 1;
        queue[tail++] = j;
      }
    }
  }

  /** The distance from each ground square to the nearest that is not (a two-pass chamfer, in squares). */
  private measure(): void {
    const { nx, nz, ground, clearance } = this;
    const far = 1e6;
    for (let i = 0; i < clearance.length; i++) clearance[i] = ground[i] ? far : 0;
    const relax = (i: number, j: number, d: number): void => {
      if (clearance[j] + d < clearance[i]) clearance[i] = clearance[j] + d;
    };
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const i = iz * nx + ix;
        if (!ground[i]) continue;
        if (ix > 0) relax(i, i - 1, 1);
        if (iz > 0) relax(i, i - nx, 1);
        if (ix > 0 && iz > 0) relax(i, i - nx - 1, 1.414);
        if (ix < nx - 1 && iz > 0) relax(i, i - nx + 1, 1.414);
      }
    }
    for (let iz = nz - 1; iz >= 0; iz--) {
      for (let ix = nx - 1; ix >= 0; ix--) {
        const i = iz * nx + ix;
        if (!ground[i]) continue;
        if (ix < nx - 1) relax(i, i + 1, 1);
        if (iz < nz - 1) relax(i, i + nx, 1);
        if (ix < nx - 1 && iz < nz - 1) relax(i, i + nx + 1, 1.414);
        if (ix > 0 && iz < nz - 1) relax(i, i + nx - 1, 1.414);
      }
    }
  }

  /** Mark the squares a character can get to: those with room, joined (by walkable steps) to the roomy square nearest the seed. */
  private join(): void {
    const { nx, nz, reachable } = this;
    reachable.fill(0);
    const need = this.options.radius / this.options.cell;
    const roomy = (i: number): boolean => this.ground[i] === 1 && this.clearance[i] >= need;
    // The roomy square nearest the seed.
    const { min, cell, seed } = this.options;
    const sx = Math.floor((seed.x - min.x) / cell);
    const sz = Math.floor((seed.z - min.z) / cell);
    let start = -1;
    for (let ring = 0; ring < 40 && start < 0; ring++) {
      for (let dz = -ring; dz <= ring && start < 0; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const ix = sx + dx;
          const iz = sz + dz;
          if (ix < 0 || iz < 0 || ix >= nx || iz >= nz || !roomy(iz * nx + ix)) continue;
          start = iz * nx + ix;
          break;
        }
      }
    }
    if (start < 0) return;
    const queue = this.from;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    reachable[start] = 1;
    while (head < tail) {
      const i = queue[head++];
      const ix = i % nx;
      const iz = (i - ix) / nx;
      for (let k = 0; k < 4; k++) {
        const jx = ix + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const jz = iz + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
        const j = jz * nx + jx;
        if (reachable[j] || !roomy(j) || !this.passes(i, j)) continue;
        reachable[j] = 1;
        queue[tail++] = j;
      }
    }
  }

  // ---------------------------------------------------------------- asking

  /** The square at a point of the plan (-1 outside the grid). */
  cellAt(x: number, z: number): number {
    const ix = Math.floor((x - this.options.min.x) / this.options.cell);
    const iz = Math.floor((z - this.options.min.z) / this.options.cell);
    return ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz ? -1 : iz * this.nx + ix;
  }

  /** The middle of a square, at the ground's height there. */
  pointAt(i: number, out = new Vector3()): Vector3 {
    const ix = i % this.nx;
    const iz = (i - ix) / this.nx;
    return out.set(this.options.min.x + (ix + 0.5) * this.options.cell, this.height[i], this.options.min.z + (iz + 0.5) * this.options.cell);
  }

  /** The highest surface below head height at a point. */
  heightAt(x: number, z: number): number {
    const i = this.cellAt(x, z);
    return i < 0 ? 0 : this.height[i];
  }

  /** Can a character stand at a point (ground, with room for its width)? */
  walkable(x: number, z: number): boolean {
    const i = this.cellAt(x, z);
    return i >= 0 && this.open(i);
  }

  private open(i: number): boolean {
    return this.reachable[i] === 1;
  }

  /** The nearest place a character can stand to a point, within `reach` metres; null if none. */
  nearest(x: number, z: number, reach: number, out = new Vector3()): Vector3 | null {
    const i = this.nearestCell(x, z, reach);
    return i < 0 ? null : this.pointAt(i, out);
  }

  private nearestCell(x: number, z: number, reach: number): number {
    const { nx, nz } = this;
    const { min, cell } = this.options;
    const cx = Math.floor((x - min.x) / cell);
    const cz = Math.floor((z - min.z) / cell);
    // On an open square already (a character on its way, a standing place): that square is the nearest.
    if (cx >= 0 && cz >= 0 && cx < nx && cz < nz && this.open(cz * nx + cx)) return cz * nx + cx;
    const rings = Math.ceil(reach / cell);
    let best = -1;
    let bestDistance = reach * reach;
    for (let dz = -rings; dz <= rings; dz++) {
      for (let dx = -rings; dx <= rings; dx++) {
        const ix = cx + dx;
        const iz = cz + dz;
        if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) continue;
        const i = iz * nx + ix;
        if (!this.open(i)) continue;
        const px = min.x + (ix + 0.5) * cell - x;
        const pz = min.z + (iz + 0.5) * cell - z;
        const d = px * px + pz * pz;
        if (d < bestDistance) {
          bestDistance = d;
          best = i;
        }
      }
    }
    return best;
  }

  /**
   * A way from one point to another: the points to walk through, ground
   * heights included, starting at `from` itself. Either end is moved to
   * the nearest place a character can stand (within `reach`). Null if
   * there is no way.
   */
  findPath(from: Vector3, to: Vector3, reach = 0.12): Vector3[] | null {
    const start = this.nearestCell(from.x, from.z, reach);
    const goal = this.nearestCell(to.x, to.z, reach);
    if (start < 0 || goal < 0) return null;
    const key = `${start}>${goal}`;
    let route = this.cache.get(key);
    if (!route) {
      const cells = this.search(start, goal);
      if (!cells) return null;
      route = this.dress(this.straighten(cells));
      this.cache.set(key, route);
    }
    const path = [from.clone(), ...route.map((p) => p.clone())];
    return path;
  }

  /**
   * How far (metres) a character walks from one point to another on this
   * grid, along the squares of its way; Infinity if there is no way. No
   * points are made: the baristas weigh every server against every order
   * this way many times a second when the café is busy
   * (systems/barista-system.ts), and the full `findPath` (finding the
   * nearest squares, straightening, copying the points) made those plans
   * frames of 10 ms and more on the headset. Remembered by square pair
   * until the next rebuild.
   */
  distance(from: Vector3, to: Vector3, reach = 0.12, keep = false): number {
    const start = this.nearestCell(from.x, from.z, reach);
    const goal = this.nearestCell(to.x, to.z, reach);
    if (start < 0 || goal < 0) return Infinity;
    const key = start * this.nx * this.nz + goal;
    let metres = this.kept.get(key) ?? this.lengths.get(key);
    if (metres === undefined) {
      const cells = this.search(start, goal);
      metres = Infinity;
      if (cells) {
        metres = 0;
        const { nx } = this;
        const { cell } = this.options;
        for (let k = 1; k < cells.length; k++) {
          const a = cells[k - 1];
          const b = cells[k];
          metres += (a % nx !== b % nx && Math.floor(a / nx) !== Math.floor(b / nx) ? 1.414 : 1) * cell;
        }
      }
      if (keep) this.kept.set(key, metres);
      else {
        // Servers on their way start from new squares each plan: start again rather than grow without end.
        if (this.lengths.size >= 5000) this.lengths.clear();
        this.lengths.set(key, metres);
      }
    }
    return metres;
  }

  /** A* over the open squares, eight ways, keeping to the middle. Returns the squares from start to goal. */
  private search(start: number, goal: number): number[] | null {
    this.searches++;
    const { nx, nz, g, f, from, state, heap } = this;
    const { cell, table, tableCost } = this.options;
    g.fill(Infinity);
    state.fill(0);
    const gx = goal % nx;
    const gz = (goal - gx) / nx;
    // Every step costs at least its length times the least centre pull (a square at least OPEN from everything): still
    // never more than the true cost, so the way found is the same, with fewer squares looked at.
    const least = 1 + CENTRE_PULL / OPEN;
    const estimate = (i: number): number => {
      const dx = Math.abs((i % nx) - gx);
      const dz = Math.abs(Math.floor(i / nx) - gz);
      return (Math.max(dx, dz) + 0.414 * Math.min(dx, dz)) * cell * least;
    };
    let size = 0;
    const push = (i: number): void => {
      let k = size++;
      heap[k] = i;
      while (k > 0) {
        const parent = (k - 1) >> 1;
        if (f[heap[parent]] <= f[heap[k]]) break;
        const swap = heap[parent];
        heap[parent] = heap[k];
        heap[k] = swap;
        k = parent;
      }
    };
    const pop = (): number => {
      const top = heap[0];
      heap[0] = heap[--size];
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < size && f[heap[l]] < f[heap[m]]) m = l;
        if (r < size && f[heap[r]] < f[heap[m]]) m = r;
        if (m === k) break;
        const swap = heap[m];
        heap[m] = heap[k];
        heap[k] = swap;
        k = m;
      }
      return top;
    };
    g[start] = 0;
    f[start] = estimate(start);
    from[start] = -1;
    push(start);
    while (size > 0) {
      const i = pop();
      if (i === goal) {
        const cells: number[] = [];
        for (let k = goal; k >= 0; k = from[k]) cells.push(k);
        return cells.reverse();
      }
      if (state[i] === 2) continue;
      state[i] = 2;
      const ix = i % nx;
      const iz = (i - ix) / nx;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const jx = ix + dx;
          const jz = iz + dz;
          if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
          const j = jz * nx + jx;
          if (state[j] === 2 || !this.open(j) || !this.passes(i, j)) continue;
          // No cutting a corner between two squares that are not open.
          if (dx !== 0 && dz !== 0 && (!this.open(iz * nx + jx) || !this.open(jz * nx + ix))) continue;
          const length = (dx !== 0 && dz !== 0 ? 1.414 : 1) * cell;
          const pull = 1 + CENTRE_PULL / Math.min(OPEN, this.clearance[j]);
          const terrain = this.height[j] <= table ? tableCost : 1;
          const hopped = Math.abs(this.height[i] - this.height[j]) > this.options.step ? HOP_COST : 0;
          const cost = g[i] + length * pull * terrain + hopped;
          if (cost >= g[j]) continue;
          g[j] = cost;
          f[j] = cost + estimate(j);
          from[j] = i;
          push(j);
        }
      }
    }
    return null;
  }

  /** Is the straight line between two squares open all the way, without a hop? */
  private clearLine(i: number, j: number): boolean {
    const { nx } = this;
    const { cell, step } = this.options;
    const ax = i % nx;
    const az = (i - ax) / nx;
    const bx = j % nx;
    const bz = (j - bx) / nx;
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) * 2);
    let last = this.height[i];
    // A line may graze closer to things than the search would walk, but not much.
    const need = (this.options.radius / cell) * 0.85;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const k = Math.round(az + (bz - az) * t) * nx + Math.round(ax + (bx - ax) * t);
      if (!this.ground[k] || this.blocked[k] || this.clearance[k] < need) return false;
      if (Math.abs(this.height[k] - last) > step) return false;
      last = this.height[k];
    }
    return true;
  }

  /** Pull the stair-stepped search result straight: keep only the squares where the way has to turn (or hop). */
  private straighten(cells: number[]): number[] {
    const kept = [cells[0]];
    let anchor = 0;
    for (let i = 2; i < cells.length; i++) {
      if (this.clearLine(cells[anchor], cells[i])) continue;
      kept.push(cells[i - 1]);
      anchor = i - 1;
    }
    kept.push(cells[cells.length - 1]);
    return kept;
  }

  /** Turn the kept squares into points, adding one wherever the ground's height changes along the way, so feet follow the steps. */
  private dress(cells: number[]): Vector3[] {
    const { nx } = this;
    const points: Vector3[] = [this.pointAt(cells[0])];
    for (let n = 1; n < cells.length; n++) {
      const a = cells[n - 1];
      const b = cells[n];
      const ax = a % nx;
      const az = (a - ax) / nx;
      const bx = b % nx;
      const bz = (b - bx) / nx;
      const steps = Math.ceil(Math.hypot(bx - ax, bz - az));
      let last = a;
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const k = Math.round(az + (bz - az) * t) * nx + Math.round(ax + (bx - ax) * t);
        if (Math.abs(this.height[k] - this.height[last]) > 0.0012) {
          if (last !== a) points.push(this.pointAt(last));
          points.push(this.pointAt(k));
        }
        last = k;
      }
      points.push(this.pointAt(b));
    }
    return points;
  }

  /** A picture of the grid in text, for looking at: `#` not ground, `.` ground too tight to walk, a space or `,` open ground (`,` on the player's table). One character per `every` squares. */
  picture(every = 2, path: Vector3[] = []): string {
    const on = new Set(path.map((p) => this.cellAt(p.x, p.z)));
    const rows: string[] = [];
    for (let iz = 0; iz < this.nz; iz += every) {
      let row = '';
      for (let ix = 0; ix < this.nx; ix += every) {
        const i = iz * this.nx + ix;
        let mark = !this.ground[i] ? '#' : !this.open(i) ? '.' : this.height[i] <= this.options.table ? ',' : ' ';
        for (let dz = 0; dz < every && mark !== '*'; dz++) for (let dx = 0; dx < every; dx++) if (on.has(i + dz * this.nx + dx)) mark = '*';
        row += mark;
      }
      rows.push(row);
    }
    return rows.join('\n');
  }
}

/** A mesh counts if it is shown, opaque geometry that stays put: not something marked dynamic (a character, a glow), not skinned or instanced. */
function isStatic(mesh: Mesh, root: Object3D): boolean {
  if ((mesh as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh || (mesh as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) return false;
  for (let node: Object3D | null = mesh; node && node !== root; node = node.parent) {
    if (!node.visible || node.userData.dynamic || node.userData.noNav) return false;
  }
  return true;
}
