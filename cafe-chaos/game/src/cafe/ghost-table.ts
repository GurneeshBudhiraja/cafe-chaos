/**
 * The next table, before it is bought: a ghost of it where it will stand.
 * Only one shows at a time (the tables after it are not drawn at all), so
 * the café never looks full of grey furniture, and the player sees what
 * the next coins buy.
 *
 * Two looks (GHOST, all the numbers in one place, to tune after a Quest
 * playtest):
 * - faint: the bank cannot pay for it yet. A see-through grey copy of the
 *   table, a thin ink outline along its edges, and a soft dark footprint on
 *   the floor under it (as the guests' blobs), so it reads in passthrough
 *   over any real table, light or dark.
 * - ready: the bank can pay. Darker, the outline and footprint the same,
 *   and a small tag over it with a coin and the price. It swells once,
 *   gently, as it turns ready; nothing moves after that (no loop).
 *
 * It fades in when it appears, and out when the table is bought (the real
 * table fades in under it: CafeSystem.revealTable). It is its own copy of
 * the table (sharing the geometry), not the table itself: the real table
 * stays hidden and off the walk grid until it is bought, and the ghost is
 * neither in the static batch nor an obstacle (guests may walk through a
 * ghost).
 */

import { Box3, CanvasTexture, Color, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, PlaneGeometry, Sprite, SpriteMaterial, SRGBColorSpace, Vector3, type BufferGeometry, type Object3D } from '@iwsdk/core';
import { laidOn } from '../lib/decal.js';
import { hand } from '../ui/sketch.js';

/** The ghost's look (opacities 0 to 1, metres in the café's space, seconds). First guesses: tune them on the Quest. */
export const GHOST = {
  /** The see-through copy: its colour and how solid it is, faint (cannot pay) and ready (can pay). */
  colour: 0xd4d2ce,
  readyColour: 0x55524d,
  faint: 0.25,
  ready: 0.65,
  /** The ink outline along the table's edges (a crease sharper than `angle` degrees is an edge). */
  outline: { colour: 0x3e2a1c, faint: 0.35, ready: 0.6, angle: 35 },
  /** The soft footprint on the floor: its darkness, how much larger than the table's footprint, and its lift off the floor. */
  footprint: { colour: 0x120a06, opacity: 0.28, grow: 1.25, lift: 0.0015 },
  /** The one swell when it turns ready: how long and how much bigger at most. */
  pulse: { seconds: 0.7, scale: 0.06 },
  /** Fading in (it appears) and out (bought). */
  fade: 0.8,
  /** The price tag over it: its width and how far over the table top. */
  tag: { width: 0.05, above: 0.035 },
};

/** One edge geometry for each geometry the ghosts copy (a table type is copied many times over a game). */
const edgeCache = new WeakMap<BufferGeometry, EdgesGeometry>();
let footprintTexture: CanvasTexture | null = null;

/** A soft rounded rectangle, white in the middle fading to nothing at the edges (an alpha map). */
function softRect(): CanvasTexture {
  if (footprintTexture) return footprintTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.filter = 'blur(12px)';
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.roundRect(24, 24, size - 48, size - 48, 18);
  ctx.fill();
  footprintTexture = new CanvasTexture(canvas);
  return footprintTexture;
}

export class GhostTable {
  readonly root = new Group();
  /** The table's index into the café's pieces. */
  readonly index: number;
  private readonly body: MeshBasicMaterial;
  private readonly edges: LineBasicMaterial;
  private readonly foot: MeshBasicMaterial;
  private readonly tag: Sprite;
  private readonly tagCanvas = document.createElement('canvas');
  private readonly colour = new Color();
  /** 0 to 1: how far it has faded in (it goes back to 0 when bought, then is gone). */
  private shown = 0;
  private leaving = false;
  /** 0 (faint) to 1 (ready), eased. */
  private readiness = 0;
  private ready = false;
  private pulseAt = -1;
  private price = -1;

  /** A ghost of `piece` (a table of the café, café space), not yet shown: it fades in. */
  constructor(piece: Object3D, index: number) {
    this.index = index;
    this.root.name = `GhostTable-${index}`;
    // Neither in the static batch nor on the walk grid.
    this.root.userData.dynamic = true;
    this.root.userData.noNav = true;
    this.body = new MeshBasicMaterial({ color: GHOST.colour, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.body.name = 'GhostTable';
    this.edges = new LineBasicMaterial({ color: GHOST.outline.colour, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.foot = laidOn(new MeshBasicMaterial({ color: GHOST.footprint.colour, alphaMap: softRect(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    // The copy: the same geometry, the ghost's material, an outline along its edges.
    const copy = piece.clone(true);
    copy.visible = true;
    copy.traverse((node) => {
      node.visible = true;
      delete node.userData.batched;
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.material = this.body;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      let edges = edgeCache.get(mesh.geometry);
      if (!edges) edgeCache.set(mesh.geometry, (edges = new EdgesGeometry(mesh.geometry, GHOST.outline.angle)));
      mesh.add(new LineSegments(edges, this.edges));
    });
    this.root.add(copy);
    // The footprint: the table's own footprint (its bounds, in the copy's space), a little larger, on the floor.
    copy.updateMatrixWorld(true);
    const box = new Box3();
    const inv = copy.matrixWorld.clone().invert();
    copy.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.computeBoundingBox();
      box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld.clone().premultiply(inv)));
    });
    const size = box.getSize(new Vector3());
    const footprint = new Mesh(new PlaneGeometry(size.x * GHOST.footprint.grow, size.z * GHOST.footprint.grow), this.foot);
    footprint.rotation.x = -Math.PI / 2;
    footprint.position.set((box.min.x + box.max.x) / 2, GHOST.footprint.lift, (box.min.z + box.max.z) / 2);
    footprint.renderOrder = 4;
    copy.add(footprint);
    // The price tag (shown only when ready), over the table's top.
    this.tagCanvas.width = 256;
    this.tagCanvas.height = 112;
    const texture = new CanvasTexture(this.tagCanvas);
    texture.colorSpace = SRGBColorSpace;
    this.tag = new Sprite(new SpriteMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    this.tag.scale.set(GHOST.tag.width, (GHOST.tag.width * 112) / 256, 1);
    this.tag.position.set(copy.position.x, copy.position.y + box.max.y + GHOST.tag.above, copy.position.z);
    this.tag.renderOrder = 10;
    this.root.add(this.tag);
  }

  /** Can the bank pay for it now? Ready: darker, the tag with `price`, and one swell as it turns ready. */
  setReady(ready: boolean, price: number): void {
    if (price !== this.price) {
      this.price = price;
      this.drawTag(price);
    }
    if (ready && !this.ready) this.pulseAt = 0;
    this.ready = ready;
  }

  /** Bought: it fades away (the real table fades in under it); `gone` once it has. */
  leave(): void {
    this.leaving = true;
  }

  get gone(): boolean {
    return this.leaving && this.shown <= 0;
  }

  /** Is it in its ready look (for the checks)? */
  get isReady(): boolean {
    return this.ready;
  }

  /** The tag is showing (for the checks). */
  get tagShown(): boolean {
    return this.tag.material.opacity > 0.05;
  }

  update(delta: number): void {
    const target = this.leaving ? 0 : 1;
    this.shown = Math.max(0, Math.min(1, this.shown + (target > this.shown ? 1 : -1) * (delta / GHOST.fade)));
    this.readiness += ((this.ready ? 1 : 0) - this.readiness) * Math.min(1, delta * 6);
    const k = this.readiness;
    const a = this.shown * this.shown * (3 - 2 * this.shown);
    this.body.opacity = a * (GHOST.faint + (GHOST.ready - GHOST.faint) * k);
    this.body.color.copy(this.colour.set(GHOST.colour).lerp(new Color(GHOST.readyColour), k));
    this.edges.opacity = a * (GHOST.outline.faint + (GHOST.outline.ready - GHOST.outline.faint) * k);
    this.foot.opacity = a * GHOST.footprint.opacity;
    this.tag.material.opacity = a * k;
    // One swell as it turns ready (up and back, eased), then still.
    let s = 1;
    if (this.pulseAt >= 0) {
      this.pulseAt += delta;
      const t = this.pulseAt / GHOST.pulse.seconds;
      if (t >= 1) this.pulseAt = -1;
      else s = 1 + GHOST.pulse.scale * Math.sin(Math.PI * t);
    }
    const copy = this.root.children[0];
    copy.scale.setScalar(s);
  }

  /** The tag: a paper pill with a coin and the price, in the bar's ink and the hand font. */
  private drawTag(price: number): void {
    const c = this.tagCanvas;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#d9cfbe';
    ctx.strokeStyle = '#16171d';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(5, 5, c.width - 10, c.height - 10, 44);
    ctx.fill();
    ctx.stroke();
    const cy = c.height / 2;
    ctx.fillStyle = '#e8b54a';
    ctx.beginPath();
    ctx.arc(68, cy, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = '#16171d';
    ctx.font = hand(64, 700);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${price}`, 112, cy + 3);
    (this.tag.material.map as CanvasTexture).needsUpdate = true;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.body.dispose();
    this.edges.dispose();
    this.foot.dispose();
    this.tag.material.map?.dispose();
    this.tag.material.dispose();
  }
}
