/**
 * Tool wheel: the radial picker for writing tools, after the weapon wheels
 * of games like Red Dead Redemption: six raised glass segments around a
 * hub, each carrying a small 3D glyph of its tool (pen, marker,
 * highlighter, eraser, lasso, colour). The active tool's segment stands a
 * little proud with a glowing clay rim; the others carry a thin light rim
 * so their shapes stay readable in the dark. Big, forgiving wedge targets
 * suit a pinch or a flick of the stylus.
 *
 * The hub is the label: a raised glass plaque where the pointed-at tool's
 * name appears (one word), so there is only ever one label, always where
 * the eye returns in a radial menu. The plaque is 3D; its text is meant to
 * be flat and crisp (a small UI panel placed at `LabelAnchor`), since flat
 * text reads best at an angle. The current ink sits as a dot under it.
 *
 * Contract: metres; faces +Z, origin at the centre, 0.2 m across, segments
 * 9 mm deep (z 0 to 0.009). Named parts: Hub, Groove, HubRing,
 * LabelPlaque, LabelAnchor (an empty on the plaque's face), CurrentInk,
 * and `Segment-<tool>` groups (each with Wedge, ActiveRim or EdgeRim, and
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
  Object3D,
} from '@iwsdk/core';
import {
  bodyMaterial,
  glowingClayMaterial,
  satinLightMaterial,
  trimMaterial,
} from './notes-materials.js';
import { roundedRect, roundedRim } from './notes-shapes.js';
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

/** The label plaque: a lighter smoked glass so it reads as a raised tile. */
const plaqueMaterial = new MeshStandardMaterial({
  color: 0x6a5f56,
  roughness: 0.2,
  metalness: 0.15,
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

    // Outer-edge rim: glowing clay on the active tool, thin light metal on
    // the rest (their outline stays readable in the dark).
    const rim = new Mesh(
      active
        ? wedgeGeometry(a0 + 0.02, a1 - 0.02, TOOL_WHEEL_RADIUS_M - 0.0075, TOOL_WHEEL_RADIUS_M - 0.0035, 0.002)
        : wedgeGeometry(a0 + 0.03, a1 - 0.03, TOOL_WHEEL_RADIUS_M - 0.0052, TOOL_WHEEL_RADIUS_M - 0.0038, 0.0012),
      active ? glowingClayMaterial : satinLightMaterial,
    );
    rim.name = active ? 'ActiveRim' : 'EdgeRim';
    rim.position.z = DEPTH;
    segment.add(rim);

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

  // Hub: a glossy disc inside a fine groove, with a light ring.
  const hubGeometry = new CylinderGeometry(INNER_R - 0.006, INNER_R - 0.006, DEPTH + 0.002, 64);
  hubGeometry.rotateX(Math.PI / 2);
  const hub = new Mesh(hubGeometry, bodyMaterial);
  hub.name = 'Hub';
  hub.position.z = (DEPTH + 0.002) / 2;
  root.add(hub);
  const groove = new Mesh(new TorusGeometry(INNER_R - 0.003, 0.0012, 10, 96), trimMaterial);
  groove.name = 'Groove';
  groove.position.z = 0.0015;
  root.add(groove);
  const ring = new Mesh(new TorusGeometry(INNER_R - 0.008, 0.0009, 10, 96), satinLightMaterial);
  ring.name = 'HubRing';
  ring.position.z = DEPTH + 0.002;
  root.add(ring);

  // Label plaque: a raised glass tile across the hub with a light edge.
  const plaqueW = 0.06;
  const plaqueH = 0.02;
  const plaque = new Mesh(
    new ExtrudeGeometry(roundedRect(new Shape(), plaqueW, plaqueH, 0.006), {
      depth: 0.0025,
      bevelEnabled: true,
      bevelThickness: 0.0008,
      bevelSize: 0.0008,
      bevelSegments: 3,
      curveSegments: 12,
    }),
    plaqueMaterial,
  );
  plaque.name = 'LabelPlaque';
  plaque.position.set(0, 0.004, DEPTH + 0.002);
  root.add(plaque);
  const plaqueRim = new Mesh(roundedRim(plaqueW + 0.0016, plaqueH + 0.0016, 0.0068, 0.0007, 0.0034), satinLightMaterial);
  plaqueRim.name = 'LabelPlaqueRim';
  plaqueRim.position.copy(plaque.position);
  root.add(plaqueRim);
  const label = new Object3D();
  label.name = 'LabelAnchor';
  label.position.set(0, 0.004, DEPTH + 0.002 + 0.0035);
  root.add(label);

  // The current ink, as a small dome under the plaque.
  const inkGeometry = new CylinderGeometry(0.0045, 0.005, 0.0024, 32);
  inkGeometry.rotateX(Math.PI / 2);
  const ink = new Mesh(inkGeometry, trimMaterial);
  ink.name = 'CurrentInk';
  ink.position.set(0, -0.016, DEPTH + 0.0032);
  root.add(ink);

  return root;
}

export const toolWheelPrototype = createToolWheel();
