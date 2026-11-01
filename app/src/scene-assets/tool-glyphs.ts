/**
 * Small 3D glyphs for the tool wheel's segments: each tool as a tiny
 * object you would recognise on a desk, not a flat icon (Snap: 3D forms
 * for interactive things, read better and invite a pinch). Undo and redo
 * are curved arrows, turning back and forward.
 *
 * Every glyph is about 36 mm long, lies in the X/Y plane facing +Z, and is
 * centred on its origin; the wheel places and tilts it.
 */

import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from '@iwsdk/core';
import type { WheelItemId } from '../ink/tool-catalog.js';
import { bevelBox } from './lib/hardsurface.js';
import { clayMaterial, paperWhiteMaterial, trimMaterial } from './notes-materials.js';

const highlighterInk = new MeshStandardMaterial({ color: 0xf2d35b, roughness: 0.5, transparent: true, opacity: 0.85 });
const markerInk = new MeshStandardMaterial({ color: 0x2f5d8a, roughness: 0.35 });

function mesh(name: string, geometry: ConstructorParameters<typeof Mesh>[0], material: MeshStandardMaterial): Mesh {
  const m = new Mesh(geometry, material);
  m.name = name;
  return m;
}

/** A barrel along X with a tip at +X. */
function barrel(group: Group, radius: number, length: number, material: MeshStandardMaterial): void {
  const geometry = new CylinderGeometry(radius, radius, length, 20);
  geometry.rotateZ(Math.PI / 2);
  group.add(mesh('Barrel', geometry, material));
}

export function createToolGlyph(tool: WheelItemId): Group {
  const g = new Group();
  g.name = `Glyph-${tool}`;
  switch (tool) {
    case 'pen': {
      // Light barrel so the pen reads on the wheel's dark glass.
      barrel(g, 0.0022, 0.026, paperWhiteMaterial);
      const cone = new CylinderGeometry(0.0006, 0.0022, 0.008, 20);
      cone.rotateZ(-Math.PI / 2);
      const tip = mesh('Tip', cone, trimMaterial);
      tip.position.x = 0.017;
      g.add(tip);
      const band = new CylinderGeometry(0.00235, 0.00235, 0.0025, 20);
      band.rotateZ(Math.PI / 2);
      const b = mesh('Band', band, clayMaterial);
      b.position.x = 0.009;
      g.add(b);
      break;
    }
    case 'marker': {
      barrel(g, 0.0034, 0.026, paperWhiteMaterial);
      const chisel = mesh('Chisel', bevelBox(0.007, 0.004, 0.0024, 0.0005), markerInk);
      chisel.position.x = 0.016;
      g.add(chisel);
      break;
    }
    case 'highlighter': {
      const body = mesh('Body', bevelBox(0.028, 0.0085, 0.005, 0.0012, 0.002), paperWhiteMaterial);
      g.add(body);
      const nib = mesh('Nib', bevelBox(0.006, 0.0075, 0.0026, 0.0006), highlighterInk);
      nib.position.x = 0.0165;
      g.add(nib);
      break;
    }
    case 'eraser': {
      g.add(mesh('Block', bevelBox(0.024, 0.012, 0.007, 0.0018, 0.002), paperWhiteMaterial));
      const sleeve = mesh('Sleeve', bevelBox(0.012, 0.0126, 0.0074, 0.0008), clayMaterial);
      sleeve.position.x = -0.005;
      g.add(sleeve);
      break;
    }
    case 'lasso': {
      const loop = new TorusGeometry(0.009, 0.0011, 10, 40, Math.PI * 1.75);
      g.add(mesh('Loop', loop, paperWhiteMaterial));
      const knot = mesh('Knot', new SphereGeometry(0.0019, 14, 10), clayMaterial);
      knot.position.set(0.009, 0, 0);
      g.add(knot);
      break;
    }
    case 'undo':
    case 'redo':
      g.add(...curvedArrow(tool === 'undo' ? 1 : -1));
      break;
  }
  return g;
}

/**
 * A three-quarter arc with an arrowhead at its end: turning back
 * (anticlockwise, `turn` 1) for undo, forward (clockwise, -1) for redo.
 */
function curvedArrow(turn: 1 | -1): Mesh[] {
  const RADIUS = 0.0085;
  const SWEEP = Math.PI * 1.35;
  const arc = mesh('Arc', new TorusGeometry(RADIUS, 0.0013, 10, 40, SWEEP), paperWhiteMaterial);
  // Open at the bottom, sweeping over the top.
  arc.rotation.z = -Math.PI / 2 + (Math.PI * 2 - SWEEP) / 2;
  if (turn === -1) arc.scale.x = -1;
  const end = arc.rotation.z + SWEEP;
  const head = new CylinderGeometry(0, 0.0034, 0.0055, 16);
  const arrow = mesh('Arrowhead', head, clayMaterial);
  // At the arc's end, pointing along it (the tangent).
  const x = Math.cos(end) * RADIUS * turn;
  const y = Math.sin(end) * RADIUS;
  arrow.position.set(x, y, 0);
  arrow.rotation.z = turn * end;
  return [arc, arrow];
}
