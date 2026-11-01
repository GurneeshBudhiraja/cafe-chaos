/**
 * The desk keyboard: its key table and the press-down helper.
 *
 * The model is `desk-keyboard` (made in Blender, see the asset contract
 * below). This module holds what code needs to know about it: where each
 * key is (so phase 4 can tell which key a fingertip is over), and how a
 * key moves when pressed. Typing into the note is phase 4, not here.
 *
 * Asset contract (desk-keyboard.glb), metres:
 * - Lies flat, key tops facing +Y, the front edge (space bar side) toward
 *   +Z, the viewer. The origin is the centre of the base's bottom face, so
 *   placing it at a desk point puts it on the desk.
 * - `Base`: the space grey aluminium body, matching the tablet (brushed
 *   grain, a polished chamfer round the top edge), a slight wedge (5 mm
 *   thick at the front, 8 mm at the back). `KeyWell`: the dark matte plate
 *   under the keys, so the gaps between them read as depth.
 * - `Keys`: the key group, tilted with the deck (about 1.5 degrees). Its
 *   children are one mesh per key, `Key_<code>` (web KeyboardEvent.code
 *   names where they exist: Key_KeyQ, Key_Space, Key_Enter, Key_Backspace,
 *   Key_ShiftLeft; plus Key_Symbols and Key_Hide). Each key's origin is its
 *   cap's bottom centre and it presses along its local -Y.
 * - Light soft-touch keys (the pen's finish) share one material with one
 *   legend texture (an atlas of every key's legend). Return is satin clay
 *   with a faint glow and its own material.
 */

import { BatchedMesh, Mesh, type Material, type MeshStandardMaterial, type Object3D } from '@iwsdk/core';
import type { Tweens } from './tweens.js';

/** The base's footprint. */
export const KEYBOARD_WIDTH_M = 0.29;
export const KEYBOARD_DEPTH_M = 0.1115;
/** How far a pressed key goes down. */
export const KEY_TRAVEL_M = 0.002;

/** Key-down and key-up times (ms): a quick press, a slightly softer return. */
const PRESS_MS = 30;
const RETURN_MS = 80;
/** Angled-texture sharpening for the legends (three.js caps it at what the device supports). */
const LEGEND_ANISOTROPY = 8;

export interface KeyboardKey {
  /** KeyboardEvent.code where one exists ('KeyQ', 'Space', 'Enter'), else 'Symbols' or 'Hide'. */
  code: string;
  /** What the key types (or its name for keys that do not type). */
  label: string;
  /** What it types with shift held, where that differs. */
  shiftLabel?: string;
  /** Centre of the key's top face, in keyboard space (metres). */
  centre: readonly [number, number, number];
  /** The cap's width (across) and depth (front to back), in metres. */
  size: readonly [number, number];
}

/** Every key, back row first, left to right. Generated from the Blender model. */
export const KEYBOARD_KEYS: readonly KeyboardKey[] = [
  { code: 'Digit1', label: "1", shiftLabel: "!", centre: [-0.10725, 0.01035, -0.03891], size: [0.01650, 0.01650] },
  { code: 'Digit2', label: "2", shiftLabel: "@", centre: [-0.08775, 0.01035, -0.03891], size: [0.01650, 0.01650] },
  { code: 'Digit3', label: "3", shiftLabel: "#", centre: [-0.06825, 0.01035, -0.03891], size: [0.01650, 0.01650] },
  { code: 'Digit4', label: "4", shiftLabel: "$", centre: [-0.04875, 0.01035, -0.03891], size: [0.01650, 0.01650] },
  { code: 'Digit5', label: "5", shiftLabel: "%", centre: [-0.02925, 0.01035, -0.03891], size: [0.01650, 0.01650] },
  { code: 'Digit6', label: "6", shiftLabel: "^", centre: [-0.00975, 0.01035, -0.03891], size: [0.01650, 0.01650] },
  { code: 'Digit7', label: "7", shiftLabel: "&", centre: [0.00975, 0.01035, -0.03891], size: [0.01650, 0.01650] },
  { code: 'Digit8', label: "8", shiftLabel: "*", centre: [0.02925, 0.01035, -0.03891], size: [0.01650, 0.01650] },
  { code: 'Digit9', label: "9", shiftLabel: "(", centre: [0.04875, 0.01035, -0.03891], size: [0.01650, 0.01650] },
  { code: 'Digit0', label: "0", shiftLabel: ")", centre: [0.06825, 0.01035, -0.03891], size: [0.01650, 0.01650] },
  { code: 'Backspace', label: "delete", centre: [0.09750, 0.01035, -0.03891], size: [0.03600, 0.01650] },
  { code: 'KeyQ', label: "q", shiftLabel: "Q", centre: [-0.08775, 0.00982, -0.01942], size: [0.01650, 0.01650] },
  { code: 'KeyW', label: "w", shiftLabel: "W", centre: [-0.06825, 0.00982, -0.01942], size: [0.01650, 0.01650] },
  { code: 'KeyE', label: "e", shiftLabel: "E", centre: [-0.04875, 0.00982, -0.01942], size: [0.01650, 0.01650] },
  { code: 'KeyR', label: "r", shiftLabel: "R", centre: [-0.02925, 0.00982, -0.01942], size: [0.01650, 0.01650] },
  { code: 'KeyT', label: "t", shiftLabel: "T", centre: [-0.00975, 0.00982, -0.01942], size: [0.01650, 0.01650] },
  { code: 'KeyY', label: "y", shiftLabel: "Y", centre: [0.00975, 0.00982, -0.01942], size: [0.01650, 0.01650] },
  { code: 'KeyU', label: "u", shiftLabel: "U", centre: [0.02925, 0.00982, -0.01942], size: [0.01650, 0.01650] },
  { code: 'KeyI', label: "i", shiftLabel: "I", centre: [0.04875, 0.00982, -0.01942], size: [0.01650, 0.01650] },
  { code: 'KeyO', label: "o", shiftLabel: "O", centre: [0.06825, 0.00982, -0.01942], size: [0.01650, 0.01650] },
  { code: 'KeyP', label: "p", shiftLabel: "P", centre: [0.08775, 0.00982, -0.01942], size: [0.01650, 0.01650] },
  { code: 'KeyA', label: "a", shiftLabel: "A", centre: [-0.10238, 0.00930, 0.00008], size: [0.01650, 0.01650] },
  { code: 'KeyS', label: "s", shiftLabel: "S", centre: [-0.08287, 0.00930, 0.00008], size: [0.01650, 0.01650] },
  { code: 'KeyD', label: "d", shiftLabel: "D", centre: [-0.06338, 0.00930, 0.00008], size: [0.01650, 0.01650] },
  { code: 'KeyF', label: "f", shiftLabel: "F", centre: [-0.04388, 0.00930, 0.00008], size: [0.01650, 0.01650] },
  { code: 'KeyG', label: "g", shiftLabel: "G", centre: [-0.02437, 0.00930, 0.00008], size: [0.01650, 0.01650] },
  { code: 'KeyH', label: "h", shiftLabel: "H", centre: [-0.00488, 0.00930, 0.00008], size: [0.01650, 0.01650] },
  { code: 'KeyJ', label: "j", shiftLabel: "J", centre: [0.01462, 0.00930, 0.00008], size: [0.01650, 0.01650] },
  { code: 'KeyK', label: "k", shiftLabel: "K", centre: [0.03413, 0.00930, 0.00008], size: [0.01650, 0.01650] },
  { code: 'KeyL', label: "l", shiftLabel: "L", centre: [0.05362, 0.00930, 0.00008], size: [0.01650, 0.01650] },
  { code: 'Enter', label: "return", centre: [0.08775, 0.00930, 0.00008], size: [0.04575, 0.01650] },
  { code: 'ShiftLeft', label: "shift", centre: [-0.08775, 0.00877, 0.01957], size: [0.03600, 0.01650] },
  { code: 'KeyZ', label: "z", shiftLabel: "Z", centre: [-0.05850, 0.00877, 0.01957], size: [0.01650, 0.01650] },
  { code: 'KeyX', label: "x", shiftLabel: "X", centre: [-0.03900, 0.00877, 0.01957], size: [0.01650, 0.01650] },
  { code: 'KeyC', label: "c", shiftLabel: "C", centre: [-0.01950, 0.00877, 0.01957], size: [0.01650, 0.01650] },
  { code: 'KeyV', label: "v", shiftLabel: "V", centre: [-0.00000, 0.00877, 0.01957], size: [0.01650, 0.01650] },
  { code: 'KeyB', label: "b", shiftLabel: "B", centre: [0.01950, 0.00877, 0.01957], size: [0.01650, 0.01650] },
  { code: 'KeyN', label: "n", shiftLabel: "N", centre: [0.03900, 0.00877, 0.01957], size: [0.01650, 0.01650] },
  { code: 'KeyM', label: "m", shiftLabel: "M", centre: [0.05850, 0.00877, 0.01957], size: [0.01650, 0.01650] },
  { code: 'Comma', label: ",", shiftLabel: "<", centre: [0.07800, 0.00877, 0.01957], size: [0.01650, 0.01650] },
  { code: 'Period', label: ".", shiftLabel: ">", centre: [0.09750, 0.00877, 0.01957], size: [0.01650, 0.01650] },
  { code: 'Symbols', label: "123", centre: [-0.09750, 0.00825, 0.03906], size: [0.03600, 0.01650] },
  { code: 'Space', label: " ", centre: [0.00000, 0.00825, 0.03906], size: [0.15300, 0.01650] },
  { code: 'Hide', label: "hide", centre: [0.09750, 0.00825, 0.03906], size: [0.03600, 0.01650] },
];

/** One key at runtime: its mesh (kept for its name and pose) and how it is drawn. */
interface LiveKey {
  mesh: Mesh;
  restY: number;
  /** Index in the shared batch, or -1 when the key draws itself (Return). */
  batchId: number;
  /** 0 up, 1 fully down. */
  depth: number;
}

/**
 * A placed keyboard. Pass a copy of the `desk-keyboard` model (for example
 * `AssetManager.getGLTF('desk-keyboard').scene`) and the app's tweens.
 *
 * The light keys are redrawn as one BatchedMesh, so all of them cost one
 * draw call instead of one each. The original key meshes stay in the
 * hierarchy, hidden, so they can still be found by name.
 */
export class DeskKeyboard {
  private readonly keys = new Map<string, LiveKey>();
  private readonly batch: BatchedMesh | null = null;

  constructor(
    readonly root: Object3D,
    private readonly tweens: Tweens,
  ) {
    const group = root.getObjectByName('Keys');
    if (!group) throw new Error('DeskKeyboard: the model has no Keys group.');
    const meshes = group.children.filter(
      (child): child is Mesh => child instanceof Mesh && child.name.startsWith('Key_'),
    );
    // Keys that share the legend material go into one batch; any other (Return) draws itself.
    const shared = meshes.find((mesh) => mesh.name !== 'Key_Enter')?.material as Material | undefined;
    // Keys are mostly seen at a slant across the desk: sharpen the legend
    // texture at an angle (anisotropic filtering), or the legends blur grey.
    for (const mesh of meshes) {
      const map = (mesh.material as MeshStandardMaterial).map;
      if (map && map.anisotropy < LEGEND_ANISOTROPY) {
        map.anisotropy = LEGEND_ANISOTROPY;
        map.needsUpdate = true;
      }
    }
    const batched = meshes.filter((mesh) => mesh.material === shared);
    if (shared && batched.length > 0) {
      let vertices = 0;
      let indices = 0;
      for (const mesh of batched) {
        vertices += mesh.geometry.getAttribute('position').count;
        indices += mesh.geometry.getIndex()?.count ?? 0;
      }
      const batch = new BatchedMesh(batched.length, vertices, indices, shared);
      batch.name = 'KeysBatch';
      for (const mesh of batched) {
        const id = batch.addInstance(batch.addGeometry(mesh.geometry));
        mesh.updateMatrix();
        batch.setMatrixAt(id, mesh.matrix);
        mesh.visible = false;
        this.keys.set(this.codeOf(mesh), { mesh, restY: mesh.position.y, batchId: id, depth: 0 });
      }
      group.add(batch);
      this.batch = batch;
    }
    for (const mesh of meshes) {
      if (mesh.material !== shared) {
        this.keys.set(this.codeOf(mesh), { mesh, restY: mesh.position.y, batchId: -1, depth: 0 });
      }
    }
  }

  /** The key mesh for a code ('KeyQ', 'Space', ...), or undefined. */
  keyMesh(code: string): Mesh | undefined {
    return this.keys.get(code)?.mesh;
  }

  /** Push a key down (it stays down until released). */
  press(code: string): void {
    this.animate(code, 1, PRESS_MS);
  }

  /** Let a key come back up. */
  release(code: string): void {
    this.animate(code, 0, RETURN_MS);
  }

  private animate(code: string, to: number, ms: number): void {
    const key = this.keys.get(code);
    if (!key) return;
    const from = key.depth;
    this.tweens.play(
      ms,
      (t) => this.setDepth(key, from + (to - from) * t),
      { key: `desk-key-${this.root.uuid}-${code}` },
    );
  }

  private setDepth(key: LiveKey, depth: number): void {
    key.depth = depth;
    key.mesh.position.y = key.restY - depth * KEY_TRAVEL_M;
    key.mesh.updateMatrix();
    if (key.batchId >= 0) this.batch?.setMatrixAt(key.batchId, key.mesh.matrix);
  }

  private codeOf(mesh: Mesh): string {
    return mesh.name.slice('Key_'.length);
  }
}

/** Push a key down on a placed keyboard. */
export function pressKey(keyboard: DeskKeyboard, code: string): void {
  keyboard.press(code);
}

/** Let a key on a placed keyboard come back up. */
export function releaseKey(keyboard: DeskKeyboard, code: string): void {
  keyboard.release(code);
}
