# Progression: start small, earn your way up

Written 2026-10-04 from Vesa's direction after the first phone drives:
the cars felt like the end of a career, not the start of one. A career
begins in jokamiesluokka, Finnish folk racing: tired old rear-wheel-drive
saloons, little power, soft springs, a lot of weight. The only weapon on
day one is the oil the car leaks. Everything better is bought with prize
money, Death Rally style. The lasting choices are in ADR 0004.

## The classes

Four, slowest first. A car has one; an event is run in one; a car may
enter its own class or any below it, never above.

| Class | Car | What it is | Weapons that exist in it |
|---|---|---|---|
| JM | Tauno 2.0 | A jokkis saloon: rear drive, soft, heavy, slow | Oil |
| C | Kortteli 1.3 | A tired town car on gravel tyres | Oil, mines, the machine gun |
| B | Sorsa 1.6 GT | Light and sharp | All of the above and missiles |
| A | Kiila 4x4 Turbo | Four-wheel drive and a turbo | All |

The stock cars should sit about 10% apart on a lap, and a fully built
car should reach the next class's stock pace (`make balance` is the
table; `README.md` of the repo's `CLAUDE.md` says how to read it). The
Tauno is tuned to that rule against the Kortteli.

The step from JM to C costs money only: buy the Kortteli. B and A keep
their licence tests.

## The weapons, in the order they arrive

Weapons fire themselves (the Räkkä rule, `docs/research/combat-racer-mechanics.md`);
what the career gates is which ones a car can carry.

1. **Oil (JM).** A can leaks a slick onto the road by itself when a car
   is right behind you. On the slick a tyre holds almost nothing for a
   second: a car with its tail out spins, a straight car wobbles and
   loses its line. A slick that spins someone pays a small credit on
   the spot, the way a ram does. Oil cans are the cheapest thing in
   the armoury, and the road has oil pickups in JM where it has mines
   and missiles in the higher classes. The field has oil too.
2. **The ram bar (JM, the shop).** The first part worth buying. A shunt
   with it hurts the other car more and you less. Three levels: a pipe
   bumper, a spiked bumper, a plough.
3. **Mines (C).** Appear in the armoury and on the road when you own a
   class C car.
4. **The machine gun (C, the shop).** A part with three levels, the
   first level is the gun itself: a JM car has no gun at all, and a
   stock Kortteli has none until it is bought.
5. **Missiles (B).** The armoury and the road, from class B.

## The shop, by class

The parts a class can fit. A car fits every part of its class and the
classes below.

| Part | From | What it does |
|---|---|---|
| Ram bar | JM | a shunt hurts them, not you |
| Armour | JM | takes hits |
| Engine | JM | top speed and pull |
| Tyres | JM | grip in the corners |
| Weight | C | acceleration and braking |
| Brakes | C | braking |
| Machine gun | C | the gun, then its rate and punch |

Prices are a share of the car's price, so the same shop fits every
class; on the Tauno the first ram bar costs about a third-place prize
in the first race.

## The money curve

A new career: the Tauno, 100 credits, three cans of oil. Nothing in the
shop is affordable before the first race.

The rule for the prize table: the first-place prizes of a class's
events, added up, are a little more than the next class's car. A
player who wins every race in a class moves up with a car and some
money for parts; a player who places second or third repeats a race or
two. Fight money (rams that spin, wrecks, oil spins) and road cash top
it up and repairs take a share; the net is what the result sheet shows.

| Class | Events | Winner's prizes, in order | Sum | Next car |
|---|---|---|---|---|
| JM | 5 | 300, 450, 600, 800, 1200 | 3350 | Kortteli 2500 |
| C | 3 | 1200, 2200, 3400 | 6800 | Sorsa 9000 |
| B | 3 | 4000, 7000, 11000 | 22000 | Kiila 28000 |
| A | 2 | 14000, 24000 | 38000 | the end |

The lower places pay about 55%, 28% and 13% of the win. The repair at
the flag is 10% of the car's price at 100% damage.

A bot that plays the whole career (race, buy the best part, repeat) is
the tool to settle the grind once the tracks are done; it is on the
roadmap. Until then the table above is the knob and `events.ts` holds
it.

## The first five races

All in JM, in the Tauno, against Jorma, Marko and Tapsa in Taunos. The
field's cars get built one part at a time so the fifth race is the
hardest.

1. **Kiviahon jokkis**, Kiviaho, 3 laps. The field is stock with oil.
   The race must be fun in its first ten seconds: the kicker on the
   start straight throws the whole field on lap one, the first bend
   is a long sweeper, and the ford crosses the road right after it.
2. **Hirvisuon jokkis**, Hirvisuo, 3 laps. The kilometre lap, a jump
   on its straight, a ford in the esses. The field has ram bars.
3. **Kiviahon kahlaus**, Kiviaho, 4 laps. The field has ram bars,
   armour and engines, and more oil.
4. **Hirvisuon pitkä**, Hirvisuo, 4 laps. The field has tyres too.
5. **Jokkisfinaali**, Kiviaho, 6 laps. The field is as built as a
   Tauno gets.

Winning the five pays for the Kortteli with a ram bar and tyres on the
Tauno along the way.

## The first tracks

What Vesa asked for (2026-10-04): at least one jump on track one, a
river crossing early, and a shortcut worth taking. Kiviaho has all
three; Hirvisuo has a jump and a ford. The shortcut is a gap in the
forest across the inside of Kiviaho's hairpin, a car and a half wide,
on grass: shorter, slower underfoot, walled by the trees, and a gamble
when the field is on your bumper. The bots drive the road; the
shortcut is the player's.

The checks: `sim-check` flies every jump with every car and asserts the
car leaves the ground at racing speed and lands on the road, and drives
the shortcut and asserts it saves time against the road without being a
free lap; `make drive-log` takes the kicker by touch on an emulated
phone and prints the flight.
