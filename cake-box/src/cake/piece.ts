/**
 * Cake pieces as entities. A piece is a transform entity whose object3D
 * holds the piece's look (see cake-mesh) and, on userData, its footprint
 * polygon (in its own frame, centred on its centroid), its strawberries and
 * its grooves. The whole cake is one piece until the knife splits it.
 *
 * Pieces are grabbable with one hand (IWSDK's OneHandGrabbable).
 */

import { Group, OneHandGrabbable, Quaternion, Vector3, type Entity, type World } from '@iwsdk/core';
import { CakePiece } from '../game-components.js';
import { castShadows } from '../lighting.js';
import { buildCakeLook, type Decoration } from './cake-mesh.js';
import { centroid, clipSegment, contains, splitByLine, translate, type Polygon, type Vec2 } from './polygon.js';

export interface PieceData {
  polygon: Polygon;
  decorations: Decoration[];
  grooves: [Vec2, Vec2][];
  /** How the piece slides off the blade after a cut (world direction), if it just was cut. */
  nudge?: Vector3;
  /** The piece's resting position before the nudge (world). */
  origin?: Vector3;
}

export function pieceData(entity: Entity): PieceData | undefined {
  return entity.object3D?.userData.piece as PieceData | undefined;
}

/** Make a piece at a world position with a yaw (radians about +Y). */
export function spawnPiece(
  world: World,
  data: { polygon: Polygon; decorations: Decoration[]; grooves: [Vec2, Vec2][] },
  position: Vector3,
  yaw: number,
): Entity {
  const group = new Group();
  group.name = 'CakePiece';
  group.position.copy(position);
  group.rotation.y = yaw;
  group.userData.piece = { ...data } satisfies PieceData;
  redress(group);
  const entity = world.createTransformEntity(group);
  entity.addComponent(CakePiece, { cell: -1, age: 10 });
  entity.addComponent(OneHandGrabbable, {});
  return entity;
}

/** Rebuild a piece's meshes from its data (after a cut or a new groove). */
export function redress(group: Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse((o) => (o as { geometry?: { dispose(): void } }).geometry?.dispose?.());
  }
  const data = group.userData.piece as PieceData;
  for (const part of buildCakeLook(data.polygon, data.decorations, data.grooves)) group.add(part);
  castShadows(group);
}

/** Add a score mark (local segment) to a piece's top. */
export function addGroove(entity: Entity, groove: [Vec2, Vec2]): void {
  const group = entity.object3D as Group | undefined;
  const data = group && pieceData(entity);
  if (!group || !data) return;
  data.grooves.push(groove);
  redress(group);
}

/**
 * Split a piece along the line through `p` with direction `d` (both in the
 * piece's frame). Returns the new pieces (the old entity is disposed), or
 * an empty list when the line misses. Each new piece is centred on its own
 * centroid, keeps the strawberries and grooves that fall on it, and gets a
 * nudge away from the blade.
 */
export function splitPiece(world: World, entity: Entity, p: Vec2, d: Vec2): Entity[] {
  const group = entity.object3D as Group | undefined;
  const data = group && pieceData(entity);
  if (!group || !data) return [];
  const parts = splitByLine(data.polygon, p, d, 2e-5);
  if (parts.length < 2) return [];
  group.updateWorldMatrix(true, false);
  const yaw = group.rotation.y;
  // The blade's normal in the world (the pieces part along it).
  const normal = new Vector3(-d[1], 0, d[0]).applyQuaternion(group.getWorldQuaternion(new Quaternion()));
  const out: Entity[] = [];
  parts.forEach((part) => {
    const [cx, cz] = centroid(part);
    const polygon = translate(part, -cx, -cz);
    const decorations = data.decorations
      .filter((deco) => contains(part, deco.at, 1e-6))
      .map((deco) => ({ kind: deco.kind, at: [deco.at[0] - cx, deco.at[1] - cz] as Vec2 }));
    const grooves: [Vec2, Vec2][] = [];
    for (const groove of data.grooves) {
      const clipped = clipSegment(part, groove[0], groove[1]);
      if (clipped && Math.hypot(clipped[1][0] - clipped[0][0], clipped[1][1] - clipped[0][1]) > 0.004)
        grooves.push([
          [clipped[0][0] - cx, clipped[0][1] - cz],
          [clipped[1][0] - cx, clipped[1][1] - cz],
        ]);
    }
    const position = group.localToWorld(new Vector3(cx, 0, cz));
    const piece = spawnPiece(world, { polygon, decorations, grooves }, position, yaw);
    // Which side of the blade this part is on: its centroid's side.
    const side = Math.sign((cx - p[0]) * -d[1] + (cz - p[1]) * d[0]) || 1;
    const pd = pieceData(piece)!;
    pd.origin = position.clone();
    pd.nudge = normal.clone().multiplyScalar(side);
    piece.setValue(CakePiece, 'age', 0);
    out.push(piece);
  });
  entity.dispose();
  return out;
}
