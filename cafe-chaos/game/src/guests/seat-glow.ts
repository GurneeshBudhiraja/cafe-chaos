/**
 * The seat glow: while a guest is carried, the seat it would land on if
 * let go lights up in a soft violet, pulsing gently, and every other free
 * seat shows a small violet dot, so it is plain where guests can go and
 * where this one is about to.
 *
 * Violet because nothing else in the café is: the café is all warm
 * timber and lamp light, and a cool lo-fi violet sits with the night
 * around it without being mistaken for part of the scene. It is kept
 * subtle (a wash, not a beacon) but in three layers so it still reads
 * from the player's seat as well as from above:
 * - a pad: a violet wash on the cushion itself (the "seat cover");
 * - a halo: a wider soft ring around it, added to what is behind;
 * - a column: a faint shaft of light rising from the seat, which is
 *   what shows when the seat is seen from the side or is behind a table.
 * While a guest is carried, the seat it would land on says whether it
 * meets the guest's wishes: mint if it meets them all, red if it does
 * not (so a seat that would let the guest down is plain before letting
 * go). The other free seats keep their small dots: mint for the seats
 * that would meet every wish, violet for the rest.
 * One set per hand; the dots are one instanced mesh.
 */

import {
  CanvasTexture, Color, CustomBlending, CylinderGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, OneFactor, PlaneGeometry, Quaternion, SrcAlphaFactor, Vector3, ZeroFactor,
} from '@iwsdk/core';
import type { Seat } from './seats.js';

/** The glow's colour and sizes (metres, café space): the pad on the cushion, the halo round it, the column above, the dots. */
export const GLOW = { color: 0x9a86ff, pad: 0.034, halo: 0.07, column: { radius: 0.016, height: 0.065 }, dot: 0.014, lift: 0.0025 };
/** A seat that would grant the carried guest's wish: mint in place of violet, and its dot larger. */
export const GRANT = { color: 0x58e39a, dot: 1.7 };
/** The landing seat when it would not meet every wish of the carried guest: a warm red. */
export const DENY = { color: 0xff4a3a };
/** The landing glow breathes between these, this many times a second: slow, like the lanterns. */
const PULSE = { low: 0.72, high: 1, rate: 0.9 };
/** How strong each layer is (0 to 1): enough to find at a glance, no more. */
const OPACITY = { pad: 0.62, halo: 0.55, column: 0.32, dot: 0.5 };

function canvasTexture(size: number, paint: (ctx: CanvasRenderingContext2D, size: number) => void): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  paint(canvas.getContext('2d')!, size);
  return new CanvasTexture(canvas);
}

/** A round gradient from the centre out, through the given alpha stops. */
function radial(stops: [number, number][]): CanvasTexture {
  return canvasTexture(128, (ctx, size) => {
    const c = size / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    for (const [at, alpha] of stops) g.addColorStop(at, `rgba(255,255,255,${alpha})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
}

/** Bright at the foot, fading to nothing at the top (v runs up the column). */
function rising(): CanvasTexture {
  return canvasTexture(64, (ctx, size) => {
    const g = ctx.createLinearGradient(0, size, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
}

/** Added to what is behind (colour only, see light/spill.ts): for light. */
function light(map: CanvasTexture, opacity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: new Color(GLOW.color), map, transparent: true, opacity, depthWrite: false, toneMapped: false, side: DoubleSide,
    blending: CustomBlending, blendSrc: SrcAlphaFactor, blendDst: OneFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor,
  });
}

/** Painted over what is behind: for the violet of the pad and the dots. */
function paint(map: CanvasTexture, opacity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({ color: new Color(GLOW.color), map, transparent: true, opacity, depthWrite: false, toneMapped: false });
}

/** One landing glow: pad, halo and column, with its origin on the seat top. */
interface Landing {
  group: Group;
  pad: MeshBasicMaterial;
  halo: MeshBasicMaterial;
  column: MeshBasicMaterial;
}

export class SeatGlow {
  /** The landing glows, one per hand that may carry. */
  readonly landing: Landing[] = [];
  readonly dots: InstancedMesh;
  /** The seat each landing glow is on this frame (null: hidden). */
  readonly target: (Seat | null)[] = [null, null];
  private time = 0;
  private readonly matrix = new Matrix4();
  private readonly flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  private readonly scale = new Vector3(GLOW.dot, GLOW.dot, GLOW.dot);
  private readonly violet = new Color(GLOW.color);
  private readonly mint = new Color(GRANT.color);
  private readonly red = new Color(DENY.color);
  private readonly place = new Vector3();

  constructor(cafe: Group, seatCount: number) {
    const plane = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const padMap = radial([[0, 1], [0.8, 1], [1, 0]]);
    const haloMap = radial([[0, 0.5], [0.42, 0.5], [0.5, 1], [0.6, 0.45], [1, 0]]);
    const columnMap = rising();
    const column = new CylinderGeometry(GLOW.column.radius, GLOW.column.radius * 0.8, GLOW.column.height, 20, 1, true).translate(0, GLOW.column.height / 2, 0);
    for (let i = 0; i < 2; i++) {
      const materials = { pad: paint(padMap, OPACITY.pad), halo: light(haloMap, OPACITY.halo), column: light(columnMap, OPACITY.column) };
      const group = new Group();
      group.name = 'SeatGlow';
      group.userData.dynamic = true;
      group.visible = false;
      const pad = new Mesh(plane, materials.pad);
      pad.scale.setScalar(GLOW.pad);
      pad.renderOrder = 12;
      const halo = new Mesh(plane, materials.halo);
      halo.scale.setScalar(GLOW.halo);
      halo.position.y = -0.0005;
      halo.renderOrder = 11;
      const shaft = new Mesh(column, materials.column);
      shaft.renderOrder = 13;
      group.add(halo, pad, shaft);
      cafe.add(group);
      this.landing.push({ group, ...materials });
    }
    // The dots take their colour one by one (violet, or mint for a seat that grants a wish), so the material is white.
    const dotPaint = paint(radial([[0, 1], [0.55, 0.9], [1, 0]]), OPACITY.dot);
    dotPaint.color.set(0xffffff);
    this.dots = new InstancedMesh(new PlaneGeometry(1, 1), dotPaint, seatCount);
    for (let i = 0; i < seatCount; i++) this.dots.setColorAt(i, this.violet);
    this.dots.name = 'SeatDots';
    this.dots.renderOrder = 10;
    this.dots.frustumCulled = false;
    this.dots.count = 0;
    this.dots.userData.dynamic = true;
    cafe.add(this.dots);
  }

  /**
   * Show the glows for this frame: `targets` is the landing seat of each
   * carrying hand (null where a hand carries nothing or is over no
   * seat); the dots show on the other free seats while anything is
   * carried. `granting` is the seats that would meet every wish of the
   * carried guest: their dots show mint, and larger; the landing seat is
   * mint if it is one of them, red if not.
   */
  show(seats: Seat[], targets: (Seat | null)[], carrying: boolean, delta: number, granting: ReadonlySet<Seat> | null = null): void {
    this.time += delta;
    const pulse = PULSE.low + (PULSE.high - PULSE.low) * (0.5 + 0.5 * Math.sin(this.time * PULSE.rate * Math.PI * 2));
    for (let i = 0; i < this.landing.length; i++) {
      const seat = targets[i] ?? null;
      const glow = this.landing[i];
      this.target[i] = seat;
      glow.group.visible = !!seat;
      if (!seat) continue;
      glow.group.position.set(seat.position.x, seat.position.y + GLOW.lift, seat.position.z);
      const tint = granting ? (granting.has(seat) ? this.mint : this.red) : this.violet;
      glow.pad.color.copy(tint);
      glow.halo.color.copy(tint);
      glow.column.color.copy(tint);
      glow.pad.opacity = OPACITY.pad * pulse;
      glow.halo.opacity = OPACITY.halo * pulse;
      glow.column.opacity = OPACITY.column * pulse;
    }
    let count = 0;
    if (carrying) {
      for (const seat of seats) {
        if (seat.occupant !== 0 || seat.locked || targets.includes(seat)) continue;
        const grant = granting?.has(seat) ?? false;
        this.scale.setScalar(GLOW.dot * (grant ? GRANT.dot : 1));
        this.matrix.compose(this.place.set(seat.position.x, seat.position.y + GLOW.lift, seat.position.z), this.flat, this.scale);
        this.dots.setColorAt(count, grant ? this.mint : this.violet);
        this.dots.setMatrixAt(count++, this.matrix);
      }
      this.dots.instanceMatrix.needsUpdate = true;
      if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true;
    }
    this.dots.count = count;
  }
}
