/**
 * Tool wheel: the radial picker for writing tools, after the weapon wheels
 * of games like Red Dead Redemption: six raised glass segments around a
 * hub, each carrying a small 3D glyph of its tool (pen, marker,
 * highlighter, eraser, lasso, colour). The active tool's segment stands a
 * little proud with a clay rim; the hub shows the current ink. Big,
 * forgiving wedge targets suit a pinch or a flick of the stylus.
 *
 * Contract: metres; faces +Z, origin at the centre, 0.2 m across, segments
 * 9 mm deep (z 0 to 0.009). Named parts: Hub, HubRing, CurrentInk,
 * `Segment-<tool>` groups (each with Wedge, optional ActiveRim, and
 * `Glyph-<tool>`), in TOOL_IDS order clockwise from the top.
 */

import {
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Shape,
  CylinderGeometry,
  TorusGeometry,
} from '@iwsdk/core';
import { bodyMaterial, clayMaterial, trimMaterial } from './notes-materials.js';
import { createToolGlyph, TOOL_IDS, type ToolId } from './tool-glyphs.js';

export const TOOL_WHEEL_RADIUS_M = 0.1;
const INNER_R = 0.046;
const DEPTH = 0.007;
const GAP_RAD = (3.2 * Math.PI) / 180;
const ACTIVE_TOOL: ToolId = 'pen';

/** Dark smoked glass for the segments (a touch see-through). */
const segmentMaterial = new MeshStandardMaterial({
  color: 0x4a413a,
  roughness: 0.28,
  metalness: 0.12,
  transparent: true,
  opacity: 0.9,
});

/** An annular wedge from angle a0 to a1 (radians), extruded with soft edges. */
function wedgeGeometry(a0: number, a1: number, inner: number, outer: number, depth: number): ExtrudeGeometry {
  const shape = new Shape();
  shape.absarc(0, 0, outer, a0, a1, false);
  shape.absarc(0, 0, inner, a1, a0, true);
  shape.closePath();
  return new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.0016,
    bevelSize: 0.0016,
    bevelSegments: 3,
    curveSegments: 32,
  });
}

function createToolWheel(): Group {
  const root = new Group();
  root.name = 'ToolWheel';
  const step = (Math.PI * 2) / TOOL_IDS.length;

  TOOL_IDS.forEach((tool, i) => {
    // Clockwise from the top: centre angle of this segment.
    const mid = Math.PI / 2 - i * step;
    const a0 = mid - step / 2 + GAP_RAD / 2;
    const a1 = mid + step / 2 - GAP_RAD / 2;
    const active = tool === ACTIVE_TOOL;
    const segment = new Group();
    segment.name = `Segment-${tool}`;
    // The active tool stands proud of the others.
    segment.position.z = active ? 0.004 : 0;

    const wedge = new Mesh(wedgeGeometry(a0, a1, INNER_R, TOOL_WHEEL_RADIUS_M - 0.004, DEPTH), segmentMaterial);
    wedge.name = 'Wedge';
    segment.add(wedge);

    if (active) {
      // A clay rim along the outer edge, like a lit bezel.
      const rim = new Mesh(wedgeGeometry(a0 + 0.02, a1 - 0.02, TOOL_WHEEL_RADIUS_M - 0.0075, TOOL_WHEEL_RADIUS_M - 0.0035, 0.002), clayMaterial);
      rim.name = 'ActiveRim';
      rim.position.z = DEPTH;
      segment.add(rim);
    }

    // The glyph sits on the wedge face, at its middle radius, tilted to 45°.
    const holder = new Group();
    holder.name = 'GlyphHolder';
    const r = (INNER_R + TOOL_WHEEL_RADIUS_M) / 2 - 0.002;
    holder.position.set(Math.cos(mid) * r, Math.sin(mid) * r, DEPTH + 0.0045);
    const glyph = createToolGlyph(tool);
    glyph.rotation.z = Math.PI / 4;
    glyph.scale.setScalar(1.45);
    holder.add(glyph);
    segment.add(holder);

    root.add(segment);
  });

  // Hub: a glossy disc with a clay ring and the current ink as a dome.
  const hubGeometry = new CylinderGeometry(INNER_R - 0.006, INNER_R - 0.006, DEPTH + 0.002, 48);
  hubGeometry.rotateX(Math.PI / 2);
  const hub = new Mesh(hubGeometry, bodyMaterial);
  hub.name = 'Hub';
  hub.position.z = (DEPTH + 0.002) / 2;
  root.add(hub);
  const ring = new Mesh(new TorusGeometry(INNER_R - 0.012, 0.0014, 12, 64), clayMaterial);
  ring.name = 'HubRing';
  ring.position.z = DEPTH + 0.002;
  root.add(ring);
  const inkGeometry = new CylinderGeometry(0.014, 0.016, 0.003, 40);
  inkGeometry.rotateX(Math.PI / 2);
  const ink = new Mesh(inkGeometry, trimMaterial);
  ink.name = 'CurrentInk';
  ink.position.z = DEPTH + 0.0035;
  root.add(ink);

  return root;
}

export const toolWheelPrototype = createToolWheel();
