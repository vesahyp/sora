# Roadmap

Forward-looking only. Shipped items are deleted; git history is the record.
The design is in `docs/design.md`.

## Next

- **Playtest by hand on a phone.** The bot is the only driver so far.
  The questions: does the car now feel like a car, does braking into a
  bend bring the tail round the way it should, is the nitro burst long
  enough to matter, and do the guns read as yours. The knobs are in
  `cars.ts` (grip, lock), `sim.ts` (the constants at the top) and
  `weapons.ts`.
- The bot in the Kiila runs wide on Hirvisuo's sweepers more than in the
  other cars; the off-road bar in `sim-check` is 15% for that. Give the
  bot's margin a feel for power and mass, and bring the bar back to 8%.
- The hairpins on Kiviaho were drawn for a two-g car. Open them a little
  so a lap is nearer 35 s than 41.
- Opponent aggression as a per-driver number (Burnout's arrow): the
  leader is leaned on more than the tail.
- The bounty and the pickups against the prize table: a race should pay
  more for driving well than for driving over cash.

## Later

- Balance the career's length: how many races from the Kortteli to a
  built Kiila. The prize table in `events.ts` and the prices in `cars.ts`
  and `parts.ts` are the knobs; `make balance` gives the lap gaps.
- Sell a car back at the dealer; a used-car column with cheaper worn cars.
- More tracks; tracks reused across classes with a different car.
- Reverse layouts of the two tracks as cheap extra events.
- Spikes and a ram plate as armour's look; a rear missile.
- Boost pads and jumps on the road.
- Two players on one phone, a thumb each, the Räkkä pattern.
- The clavesa rollup of the pixel logs and the `?stats` board (Räkkä's
  `analytics/` and `StatsScreen`), then global lap records in DynamoDB
  behind one Lambda, the Räkkä way.
