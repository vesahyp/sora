---
adr: 4
title: The career starts in jokamiesluokka with oil as the only weapon, and weapons arrive by class
date: 2026-10-04
status: Accepted
deciders: Vesa
---

## Context

The first career (2026-10-03) had three classes, C, B and A, and the
starter car was the Kortteli, a hatchback that does 150 km/h with a
machine gun that fires from the first race, three missiles and three
mines in the boot. Vesa drove it on the phone and said the cars feel
end-game: there was nothing to earn, and the first race already had
every weapon in it.

The references say the same. Death Rally starts you in a slow car with
a weak gun and sells everything else; Gran Turismo starts you in a used
car you can barely afford. Finland's own entry class is jokamiesluokka:
old rear-wheel-drive saloons, bought for the price of a set of tyres,
which is the right car to start a Finnish gravel career in.

## Decision

- **A fourth class, JM, below C.** Its car is the Tauno 2.0, a jokkis
  saloon: slow, soft, heavy, rear drive. A new career owns it and
  little else. The classes are `JM`, `C`, `B`, `A`; the step from JM
  to C is money only (buy the Kortteli), B and A keep their licences.
- **Oil is the only weapon in JM.** A car can carry oil cans; one leaks
  a slick when a car is right behind, and the slick takes a tyre's
  grip for a second. It is a weapon of the car itself, which is what a
  leaking old saloon has.
- **Weapons arrive by class.** The armoury sells, the road grows, and a
  car can carry: oil from JM, mines from C, missiles from B. The machine
  gun is a shop part whose first level is the gun; a car with the part
  at zero has no gun. The field in an event carries what its class
  allows and what its build has bought.
- **The ram bar is its own part**, separate from armour: it raises the
  damage a shunt does to the other car and lowers what the rammer
  takes. Armour only takes hits. Parts are gated by class too: ram bar,
  armour, engine and tyres from JM; weight, brakes and the gun from C.
- **The money curve** is a rule, not a table: a class's first-place
  prizes add up to a little more than the next class's car.
  `docs/progression.md` holds the numbers.

## Consequences

- The save format changes (`v: 2`). A `v: 1` save starts a new career;
  the game was a day old and nobody had progress worth carrying.
- `sim-check` can no longer assert that the guns fire for every car:
  the JM car has none. It asserts the guns for the classes that have
  them and the oil for JM, and it asserts the fight pays more than the
  road in every class, which with no guns in JM leans on rams and oil.
- A fourth class is a fourth car to balance, five more events, and
  another row in every table that lists classes. The licence tests do
  not grow: JM to C is bought.
- Everything the first career did with weapons in C (the first-event
  field shooting) moves one class up, so a player who has not bought a
  gun meets a field without one. The first C event is quieter than it
  was.
- The oil slick is a new sim object, a new pickup kind, a new HUD count
  and a new armoury line, in both languages.
