# Game mechanics plan: levels, tables, staff, pay (Nov 16 2026)

Agreed with the owner over the Nov 16 planning session. Branch: `feature/game-mechanics`.
Each number is marked: **M** measured in the game, **S** backed by a published source,
**E** an estimate to tune with `scripts/sim-run.mjs` and playtests.

## 1. Levels replace the clock

- Start card: returning player sees CONTINUE with "Level N · coins"; first-timer sees NEW GAME, the tutorial, then Level 1.
- A level is passed by serving a set number of guests (seated, fed, paid). The café never closes between levels.
- Level-up: wait until the player's hand is empty, ease time to a stop (0.3 s), then show a "Level N" card in the sketch style at the menu spot (world-locked, 1 m) with confetti from the card and a chime, no flashing. It waits for a pinch on CONTINUE (the rest point, S: Meta breaks every 10–15 min; Apple: nothing waits on an animation, CONTINUE works during the confetti). Guests served while the card waited count toward the next level. The café is hidden behind the card as in pause (zero cost; built: phase 1).
- Fail: café happiness at 0 → retry the current level from its start; coins and purchases kept (S: Juul). The card says how far it got and why ("N guests left unhappy"; S: NN/g error messages name the problem).
- Bar HUD: "Level N · served/goal" where the clock was.
- Save (new save version, old saves start fresh, settings kept): level, served count in the level, happiness, coins, unlocked tables, staff. Autosave on each served guest, each purchase, pause and headset-off (S: Meta autosave, VRC pause). Who was sitting where is not restored.

## 2. Pace by level (E, derived from M barista speeds)

| Level | Guests to serve | Arrival gap | Max in line | Staff needed |
|---|---|---|---|---|
| 1 | 5 | 20 s | 2 | 1 barista |
| 2 | 7 | 18 s | 2 | 1 |
| 3 | 10 | 15 s | 3 | 2 |
| 4 | 14 | 12 s | 3 | 2 |
| 5 (rush) | 19 | 8.5 s | 3 | 2 |
| 6 (breather) | 25 | 9.4 s | 3 | 2 + janitor |
| 7 | 32 | 7 s | 3 | 3 |
| 8 | 40 | 6 s | 4 | 3 |
| 9 | 49 | 5.5 s | 4 | 3 + janitor |
| 10+ | 60 | 5 s | 4 | 3 + janitor |

- Goal growth: the step grows by 1 each level, capped at 60 (S: accelerating thresholds).
- Inside a level arrivals speed up ~15%, then the level-up rest.
- Floor 5 s: three baristas serve about one guest per 5 s (M), and Meta advises against reflex-heavy pacing (S).
- Every 5th level is a rush level (×0.85), the next one eases (×1.1); the 5 s floor wins, so from level 10 there are no rush levels and variety comes from the wishes.
- Competition rule "satisfying in ≤10 minutes": every feature must appear in the first 10 minutes (levels 1–4): hurried guests from level 2, two-wish guests from level 3, pairs from level 4, three-wish guests from level 5. Janitor affordable by about level 4.

## 3. Timers (one dot per guest, two stages)

| Stage | Normal | Hurried |
|---|---|---|
| In line (from taking its place until seated) | 30 s → 20 s at higher levels (E) | 18 s → 15 s (E) |
| Seated (from sitting until food lands) | 40 s (M: worst single-queue wait 35.5 s) | 30 s (M: 2% lost at a random moment vs 10% at 25 s) |
| Eating | 22 s, no countdown | 22 s |

- The line countdown keeps running in the hand. Released with no seat: back to its place in line with the time it had left, no penalty.
- Sitting gives a fresh seated amount (replaces today's +28 capped at 46). The share of line time used is recorded for pay.
- Line at 0: gives up, pays 0, happiness drops. Seated at 0: storms out, pays 0, happiness drops.
- Everything freezes during pause, shop, buy card and level-up banner.
- Hurried guests keep their place in line, carry a clear badge, and their food is brought first once seated. 10–20% of guests (E).

## 4. Pay

One payment per guest, 1–10 coins: `1 + 9 × (0.4 × speed + 0.6 × share of wishes met)` (E), rounded. Hurried guests pay the same score × 1.5, so up to 15 (S: Diner Dash customer types tip differently; more risk, more reward). Leavers pay 0. The game starts at 0 coins with the two centre tables already open for free; the first table bought costs 10. Why the amount: the genre shows a live predictor (hearts) rather than a breakdown after; the seated dot counts the food wait down (built: phase 1) and the seated mood bubble (phase 5) shows the wishes met, so "+7" reads as earned. Show why (ticks and a speed mark beside "+6") (S: feedback). Replaces the base + tip-per-wish pay from guest-cards.

## 5. Wishes

- 1–3 per guest by level; never clashing; only wishes an unlocked seat can satisfy.
- Cap mix about 25% one, 45% two, 30% three (E).
- Keep wishes a self-contained registry (id, label, icon, rule, clashes, from-level) so new ones drop in; the owner plans harder wishes and a dynamic picker later.
- Pairs: two friends who must share a table.
- UI is the guest-cards work (dot per guest, request card beside the hand) (S: icon size minimums).

## 6. Tables

- Start: centre front two-seater and centre back table open (4 seats). 10 more spots locked in the main room (8 tables, bar, quiet corner), then the 4-table extension once the main room is open.
- Locked look (built: phase 2): a muted warm ghost at 42 % opacity, still casting its shadow (S: stereo transparency reads slower, 30–50 % is the headset range, shadow is a depth cue); a paper tag 6 × 4.2 cm above it (S: Meta ≥ 3° ray target, Microsoft text minimums) with a padlock and the price, moss with the padlock open when affordable, plain with it shut when not (S: never colour alone). The ray lights the tag and turns the table gold.
- Pinch a tag (hand empty): time freezes, the café stays visible under the card (the lamps dim as in pause: S, Apple, keep context but let it recede), buy card in the sketch style ("Open this table? · A two-seat table · Seats 2 · You have n · BUY n / NOT NOW", "Need n more" when short). Bought: the ghost and tag go, the unlock sound plays.
- The player chooses which table; the price depends only on how many were bought.
- Prices (jump grows by 5): 10, 20, 35, 55, 80, 110, 145, 185, 230, 280, then 335, 395, 460, 530. Total 2,870 (E).

## 7. Dirty tables and staff

- A table turns dirty when its last guest leaves; no seating until cleaned (~3 s). Dropping a guest on it: amber glow, guest does not land.
- Baristas clean automatically; the player does not act on dirty tables. Priority: serve first; after a set-down clean a nearby dirty table if no order waits; with no orders clean the nearest; an order interrupts cleaning and it is resumed after; all clean → back behind the counter.
- Built (phase 3): a mess model on the table and amber seat dots while dirty; the barista breaks off cleaning when an order waits and nobody is at the bar; the janitor stands by the counter's end and takes the longest-dirty table first. The shop shows one row per job, not per person (owner's call): Barista (its render, "1 of 3 working", HIRE for the next at its price, then "All working") and Janitor (HIRE 120, then "Working"); the janitor is drawn until its Blender render is made (phase 6).
- Staff, priced by what they add: barista 2 = 50 (needed early), janitor = 120 (one only, only cleans, nearest first), barista 3 = 150 (max 3, M: a 4th has nothing to do). Total 320.
- Everything together 3,190 coins, about 50 minutes (E, assumes ~6.5 coins per guest).
- Not agreed yet: a coin bonus at each level-up (5 × level).

## 8. Releasing a guest

Today a guest released anywhere over the café jumps to the nearest free seat. New: it sits only when released near a glowing (open, clean, free) seat; otherwise an eased 0.2–0.4 s return to its place in line with a sound (S: Apple drag and drop, Meta forgiving and reversible). Tracking loss counts as the same harmless return.

## 9. Reactions

Reference from the owner: speech bubbles over seated guests, coins popping, a red scribble on a leaver. Draw our own in the sketch style and palette (not the blue thumbs-up).

- One small bubble per seated guest for mood; the timer ring around it while waiting. Seat-mates at different heights, nearer one in front; slight overlap is fine as long as each stays readable. Bubbles turn toward the player.
- Moments: seated (tick/star/cross, exists), waiting too long, food arrives ("!"), eating (yum/steam, heart if loving it), paying (coin with amount), leaving happy (wave/heart/thumbs-up), storming out (scribble, thumbs-down, frown in turn, dust puffs), bothered by a neighbour, singing (notes).
- Several variations per mood so it is not monotonous; good and bad keep separate colour and shape families; never colour alone (S: Meta accessibility).

## 10. Blender

Janitor walk and wipe; barista wipe; final dirty-table mess (plus a quiet-corner version); padlock with a price tag; optional cleaning cloth. Everything else is drawn in code.

## 11. Competition rules that bind this (start-developer-competition-26.devpost.com/rules)

Hands end to end; seated, every interaction in a 2 ft radius; fast cold start, clean pause/resume, satisfying in ≤10 minutes; min 60 fps, solid and bug-free; essential UI inside a narrower field of view, adapted across devices; gaze is a named capability. So every new screen (locked tables, buy card, banner, bubbles) must fit the narrow view and work with look-and-pinch.

## 12. Build order

1. Levels, banner, save, pay, timers, release fix.
2. Locked tables, buy card, extension.
3. Dirty tables, barista cleaning, janitor.
4. Hurried guests, pairs.
5. Reactions.
6. Blender art.
7. Tutorial and How to play (last, per the owner).
8. Narrow view and look-and-pinch for all of it; update the check scripts; tune with the simulation.

Each part merges to `main` only when its checks pass and the owner has played it on the Quest.

## Later

A Canadian café as a second, purchasable café. Harder wishes and a dynamic wish picker.
