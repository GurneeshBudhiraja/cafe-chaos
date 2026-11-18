# The Canadian café: guest conditions and challenges

What the Canadian café's guests ask for, and the twists that make the
café play differently from the Japanese garden. For the competition
build (submitted Nov 18, 2026). Decided with the owner on Nov 17; checked
against the café as built in model round 4 and the layout on branch
`claude/jolly-napier-e48958` (`src/cafe/canada-layout.ts`).

The café's idea in one line: **it is cold out, and warm seats are
scarce.** Everything here is game code: no new models, anchors or hand
actions (the player only pinches guests). Numbers are (estimate), to be
tuned by play, and go in `src/game/rules.ts`.

## The places (table numbers are `CANADA_LAYOUT` indices)

| # | Table | Where |
|---|---|---|
| 1, 2 | log tables for two | the cabin's window wall, under the two sockets, either side of the fireplace (start open) |
| 13 | log table for two | right in front of the hearth |
| 3 | long table for four | the middle of the cabin, facing the counter and the chalk menu board |
| 4, 5 | log tables | the deck's front half, by the heater, looking over the lake |
| 6 | bench for two | on the frozen lake |
| 7, 8 | Muskoka chairs | round the bonfire, front left |
| 9–12 | bistro tables | upstairs on the roof deck, either side of the piano, under the Hoser's sign |
| (spot) | the pick-up spot | the counter's right end (`TakeawaySpot`) |

**As built (Nov 17, layout of `5dc5c21`):** the model has no lake bench
and no table in front of the hearth, and the bonfire has three chairs, so
the game uses `CANADA_LAYOUT`'s real indices: fireplace and socket 1, 2;
inside 1, 2, 3; menu board 3; lake view 4, 5; bonfire 6, 7, 8 (one table);
outside 4–12; upstairs 9–12. The fiddler's earshot is 0.34 (the far seat
at table 5 is 0.331 m off), not 0.33.

## Difficulty (easy, medium, hard)

The Canadian café brings the conditions in by level, so the first minutes
ask only for what the two starting tables can give
(`CANADA_DIFFICULTY` in `src/guests/wishes.ts`):

| Difficulty | From level | Conditions | Why |
|---|---|---|---|
| Easy | 1 | Inside, Outside, By the fireplace, By a socket, A table to myself, Some company, Coffee to go | One look tells where: the starting tables or the pick-up spot meet them, or any table does |
| Medium | 2 | Lake view, At the bonfire, By the menu board, Upstairs | One place with few seats, most behind a table to open; upstairs costs a slower tray |
| Hard | 3 | Somewhere quiet, Near the music, With my friend (pairs still from level 4) | They depend on other guests or a musician, and can stop being true after the guest sits |

Coffee to go still starts at level 2, as before (the first lesson's guests
sit at a table). The cold twist and the storm sit on top of these.

## The guest conditions (14)

Every guest has 1–3 of these on its card (1 at level 1, more later, as
now). Each line: the card's words, where it is met, and the decision
it makes.

### Where to sit (10)

| # | Card | Met at | The decision |
|---|---|---|---|
| 1 | **By the fireplace** · "I'm frozen!" | 1, 2, 13 | Three warm tables; the socket guests want two of them too. |
| 2 | **At the bonfire** · "S'mores weather!" | 7, 8 | Only two chairs; the overflow for cold guests when the cabin is full. |
| 3 | **Lake view** · "I want to see the ice." | 4, 5, 6 | The deck's two tables and the bench on the ice. |
| 4 | **Upstairs** · "The best view in town." | 9–12 | The baristas climb 15 steps with the tray, so food comes slower: a risk for a hurried guest. |
| 5 | **Near the music** · "I love live music." | within earshot of a musician the player has bought: the pianist reaches all four roof tables; the fiddler the deck's two (see **Fixes**) | Only once a musician is bought; the opposite of quiet. |
| 6 | **By a socket** · "My laptop's at 2 %." | 1, 2 | The same tables as the fireplace: the laptop or the cold guest? |
| 7 | **By the menu board** · "What's today's special?" | 3 | Gives the big table a wish of its own; a solo guest here blocks a table for four. |
| 8 | **Inside** · "Out of the cold, please." | 1, 2, 3, 13 | The easy one, common at level 1 and in a storm. |
| 9 | **Outside** · "Fresh mountain air!" | 4–12 | The easy outdoor one, common on sunny days. |
| 10 | **Coffee to go** · "No table, thanks!" | the pick-up spot | Only this, never with another; the spot serves one at a time. |

### Who to sit with (4)

| # | Card | Met when | The decision |
|---|---|---|---|
| 11 | **Somewhere quiet** · "Shh, I'm reading." | no musician in earshot and a table to itself | Upstairs is never quiet once the pianist plays; the lake bench and the bonfire are. |
| 12 | **A table to myself** · "Just me today." | nobody else at its table | |
| 13 | **Some company** · "Don't sit me alone!" | someone else at its table (the two bonfire chairs count as one table: they share the fire) | |
| 14 | **With my friend** · "We came together!" | the pair at one table (from level 4, as now) | |

### What goes together

- At most one place, or two that go together: fireplace + socket,
  fireplace + inside, socket + inside, menu board + inside, outside +
  lake / bonfire / upstairs, upstairs + music.
- Never together: inside + outside; quiet + music; quiet + company;
  alone + company; friend + alone / company / quiet; coffee to go +
  anything.
- A guest is only given a place some open table can meet (as
  `openWishes` does now). At the start only tables 1 and 2 are open, so
  level 1 asks for: fireplace, socket, inside, quiet, a table to itself,
  company, coffee to go.

### Who wants what (the five species)

Each species leans toward a few conditions (its card is still random;
these double the chance of its favourites), so a player learns to read
a guest by its shape:

| Guest | Leans toward | Why |
|---|---|---|
| Snowbit (the donut hole) | fireplace, inside; often cold | small, sugared like snow |
| Beavertail | outside, lake view, bonfire | the outdoorsy one |
| Nanaimo bar | menu board, company | the sweet tooth, a social one |
| Double-double (the cup) | coffee to go, socket; often in a hurry | a commuter with a laptop |
| Butter tart | quiet, a table to itself, upstairs | the shy one who likes the view |

## The twists (states on a guest or the café, not card conditions)

### Cold guests

- **Sees:** a pale blue tint, a snowflake at the top of the patience dot
  (a shape, as the hurried guest's hourglass), and a small shiver.
- **How:** a cold guest always has **By the fireplace** on its card, and
  **At the bonfire** also meets it (warm is fireplace or fire). It waits
  0.75 × as long in the line. Seated outside anywhere but the bonfire, it
  also waits 0.75 × as long for its food.
- **When:** from level 2; 12 % of guests (by forecast and storm, below).
- `COLD = { from: 2, chance: 0.12, line: 0.75, outside: 0.75 }`

### Snowstorm (the café's first-five-minutes moment)

- **Sees:** a "Snowstorm!" tip card and a gust; snowflakes drift over
  the plate (a few hundred points, one draw call). Nothing dims.
- **How:** for 60 s, 60 % of new guests are cold; nobody new asks for
  outside, lake view or upstairs (inside and the bonfire still come);
  guests already seated outside (not at the bonfire) wait 1 / 1.3 as long
  for their food.
- **When:** always a third of the way into level 2, then every few levels
  by the forecast; never with another event.
- `STORM = { level: 2, at: 0.33, seconds: 60, cold: 0.6, outside: 1.3 }`

### Today's forecast (the reason to come back)

On the start card under the Canadian café, an icon and one line, picked
from the local date (no save needed):

| Forecast | Days a week | Cold guests | Storms after level 2 | Leans the cards toward |
|---|---|---|---|---|
| Sunny | 3 | 8 % | none | outside, lake view, upstairs |
| Cold snap | 2 | 25 % | every 4 levels | fireplace, bonfire, inside |
| Snow day | 2 | 15 % | every 2 levels, 75 s | inside |

### Stretch: Morning commute

Only if everything above is in and tested. At the start of level 4, for
30 s, most arrivals want **Coffee to go**, and the pick-up spot serves one
at a time.

## Fixes to the current game code (branch `claude/jolly-napier-e48958`)

- **The fiddler's music reaches no seat.** At `MusicianSpot` (0.205,
  −0.19) with `earshot` 0.2, the nearest seats are the deck tables at
  about 0.31 m. Raise the fiddler's earshot to 0.33: that meets tables
  4 and 5, and also the two roof tables nearest the stairs (10 and 12, at
  about 0.27 m), which the pianist already reaches. The pianist's 0.2
  reaches all four roof tables and none downstairs; that is fine.
- **`patio` is folded into Lake view:** the deck's tables now stand on
  its front half over the lake, so `lake` = 4, 5, 6 and the `patio` wish
  goes (`CANADA_PLACES.lakeTables`, `CANADA_PLACE_WISHES`,
  `CANADA_TOGETHER`).
- **New wishes:** `inside` (1, 2, 3, 13) and `board` (3), in `WishId`,
  `WISHES`, `WISH_SHORT`, `grants`, `openWishes`, the clashes above, and
  their pictures in `guests/wish-art.ts`.
- **Bonfire chairs as one table** for company, alone and quiet
  (`tablesOf` today makes each chair a table of its own).
- **Species leanings:** a weight per species in `pickWishes`
  (`guests/cast.ts` knows the species).
- **Cold, storm, forecast:** `rules.ts` (COLD, STORM, FORECASTS), a new
  `game/events.ts` (one event at a time), `guests/patience-dial.ts` (the
  snowflake), `ui/start-menu.ts` (the forecast line), one tip in
  `game/how-to-play.ts`: "A snowflake: the guest is cold. Sit it by a
  fire."

## Coming next (for the write-up, not this build)

| Idea | What it adds | Needs |
|---|---|---|
| Keep the fire going | Flames shrink; pinch a log off the woodpile into the ring. Low fire = the bonfire is not warm. | A grabbable log (Blender), a grab target |
| The fire goes out (event) | A gust snuffs the bonfire; everyone there turns cold until it is relit | The above |
| The hockey team (event) | Four in matching toques want the table for four together | Groups of N in the line; a jersey (optional) |
| Skaters | Seat on the ice, it skates loops, then wants a seat by the fire for its cocoa | A two-stage guest |
| Shovel the stairs (after a storm) | Snow shuts the roof until the janitor shovels (one tap) | Drifts on the steps (Blender) |
| Golden hour on the roof | Upstairs pays double for 45 s | Game code only |
| Hoser's passport | Stamps for goals (every place in one run, the team together) | Game code and UI |
| More forecasts | Chinook (everyone wants outside), Hockey night | The events above |

## Checks before submitting

- Every card shown can be met by an open seat, at every level, in a storm
  and on every forecast (the two starting tables meet every level-1
  card).
- A cold guest at a bonfire chair counts as warm; at a deck table it
  does not, and waits less there.
- With the fiddler bought, the deck tables meet **Near the music**; with
  the pianist, the roof tables do, and none of them is **quiet**.
- The level-2 storm starts, shows its tip, snows and ends on time.
- The snow keeps the frame rate on the headset.
- The forecast line changes with the date.
