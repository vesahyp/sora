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
- Opponents: three AI cars driven by the bot in `tools/autoplayer.ts`,
  with a grid start and a finishing order.

## Later

- The garage: credits from results, parts in a fixed value order (tyres,
  weight, engine), the first used car.
- Licence tests: short exercises with a target time that gate the next
  class.
- Two more tracks; tracks reused across classes with a different car.
- Missiles, front and rear, and damage that costs money to repair.
- Two players on one phone, a thumb each, the Räkkä pattern.
- The tracking pixel and the `?stats` board (`infra/`, the Höyry copy),
  then global lap records in DynamoDB behind one Lambda, the Räkkä way.
