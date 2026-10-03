# Sora: the design

> Revised 2026-10-03 after the first playable: the race half is now
> Death Rally and Burnout as much as Super Cars II. Cars slide, ram and
> wreck each other, nitro is earned by driving dangerously, pickups lie
> on the road, and every weapon fires itself. The career half is as
> below.

A top-down arcade racer in the shape of Super Cars II (Gremlin, Amiga, 1991),
with a career in the shape of Gran Turismo: start in a cheap car, win credits,
buy parts, pass a licence, move up a class. Phones first, Canvas 2D, the
Räkkä and Höyry stack. Written as an idea in jeeves on 2026-10-03, moved
here the same day when the repo was made. Sora is Finnish for gravel.

## What each source gives

**Super Cars II gives the race.** Top-down, four cars on one scrolling
screen, laps of under a minute, nine tracks reused across three tiers.
Front and rear missiles, and damage that costs money to repair. Two players
on the same screen at the same time. A shop between races with a salesman
who haggles, and comic interludes (the tax form, the police quiz) that
decide what you keep. The tone is a joke that the car still takes seriously.

**Gran Turismo gives the career.** One home screen, the garage. A used car
you can barely afford. Credits from race results, spent on parts in a fixed
order of value: tyres, then weight, then engine. Licence tests, each a short
driving exercise with a target time, that gate the championships. A car
collection that grows, and a save file that holds hours of progress.

The combination is the point. Super Cars II had a flat progression (three
tiers, one shop), so it was done in an evening. Gran Turismo races were long
and sober. Short, loud, top-down races with a slow, serious career under
them is a shape neither of them had, and it fits a phone: one race fits a
bus stop, and the career gives a reason to come back tomorrow.

## The loop

1. Pick a race from the calendar the current licence allows.
2. Race: under a minute per lap, three to five laps, four cars.
3. Credits from the finishing position, minus repairs.
4. Garage: buy a part, buy a car, sell a car, or take a licence test.
5. The next class opens when the licence is passed and a car qualifies.

The balance question is the Gran Turismo one: how many hours from the first
car to the last class. The headless sim answers it. A bot driver with a
known skill races every car and part combination on every track, so the
income curve and the lap-time gain per part are numbers from `make balance`
and the grind is a chosen value, as the Räkkä and Höyry balance tools do
for their numbers.

## Controls

The Höyry hand: auto-throttle, drag anywhere to steer, tap to fire, a
brake only if the sim shows it matters. Two players on one phone is the
Räkkä pattern, one thumb each, and Super Cars II already proved the
same-screen race. Nothing here needs a second input scheme.

## Setting

Open, but Finland is the obvious pick after a forest and a mill town, and
it is rally country. Gravel roads, 1990s rally and hill climb cars, a
licence office that is a Katsastus hall, a shop that sells winter tyres.
Missiles on a Finnish gravel road are a joke in the Super Cars II register.
Decide before the first track is drawn, because the setting decides the
sprites.

## Shape

The Räkkä architecture, copied: Vite + TypeScript + React for the garage
and menus, Canvas 2D with procedural sprites for the race, a fixed-step
headless sim with a bot behind `make check` and `make balance`. A track is
a centreline polyline with a width and surface per segment, so a new track
is data, and the bot can drive it from the data. GitHub Pages on push,
CloudFront pixel, clavesa rollup to `?stats`, lap records per track in
DynamoDB behind one Lambda, as the two game repos already do.

## The one thing to prove

**Does a top-down race feel good with one thumb?** One track, one car, no
opponents. If the car does not feel like a car, no career saves it. This
is what the first commit builds, and the phone test is the first item on
the roadmap.

## Risks

1. **Two games' worth of scope.** Each source has a long feature list and
   both are loved for different reasons. The first release is one class,
   three cars, three tracks, missiles, and one licence. Everything else is
   the roadmap.
2. **Opponents.** Four cars means three AI drivers, and a bad AI (rubber
   banding, or walls) is the first thing a racer is judged on. The bot
   driver from the sim is the AI driver, so it is tested from day one.
3. **Progression maths.** Too fast and the career is a demo; too slow and
   it is a grind. The balance tool makes the choice visible, but the choice
   still has to be made.
4. **Tracks are content.** Nine tracks took Gremlin a studio. Data-driven
   tracks and reused tracks across classes (the Super Cars II trick) keep it
   to a one-person size.

## Open questions

- Weapons: in from the start, or a later class? They decide the tone.
- How much of Gran Turismo: licences and classes, or classes only?
- Two-player on one phone in the first release, or after the career works?
