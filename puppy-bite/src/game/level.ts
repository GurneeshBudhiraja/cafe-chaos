/**
 * Levels, made up on the spot and always solvable: a bed of so many cells,
 * and a litter of puppies whose footprints are known to fit on it, because
 * the level is made by packing them onto the bed first (a backtracking
 * tiling with random choices) and then scattering them on the blanket.
 *
 * Easy: a 3 x 3 bed with room to spare. Medium: 4 x 4, nearly full. Hard:
 * 4 x 5, every cell taken. Pure (seeded random numbers, no three.js).
 */

import { COATS, type Coat } from '../puppies/puppy-mesh.js';
import { CELL, CELLS, POSES, turnPoint, type Pose, type Vec2 } from '../puppies/shapes.js';

export type Difficulty = 'easy' | 'medium' | 'hard';

/** One puppy of the litter: who it is, where it lies to begin with, and where it fits (the solution). */
export interface LitterPuppy {
  pose: Pose;
  coat: Coat;
  seed: number;
  /** On the blanket to begin with: position (metres, in the blanket's frame) and quarter turns. */
  scatter: { x: number; z: number; turns: number };
  /** A place on the bed where it fits: the footprint's corner cell and quarter turns. */
  solution: { column: number; row: number; turns: number };
}

export interface Level {
  difficulty: Difficulty;
  seed: number;
  columns: number;
  rows: number;
  puppies: LitterPuppy[];
}

const SETTINGS: Record<Difficulty, { columns: number; rows: number; count: number; minFilled: number }> = {
  easy: { columns: 3, rows: 3, count: 3, minFilled: 6 },
  medium: { columns: 4, rows: 4, count: 5, minFilled: 13 },
  hard: { columns: 4, rows: 5, count: 6, minFilled: 20 },
};

/** A small seeded random generator (mulberry32). */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A pose's cells turned by quarter turns, normalised to start at (0, 0). */
export function turnedCells(pose: Pose, turns: number): Vec2[] {
  const turned = CELLS[pose].map((c) => turnPoint(c, turns));
  const minC = Math.min(...turned.map((c) => c[0]));
  const minR = Math.min(...turned.map((c) => c[1]));
  return turned.map(([c, r]) => [c - minC, r - minR]);
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Pack `count` puppies onto a columns x rows grid, filling at least
 * `minFilled` cells. The first empty cell (reading order) is always taken
 * by the next puppy, which keeps the packing tight; when enough is filled,
 * the rest may stay empty. Null when these random choices fail.
 */
function pack(columns: number, rows: number, count: number, minFilled: number, rand: () => number): { pose: Pose; column: number; row: number; turns: number }[] | null {
  const grid: boolean[][] = Array.from({ length: rows }, () => Array(columns).fill(false));
  const placed: { pose: Pose; column: number; row: number; turns: number }[] = [];
  let filled = 0;
  const options = () => {
    const out: { pose: Pose; turns: number }[] = [];
    for (const pose of POSES) for (let turns = 0; turns < 4; turns++) out.push({ pose, turns });
    return shuffled(out, rand);
  };
  const search = (depth: number): boolean => {
    if (placed.length === count) return filled >= minFilled;
    if (depth > 400) return false;
    // The first empty cell.
    let fc = -1;
    let fr = -1;
    outer: for (let r = 0; r < rows; r++)
      for (let c = 0; c < columns; c++)
        if (!grid[r][c]) {
          fc = c;
          fr = r;
          break outer;
        }
    if (fc < 0) return false;
    // Enough filled already? The remaining puppies may go anywhere free.
    for (const { pose, turns } of options()) {
      const cells = turnedCells(pose, turns);
      // Anchor: the cell of this shape that would land first in reading order must be the first empty cell.
      const first = [...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0])[0];
      const column = fc - first[0];
      const row = fr - first[1];
      if (!cells.every(([c, r]) => column + c >= 0 && column + c < columns && row + r >= 0 && row + r < rows && !grid[row + r][column + c])) continue;
      for (const [c, r] of cells) grid[row + r][column + c] = true;
      placed.push({ pose, column, row, turns });
      filled += cells.length;
      if (search(depth + 1)) return true;
      filled -= cells.length;
      placed.pop();
      for (const [c, r] of cells) grid[row + r][column + c] = false;
    }
    return false;
  };
  return search(0) ? placed : null;
}

/** Scatter the litter on a blanket of the given size (metres), without overlapping, by trial. */
function scatter(poses: Pose[], width: number, depth: number, rand: () => number): { x: number; z: number; turns: number }[] {
  const out: { x: number; z: number; turns: number; r: number }[] = [];
  for (const pose of poses) {
    const cells = CELLS[pose];
    const r = (Math.hypot(Math.max(...cells.map((c) => c[0])) + 1, Math.max(...cells.map((c) => c[1])) + 1) * CELL) / 2;
    let best = { x: 0, z: 0, turns: 0, r, score: -Infinity };
    for (let attempt = 0; attempt < 60; attempt++) {
      const x = (rand() - 0.5) * (width - 2 * r);
      const z = (rand() - 0.5) * (depth - 2 * r);
      const gap = Math.min(...out.map((o) => Math.hypot(o.x - x, o.z - z) - o.r - r), Infinity);
      if (gap > best.score) best = { x, z, turns: Math.floor(rand() * 4), r, score: gap };
      if (gap > 0.02) break;
    }
    out.push(best);
  }
  return out.map(({ x, z, turns }) => ({ x, z, turns }));
}

/** Make a level. The same difficulty and seed always give the same level. */
export function makeLevel(difficulty: Difficulty, seed = Math.floor(Math.random() * 1e9), blanket = { width: 0.58, depth: 0.56 }): Level {
  const settings = SETTINGS[difficulty];
  for (let s = seed; ; s++) {
    const rand = random(s);
    const packed = pack(settings.columns, settings.rows, settings.count, settings.minFilled, rand);
    if (!packed) continue;
    const coats = shuffled(COATS, rand);
    const spots = scatter(packed.map((p) => p.pose), blanket.width, blanket.depth, rand);
    const puppies: LitterPuppy[] = packed.map((p, i) => ({
      pose: p.pose,
      coat: coats[i % coats.length],
      seed: Math.floor(rand() * 1000),
      scatter: spots[i],
      solution: { column: p.column, row: p.row, turns: p.turns },
    }));
    return { difficulty, seed: s, columns: settings.columns, rows: settings.rows, puppies };
  }
}
