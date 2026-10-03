# Roadmap

Forward-looking only. Shipped items are deleted; git history is the record.
The design is in `docs/design.md`.

## Next

- **Playtest by hand on a phone.** The bot is the only driver so far. The
  question is whether the car feels like a car with one thumb: the
  steering lock, how fast the wheel follows, how much the gravel slides.
  Tune `src/game/content/cars.ts` and the constants in `sim.ts` beside
  `make balance`.
- Skid marks and a dust trail that reads the slide, so the slide is
  visible before it is felt.
- The opponents are the bot with a skill knob. Watch for what they do
  wrong (bunching, a car parked across the road) and give them what a
  race needs: a touch of rubber banding so the field stays in view.

## Later

- Balance the career's length: how many races from the Kortteli to a
  built Kiila. The prize table in `events.ts` and the prices in `cars.ts`
  and `parts.ts` are the knobs; `make balance` gives the lap gaps.
- Sell a car back at the dealer; a used-car column with cheaper worn cars.
- More tracks; tracks reused across classes with a different car.
- Reverse layouts of the two tracks as cheap extra events.
- Missiles, front and rear, and damage that costs money to repair.
- Two players on one phone, a thumb each, the Räkkä pattern.
- The clavesa rollup of the pixel logs and the `?stats` board (Räkkä's
  `analytics/` and `StatsScreen`), then global lap records in DynamoDB
  behind one Lambda, the Räkkä way.
