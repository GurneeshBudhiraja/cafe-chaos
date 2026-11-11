# `barista-*` — the baristas (six looks, one rig)

Blocky, box-built characters (deliberately unlike the round guests): a head, body, two arms and
two legs, each a box with a 64 px pixel-art skin and nearest-neighbour filtering, so they read as
crisp little figures on Quest. 7.4 cm tall, about 500 triangles, one 64 px texture each, ~85 KB.
**Every look shares the same rig, node names and clips**, so one piece of code drives any of them
and the game can unlock looks one by one.

| File | Who | Look |
|---|---|---|
| `barista-sora.glb` | Sora | black bob, sage flat cap, cream shirt, indigo apron with a brass tie |
| `barista-momo.glb` | Momo | chestnut hair in a bun with a red tie, pink apron, white shirt |
| `barista-yuki.glb` | Yuki | silver hair, dark round glasses, matcha-green apron |
| `barista-ren.glb` | Ren | red bandana over dark hair, grey tee, charcoal apron with a copper tie |
| `barista-hana.glb` | Hana | pink twin buns with gold ties, lavender apron |
| `barista-kenji.glb` | Kenji | the old master: grey hair and beard, white hachimaki, indigo happi, red collar |

The root's extras carry `barista: "<name>"`. Suggested unlock order: Sora and Momo at the start,
then Yuki, Ren, Hana, Kenji.

## Where they stand

The café shell has two anchors behind the counter, on the raised duckboard:
`BaristaSpot-1` (left, by the espresso machine) and `BaristaSpot-2` (right, by the pour-over).
Parent a barista to the spot and turn it `Math.PI` about Y so it faces the counter (its front is
+Z in glTF; the spots' local frame is the shell's). Standing on the duckboard the head is ~3 cm
above the counter top, so they show over the bar from the player's seat.

They are plain objects, so the game can move them: slide the root, face the direction of travel
and play `Walk` (or `Carry` with a tray), exactly as with the guests. The feet are box legs
pivoting at the hip, so there is no planted-foot speed to match; 4–6 cm/s looks right.

## Nodes

`barista` (root; extras `barista: "sora"|"momo"`) → `Rig` → `Body` → `Head` (→ `Blink`), `Arm-L`,
`Arm-R` (→ `Hand-L`, `Hand-R`, empties at the hands for a held cup or cloth), **`Tray`** (an empty in
front of the body at hand height: parent a `tray-*` model there, see `../21-tray/`); `Leg-L`,
`Leg-R` under the rig. `Blink` is an eyelid strip switched by scale (the clips do it).

## Clips (all loop; play with an `AnimationMixer` on the root, stop the previous one first)

| Clip | Length | Use |
|---|---|---|
| `Idle` | 3 s | Breathing, a look left and right, a blink |
| `Work` | 2 s | Leaning over the counter, hands busy (default for the one at the machine) |
| `Wave` | 1.5 s | A wave to an arriving guest; a little bounce |
| `Bow` | 2 s | A small bow with hands together (thanks, or when an order is served) |
| `Walk` | 1 s (two steps) | Walking in place: legs swinging, arms counter-swinging, a bob; the game moves the root |
| `Carry` | 1 s | Walking with both arms held out in front under a tray (the `Tray` empty bobs with the steps) |
| `Serve` | 1.5 s | Lowers the tray to table height with a lean, holds, and straightens up |

A nice loop for the game: `Work` most of the time, `Wave` when a guest walks in through the
gate; to deliver an order, attach a tray, `Carry` out to the table, `Serve`, drop the `meal`
on the table, `Walk` back, `Work` again. `Idle` when the café is empty.

## Blender

`cafe-shell-art.blend`, scene `BaristaArt` (collection `BaristaCast` = Sora and Momo, used by the
shell previews; `BaristaExtra` = the other four); script `barista_build.py` (text block).

**Adding a look is one row in `LOOKS`:** skin, hair, shirt, apron, trim, legs, shoes, eye, blush and
mouth colours, two accessory colours (`hat`, `hat2`), a `top` style — `cap`, `bun`, `twin`,
`bandana`, `hachimaki`, `glasses` or none — and optional `beard`. `paint()` draws the 64 px skin
from those colours, `build()` adds the head piece, `build_all()` rebuilds and animates everyone.
New head pieces are a few lines in `build()` next to the existing ones.
