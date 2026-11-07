/**
 * The pads: four little buttons on the counter's front edge (Easy, Medium,
 * Hard, New cake), pressed by touching them with a fingertip (IWSDK's
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
import { COUNTER_TOP_Y } from '../scene-assets/kitchen.scene-asset.js';
import type { Difficulty } from './level.js';

export type PadKind = Difficulty | 'new';
const KINDS: PadKind[] = ['easy', 'medium', 'hard', 'new'];
const LABELS: Record<PadKind, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', new: 'New cake' };
const COLORS: Record<PadKind, number> = { easy: 0xb7e0b4, medium: 0xf6d99a, hard: 0xf3aeb8, new: 0xcdc4ee };
const SIZE = { width: 0.07, depth: 0.04, height: 0.012 };
const GAP = 0.018;
/** Where the row of pads sits, in the counter's frame: right of the knife, near the front edge. */
const ROW = { x: 0.1, z: 0.24 };
const PRESS_DEPTH = 0.005;

function label(text: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 146;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#5a3a46';
  ctx.font = 'bold 54px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 76);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Make the pads; returns their entities, in KINDS order. */
export function createPads(world: World): Entity[] {
  const counter = world.getSceneObject('counter')!;
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
    group.position.copy(counter.localToWorld(new Vector3(x, COUNTER_TOP_Y, ROW.z)));
    const entity = world.createTransformEntity(group);
    entity.addComponent(Pad, { kind: i });
    entity.addComponent(PokeInteractable);
    return entity;
  });
}

/** Pressing a pad: sinks it while touched, fires once per touch. */
export class PadSystem extends createSystem({
  pads: { required: [Pad] },
  pressed: { required: [Pad, Pressed] },
}) {
  onPress: ((kind: PadKind) => void) | null = null;
  private readonly lastPress = new Map<Entity, number>();

  init(): void {
    this.cleanupFuncs.push(
      this.queries.pressed.subscribe('qualify', (entity) => {
        const now = performance.now();
        if (now - (this.lastPress.get(entity) ?? -Infinity) < 600) return;
        this.lastPress.set(entity, now);
        this.onPress?.(KINDS[entity.getValue(Pad, 'kind') ?? 0]);
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
