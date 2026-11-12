/**
 * SoundSystem: the café's own sounds, under the theme, so it sounds like
 * a café and not only looks like one. Every sound comes from where its
 * source is in the little café (3D sound, HRTF), so turning the head
 * moves it and leaning in to the bar makes the bar louder. All of it is
 * made in code (audio/voices.ts): nothing to download, nothing licensed.
 *
 * - The room: a soft murmur, slowly rising and falling.
 * - The bar: the kettle simmering on its brazier; now and then the
 *   espresso machine grinding and steaming; cups clinking at the tables.
 * - The door: the wind chime rings when a guest arrives.
 * - The garden: the pond trickling, a cricket now and then.
 * - The hands: a little pop and an "oh!" when a guest is picked up; a
 *   soft thump, a two-note chime and a contented "mm" when one is seated;
 *   a sigh when one gives up; a tray set down when a server serves; the
 *   padlock's click and a run of bells when the café is extended.
 *
 * Sounds start with the XR session (entering it is the player's go-ahead
 * to play sound) and stop when it ends; in the desktop preview the café
 * is silent. Events are noticed from the other systems' counts, so
 * nothing else has to know about sound.
 */

import { createSystem, Vector3, type Object3D } from '@iwsdk/core';
import { bubble, clink, closing, coins, cricket, espresso, furin, grumble, pop, refuse, roomTone, seated, tick, trayDown, trickle, unlock, voice } from '../audio/voices.js';
import { BaristaSystem } from './barista-system.js';
import { CafeSystem } from './cafe-system.js';
import { GameSystem } from './game-system.js';
import { ScoreSystem } from './score-system.js';
import { GuestSystem } from './guest-system.js';
import { ShopSystem } from './shop-system.js';

/** How loud it all is (0 to 1), and each group within that. The theme plays at 5%; these sit just under and around it. */
export const SOUND = { master: 0.32, room: 0.5, bar: 0.7, door: 0.8, garden: 0.55, hands: 1 };
/** How often the background sounds come (seconds between, at random within the range). */
const EVERY = { bubble: [0.18, 0.7], espresso: [20, 38], clink: [5, 11], trickle: [0.25, 0.6], cricket: [4, 10] } as const;
/** Where the steady sources are, in café space, when the shell has no node for them (metres). */
const PLACES = {
  room: new Vector3(0, 0.06, -0.03),
  pond: new Vector3(-0.39, 0.03, 0.26),
  annexPond: new Vector3(-0.62, 0.03, 0.26),
  crickets: [new Vector3(-0.42, 0.03, -0.29), new Vector3(0.42, 0.03, -0.29), new Vector3(0.43, 0.03, 0.29)],
};
/** Distance falloff: at about the café's distance from the eyes a sound plays at its own level. */
const NEAR_M = 0.35;

export class SoundSystem extends createSystem({}) {
  /** The audio context, made when the session starts. */
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  /** How many sounds have played, by name (for the checks). */
  readonly played: Record<string, number> = {};
  private cafe!: CafeSystem;
  private guests: GuestSystem | null = null;
  private baristas: BaristaSystem | null = null;
  private shop: ShopSystem | null = null;
  private readonly next: Record<keyof typeof EVERY, number> = { bubble: 0, espresso: 8, clink: 3, trickle: 0, cricket: 2 };
  private seen = { arrived: 0, pickedUp: 0, seated: 0, gaveUp: 0, served: 0, purchases: 0, refused: 0, scored: 0, clicks: 0, closed: false, placements: -1 };
  private score: ScoreSystem | null = null;
  private game: GameSystem | null = null;
  private readonly at = new Vector3();
  private readonly forward = new Vector3();
  private readonly up = new Vector3();

  init(): void {
    this.cafe = this.world.getSystem(CafeSystem)!;
    this.guests = this.world.getSystem(GuestSystem) ?? null;
    this.baristas = this.world.getSystem(BaristaSystem) ?? null;
    this.shop = this.world.getSystem(ShopSystem) ?? null;
    this.score = this.world.getSystem(ScoreSystem) ?? null;
    this.game = this.world.getSystem(GameSystem) ?? null;
    const xr = this.world.renderer.xr;
    xr.addEventListener('sessionstart', () => {
      this.start();
      // A pinch is a player action too: if the browser held the sound back, the first one lets it go.
      xr.getSession()?.addEventListener('selectstart', () => void this.ctx?.resume());
    });
    xr.addEventListener('sessionend', () => void this.ctx?.suspend());
  }

  update(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.cafe.placed || this.cafe.arriving) return;
    this.listen();
    const now = ctx.currentTime;
    this.background(now);
    this.events(now);
  }

  /** Make the context and the steady sounds (the room's murmur). */
  private start(): void {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = SOUND.master;
      this.master.connect(ctx.destination);
      roomTone(ctx, this.place(PLACES.room, SOUND.room));
    }
    void this.ctx.resume();
  }

  /** The listener is the player's head. */
  private listen(): void {
    const ctx = this.ctx!;
    const head = this.player.head;
    head.getWorldPosition(this.at);
    this.forward.set(0, 0, -1).transformDirection(head.matrixWorld);
    this.up.set(0, 1, 0).transformDirection(head.matrixWorld);
    const l = ctx.listener;
    if (l.positionX) {
      const t = ctx.currentTime;
      l.positionX.setValueAtTime(this.at.x, t);
      l.positionY.setValueAtTime(this.at.y, t);
      l.positionZ.setValueAtTime(this.at.z, t);
      l.forwardX.setValueAtTime(this.forward.x, t);
      l.forwardY.setValueAtTime(this.forward.y, t);
      l.forwardZ.setValueAtTime(this.forward.z, t);
      l.upX.setValueAtTime(this.up.x, t);
      l.upY.setValueAtTime(this.up.y, t);
      l.upZ.setValueAtTime(this.up.z, t);
    } else {
      l.setPosition(this.at.x, this.at.y, this.at.z);
      l.setOrientation(this.forward.x, this.forward.y, this.forward.z, this.up.x, this.up.y, this.up.z);
    }
  }

  /**
   * A panner at a café-space point (followed into the world as it is
   * now), with a gain in front of it, into the master. A steady source's
   * panner is fixed where the café stood when it began; one-shots are
   * short enough that the café cannot move far meanwhile.
   */
  private place(local: Vector3, level: number, seconds = 0): AudioNode {
    const ctx = this.ctx!;
    const world = this.cafe.cafe.localToWorld(this.at.copy(local));
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = NEAR_M;
    panner.rolloffFactor = 1.2;
    panner.positionX.value = world.x;
    panner.positionY.value = world.y;
    panner.positionZ.value = world.z;
    const gain = ctx.createGain();
    gain.gain.value = level;
    gain.connect(panner).connect(this.master!);
    if (seconds > 0) setTimeout(() => panner.disconnect(), (seconds + 0.5) * 1000);
    return gain;
  }

  /** Play a one-shot sound at a café-space point. */
  private emit(name: string, local: Vector3, level: number, seconds: number, sound: (ctx: BaseAudioContext, out: AudioNode, t: number) => void, delay = 0): void {
    const ctx = this.ctx!;
    sound(ctx, this.place(local, level, seconds), ctx.currentTime + delay);
    this.played[name] = (this.played[name] ?? 0) + 1;
  }

  /** A node of the café by name, in café space (or the fallback). */
  private spot(name: string, fallback: Vector3): Vector3 {
    const node = this.cafe.cafe.getObjectByName(name) as Object3D | undefined;
    if (!node) return fallback.clone();
    return this.cafe.cafe.worldToLocal(node.getWorldPosition(new Vector3()));
  }

  /** The sounds that go on by themselves: the kettle, the espresso machine, cups at the tables, the pond, the crickets. */
  private background(now: number): void {
    const due = (name: keyof typeof EVERY): boolean => {
      if (now < this.next[name]) return false;
      const [a, b] = EVERY[name];
      this.next[name] = now + a + Math.random() * (b - a);
      return true;
    };
    if (due('bubble')) this.emit('bubble', this.spot('Steam-Kettle-1', PLACES.room), SOUND.bar * 0.6, 0.2, bubble);
    if (due('espresso')) this.emit('espresso', this.spot('Steam-Machine-1', PLACES.room), SOUND.bar, 4.5, espresso);
    if (due('clink')) {
      // At a table someone is sitting at, if anyone is; else somewhere in the room.
      const seats = this.guests?.seats.filter((s) => s.occupant !== 0) ?? [];
      const seat = seats[Math.floor(Math.random() * seats.length)];
      this.emit('clink', seat ? (seat.meal ?? seat.position) : PLACES.room, SOUND.bar * 0.7, 0.4, clink);
    }
    if (due('trickle')) this.emit('trickle', this.cafe.annex ? PLACES.annexPond : PLACES.pond, SOUND.garden, 0.4, trickle);
    if (due('cricket')) this.emit('cricket', PLACES.crickets[Math.floor(Math.random() * PLACES.crickets.length)], SOUND.garden, 0.4, cricket);
  }

  /** What has just happened, read from the other systems' counts. */
  private events(now: number): void {
    const guests = this.guests;
    const seen = this.seen;
    if (seen.placements !== this.cafe.placements) {
      // A fresh café: start counting from here, so nothing from before plays.
      seen.placements = this.cafe.placements;
      seen.arrived = guests?.arrived ?? 0;
      seen.pickedUp = guests?.pickedUp ?? 0;
      seen.seated = guests?.seated ?? 0;
      seen.gaveUp = guests?.gaveUp ?? 0;
      seen.served = this.baristas?.servedCount ?? 0;
    }
    if (guests) {
      if (guests.arrived > seen.arrived) this.emit('furin', this.spot('Entrance', PLACES.room), SOUND.door, 3, furin);
      if (guests.pickedUp > seen.pickedUp) {
        const held = guests.guests.filter((g) => g.state === 'held').sort((a, b) => b.id - a.id)[0];
        const where = held ? held.actor.root.position : PLACES.room;
        this.emit('pop', where, SOUND.hands, 0.3, pop);
        this.emit('oh', where, SOUND.hands, 0.4, (c, o, t) => voice(c, o, t, 'oh'), 0.05);
      }
      if (guests.seated > seen.seated) {
        const sat = guests.guests.filter((g) => g.seat && (g.state === 'seated' || g.state === 'hop')).sort((a, b) => b.id - a.id)[0];
        const where = sat?.seat?.position ?? PLACES.room;
        this.emit('seated', where, SOUND.hands, 1, seated);
        this.emit('mm', where, SOUND.hands, 0.5, (c, o, t) => voice(c, o, t, 'mm'), 0.35);
      }
      if (guests.gaveUp > seen.gaveUp) {
        const gone = guests.guests.filter((g) => g.state === 'vanishing' || (g.state === 'leaving' && g.side === null)).sort((a, b) => b.id - a.id)[0];
        this.emit('sigh', gone ? gone.actor.root.position : this.spot('Entrance', PLACES.room), SOUND.hands * 0.8, 0.8, (c, o, t) => voice(c, o, t, 'sigh'));
      }
      seen.arrived = guests.arrived;
      seen.pickedUp = guests.pickedUp;
      seen.seated = guests.seated;
      seen.gaveUp = guests.gaveUp;
    }
    const baristas = this.baristas;
    if (baristas && baristas.servedCount > seen.served) {
      const id = baristas.servedLog[baristas.servedLog.length - 1];
      const seat = guests?.guests.find((g) => g.id === id)?.seat;
      this.emit('tray', seat ? (seat.meal ?? seat.position) : PLACES.room, SOUND.bar, 0.6, trayDown);
      seen.served = baristas.servedCount;
    }
    // Hiring: a new server rings the bells; a press the bank cannot pay for gets a knock and an "uh-uh".
    const shop = this.shop;
    if (shop) {
      if (shop.purchases > seen.purchases) this.emit('unlock', PLACES.room, SOUND.hands, 1.6, unlock);
      if (shop.refused > seen.refused) this.emit('refuse', PLACES.room, SOUND.hands, 0.4, refuse);
      seen.purchases = shop.purchases;
      seen.refused = shop.refused;
    }
    // The score: coins for a happy guest, a grumble for one who stormed out.
    const log = this.score?.log ?? [];
    if (log.length < seen.scored) seen.scored = 0;
    for (const entry of log.slice(seen.scored)) {
      if (entry.kind === 'paid') this.emit('coins', PLACES.room, SOUND.hands * 0.8, 0.3, coins);
      if (entry.kind === 'stormedOff') this.emit('grumble', PLACES.room, SOUND.hands, 0.4, grumble);
    }
    seen.scored = log.length;
    // The cards: a tick for a button, bells at closing time.
    const game = this.game;
    if (game) {
      const card = game.card.mesh.position;
      if (game.clicks > seen.clicks) this.emit('tick', card, SOUND.hands, 0.1, tick);
      seen.clicks = game.clicks;
      const closed = game.phase === 'closed';
      if (closed && !seen.closed) this.emit('closing', card, SOUND.hands, 2, closing);
      seen.closed = closed;
    }
    void now;
  }
}
