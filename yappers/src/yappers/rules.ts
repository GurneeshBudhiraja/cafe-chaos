/**
 * The puzzle, as pure maths: the bus's seats, the Yappers' rules about
 * where they will sit, checking a seating against the rules, and making
 * levels that are always solvable (a seating is drawn first and the rules
 * are read off it, then rules are added until few seatings satisfy them).
 *
 * The bus has `rows` rows of four seats: two on the far side, an aisle,
 * two on the near side. Row 0 is the front. Seats are numbered
 * `row * 4 + column`; column 0 is the far window, 1 the far aisle seat,
 * 2 the near aisle seat, 3 the near window. A "pair" is the two seats on
 * one side of the aisle in one row: being "beside" someone means sharing
 * a pair.
 *
 * No three.js here: the tests import this module in Node.
 */

export const SEATS_PER_ROW = 4;

export type Difficulty = 'easy' | 'medium' | 'hard';

/** What a Yapper wants. `who` names another Yapper (its index in the level) for beside/apart. */
export type RuleKind = 'window' | 'aisle' | 'front' | 'back' | 'beside' | 'apart' | 'alone';
export interface Rule {
  kind: RuleKind;
  who?: number;
}

/** A rule's state for one seating: met, broken, or not yet decidable (the other Yapper is still standing). */
export type RuleState = 'ok' | 'bad' | 'pending';

export interface YapperSpec {
  name: string;
  /** Index into COLORS / HATS (each level uses each combination once). */
  color: number;
  hat: number;
  rules: Rule[];
  /** A seat that solves the level (the one the rules were read from). */
  solution: number;
}

export interface Level {
  difficulty: Difficulty;
  seed: number;
  rows: number;
  yappers: YapperSpec[];
  /** How many seatings satisfy every rule (capped at SOLUTION_CAP). */
  solutions: number;
}

export const NAMES = ['Pip', 'Bo', 'Zuzu', 'Momo', 'Kiki', 'Tiktik', 'Lulu', 'Gogo', 'Nib', 'Wobble', 'Dot', 'Fizz'];
/** Body colours (hex) and hat kinds; the look module draws them. */
export const COLORS = [0xf2c14e, 0x6fb7e9, 0xe98a8a, 0x8fd18b, 0xc39be6, 0xf5a76c, 0x7fd6c8, 0xf0f0f0];
export const HATS = ['none', 'cap', 'bow', 'beanie', 'glasses', 'flower', 'propeller', 'headphones'] as const;
export type Hat = (typeof HATS)[number];

const SETTINGS: Record<Difficulty, { rows: number; yappers: number; rulesEach: [number, number]; targetSolutions: number }> = {
  easy: { rows: 2, yappers: 4, rulesEach: [1, 1], targetSolutions: 40 },
  medium: { rows: 3, yappers: 6, rulesEach: [1, 2], targetSolutions: 8 },
  hard: { rows: 3, yappers: 8, rulesEach: [2, 3], targetSolutions: 2 },
};
export const SOLUTION_CAP = 500;

// ------------------------------------------------------------- seat maths

export const seatRow = (seat: number): number => Math.floor(seat / SEATS_PER_ROW);
export const seatColumn = (seat: number): number => seat % SEATS_PER_ROW;
export const isWindow = (seat: number): boolean => seatColumn(seat) === 0 || seatColumn(seat) === 3;
export const isAisle = (seat: number): boolean => !isWindow(seat);
/** The other seat of a seat's pair. */
export const pairMate = (seat: number): number => (seatColumn(seat) < 2 ? seatRow(seat) * 4 + (1 - seatColumn(seat)) : seatRow(seat) * 4 + (5 - seatColumn(seat)));
export const beside = (a: number, b: number): boolean => a !== b && pairMate(a) === b;

/** A seating: Yapper index -> seat, for the seated ones. */
export type Seating = ReadonlyMap<number, number>;

/** Check one rule of Yapper `me` against a seating (me must be seated). */
export function checkRule(rule: Rule, me: number, seating: Seating, rows: number): RuleState {
  const seat = seating.get(me);
  if (seat === undefined) return 'pending';
  switch (rule.kind) {
    case 'window':
      return isWindow(seat) ? 'ok' : 'bad';
    case 'aisle':
      return isAisle(seat) ? 'ok' : 'bad';
    case 'front':
      return seatRow(seat) === 0 ? 'ok' : 'bad';
    case 'back':
      return seatRow(seat) === rows - 1 ? 'ok' : 'bad';
    case 'beside': {
      const other = seating.get(rule.who!);
      if (other === undefined) {
        // Decidable early: the seat beside me is taken by someone else.
        const mate = pairMate(seat);
        for (const [who, s] of seating) if (who !== me && s === mate) return 'bad';
        return 'pending';
      }
      return beside(seat, other) ? 'ok' : 'bad';
    }
    case 'apart': {
      const other = seating.get(rule.who!);
      if (other === undefined) return 'pending';
      return beside(seat, other) ? 'bad' : 'ok';
    }
    case 'alone': {
      const mate = pairMate(seat);
      for (const [who, s] of seating) if (who !== me && s === mate) return 'bad';
      return 'ok';
    }
  }
}

/** Every rule of a Yapper, in order. */
export function checkYapper(spec: YapperSpec, me: number, seating: Seating, rows: number): RuleState[] {
  return spec.rules.map((rule) => checkRule(rule, me, seating, rows));
}

/** Is the whole level solved by this seating: everyone seated, every rule met? */
export function isSolved(level: Level, seating: Seating): boolean {
  return level.yappers.every((spec, i) => seating.has(i) && checkYapper(spec, i, seating, level.rows).every((s) => s === 'ok'));
}

/** Count the seatings (up to `cap`) in which every rule is met. */
export function countSolutions(yappers: { rules: Rule[] }[], rows: number, cap = SOLUTION_CAP): number {
  const seats = rows * SEATS_PER_ROW;
  const seating = new Map<number, number>();
  const taken = new Array<boolean>(seats).fill(false);
  let count = 0;
  const consistent = (): boolean => {
    for (const [who] of seating) {
      for (const rule of yappers[who].rules) if (checkRule(rule, who, seating, rows) === 'bad') return false;
    }
    return true;
  };
  const place = (who: number): void => {
    if (count >= cap) return;
    if (who === yappers.length) {
      count++;
      return;
    }
    for (let seat = 0; seat < seats; seat++) {
      if (taken[seat]) continue;
      taken[seat] = true;
      seating.set(who, seat);
      if (consistent()) place(who + 1);
      seating.delete(who);
      taken[seat] = false;
    }
  };
  place(0);
  return count;
}

// ------------------------------------------------------------- generation

/** A small seeded random (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Every rule that is true of Yapper `me` in the drawn seating (the pool rules are picked from). */
function trueRules(me: number, seats: number[], rows: number): Rule[] {
  const seat = seats[me];
  const rules: Rule[] = [];
  rules.push({ kind: isWindow(seat) ? 'window' : 'aisle' });
  if (seatRow(seat) === 0) rules.push({ kind: 'front' });
  if (seatRow(seat) === rows - 1) rules.push({ kind: 'back' });
  let mateTaken = false;
  seats.forEach((other, who) => {
    if (who === me) return;
    if (beside(seat, other)) {
      rules.push({ kind: 'beside', who });
      mateTaken = true;
    } else rules.push({ kind: 'apart', who });
  });
  if (!mateTaken) rules.push({ kind: 'alone' });
  return rules;
}

const sameRule = (a: Rule, b: Rule): boolean => a.kind === b.kind && a.who === b.who;

/**
 * Pick a rule for `me` from its true ones, avoiding ones it has, mirror
 * images of "beside" it is already in, and (early on) the weak "apart".
 */
function pickRule(me: number, pool: Rule[], chosen: Rule[][], random: () => number, allowApart: boolean): Rule | null {
  const candidates = pool.filter((rule) => {
    if (chosen[me].some((r) => sameRule(r, rule))) return false;
    if (rule.kind === 'apart' && !allowApart) return false;
    if (rule.kind === 'beside' && chosen[rule.who!].some((r) => r.kind === 'beside' && r.who === me)) return false;
    return true;
  });
  if (!candidates.length) return null;
  // Weighted: positional and beside rules are the most telling; alone less so, and the
  // many "apart" rules share one small weight between them.
  const aparts = Math.max(1, candidates.filter((r) => r.kind === 'apart').length);
  const weight = (rule: Rule): number => (rule.kind === 'beside' ? 3 : rule.kind === 'apart' ? 0.8 / aparts : rule.kind === 'alone' ? 1.2 : 2);
  const total = candidates.reduce((s, r) => s + weight(r), 0);
  let pick = random() * total;
  for (const rule of candidates) {
    pick -= weight(rule);
    if (pick <= 0) return rule;
  }
  return candidates[candidates.length - 1];
}

/**
 * Make a level. A seating is drawn at random, each Yapper gets rules that
 * are true of it there, and more rules are added (up to the difficulty's
 * maximum each) until at most `targetSolutions` seatings satisfy them.
 * The drawn seating always does, so the level is always solvable.
 */
export function makeLevel(difficulty: Difficulty, seed = Math.floor(Math.random() * 1e9)): Level {
  const { rows, yappers: count, rulesEach, targetSolutions } = SETTINGS[difficulty];
  const random = rng(seed);
  const seats = shuffle(Array.from({ length: rows * SEATS_PER_ROW }, (_, i) => i), random).slice(0, count);
  const pools = seats.map((_, me) => trueRules(me, seats, rows));
  const chosen: Rule[][] = seats.map(() => []);
  // The minimum number of rules each.
  for (let me = 0; me < count; me++) {
    for (let n = 0; n < rulesEach[0]; n++) {
      const rule = pickRule(me, pools[me], chosen, random, n > 0);
      if (rule) chosen[me].push(rule);
    }
  }
  // Tighten: while too many seatings satisfy the rules, try a few more true rules
  // (on Yappers with room for one) and keep the one that rules out the most.
  let solutions = countSolutions(chosen.map((rules) => ({ rules })), rows);
  let guard = 0;
  while (solutions > targetSolutions && guard++ < 12) {
    const room = seats.map((_, me) => me).filter((me) => chosen[me].length < rulesEach[1]);
    let best: { me: number; rule: Rule; solutions: number } | null = null;
    for (const me of shuffle(room, random).slice(0, 4)) {
      for (let n = 0; n < 3; n++) {
        const rule = pickRule(me, pools[me], chosen, random, true);
        if (!rule) break;
        const trial = chosen.map((rules, i) => ({ rules: i === me ? [...rules, rule] : rules }));
        const count = countSolutions(trial, rows, best ? best.solutions : solutions);
        if (!best || count < best.solutions) best = { me, rule, solutions: count };
      }
    }
    if (!best) break;
    chosen[best.me].push(best.rule);
    solutions = best.solutions;
  }
  // Looks: distinct names, colours and hats.
  const names = shuffle(NAMES, random).slice(0, count);
  const colors = shuffle(COLORS.map((_, i) => i), random).slice(0, count);
  const hats = shuffle(HATS.map((_, i) => i), random).slice(0, count);
  return {
    difficulty,
    seed,
    rows,
    solutions,
    yappers: seats.map((seat, me) => ({ name: names[me], color: colors[me], hat: hats[me], rules: chosen[me], solution: seat })),
  };
}

/** The rule in words, for cards and logs. */
export function describeRule(rule: Rule, level: Level): string {
  switch (rule.kind) {
    case 'window':
      return 'window seat';
    case 'aisle':
      return 'aisle seat';
    case 'front':
      return 'front row';
    case 'back':
      return 'back row';
    case 'beside':
      return `beside ${level.yappers[rule.who!].name}`;
    case 'apart':
      return `not by ${level.yappers[rule.who!].name}`;
    case 'alone':
      return 'spare seat beside';
  }
}
