# Sending it in: a draft

For the Meta VR Start Developer Competition 2026 (Gaming, New
Experience). Everything here is a draft for the entrant to edit; the
facts about the game are true of the build on `feature/cafe-lofi`.

## Tagline (140 characters at most)

> A tiny café on your real table. Pinch guests into the seats they wish
> for and see how long you can keep it open. Hands only.

(126 characters.)

## Description (about 500 words)

Café Chaos puts a hand-sized Japanese café on the table in front of you.
Guests walk in across your own table from its real edge, queue at the
gate, and wait. You pinch each one up between two fingers, carry it over
the café and let go: it hops onto the seat glowing under it. Servers
bring the tea by themselves. Fed guests pay; guests kept waiting leave
unhappy. That is the whole game, and it is played sitting down, with
bare hands, in passthrough.

It is one endless evening. The clock starts at 0:00 and counts up.
Guests come faster and wait less patiently as the evening goes on, and
the café closes when its happiness runs out. How long you stayed open is
your score; a run lasts six to ten minutes.

The puzzle is the guests. Every guest has a name, and most have a wish:
a window seat, a seat by the gate, somewhere quiet, a table to itself,
some company, a seat near the guest who sings. A small picture over
each head shows the wish at a glance. Hold your hand over a guest and a
card says who it is and what it wants; pick it up and the seats that
would grant its wish turn mint. Granting a wish pays more and lifts the
café; ignoring one costs you the tip. A loner is put out if you then
seat someone at its table. The line keeps growing while you decide.

Coins hire servers, who stay hired: your café visibly grows from one
session to the next, and the longest evening is the record to beat.

Built for hands from the start:
- **Pinch what you see.** A guest counts as under your pinch when it is
  behind your fingers along your line of sight, so nothing asks you to
  reach across the table; it flies to your hand.
- **Your own hands, in front of the café.** No model hand is drawn: the
  café is simply not drawn where your hand is, so your real hand covers
  it as it would a real model.
- **Fingertip buttons.** Hire, Pause and the cards are pressed by
  pushing a fingertip through them, sized past Meta's 22 mm.
- **Let go anywhere.** A guest released over the café finds the nearest
  free seat to where you aimed.

The first run teaches by doing in three steps, each with a picture taken
from the game; nothing has to be read twice. The game pauses and saves
itself when the headset comes off.

Made with Meta's Immersive Web SDK: plane detection places the café on
a real surface and tells the guests where the table ends; hand tracking
does everything else.

## How hands are used (the optional note)

Thumb-and-index pinch (the headset's own pinch, or the tips within
1.6 cm; held until they are 2.4 cm apart, so a flicker never drops a
guest) to pick up, carry and release; index fingertip pushed through a
button to press it; a pinch on the café's pill and corner brackets to
move, turn and resize it. No controller is needed at any point.

## Target launch date

To be chosen by the entrant.

## What the entrant still has to do

- **Host it.** The entry is a link that must stay live and unchanged
  through judging. `npm run build` writes a static site to `dist/`; it
  must be served over HTTPS. Any static host works.
- **Confirm the start date.** New Experience means built on or after
  Sep 24 2026 with no earlier codebase.
- **The video.** Under three minutes, real footage, public on YouTube or
  Vimeo. `npm run record:game` makes one from the emulator; footage from
  the headset itself, in a real room, would show the passthrough and the
  real hands, which the emulator cannot.
- **Try it on the headset** against `docs/HEADSET-CHECKS.md`: the feel
  of the pick-up, the frame rate, two or three different tables.
