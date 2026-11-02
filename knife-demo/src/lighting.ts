/**
 * Daylight for the room: a soft sky fill and a sun-like light from the
 * window that casts shadows, so the knife and the apple sit on things.
 */

import { DirectionalLight, HemisphereLight, PCFSoftShadowMap, type World } from '@iwsdk/core';

/** Scene nodes whose meshes cast shadows. */
const SHADOW_CASTERS = ['knife', 'apple', 'side-table'];

export function setUpLighting(world: World): void {
  world.renderer.shadowMap.enabled = true;
  world.renderer.shadowMap.type = PCFSoftShadowMap;

  world.createTransformEntity(new HemisphereLight(0xfff6e8, 0x7a6450, 1.35));

  const sun = new DirectionalLight(0xfff1dc, 1.7);
  sun.position.set(0.8, 2.6, -2.0);
  sun.target.position.set(0, 0.4, -0.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -1.2;
  sun.shadow.camera.right = 1.2;
  sun.shadow.camera.top = 1.2;
  sun.shadow.camera.bottom = -1.2;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 6;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.01;
  world.createTransformEntity(sun);
  world.createTransformEntity(sun.target);

  for (const node of SHADOW_CASTERS) {
    world.getSceneObject(node)?.traverse((object) => {
      object.castShadow = true;
      object.receiveShadow = node === 'side-table';
    });
  }
}
