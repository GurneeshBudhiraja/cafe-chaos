/**
 * Levels, made up on the spot and always solvable: the cake's shape, where
 * its strawberries go, and the cards (target shapes) in the box. The cards
 * come from actually cutting the cake's footprint with random straight
 * cuts, so the pieces the player needs always exist. Harder levels have
 * more pieces, rounder cakes, freer cut angles, and cards turned away
 * from how the piece sits on the cake.
 *
 * Pure (seeded random numbers, no three.js), so a level can be reproduced
 * from its seed.
 */

import {
  area,
  boundingRadius,
  bounds,
  centroid,
  contains,
  rectangle,
  regularPolygon,
  rotate,
  splitByLine,
  translate,
  type Polygon,
  type Vec2,
} from '../cake/polygon.js';

export type Difficulty = 'easy' | 'medium' | 'hard';

/** A card: the shape a cell of the box wants, as drawn on the card (centred on its centroid, turned by `turn`). */
export interface Card {
  polygon: Polygon;
  /** How far the card's shape is turned from how the piece sits on the cake (radians). */
  turn: number;
}

/** A cut that made the level's pieces: a point and a direction in the cake's frame (for scripts that replay it). */
export interface Cut {
  p: Vec2;
  d: Vec2;
}

/** A cell of the box, in the box's frame: its centre and size (metres), one per card. */
export interface Cell {
  x: number;
  z: number;
  width: number;
  depth: number;
}

export interface Level {
  difficulty: Difficulty;
  seed: number;
  /** The cake's footprint, centred. */
  cake: Polygon;
  strawberries: Vec2[];
  cards: Card[];
  cuts: Cut[];
  /** The box's cells, one per card (same order), sized to their cards and laid out in rows. */
  cells: Cell[];
  /** The box's inside size. */
  inner: { width: number; depth: number };
}

const SETTINGS: Record<Difficulty, { cuts: number; pieces: number; angles: number[] | 'any'; turns: number[] | 'any' }> = {
  // One straight cut, two pieces, cards as the pieces sit on the cake.
  easy: { cuts: 1, pieces: 2, angles: [0, Math.PI / 2], turns: [0] },
  // Two cuts that do not cross on the cake (three pieces), diagonals allowed, cards turned by quarter turns.
  medium: { cuts: 2, pieces: 3, angles: [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4], turns: [Math.PI / 2, Math.PI, -Math.PI / 2] },
  // Two crossing cuts through a round cake (four pieces), any angle, cards turned any which way.
  hard: { cuts: 2, pieces: 4, angles: 'any', turns: 'any' },
};
/** No piece smaller than this share of the cake (so every piece is a real slice). */
const MIN_SHARE = 0.16;

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

/** Cake sizes keep every cut shorter than the knife's edge (about 20 cm), with room for a bit of sawing. */
function cakeShape(difficulty: Difficulty, rand: () => number): Polygon {
  if (difficulty === 'easy') return rectangle(0.16, 0.16);
  if (difficulty === 'medium') return rand() < 0.5 ? rectangle(0.18, 0.14) : regularPolygon(6, 0.092, Math.PI / 6);
  return regularPolygon(28, 0.09);
}

/** Room around a card's shape in its cell (metres). */
const CELL_PAD = 0.013;

/** Lay the cards out in cells: one row up to three cards, two rows for four. */
function layOut(cards: Card[]): { cells: Cell[]; inner: { width: number; depth: number } } {
  const sizes = cards.map((card) => {
    const b = bounds(card.polygon);
    return { width: b.maxX - b.minX + 2 * CELL_PAD, depth: b.maxZ - b.minZ + 2 * CELL_PAD };
  });
  const perRow = cards.length <= 3 ? cards.length : 2;
  const rows: number[][] = [];
  for (let i = 0; i < cards.length; i += perRow) rows.push(sizes.slice(i, i + perRow).map((_, k) => i + k));
  const rowDepth = rows.map((row) => Math.max(...row.map((i) => sizes[i].depth)));
  const rowWidth = rows.map((row) => row.reduce((sum, i) => sum + sizes[i].width, 0));
  const width = Math.max(...rowWidth);
  const depth = rowDepth.reduce((a, b) => a + b, 0);
  const cells: Cell[] = cards.map(() => ({ x: 0, z: 0, width: 0, depth: 0 }));
  let z = -depth / 2;
  rows.forEach((row, r) => {
    // Cells in a row share its depth and stretch to fill the box's width.
    const stretch = width / rowWidth[r];
    let x = -width / 2;
    for (const i of row) {
      const w = sizes[i].width * stretch;
      cells[i] = { x: x + w / 2, z: z + rowDepth[r] / 2, width: w, depth: rowDepth[r] };
      x += w;
    }
    z += rowDepth[r];
  });
  return { cells, inner: { width, depth } };
}

/** Strawberries spread over the cake: a ring plus one in the middle, kept off the edge. */
function placeStrawberries(cake: Polygon, rand: () => number): Vec2[] {
  const r = boundingRadius(cake);
  const count = 5 + Math.floor(rand() * 2);
  const out: Vec2[] = [[0, 0]];
  const phase = rand() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * Math.PI * 2;
    const d = r * (0.5 + rand() * 0.1);
    const at: Vec2 = [Math.cos(a) * d, Math.sin(a) * d];
    if (contains(cake, at, -0.022)) out.push(at);
  }
  return out;
}

/**
 * Cut the cake with `count` straight cuts, each a full line across the cake
 * (as a knife makes), into exactly `pieces` pieces, all a fair size. Null
 * when these random numbers cannot manage it.
 */
function cutUp(cake: Polygon, count: number, pieces: number, angles: number[] | 'any', rand: () => number): { parts: Polygon[]; cuts: Cut[] } | null {
  const total = area(cake);
  const r = boundingRadius(cake);
  for (let attempt = 0; attempt < 40; attempt++) {
    let parts: Polygon[] = [cake];
    const cuts: Cut[] = [];
    for (let c = 0; c < count; c++) {
      const angle = angles === 'any' ? rand() * Math.PI : angles[Math.floor(rand() * angles.length)];
      const d: Vec2 = [Math.cos(angle), -Math.sin(angle)];
      const off = (rand() - 0.5) * r * 0.8;
      const p: Vec2 = [-d[1] * off, d[0] * off];
      parts = parts.flatMap((part) => {
        const halves = splitByLine(part, p, d, 1e-6);
        return halves.length === 2 ? halves : [part];
      });
      cuts.push({ p, d });
    }
    if (parts.length === pieces && parts.every((part) => area(part) >= total * MIN_SHARE)) return { parts, cuts };
  }
  return null;
}

/** Make a level. The same difficulty and seed always give the same level. */
export function makeLevel(difficulty: Difficulty, seed = Math.floor(Math.random() * 1e9)): Level {
  const settings = SETTINGS[difficulty];
  // A few tries: a seed whose cuts cannot make fair pieces moves on to the next seed.
  for (let s = seed; ; s++) {
    const rand = random(s);
    const cake = cakeShape(difficulty, rand);
    const cut = cutUp(cake, settings.cuts, settings.pieces, settings.angles, rand);
    if (!cut) continue;
    const cards: Card[] = cut.parts.map((part) => {
      const [cx, cz] = centroid(part);
      const turn = settings.turns === 'any' ? Math.floor(rand() * 12) * (Math.PI / 6) : settings.turns[Math.floor(rand() * settings.turns.length)];
      return { polygon: rotate(translate(part, -cx, -cz), turn), turn };
    });
    // Shuffle the cards so the cells do not follow the cake's layout.
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    const { cells, inner } = layOut(cards);
    return { difficulty, seed: s, cake, strawberries: placeStrawberries(cake, rand), cards, cuts: cut.cuts, cells, inner };
  }
}

/** How well a piece fits a card when turned exactly as the card is (for matching pieces to cards). */
export function fitAtCardTurn(piece: Polygon, card: Card, iou: (a: Polygon, b: Polygon) => number): number {
  return iou(rotate(piece, card.turn), card.polygon);
}

/** How well a piece (its footprint turned to the box's frame) fits a card: 0 to 1, with the small turn that fits best. */
export function fitOnCard(piece: Polygon, card: Card, yaw: number, iou: (a: Polygon, b: Polygon) => number): { fit: number; yaw: number } {
  // Forgiving: the best of a few small turns either way counts.
  let best = { fit: -1, yaw };
  for (let step = -5; step <= 5; step++) {
    const y = yaw + step * (2 * Math.PI) / 180;
    const fit = iou(rotate(piece, y), card.polygon);
    if (fit > best.fit) best = { fit, yaw: y };
  }
  return best;
}
