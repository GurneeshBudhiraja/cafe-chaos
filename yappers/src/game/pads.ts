/**
 * The pads: four little buttons on the table's front edge (Easy, Medium,
 * Hard, New crowd), pressed by touching them with a fingertip (IWSDK's
 * poke interaction). A pad sinks while a finger is on it.
 */

import {
  BoxGeometry,
  CanvasTexture,
  createSystem,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PokeInteractable,
  Pressed,
  SRGBColorSpace,
  Vector3,
  type Entity,
  type World,
} from '@iwsdk/core';
import { Pad } from '../game-components.js';
import { castShadows } from '../lighting.js';
import { TABLE_TOP_Y } from '../scene-assets/furniture.scene-asset.js';
import type { Difficulty } from '../yappers/rules.js';

export type PadKind = Difficulty | 'new';
const KINDS: PadKind[] = ['easy', 'medium', 'hard', 'new'];
const LABELS: Record<PadKind, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', new: 'New crowd' };
const COLORS: Record<PadKind, number> = { easy: 0xb7e0b4, medium: 0xf6d99a, hard: 0xf3aeb8, new: 0xc9d6ee };
const SIZE = { width: 0.07, depth: 0.04, height: 0.012 };
const GAP = 0.018;
/** Where the row of pads sits, in the table's frame: the right end of the front edge, clear of the bus. */
const ROW = { x: 0.5, z: 0.3 };
const PRESS_DEPTH = 0.005;

function label(text: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 146;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#4a4660';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Shrink the type for a long label.
  let size = 54;
  do {
    ctx.font = `bold ${size}px sans-serif`;
    size -= 2;
  } while (ctx.measureText(text).width > 224 && size > 20);
  ctx.fillText(text, 128, 76);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Make the pads; returns their entities, in KINDS order. */
export function createPads(world: World): Entity[] {
  const table = world.getSceneObject('table')!;
  const total = KINDS.length * SIZE.width + (KINDS.length - 1) * GAP;
  return KINDS.map((kind, i) => {
    const group = new Group();
    group.name = `Pad:${kind}`;
    const base = new Mesh(new BoxGeometry(SIZE.width, SIZE.height, SIZE.depth), new MeshStandardMaterial({ color: COLORS[kind], roughness: 0.6 }));
    base.position.y = SIZE.height / 2;
    base.name = 'PadBase';
    const face = new Mesh(new PlaneGeometry(SIZE.width * 0.92, SIZE.depth * 0.92), new MeshStandardMaterial({ map: label(LABELS[kind]), transparent: true, roughness: 0.7 }));
    face.rotation.x = -Math.PI / 2;
    face.position.y = SIZE.height + 0.0005;
    face.name = 'PadFace';
    group.add(base, face);
    castShadows(group);
    const x = ROW.x - total / 2 + SIZE.width / 2 + i * (SIZE.width + GAP);
    group.position.copy(table.localToWorld(new Vector3(x, TABLE_TOP_Y, ROW.z)));
    const entity = world.createTransformEntity(group);
    entity.addComponent(Pad, { kind: i });
    entity.addComponent(PokeInteractable);
    return entity;
  });
}

/** A pad fires once per touch, and not again within this long (the poke can flicker as the finger leaves). */
const PRESS_COOLDOWN_MS = 1200;

/** Pressing a pad: sinks it while touched, fires once per touch. */
export class PadSystem extends createSystem({
  pads: { required: [Pad] },
  pressed: { required: [Pad, Pressed] },
}) {
  onPress: ((kind: PadKind) => void) | null = null;
  private readonly lastPress = new Map<Entity, number>();
  /** Pads whose finger has left since they last fired. */
  private readonly armed = new Set<Entity>();

  init(): void {
    this.cleanupFuncs.push(
      this.queries.pressed.subscribe('qualify', (entity) => {
        const now = performance.now();
        const fresh = this.armed.has(entity) || !this.lastPress.has(entity);
        if (!fresh || now - (this.lastPress.get(entity) ?? -Infinity) < PRESS_COOLDOWN_MS) return;
        this.lastPress.set(entity, now);
        this.armed.delete(entity);
        this.onPress?.(KINDS[entity.getValue(Pad, 'kind') ?? 0]);
      }),
      this.queries.pressed.subscribe('disqualify', (entity) => {
        // Re-arm only once the finger has been off the pad for the cooldown.
        setTimeout(() => {
          if (!entity.hasComponent(Pressed)) this.armed.add(entity);
        }, PRESS_COOLDOWN_MS);
      }),
    );
  }

  update(delta: number): void {
    for (const entity of this.queries.pads.entities) {
      const base = entity.object3D?.getObjectByName('PadBase');
      const face = entity.object3D?.getObjectByName('PadFace');
      if (!base || !face) continue;
      const target = entity.hasComponent(Pressed) ? -PRESS_DEPTH : 0;
      const k = Math.min(1, delta * 18);
      base.position.y += (SIZE.height / 2 + target - base.position.y) * k;
      face.position.y = base.position.y + SIZE.height / 2 + 0.0005;
    }
  }
}
