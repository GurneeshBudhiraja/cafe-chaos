/**
 * The sticky-note pad: five small stacks of sticky notes (classic yellow,
 * mint, blush, sky and the white index card) in a column, lying on the desk
 * beside the tablet. Pinching or tapping a stack peels a new note off it.
 *
 * Each stack is a block of paper with the top sheet (a smaller copy of
 * that sticky note) on it, so it reads as a real pad at a glance.
 *
 * Contract: metres; lies flat, its tops facing +Z; origin at the middle of
 * the column, at the bottom of the stacks (z = 0); the column runs along Y,
 * first stack (classic) at +Y. Named parts: `StickyPad-<kind>` groups
 * (Block, TopSheet), in STICKY_KINDS order.
 */

import { Group, Mesh, MeshStandardMaterial, type Object3D } from '@iwsdk/core';
import { STICKY_KINDS, type StickyKind } from '../stickies/sticky-model.js';
import { bevelBox } from './lib/hardsurface.js';
import {
  STICKY_COLOURS,
  stickyBlushPrototype,
  stickyClassicPrototype,
  stickyFormalPrototype,
  stickyMintPrototype,
  stickySkyPrototype,
} from './sticky-notes.scene-asset.js';

/** Each stack's footprint (metres; the formal card's is wider) and height. */
const STACK_M = 0.05;
const FORMAL_WIDTH_M = 0.066;
const STACK_HEIGHT_M = 0.008;
/** Centre-to-centre spacing of the stacks along the column. */
export const STICKY_PAD_SPACING_M = 0.06;
/** The top sheet: the sticky note model at this scale. */
const TOP_SHEET_SCALE = 0.64;

export const STICKY_PROTOTYPES: Record<StickyKind, Object3D> = {
  classic: stickyClassicPrototype,
  mint: stickyMintPrototype,
  blush: stickyBlushPrototype,
  sky: stickySkyPrototype,
  formal: stickyFormalPrototype,
};

const BLOCK_COLOURS: Record<StickyKind, number> = {
  classic: STICKY_COLOURS.butter,
  mint: STICKY_COLOURS.mint,
  blush: STICKY_COLOURS.blush,
  sky: STICKY_COLOURS.sky,
  formal: 0xf7f2ea,
};

function createStickyPad(): Group {
  const root = new Group();
  root.name = 'StickyPad';
  STICKY_KINDS.forEach((kind, i) => {
    const stack = new Group();
    stack.name = `StickyPad-${kind}`;
    stack.position.y = ((STICKY_KINDS.length - 1) / 2 - i) * STICKY_PAD_SPACING_M;

    // The block of sheets under the top one: a shade darker, as paper edges are.
    const width = kind === 'formal' ? FORMAL_WIDTH_M : STACK_M;
    const material = new MeshStandardMaterial({ color: BLOCK_COLOURS[kind], roughness: 0.9 });
    material.color.multiplyScalar(0.9);
    const block = new Mesh(bevelBox(width, STACK_M, STACK_HEIGHT_M, 0.0008, 0.002, 2), material);
    block.name = 'Block';
    block.position.z = STACK_HEIGHT_M / 2;
    stack.add(block);

    const top = STICKY_PROTOTYPES[kind].clone();
    top.name = 'TopSheet';
    top.scale.setScalar(TOP_SHEET_SCALE);
    top.position.z = STACK_HEIGHT_M;
    stack.add(top);
    root.add(stack);
  });
  return root;
}

export const stickyPadPrototype = createStickyPad();
