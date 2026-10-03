# Roadmap

Forward-looking only. Shipped items are deleted; git history is the record.
The design is in `docs/design.md`.

## Next

- **Playtest by hand on a phone.** The bot is the only driver so far.
  The questions: does the car now feel like a car, does braking into a
  bend bring the tail round the way it should, is the nitro burst long
  enough to matter, and do the guns read as yours. The knobs are in
  `cars.ts` (grip, lock), `sim.ts` (the constants at the top) and
  `weapons.ts`. If it still pushes, say in which phase: on turn-in
  (lock and yaw inertia), through the bend (grip and the rear's share),
  or on the throttle out (the rear's cost in the friction circle). Each
  is a different number, and `tools/dbg/handling.ts` measures it.
- Opponent aggression as a per-driver number (Burnout's arrow): the
  leader is leaned on more than the tail.
- The bounty and the pickups against the prize table: a race should pay
  more for driving well than for driving over cash.

## Later

- Balance the career's length: how many races from the Kortteli to a
  built Kiila. A bot that plays the whole career (race, buy the best
  part, repeat) and reports races to each class is the tool; the prize
  table in `events.ts` and the prices in `cars.ts` and `parts.ts` are
  the knobs; `make balance` gives the lap gaps.
- Sell a car back at the dealer; a used-car column with cheaper worn cars.
- More tracks; tracks reused across classes with a different car.
- Reverse layouts of the two tracks as cheap extra events.
- Spikes and a ram plate as armour's look; a rear missile.
- Boost pads and jumps on the road (Death Rally's acceleration zones).
- The rest of what the research found and Sora has not taken: a market
  with bad ideas in it (sabotage, rocket fuel, a loan shark), a league
  of drivers that moves on its own between races, a harpoon. See
  `docs/research/combat-racer-mechanics.md`.
- Two players on one phone, a thumb each, the Räkkä pattern.
- The clavesa rollup of the pixel logs and the `?stats` board (Räkkä's
  `analytics/` and `StatsScreen`), then global lap records in DynamoDB
  behind one Lambda, the Räkkä way.
- itch.io and Newgrounds: the portal kit from Räkkä (`docs/portals.md`
  there): a relative-path build, the iframe check, English store images,
  records read through the CloudFront cache, two beacons a race.
