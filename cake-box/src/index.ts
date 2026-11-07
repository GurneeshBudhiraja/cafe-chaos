/**
 * Cake Box: a hands-only Quest game. A layered cake stands on the board;
 * pick up the knife, cut the cake into the shapes the box's cards ask for,
 * and fit the pieces into the box.
 *
 * `virtual:iwsdk-project` (from iwsdk.config.json) brings the scene, assets,
 * components and XR features. Grabbing is IWSDK's own: the knife and every
 * cake piece carry OneHandGrabbable, and GrabSystem turns a hand's pinch
 * into a grab. Hands render as IWSDK's tracked hands.
 */

import { Vector3, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { createCakeBoard, decorateCake } from './cake/cake-mesh.js';
import { spawnPiece } from './cake/piece.js';
import { boundingRadius, regularPolygon } from './cake/polygon.js';
import { setUpLighting } from './lighting.js';
import { BOARD_CENTRE, BOARD_THICKNESS, COUNTER_TOP_Y } from './scene-assets/kitchen.scene-asset.js';
import { CrumbSystem } from './systems/crumb-system.js';
import { CutSystem } from './systems/cut-system.js';
import { RestSystem } from './systems/rest-system.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((world) => {
  setUpLighting(world);
  // Crumbs register first: the cut system looks them up.
  world.registerSystem(CrumbSystem).registerSystem(CutSystem).registerSystem(RestSystem);

  // Phase 1: a square cake on a cake board (the levels come in phase 2).
  const counter = world.getSceneObject('counter')!;
  const onBoard = counter.localToWorld(new Vector3(BOARD_CENTRE.x, COUNTER_TOP_Y + BOARD_THICKNESS, BOARD_CENTRE.z));
  const polygon = regularPolygon(4, 0.09 * Math.SQRT2, Math.PI / 4);
  const strawberries = [0, 1, 2, 3].map((i) => [Math.cos((i / 4) * Math.PI * 2 + 0.4) * 0.055, Math.sin((i / 4) * Math.PI * 2 + 0.4) * 0.055] as [number, number]);
  strawberries.push([0, 0]);
  const cakeBoard = createCakeBoard(boundingRadius(polygon));
  cakeBoard.position.copy(onBoard);
  world.createTransformEntity(cakeBoard);
  spawnPiece(world, { polygon, decorations: decorateCake(polygon, strawberries), grooves: [] }, onBoard.clone().setY(onBoard.y + 0.004), 0);

  // Dev only: lets the recording and test scripts find the world.
  if (import.meta.env.DEV) (window as unknown as { __cake: unknown }).__cake = { world, cut: world.getSystem(CutSystem) };
});
