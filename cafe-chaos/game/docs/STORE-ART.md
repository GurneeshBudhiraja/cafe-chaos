# Store art: research, directions and prompts (Nov 17 2026)

Icons, covers and key art for Café Chaos, in the sketch-pen style (thick
wobbly ink, flat marker fills, cream paper). Built on two research passes:
Meta's store rules and 16 current Quest covers; and about 45 AAA and hit
indie covers (Steam, PlayStation, Nintendo), checked at thumbnail size and
in grayscale. Sources at the end.

## The rules that shape everything

- **Sizes (Meta Horizon Store, 24-bit PNG):** Hero 3000×900 (10:3); Cover
  Landscape 2560×1440 (16:9); Cover Square 1440×1440; Cover Portrait
  1008×1440 (7:10); Mini Landscape 1080×360 (3:1); Icon 512×512; Logo a
  transparent PNG up to 9000×1440; 5 screenshots 2560×1440.
- **Devpost thumbnail:** 3:2 (shown at 333×222), up to 5 MB.
- **Text:** every cover carries the exact title "Café Chaos" and nothing
  else (no tagline, badge, "VR", price, superlative, corner text). The icon
  is the only asset exempt from the title; keep text out of it.
- **Placement:** title and faces in the safe area, away from the edges
  (Meta's UI covers the bleed). Hero cover: title centred.
- **Icon:** square corners, solid (no transparency), shows the game, reads
  small. Spatialized icon 180×180: background + foreground, no shadow.
- **Honesty:** no controllers (hands only), no other platforms' hardware.
  Judges: "show real gameplay that honestly represents the experience";
  wary of AI-carried pitches. Screenshots are real captures, no text.
- **Design for about 150 px** ("about two seconds of eye time"). Pass the
  grayscale test. One hero. 2-3 big elements plus the logo.

## What works at thumbnail size (from the covers)

- One focal subject on a simple field, with a chunky outlined title (Cuphead,
  Moss, Two Point, I Expect You To Die, Little Cities).
- For MR and tabletop: a giant hand acting on a tiny world (Cubism, Tiny
  Golf, Townsmen, Job Simulator, Cult of the Lamb's giant hands).
- Chaos sold through motion: diagonals, flying props, tilted logo,
  speed lines (Overcooked 2, Moving Out, PlateUp!). Cozy sold through round
  soft faces, warm palette, nobody hurt: panic played as delight.
- Ink style at small sizes: heavy outer contour, thinner inner lines; low
  paper texture; 3-5 flat colours with one dominant field.
- Panel collages: none among ~45 hit covers; they split attention at 150 px.
  Keep ours (the Flow collage) for press and social.

## Directions, ranked

1. **The Pinch** (main key art). Giant hand pinches the mochi guest above
   a tiny table. Scale contrast + the core verb.
2. **Mascot lockup** (square cover, icon, small sizes). Mochi and the
   square guest squashed on one chair, the barista behind, one cup falling.
3. **Rush-hour stampede.** The queue pours toward the viewer.
4. **Café burst.** Everything spirals out from the title on a saucer.
5. **On your table** (MR explainer, hero/landscape, trailer). The café on a
   real table, drawn in ink.
6. **Tower of trouble** (portrait). The barista balancing a teetering stack.

Generate art without the title, then add the title from one logo file in
every size (consistent, crisp, and Meta needs the logo as its own file).

## Built so far (scripts/build-store-art.py)

Sources in art/source, output in art/store; the app icons in public/icons
are the same icon. Run `python3 scripts/build-store-art.py` after replacing
a source.

- logo.png: the wordmark, magenta keyed out (transparent).
- icon-512.png: the one icon (also public/icons; a maskable copy keeps the
  name inside the centre 80%). favicon-32/48: the C.
- cover-square-1440.png, cover-landscape-2560x1440.png,
  devpost-1500x1000.png: from the cast-on-a-chair picture.
- Still to come: Hero 3000×900 and Mini 1080×360 (The Pinch, the table),
  Portrait 1008×1440 (the tower). The landscape cover moves to The Pinch
  when it arrives, if it reads better.

## Prompts (Nano Banana)

Upload the Flow collage and the chosen Pinch image as references with each. Replace [START] and [STYLE] with the shared lines below.

Shared lines (start and end of every prompt):

    START: Use the characters from the reference images exactly as drawn
    (the round cream mochi guest with a red beret, the grumpy square cream
    guest with black glasses, the young barista in an apron, the big
    cartoon hand) in the same sketch-pen style.

    STYLE: hand-drawn cartoon illustration in a lively sketch-pen style.
    Heavy, slightly wobbly black ink outlines around every shape, thinner
    lines inside; flat marker fills with light hatching; subtle cream paper
    grain. Palette: mustard gold #f0c987, moss green #3d6136, koi red
    #9a2208, warm brown #66462f, cream #e8dfcf, ink black #16171d. Round,
    soft, friendly shapes; panic played as delight, nobody hurt. Theme-free
    café props only: small round tables, chairs, cups, saucers, steam, cake.
    No text, no letters, no logos, no controllers, no headsets.

### 1. The Pinch (main key art; build at 16:9, crops to hero and portrait)

    [START] A big cartoon hand drawn in thick black ink with a cream fill
    swoops in from the upper right and pinches the mochi guest by the soft
    top of its head, lifting it high; the mochi stretches a little like
    dough, kicks its stubby feet and grins, startled and delighted, with
    three short motion ticks around it. Below on the left, one tiny round
    café table with an empty chair and a steaming cup waits: the seat it is
    going to. At the next table the grumpy square guest sits with arms
    crossed, glaring up over its glasses. Behind everything, a soft mustard
    gold sunburst on cream paper. The hand's diagonal runs from upper right
    to lower left. Keep the lower-left third calm and open (the title goes
    there later). Three subjects only. [STYLE] 16:9.

### 2. Mascot lockup (square cover, small sizes)

    [START] The mochi guest and the square guest are squashed together on
    one tiny café chair: the mochi beaming, the square guest annoyed, pushed
    half off the edge. The barista leans in behind them holding a tray with
    one teacup tipping off it, a small splash in the air: the only sign of
    chaos. Plain cream paper background with one big soft mustard gold
    blob behind the group. The group sits in the lower 60% of the frame;
    the top 35% is empty cream (the title goes there later). [STYLE] 1:1.

### 3. Rush-hour stampede (alternate landscape)

    [START] A queue of five round cream guests pours toward the viewer,
    led by the mochi guest running open-mouthed with arms out, the square
    guest behind it jabbing at its wristwatch, three more round guests
    bouncing behind with speed lines. Beside them the barista sprints with a
    tray of stacked cups held overhead; a saucer and a small paper order
    ticket fly past. Low camera, the crowd coming from the back right to the
    front left, strong diagonal. Plain moss green background with a soft
    cream glow. Top 30% calm and open (the title goes there later).
    Exactly five guests and one barista. [STYLE] 16:9.

### 4. Café burst (alternate; good for hero and mini landscape)

    [START] A big round cream saucer sits dead centre, empty, with clear
    space on it (the title goes there later). Around it, on mustard gold and
    koi red rays bursting outward, café things spiral away: two cups, a
    slice of cake, a little chair, and three guests: the mochi guest
    tumbling happily, the square guest clinging to a cup, the barista
    leaping to catch two cups. At the edge, the big cartoon hand pinches the
    mochi out of the spin. No more than eight objects in total. [STYLE] 16:9.

### 5. On your table (MR explainer: hero, landscape, trailer cover)

    [START] Three-quarter high view of a real wooden table at home, drawn
    in the same ink style: a coffee mug and a small houseplant at its edge,
    a warm lamp glow from the left. On the table sits a small round café
    platform like a tray: four tiny tables, a counter cart, guests crowding
    at its edge. The barista dashes across with a tray; the big cartoon hand
    hovers over the edge holding the mochi guest above an empty seat. The
    café is simple and theme-free. Upper third: plain wall, open (the title
    goes there later). [STYLE] 16:9.

### 6. Tower of trouble (portrait cover)

    [START] The barista stands wide-eyed, balancing on one tray a tall
    wobbling tower: a cup, a cake slice, the square guest (arms crossed,
    annoyed), the mochi guest (delighted), two more cups on top. At the top
    of the frame the big cartoon hand is placing one last tiny cup on the
    tower. Plain cream paper background with a soft mustard gold stripe
    behind the tower. The bottom 25% is open floor (the title goes there
    later). [STYLE] 7:10.

### The title, once (the logo for every asset)

    A wordmark for a game called "CAFÉ CHAOS" (EXACT, verbatim, one line):
    big chunky hand-lettered capitals drawn with a fat marker, slightly
    bouncy and uneven, cream fill with a heavy black ink outline and a koi
    red offset shadow. A tiny steaming cup doodle replaces the accent on the
    É. Centred on a flat plain white background with generous padding.
    Ensure the text appears once and is perfectly legible. Nothing else in
    the image. 4:1.

### One icon everywhere (store, Quest library, browser shortcut)

The face of the game is the name, not a character. One icon is used in
every place: the Meta store icon, the Quest library tile, the browser and
home screen shortcut. Meta exempts the icon from the title rule but does
not forbid text in it, so the name can be on it. It is built from the logo
file (the same lettering), not drawn again, so the two always match.

- Layout: "CAFÉ" over "CHAOS", stacked, filling about 70% of the width;
  the tipping cup is the accent on the É; three motion ticks and a small
  splash beside the cup. No characters.
- Field: moss green #3d6136, with one soft mustard gold #f0c987 disc
  behind the words.
- Rules: square corners, solid, no transparency, 512×512 24-bit PNG.
  Keep the words inside the centre 80% circle, so the shortcut's round
  mask does not cut them.
- Small sizes (favicon, 48 px and less): the name does not read there, so
  use only the C from the same logo on the same moss field.

If you generate the icon instead of building it from the logo, upload the
chosen wordmark as the reference and use:

    Use the "CAFÉ CHAOS" lettering from the reference image exactly as
    drawn. A square game icon: the words stacked, "CAFÉ" on the top line
    and "CHAOS" below, big and centred, filling about 70% of the width.
    Chunky hand-lettered capitals, cream fill, heavy black ink outline, koi
    red offset shadow. A tiny steaming teacup tips over as the accent on
    the É, with three short motion ticks and a small splash beside it.
    Behind the words, one soft mustard gold #f0c987 disc on a flat moss
    green #3d6136 field, edge to edge. Hand-drawn sketch-pen style, flat
    marker fills, subtle paper grain. No characters, no faces, no other
    text. Ensure the text appears once and is perfectly legible. Keep all
    lettering inside the centre 80% of the square. 1:1.

Exports from the one master: 512 (store, shortcut), 192 (shortcut),
180 (Apple touch), 48 and 32 (favicon, the C only).

Characters belong to the covers, as a cast. No single guest is the
mascot; the pinched guest in The Pinch is one of the guests, not a brand.

## Sources

- Meta asset guidelines: developers.meta.com/horizon/resources/asset-guidelines/
- Meta VRC.Quest.Asset.1-10: developers.meta.com/horizon/resources/vrc-quest-asset-1 (to -10)
- Meta, Mastering marketing assets: developers.meta.com/horizon/resources/gtm-marketing-assets/
- Competition rules: start-developer-competition-26.devpost.com/rules
- Valve store assets: partner.steamgames.com/doc/store/assets/standard and /rules
- Apple app icons: developer.apple.com/design/human-interface-guidelines/app-icons
- Google Play icon spec: developer.android.com/distribute/google-play/resources/icon-design-specifications
- GDC 2021, Alex Van Lepp, key art: gdcvault.com/play/1027247
- Chris Zukowski: howtomarketagame.com (2020-04-13, 2020-07-27, 2020-10-28)
- Project Horseshoe 2017, Coziness in Games: projecthorseshoe.com/reports/featured/ph17r3.htm
