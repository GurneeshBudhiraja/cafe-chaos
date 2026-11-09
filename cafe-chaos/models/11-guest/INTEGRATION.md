# `guest` (final art: the snack-spirit cast)

Three adult guest species, one file each, plus a shared accessories file:

| File | Species | Shape | Signature | Size (w × h × d) |
|---|---|---|---|---|
| `guest-mochi.glb` | `mochi` | Round ball | Sakura hairpin, pink-tinted skin | 4.3 × 5.9 × 3.6 cm |
| `guest-onigiri.glb` | `onigiri` | Rounded triangle | Nori wrap, shiso leaf on top | 4.6 × 6.7 × 3.4 cm |
| `guest-tofu.glb` | `tofu` | Rounded square | Scallion sprout, cream skin | 4.2 × 6.6 × 3.9 cm |
| `accessories.glb` | — | 13 hats, glasses, bows and outfits | | |

`guest.glb` is a copy of `guest-mochi.glb`, kept so older code that loads `guest` still works.

**Every species has the same rig, node names, attach points and 8 animation clips**, so game code
written against one works for all three. The species are "shapes"; the game gives each guest its own
name. The root's extras carry `guest_type` (`"mochi"`, `"onigiri"` or `"tofu"`).

## The files

- About 310–335 KB each, 3,400–4,100 triangles per pose, 22 meshes per pose, one 256 px skin texture
  per species plus small flat materials for the face.
- Legs are three parts each (`Leg-*` thigh from the hip, `Shin-*` from the knee, `Foot-*` from the
  ankle) so they can really walk, sit and tap; see **Walking** below.
- Units are metres. +Y is up and the front faces **+Z** (toward the player). The origin is at the feet
  (standing) or the seat top (seated).
- Materials: `GuestSkin-<species>` (textured, white; **colour it at runtime**, see "Colours"),
  `GuestEye`, `GuestEyeShine`, `GuestEyeWhite`, `GuestMouth`, `GuestTongue`, `GuestBlush`, and the
  accent materials (`GuestSakuraPin`, `GuestLeaf`…).

## Colours

The guests ship **plain white** and the game gives each one a colour. The skin textures are
painted near-white on purpose, so multiplying the skin material's colour by a pastel gives a clean
pink, blue or green guest with the rice grain, mochi powder, tofu pores and the dark nori band all
kept. No extra textures, no extra draw calls: clone the skin material once per guest and set its
colour.

```ts
function tint(guestRoot: Object3D, hex: string) {
  const own: { skin?: MeshStandardMaterial } = {};
  guestRoot.traverse((o) => {
    const mesh = o as Mesh, mat = mesh.material as MeshStandardMaterial | undefined;
    if (!mesh.isMesh || !mat?.name.startsWith('GuestSkin')) return;
    own.skin ??= mat.clone();      // one copy per guest, shared by body, legs and arms
    mesh.material = own.skin;
  });
  own.skin?.color.set(hex);
}
tint(mochi, '#faa8c2');
```

A palette that stays cute and readable on all three shapes (tested; keep tints this light or
lighter, as darker colours lose the texture and the face):

| Name | Hex | Goes with |
|---|---|---|
| Plain | `#ffffff` | anything |
| Sakura pink | `#faa8c2` | Mochi's hairpin |
| Ramune blue | `#9eccfa` | Onigiri's nori |
| Matcha green | `#b3e09e` | Tofu's sprout |
| Yuzu yellow | `#f7e39a` | Beret, bow |
| Lavender | `#cfb8f0` | Glasses |
| Peach | `#fbc8a6` | Chef hat, apron |

The accents (`GuestSakuraPin`, `GuestLeaf`, `GuestLeafDark`), the face parts and the accessories
are separate materials, so they keep their own colours; tint their clones the same way if a guest
needs a matching hairpin or leaf. The test app colours the bench guests sakura, ramune and matcha.

## Anchors, groups and attach points

| Name | What it is |
|---|---|
| `Standing` / `Seated` | Two groups, one per pose. **Both are visible in the file**: show one and hide the other when the guest loads. |
| `Grip` | The point the player pinches (mid-body, about 4 cm up). Pick up when a pinch closes within about 3 cm. |
| `BubbleAnchor` | Above the head (7.0–7.4 cm, per species), for the `demand-bubble`. |
| `MoodAnchor` | At the feet, for the `mood-ring`. |
| `St-HeadTop` / `Se-HeadTop` | Attach point on top of the head: hats. |
| `St-Face` / `Se-Face` | On the face at eye height, just in front of the skin: glasses. |
| `St-Neck` / `Se-Neck` | Under the mouth: bows, scarves. |
| `St-Chest` / `Se-Chest` | Mid-body: aprons, vests. |

Attach points are empty nodes under each pose's torso, so whatever hangs on them squashes, bounces,
sways and turns with the body in every clip. There is one per pose (`St-` standing, `Se-` seated):
**put a copy of the accessory on both.**

## Accessories (`accessories.glb`)

One mesh per accessory, all sharing **one material and one 256 px atlas** (`GuestAccessoryAtlas`), so
dressing a guest costs one extra draw call per item and no extra textures. Each node's extras carry
`attach`, the attach point it belongs on. Its origin is already at that attach point: parent it and
leave its transform alone.

| Node | `attach` | Fits | Look |
|---|---|---|---|
| `ChefHat` | `HeadTop` | all | White toque |
| `Beret` | `HeadTop` | all | Red beret, tilted |
| `Glasses` | `Face` | all | Round dark frames |
| `Bow` | `Neck` | all | Red bow with tails |
| `Hachimaki-<species>` | `HeadTop` | that species | White headband with a red sun, knot at the back |
| `Apron-<species>` | `Chest` | that species | Sage apron, red strings, white pocket |
| `Vest-<species>` | `Chest` | that species | Deep-indigo happi vest, shoulders to waist, open front with red collar and hem |

Headbands and clothes are thin shells fitted to each body, so use the one that matches the species.
Hats, glasses and the bow are generic. Mix freely; a random two-item outfit per guest already makes
the bench look varied.

```ts
const accessories = AssetManager.getGLTF('accessories')!.scene;
function wear(guestRoot: Object3D, item: string) {
  const source = accessories.getObjectByName(item)!;
  const attach = source.userData.attach as string;           // "HeadTop", "Face", "Neck" or "Chest"
  for (const prefix of ['St-', 'Se-']) guestRoot.getObjectByName(prefix + attach)!.add(source.clone());
}
wear(mochi, 'ChefHat'); wear(mochi, 'Apron-mochi');
```

Uniform colours: clone `GuestAccessoryAtlas`'s material and tint it, or add swatches to the atlas.

## Animation clips (all loop)

Play them with a three.js `AnimationMixer` on the guest's root. Each clip also switches the face,
so **stop the previous clip before playing the next** (`mixer.stopAllAction()`), or two faces
can show at once.

| Clip | Pose | Length | When to play it | What it shows |
|---|---|---|---|---|
| `Idle` | Standing | 2 s | Waiting on the bench | Breathing, a glance, a blink |
| `Impatient` | Standing | 1.5 s | Waited too long | Half-lidded side-eye, frown, foot tapping |
| `Walk` | Standing | 1 s (two steps) | While the game moves them: gate → bench, seat → gate | A real gait cycle **in place**: heel strike, flat stance, heel rise and push-off, bent-knee swing; arms counter-swinging, hips over the support leg, slight forward lean |
| `Lifted` | Standing | 1 s | While the player carries them | Wide eyes darting about, "o" mouth, legs kicking, arms flapping, dangling sway |
| `SitIdle` | Seated | 2 s | Seated, nothing special | Breathing, small sway, blink |
| `SitHappy` | Seated | 1 s | Right after a good seat | Happy squint eyes, open smile, rosy cheeks, bouncing, arms up |
| `SitEating` | Seated | 1 s | While the meal is eaten | Closed content eyes, "w" nibbling mouth, hands up in turn |
| `SitUnhappy` | Seated | 2 s | A bad seat, or a bad neighbour | `> <` eyes, frown, a huff, then a sulky half-turn away |

```ts
const mixer = new AnimationMixer(guestRoot);
const clips = AssetManager.getGLTF('guest-tofu')!.animations;
function play(name: string) {
  mixer.stopAllAction();
  mixer.clipAction(clips.find((c) => c.name === name)!).play();
}
// every frame: mixer.update(delta);
```

Standing clips only move the `Standing` group's nodes and seated clips only the `Seated` ones,
so play a clip that matches the pose you show.

### Walking (arriving at the gate, leaving after the meal)

`Walk` is a human gait cycle walked **in place**, the way every game character walks: the game
slides the guest's root across the floor and turns them to face the way they are going. The clip
was solved so that the planted foot moves backward at exactly **1.81 cm/s** relative to the body
(`0.0181` m/s), i.e. it stays stationary on the floor when the root moves forward at that speed.
For any other speed set the action's `timeScale` to `speed / 0.0181` and the foot stays planted
(3 cm/s, `timeScale` 1.66, is a brisk café stroll; above ~4 cm/s it starts to look hurried). Play
`Walk` while moving and `Idle` when they stop:

```ts
const WALK_CLIP_SPEED = 0.0181;                         // m/s, as authored
// Start: face the way you are going, play Walk at the matching pace.
guest.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
const walk = play('Walk'); walk.timeScale = speed / WALK_CLIP_SPEED;
// Each frame while walking from `from` to `to` (café space):
t = Math.min(1, t + (delta * speed) / from.distanceTo(to));
guest.position.lerpVectors(from, to, t);
if (t === 1) play('Idle');
```

The test app does this in `CafeTestSystem.walkTo()`; from the browser console,
`__cafe.system.walkTo(0, 0.12, 0.10)` walks the first guest to that café-space spot.

## Expressions as parts (for custom moments)

Each face is a separate node, switched by scale (1 = shown, 0 = hidden); the clips do this for
you. Nodes are prefixed `St-` (standing) or `Se-` (seated):

- Eyes: `EyesOpen`, `EyesWide` + `WidePupils`, `EyesHappy` (^ ^), `EyesClosed` (u u), `EyesCross` (> <)
- Mouths: `MouthSmile`, `MouthOpen`, `MouthO`, `MouthFrown`, `MouthNom` (w)
- `Blush` (always on; bigger when happy)

To make a carried guest look at the player's hand, move `St-WidePupils` by up to about
±1 mm in x and z.

## Two things the game should do

1. **Turn a carried guest to face the player.** Otherwise the `Lifted` face is seen from behind.
   The test app does it each frame while carrying:
   `guest.rotation.y = atan2(head.x - guest.x, head.z - guest.z)` (in café space).
2. **Seats at `table-2` face sideways**, so seated guests there are seen side-on. The body
   bounce and arm movement still read from that angle; the face is clearest at the waiting
   bench and while carried.

## How to use it

Copy the `.glb` files to `app/public/models/` and register them in `src/assets.ts`:

```ts
  'guest-mochi':   { url: publicAssetUrl('models/guest-mochi.glb'),   type: AssetType.GLTF, priority: 'critical', name: 'guest-mochi' },
  'guest-onigiri': { url: publicAssetUrl('models/guest-onigiri.glb'), type: AssetType.GLTF, priority: 'critical', name: 'guest-onigiri' },
  'guest-tofu':    { url: publicAssetUrl('models/guest-tofu.glb'),    type: AssetType.GLTF, priority: 'critical', name: 'guest-tofu' },
  'accessories':   { url: publicAssetUrl('models/accessories.glb'),   type: AssetType.GLTF, priority: 'critical', name: 'accessories' },
```

Each `AssetManager.getGLTF(id).scene` is a fresh copy; every guest's root node is named `guest`.

## Blender source

`models/01-cafe-shell/blender/cafe-shell-art.blend`, scenes `GuestArt` (the three guests, standing
row and seated row) and `AccessoryArt`. The scripts are saved inside it as text blocks
`guest_build.py` (the `SPECIES` table at the top holds each shape's body function, eye and mouth
heights and shoulder positions; adding a species is adding a row), `guest_anim.py` (the clips) and
`guest_accessories.py` (the atlas and the fitted shells). Clips are NLA tracks, one per clip.
Export each guest with its root hierarchy selected, **Animation mode: NLA Tracks** and **Optimize
Animation Size off / Keep Object Animation on**; otherwise the exporter drops the constant face
channels and expressions stop switching. Then strip Blender's `.001` name suffixes as for the other
models. The textures are also saved as PNGs in `textures/`.

See `../../START-HERE.md` for the shared rules, the sizes and how the models were tested.
