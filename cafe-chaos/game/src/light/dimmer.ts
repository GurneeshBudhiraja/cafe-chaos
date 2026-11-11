/**
 * The passthrough dimmer: a page cannot turn the headset's cameras down,
 * so a large dark shell is drawn around the player's head, first, before
 * anything else and without depth, and everything in the scene draws over
 * it. With a partly transparent colour it tints the passthrough to dusk,
 * and the café's lights then stand out. Its opacity is faded by the mood
 * system; outside XR (the desktop preview) it stays clear.
 */

import { BackSide, Color, Mesh, MeshBasicMaterial, SphereGeometry } from '@iwsdk/core';
import { DIM_COLOR } from './mood.js';

export class PassthroughDimmer {
  readonly mesh: Mesh<SphereGeometry, MeshBasicMaterial>;

  constructor() {
    const material = new MeshBasicMaterial({
      color: new Color(DIM_COLOR),
      transparent: true,
      opacity: 0,
      side: BackSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
    this.mesh = new Mesh(new SphereGeometry(3, 24, 12), material);
    this.mesh.name = 'PassthroughDimmer';
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  get level(): number {
    return this.mesh.material.opacity;
  }

  /** 0 clear, 1 black. */
  set level(value: number) {
    this.mesh.material.opacity = value;
    this.mesh.visible = value > 0.001;
  }
}
