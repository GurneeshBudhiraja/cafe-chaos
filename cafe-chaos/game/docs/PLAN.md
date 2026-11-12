# Café Chaos: the endless-café pass

The working plan for this round. It is kept up to date as phases finish;
the log at the end records what each iteration taught.

## What was asked

1. Pinching is still not smooth: find a better way.
2. Remove extending the café (the annex). Only more servers can be bought.
3. Buying must be intuitive and not in the gravel in front of the café.
4. Happiness, money, the timer, saving and buying live on a panel away
   from the model, with a progress bar, kept up to date.
5. No countdown. The café opens at 0:00 with the saved money, and the
   game is how long it can be kept running.
6. Better mechanics and timers overall; polish everything.
7. A better start of the game; How to play made of pictures taken from
   the game (how to pinch, where to put a guest).
8. Process: review, find gaps, review again, then fix in phases. After
   each phase, stop and re-read the work against this plan. Every change
   to the UI or the mechanics gets three iterations, each reviewed, and a
   fourth that combines what the three taught. Follow Meta's guidance for
   hands and mixed reality and the competition rules.

## How iterations are judged here

The headset is not on this machine, so each kind of change has its own
measurable stand-in. What cannot be measured here is listed under
"Needs the headset" and is not claimed as done.

| Change | Measured with |
| --- | --- |
| Pinch, carry, drop | `scripts/probe-pinch.mjs`: a recorded reach with the jitter, dropouts and finger noise of real tracking played into the emulator; reports wrong picks, drops, jitter of a held guest at rest, lag behind a moving hand, guests that land where they were aimed |
| Pace and economy | `scripts/sim-run.mjs`: whole runs played by three scripted players (quick, average, slow hands); reports how long each lasts, what they earn, when they can hire |
| Panels, title, how-to | Screenshots from the seat at the headset's field of view, checked against Meta's sizes for touch targets and text |

## The design

**The run.** One endless evening. The clock counts up from 0:00. Guests
come faster as the evening goes on. Happiness starts full; it falls when
a guest gives up or storms out and rises a little when one leaves fed.
At zero the café closes: the run is over, and the time is the score.
The bank is saved between runs; a run starts with one server and the
saved bank, and servers are hired during the run with that money, so a
good evening pays for a longer one next time.

**The side board.** One panel beside the café, turned to the player:
the clock, the happiness bar, the bank, the staff (six places, filled
as servers are hired), one large Hire button with its price, and Pause.
Nothing to buy stands in the gravel any more.

**Hands.** A held guest follows a steady part of the hand, not the
fingertips. A guest let go anywhere over the café goes to the nearest
free seat; only one let go well outside goes back to the line.

**The start.** Title card with Play, How to play, and the best time.
The first run teaches by doing, in three short steps. How to play is
three pictures from the game with a line each.

## Phases

- **0. Review and research.** Read the code, list the gaps, read Meta's
  guidance and the rules. Re-read the list once more before starting.
- **1. The run.** Count-up clock, the ramp, closing at zero happiness,
  hires that last the run, the saved bank and best time. Annex removed.
- **2. The side board.** Layout, sizes, the Hire button, Pause.
- **3. Hands.** Pinch, carry, drop.
- **4. The start.** Title, first run, How to play with pictures.
- **5. Whole-game pass.** Play it through, list what is still wrong,
  fix, repeat. Checks, README.
- **6. Guests with wishes.** (Asked for after the plan was written.)
  Every guest has its own name, a personality and a wish about where it
  sits: alone, with company, by the window, near the way out, near the
  counter, near the music, away from the music; one who sings, one who
  loves to listen. Decide when the wish card shows (a hand near the
  guest, and while it is carried), where it sits and how it looks; a
  wish met pays more and lifts happiness, a wish ignored pays less.
  Seating puzzles of this kind are a genre; the names, wishes, art and
  rules here are the café's own.
- **7. The video.** The whole game as the headset shows it, start to
  closing, sent once phases 1 to 6 hold up.

After every phase: stop, re-read the result against this plan, write
what was learned in the log, then go on.

## Gaps found in review (phase 0)

See the log.

## Log
