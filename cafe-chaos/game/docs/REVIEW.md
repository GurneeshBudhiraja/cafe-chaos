# Player's-eye review, Nov 15 2026

A walk through the whole game as a first-time player (emulator, fresh
save, seated at the emulated table), phase by phase, checked against
current guidance and the competition's own rules. Measurements are from
the seat; text sizes are font size over distance. Sources are listed at
the end; quotes were checked against the saved pages.

## What works

- The start card is up the moment the headset view opens; Settings,
  pause, shop and the New Game warning are clear (text 1.3 to 2.8 deg,
  buttons 36 to 43 cm from the shoulder: Meta's 42 to 46 cm).
- The café arrives well: a dotted outline on the table, then it rises.
- Headset off pauses; back on, the pause card is there. Returning shows
  CONTINUE and the best time.
- A guest dropped by lost tracking (0.25 s grace) takes its aimed seat
  or goes back to its place in the line (Meta: plan for tracking loss).
- One shadow-casting light (a spot: one shadow map). 246 draw calls in a
  run (Meta's browser guide: about 1000 would drop below 72 fps).

## Found

### Blocking or near it

1. **The first run cannot be finished from the seat.** The coach card's
   Open! (the only way to end the last step) and Skip are 87 to 90 cm
   from the shoulder; a seated arm reaches about 60 cm (the rules'
   "airplane seat test": a 2 ft radius). The checks pass only because
   they move the hand there directly.
2. **The bar is out of view on narrower headsets.** Looking at the café,
   the bar's centre is 33 deg above the line of sight (top 36 deg).
   Meta VR Glasses see about 70 x 66 deg, so half the height is 33 deg:
   the bar is cut off. The café (0.79 m away, scale 1) also fills the
   whole width, so the line at the gate is at the edge. The rules ask
   for "essential UI and interactions within a comfortable, narrower
   FoV". `?board=low` (the bar just above the café) already exists.

### First five minutes (an award, and Experience Design)

3. The coach card's text is 6 mm at 87 cm (0.4 deg); its title 0.6 deg.
   Meta: 14 px minimum, 18 px for reading; far below either. Old style.
4. Nothing in the café points at the guest to pinch; Meta's onboarding
   guidance: show, don't tell (a looping hand demo at the target until
   the player does it).
5. How to play (title and pause) is the old card: 6.2 mm text at 60 cm
   (0.6 deg), Got it at 56 cm from the shoulder (Meta: avoid 0.5 to
   0.8 m), and on the title it floats over an empty table.

### Polish and coming back

6. The closing card is the old style (small text, orange button, 55 to
   58 cm away). It is the payoff moment and the place for "something to
   work toward" (the Best Reason to Come Back award): next barista in N
   coins, the best time, what changed since last time.
7. The guest card (hand over a guest) is the old style: 5.4 mm at 79 cm
   (0.4 deg).
8. The shop shows placeholder cups, not the baristas.

### Smaller

9. The page before the headset could say what the headset will ask for
   (hands, space setup) and suggest good light (Meta's hands guidance).
10. A relaxed pace (longer patience) in Settings would help comfort and
    accessibility (Meta: avoid timeouts with no extension), and could
    enter the accessibility award.
11. Only on the headset: frame rate at the evening's peak (at least 60,
    Quest Browser runs at 72), the ray's steadiness, two or three
    unfamiliar tables (the rules: "rooms the developer never tested").

## The competition, in short

- Due Nov 18 2026, 12:00 PT. "Projects that are modified after the
  submission deadline may be disqualified": the hosted link and the
  video must be final before then.
- Four equal parts: innovation, experience design, technical
  implementation, polish. Hands end to end, "including onboarding and
  menus". Judged on Quest 3 / 3S.
- The judging text names this game's idea: passthrough is purposeful
  when "a table becomes the play surface".
- Closest past winners (2025): Tiny Golf (tabletop pinch game, Best
  Casual Game) and HandCraft XR (cozy IWSDK tabletop builder, Judges'
  Choice). Meta published no judge reasons for winners.
- Video: under 3 minutes, real footage, the hands-first design clear in
  the first 30 seconds, no AI-generated video.

## Sources

- Rules, judging, awards, updates: start-developer-competition-26.devpost.com
  (/rules, /details/judging, /details/special-awards, /updates)
- 2025 winners: developers.meta.com/horizon/blog/meta-horizon-start-developer-competition-meet-the-winners/
- Hands UI: developers.meta.com/horizon/design/hands-ui-best-practices/,
  /touch_bp/, /raycasting_specs/, /interactions-input-hierarchy/, /grab_specs/
- Onboarding: developers.meta.com/horizon/design/hands-onboarding-best-practices/
- Type: developers.meta.com/horizon/design/styles_typography/
- MR: developers.meta.com/horizon/design/mr-design-guideline/
- Browser performance: developers.meta.com/horizon/documentation/web/webxr-perf-workflow/
- Tracking loss: developers.meta.com/vr/blog/what-makes-a-meta-vr-title-work-hands-only/
