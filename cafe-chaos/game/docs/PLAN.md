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

- **8. The room matters.** (Added after checking the game against the
  rules.) Passthrough has to change the experience: guests arrive across
  the player's real table from its edge and leave the same way, so the
  café is a place on this table, not a scene in the air.
- **9. Sending it in.** A draft of the write-up (tagline, description,
  how hands are used, target launch date), and what hosting needs.

After every phase: stop, re-read the result against this plan, write
what was learned in the log, then go on.

## The gaps against the rules, and where each is closed

Each gap is carried by a phase, and every phase ends with a short list
for the headset (`docs/HEADSET-CHECKS.md`), since four of these cannot
be confirmed on this machine.

| Gap | Closed in | Confirmed by |
| --- | --- | --- |
| Picking up feels bad | 3: tolerance, anchoring, cues on the hand | Headset |
| Onboarding is text; How to play is a wall of it | 4: three done steps, pictures | Screenshots, then headset |
| Passthrough does not matter | 8: guests cross the real table | Headset |
| A run can pass ten minutes | 1: the ramp | Scripted players |
| Buttons under 22 mm, pressed by pinch | 2: the side board, fingertip press, on every card | Measured in screenshots |
| Reach near the 60 cm limit | 2: the board sits inside it | Measured |
| Frame rate not measured since the new systems | 5: probe-perf here; the number on the headset | Headset |
| Only one room tried | 5: the placement check in the emulator's other rooms | Headset, two or three tables |
| Pause and save when the headset comes off | 1 (done), 2: the Pause button | Headset |
| Nothing visibly grows between sessions | 1: staff stay hired; 6: guests with wishes | Play |
| Not hosted, no video, no write-up | 7, 9 | The user |

## Assets already made, to be used

Nothing new needs modelling for this round.

- `demand-bubble.glb`, `mood-ring.glb`: the wish card and its mood (6).
- `25-music`, `accessories.glb` (the guitar): the singer and the
  listener (6).
- `window-booth.glb`, `quiet-corner.glb`, the door and the counter of
  the shell: the places wishes name (6).
- `coin.glb`: coins flying to the side board when a guest pays (2).
- `seat-glow.glb`: the seat a let-go guest will fly to (3).
- The six barista models: the staff row on the side board shows who is
  hired and who is still to hire (2).
- The annex, the stone plaques and their icon sheet are no longer used.

## What the rules and Meta's guidance ask for

The entry is for the Meta VR Start Developer Competition 2026 (Gaming,
New Experience; due Nov 18 2026). Judged in four equal parts: innovation,
experience design, technical implementation, polish.

- Hands only from start to finish; seated; every interaction within
  about 60 cm (the "airplane seat test").
- A satisfying session in ten minutes or less; fast start; clean pause
  and resume.
- Passthrough must matter; essential UI inside a comfortable, narrow
  field of view; at least 60 fps (72 is the target here).
- Special awards aimed at: Best First Five Minutes (teaches without a
  wall of text, a payoff early) and Best Reason to Come Back (visible
  growth between sessions).
- Video under three minutes of real footage.

Meta's numbers used below:

- Pinch starts with the tips 1.6 cm apart and ends once they are more
  than 3 cm apart (and 2 cm more than the closest they came).
- A thing to grab lights up from 5 cm away and stays lit to 8 cm.
- Touch buttons: at least 22 mm square, 12 mm apart, pressed with the
  index fingertip (not a pinch), about 45 cm from the eyes, facing the
  player, the most used controls low on the panel; a hover state, a
  pressed state and a sound for every press.
- Text no finer than it must be against passthrough; strong contrast.
- Teach by doing, untimed; show the gesture; keep help in reach.
- Snap and magnetism for small things; clear cues for small objects.

## Gaps found in review (phase 0)

Read twice: once through the code, once against the rules above.

The run
1. The shift is a four-minute countdown; asked for: count up, endless.
2. Nothing gets harder with time, so an endless run would never end.
3. No pause, and nothing is saved if the headset comes off mid-run.
4. The annex and its plaques are still in; asked to go.
5. One check (the storm-off) races the slow emulator and fails at random.

The board and buying
6. The scoreboard floats over the back of the café: 6 cm tall, its
   small print about 6 mm high. Too small, and behind the hands.
7. Buying is by pinching stone plaques in the gravel, in the way of the
   line and easy to miss.
8. Card buttons are 2 cm tall and pressed with a pinch; Meta asks for
   22 mm at least and a fingertip press.
9. Cards hang over the middle of the café, between the hands and it.

Hands
10. A guest let go more than 5 cm from a seat goes back to the line.
11. A held guest follows the fingertips through two smoothings (the
    pinch filter, then the carry follow): shaky when still, late when
    moving.
12. The pinch ends the moment the tips part past 1.5 cm when the headset
    reports its own pinch; Meta's own rule holds to 3 cm.
13. The fingertip dot and the guest's highlight are the only cues; the
    hand itself shows nothing now that the model hand is not drawn.

The start
14. The title card is plain text on a small card.
15. How to play is five paragraphs of small text, no pictures.
16. The walkthrough is five steps, two of them reading.

Come back
17. Only the bank and the best night are kept; nothing visibly grows.

Decision changed after reading the rules: servers hired stay hired
(saved), so the café visibly grows between sessions; the run gets harder
with time whatever the staff, and the best time is the record to beat.

## Log

### Phase 1, the run

Target: the café stays open about 3 minutes for slow hands, 5 to 6 for
average, 8 to 9 for quick ones (a whole session in under ten); the
first run pays for one or two servers and the staff is complete after
four or five runs.

**Iteration 1** (gaps shrink 0.8x a minute, patience 0.95x a minute,
tips lift happiness 5/3/1, hires 40 to 200).
Scripted players, three runs each: quick hands never closed (stopped at
15:00), average 11:30, slow 8:30. Five servers hired in the first run.
- Good: one server copes at opening; food comes in about 10 s; nobody
  storms out; the line, not the kitchen, is where guests are lost.
- Lacking: far too long and too rich. Happy guests refill happiness
  faster than the lost ones drain it, so quick hands never lose.
- Next: steeper ramp, smaller refill, dearer hires.

**Iteration 2** (gaps 0.78x a minute, patience 0.92x a minute down to
0.4, tips lift 4/2/1, hires 60 to 420).
Quick hands still never closed; average 10:00; slow 8:05. Two to four
servers hired in the first run, the sixth by the third run.
- Good: the hires now spread over three runs; the first run buys two.
- Lacking: the length hardly moved. Reading the runs: never more than
  ten guests are about at once, so however fast they are meant to come,
  the line stops filling and nobody is lost. Arrivals cannot end a run.
- Learned: the lever that ends a run is patience, not arrivals.
- Next: patience falls faster and further (0.86x a minute, to 0.28).

### Phase 2, the side board: layout

Drawn at real size off the game first (`docs/iterations/board-1-2-3.png`,
`board-final.png`), judged against Meta's touch sizes (22 mm, 12 mm
apart) and the 60 cm reach.

**Iteration 1, the menu board** (17 x 26 cm, everything stacked).
- Good: one clear order to read; a big clock; a row of six staff.
- Lacking: too tall for the table; Pause is as big as Hire and right
  under it, so one is pressed for the other; a greyed Hire does not say
  why it is grey.

**Iteration 2, the ticket strip** (36 x 11 cm, status left, buttons right).
- Good: low, does not hide the room.
- Lacking: 36 cm more to reach across, on top of a 60 cm café; the staff
  row shrinks to specks; the buttons become slabs.

**Iteration 3, the till** (20 x 20 cm, happiness as a ring round the clock).
- Good: the savings bar inside the Hire button says exactly how far the
  next server is: this is the progress bar asked for. Compact.
- Lacking: the ring makes the clock small and happiness harder to read
  at a glance than a bar; the staff sit in a cramped grid.

**Final** (18 x 21.5 cm): the menu board's order and big clock; the
till's savings bar in the Hire button, which turns amber and glows when
the bank can pay and reads "Full staff" at six; Pause small (26 mm) in
the top corner, far from Hire (34 mm tall, 148 wide). The record sits
under the clock and turns amber the moment it is beaten.
