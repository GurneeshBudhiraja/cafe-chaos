# Café Chaos — Game Brief

Nov 7, 2026 · @Gurneesh

## Pitch

Café Chaos (working title) is a seating puzzle on your real table: guests arrive at a tiny café and you pinch each one into the seat that matches what they want.

Food serves itself. Your job is placing people well, keeping tables clean and keeping the café's rating up. It is seated, hands-only and plays in 3–5 minute shifts, which is the kind of game Meta wants for the VR Glasses.

## Competition framing

The entry goes into the Gaming track, New Experience division, submitted by Nov 18, 2026 (12:00 PM PT).

| Item | Detail |
| --- | --- |
| Track and division | Gaming, New Experience |
| Prizes in that slot | $100,000 winner, $50,000 runner-up |
| Special awards to design toward | Best First Five Minutes, Best Reason to Come Back |
| Engine | IWSDK / WebXR, submitted as a link |
| Submission | Working link, video under 3 minutes of real footage, write-up with a target launch date |
| Hard rules | Hands-only end to end, seated, a satisfying session in 10 minutes or less |

Gaming is the most crowded track (353 of 655 entries in 2025). Tiny Golf won Best Casual Game that year by putting a simple idea on the player's table, which is the shape of this entry.

## Core loop

&#91;embedded content: core loop · 6 steps, 2 player moves\]

A shift repeats this loop for 3–5 minutes. New guests keep arriving while others eat, so the real decision is which seat each guest gets while some tables are still dirty.

## Guests and demands

The demands are the game: each guest shows one in a bubble, and the fun comes when demands clash and seats run short.

| Demand | Satisfied when the guest sits |
| --- | --- |
| Quiet place | Away from groups and the door |
| By the window | At a window seat |
| Front of the café | In the row nearest the door |
| Back of the café | In the row farthest from the door |
| Next to a friend | Beside the guest they arrived with |
| Not near someone | Away from a named guest type (a loud group, kids) |

- Guests arrive alone, in pairs or in small groups, so table sizes matter.
- Early shifts give each guest one demand; later shifts give some guests two.
- Each guest has a mood bubble that drains slowly while they wait and drops if their demand is not met.
- Conflicts are designed in: two friends who need a table for two, a loud group and a guest who wants quiet, with one dirty table where you need it.

## Tables, food and the janitor

The player has only two actions, seating and cleaning, so everything else runs on its own.

- **Food is automatic.** Once a guest is seated, food arrives and they eat for a short, fixed time.
- **Tables get dirty.** When a guest leaves, their table is marked dirty and no one can sit there.
- **Cleaning is one tap.** Tap a dirty table and the janitor walks over and cleans it. The player never steers the janitor.
- **One janitor to start.** That creates the real choice: clean this table now, or seat someone elsewhere first.
- **A full café has a waiting bench.** Guests wait by the door with their mood draining, so being full is a decision, not a dead end.

## Money, reviews and the café rating

Two meters, two jobs: each guest's mood decides their review, and the reviews decide the café rating, which is how you lose.

- **When a guest leaves,** they pay and leave a 1–5 star review based on their mood.
- **Money** goes into the bank and pays for unlocks between shifts.
- **The café rating** is the average of recent reviews, shown as a meter from green to red.
- **Guests who give up** (mood runs out while waiting) leave a 1-star review and pay nothing.
- **Lose condition:** the rating meter reaches red, and the shift ends early.
- **Win condition:** the shift timer runs out with the rating above red. An end-of-shift card shows money earned, stars and guests served.

## Unlocks and progression

Money unlocks new café pieces, and most of them change the puzzle rather than just the look. This is the answer to the Reason to Come Back award.

| Unlock | What it adds to the puzzle |
| --- | --- |
| Window booth | More seats that satisfy "by the window" |
| Quiet corner | A protected spot for "quiet place" guests |
| Two-seat bar | Fast seating for solo guests and pairs |
| Big table | Room for groups |
| Second janitor | Two dirty tables cleaned at once |
| Decor (later) | Cosmetic only, after the puzzle unlocks |

- The café keeps its unlocks between sessions, so it visibly grows.
- A new layout or guest mix each day gives a reason to play tomorrow.
- Minimum for submission: three working unlocks, with the rest named in the write-up as coming next.

## Hands, gaze and passthrough

The whole game is pinch, carry, release and tap, played at table height with no controllers.

- **Placement:** the café sits on a detected real table; with no table found, it floats at arm's reach.
- **Seating:** pinch a guest, carry them, and release over a seat. Valid seats light up while you carry; the best match glows.
- **Cleaning:** tap a dirty table with a fingertip.
- **Seeing demands:** on the VR Glasses, look at a guest to see their demand. On Quest 3 and 3S (no eye tracking), the demand shows when your hand comes close.
- **Room-aware hook:** turn the café so its window side faces your real window, so "by the window" means your actual window. Whether the browser exposes a window label still needs checking on the headset.
- **Comfort:** UI and key actions stay inside the glasses' narrower field of view, nothing needs raised arms, and the target is 72 fps on Quest 3S.
- **Pace:** gentle pressure only. Guests arrive in waves with slow patience timers, not a frantic clock, because hand tracking lags slightly and fast juggling feels bad.

## Originality and what is out

The seating-puzzle idea is inspired by *Is This Seat Taken?*, a commercial game, so everything you see and play must be original.

- **Own work only:** characters, art style, name, levels and demand wording are designed from scratch. The rules require originality, and judges will recognise the reference.
- **What carries over:** only the general mechanic of seating people by preference, which no one owns.

Out of scope for the competition build:

- Cooking, serving or carrying food
- Steering the janitor by hand
- A frantic real-time clock
- Multiplayer and story mode
- Cosmetic-only unlocks before the puzzle unlocks work

## Build order and open decisions

Build the seating puzzle first; everything else is layered on once placing a guest feels good.

1. Café on the real table, and pinch-carry-release a guest into a seat
2. Four or five demand types, mood bubbles and seat highlighting
3. Food timer, guests leaving, dirty tables and the one-tap janitor
4. Reviews, money, the café rating, and win and lose
5. Shift structure with three hand-made layouts
6. Three unlocks
7. First five minutes: a short tutorial shift that teaches pinch and tap without text
8. Headset testing in an unfamiliar room, frame rate, then the video and write-up

Open decisions:

- [ ] Does this replace the notes app as the competition entry?
- [ ] Puzzle with gentle pressure (recommended) or real-time chaos?
- [ ] Final name and original art style
- [ ] Can the browser detect a real window for the room-aware hook?
