# `guitar`, `music-notes` — a barista plays

For a musical moment at the counter (or a busker in the annex): a small acoustic guitar a barista
holds, floating music notes, and a barista `Strum` clip.

## `guitar.glb`

- ~890 triangles, one material (`CafeBarPalette`): dark wood body, spruce top, charcoal
  fretboard with brass frets and tuners, cream strings. 2.7 cm wide × 7 cm long × 0.5 cm deep.
- Origin at the body's centre, **authored in playing pose**: parent it to a **`Guitar`** empty with
  no further transform. Baristas have one (`Guitar`, on the body); every guest has one per pose
  (`St-Guitar` / `Se-Guitar`, on the chest) — scale the guitar 0.85 on guests. It sits against the
  chest, neck up and out to the player's right.

## `music-notes.glb`

- Root `music-notes` → `Note-1` (a quaver), `Note-2` (a beamed pair), `Note-3` (a crotchet), all in
  dark charcoal so they read against the shoji, the timber and the garden, each a node with its glyph mesh under it; ~330 triangles in all, one material.
- Clip `Ambient` (2 s loop): each note pops in small, drifts up ~3 cm while swaying, and shrinks
  away at the top, out of step with the others. Place the root just above the guitar (or a
  singing guest's head), play `Ambient` and leave it running; hide the root when the song ends.

## `Strum` clips

Guests: `Strum` (standing) and `SitStrum` (seated), 1 s loops with a singing face (happy eyes,
open mouth pulsing), left hand up the neck, right hand strumming, a bob and sway.

### Barista `Strum`

Every barista file now has a `Strum` clip (1 s loop): guitar against the chest, left hand up the
neck, right hand strumming, head nodding. The `Guitar` empty is a child of `Body`, so the
guitar bobs with the body. For a singing barista add `music-notes` over the head.

## Blender

Scene `MusicArt`, script `music_build.py`; the clip and attach point are in `barista_build.py`.
