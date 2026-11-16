# `tray-tea`, `tray-coffee` — serving trays

Two lacquered wooden trays with their orders already on them (one mesh each, the shared
`CafeBarPalette` atlas, ~300 KB each because the atlas is packed in; about 170–280 tris):

| File | On the tray |
|---|---|
| `tray-tea.glb` | a cup of matcha on a saucer and a plate of three dango on a skewer |
| `tray-coffee.glb` | a latte with ∞ art and a stacked dorayaki |

3.6 × 2.6 cm, 0.4 cm rim. Origin at the tray's underside centre.

## Use

Parent a tray to a barista's **`Tray`** empty (under `Body`, in front at hand height) and
play the barista's `Carry` clip: the arms are held out under it and the tray bobs with the
steps. `Serve` lowers it to table height and straightens back up — put the `meal` on the
table at the lowest point (frame 13–25 of 37) and remove the tray.

A tray can also sit on the counter top (y = 0.085 in shell space) as dressing.

## Empty tray and dish-only models

So a server can set just the order down and keep the tray:

| File | What | Origin |
|---|---|---|
| `tray-empty.glb` | the tray alone, with a **`Dish`** empty on its deck (0, 0.0021, 0) where a dish sits | tray underside centre |
| `dish-tea.glb` | matcha cup on a saucer + a plate of three dango | base centre (sits flat on a table or on `Dish`) |
| `dish-coffee.glb` | latte with ∞ art + a stacked dorayaki | base centre |
| `dish-tea-done.glb` | the same set finished: empty cup with a ring of leaves, bare skewer, crumbs | base centre |
| `dish-coffee-done.glb` | empty cup, crumbs on the plate | base centre |

Each dish is 3.2 × 1.6 cm, under 300 triangles, the shared `CafeBarPalette` material. Flow: parent
`dish-*` to the tray's `Dish` for `Carry`, re-parent it to the table at `Serve`'s low point, swap
it for the `-done` variant when the guest has eaten, and pick the done dish back onto the tray.
