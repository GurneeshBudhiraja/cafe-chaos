# `petals` — falling sakura petals

Three tiny meshes in one file (14 KB, one 32 px texture, no clips):

| Node | What | Tris |
|---|---|---|
| `Petal-A` | a round sakura petal with the notch at the tip, 8 mm, slightly cupped | 60 |
| `Petal-B` | a narrow, curled petal, 9 mm | 60 |
| `Blossom` | a whole five-petal flower, 12 mm, for the odd one that drops intact | 300 |

Double-sided, faintly emissive pink so they stay readable in the shade.

## How the falling works (the game does it in code)

The petals are plain meshes; the motion is a few lines per frame, not an animation clip. The
test app's [`src/lib/petal-fall.ts`](../../test-app/src/lib/petal-fall.ts) is the reference:

1. Clone a pool of ~30 petals (alternate A and B, maybe one Blossom) under the café root.
2. Each petal gets a slow fall (3.5–6 cm/s), a breeze toward +X (over the café from the tree),
   a random spin, and its own flutter phase.
3. Every frame: move it by its velocity plus a sideways `sin(phase)` rock (the leaf-flutter),
   advance the spin; when it reaches the floor, respawn it in the box above the cherry tree
   (x −0.42…−0.1, y 0.26…0.4, z −0.3…0.1 in café space).

Thirty cloned petals are thirty small draw calls; if the game wants hundreds, use an
`InstancedMesh` per petal type with the same update. Keep them off the tables' seat spots so
they never read as food.

The static `FallenPetals` on the shell's floor stay; the falling ones land on top of them.

## Blender

`cafe-shell-art.blend`, scene `PetalArt`. Petal shape is a 6×5 grid bent by cup and curl
parameters (see the console script in the session; the shapes are plain meshes in the file).
