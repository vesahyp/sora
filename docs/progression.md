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
| JM | Tauno 2.0 | A tiny boxy jokkis saloon: rear drive, soft, slow, about 80 km/h flat out | Oil |
| C | Kortteli 1.3 | A tired town car on gravel tyres | Oil, mines, the machine gun |
| B | Sorsa 1.6 GT | Light and sharp | All of the above and missiles |
| A | Kiila 4x4 Turbo | Four-wheel drive and a turbo | All |

Size climbs with the class, Hill Climb Racing's first jeep to its
monster (Vesa, 2026-10-04): JM cars are tiny boxes, 2.4 to 3.2 m long
(a mopoauto, a Fiat 126), C 3.6 to 4.1 m, B 4.4 m up to the 7.5 m bus,
A 4.7 m up to the 6 m plough lorry; the rivals' vehicles sit on the same
ladder (`rivals.ts`). Beside each class car the dealer sells a wild buy
in that class's money: a Niva and a Valmet tractor in C, a monster
truck in B, a hearse in A (`cars.ts`). So does the
field's skill: the folk rivals' ceiling is 0.75 to 0.85 and each folk
event scales it, from 0.4 in the first race (weekend drivers who wobble
and brake late, 4 s a lap off a new thumb) to 0.85 at the final; C sits
at 0.5 to 0.6, B 0.68 to 0.8, A 0.84 to 1.0. `sim-check` holds the
curve with the thumb driver (`tools/hand.ts`) in the Tauno with the
parts a winning player has by each race: it wins the first two folk
races from every grid, is top two in the next two, has a fight in the
final; the bot finishes top two in two of three C races over both
tracks, and does not win every A race.

C, B and A should sit about 10% apart on a lap, and a fully built car
should reach the next class's stock pace (`make balance` is the table;
the repo's `CLAUDE.md` says how to read it). The Tauno is outside that
rule on purpose (2026-10-05, after Vesa played it: "the speed now is
like a really upgraded car"): stock it is slow and light, about 80 km/h
flat out with 1.3 g of grip, so the engine and tyre parts are a step
felt at once, and it races its own short loops, so its lap is not
compared with the Kortteli's. JM to C is a bigger step than the
others: the full tracks and a car half again as fast arrive together.

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
| Nitro | JM | a tank 25% bigger a level that fills 15% faster |
| Weight | C | acceleration and braking |
| Brakes | C | braking |
| Machine gun | C | the gun, then its rate and punch |

Prices are a share of the car's price, so the same shop fits every
class; on the Tauno the first ram bar costs about a third-place prize
in the first race.

The paint shop sells a colour (5% of the car's price) and a livery
(8%), each bought once per car; the red and the car's own livery are
free. Paint is only looks.

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

All in JM, in the Tauno, on the two folk loops (about 400 m, a lap of
25 s for a new thumb in the stock car), against Jorma, Marko and Tapsa
in their own tiny cars. The field's cars stay stock until the final:
the rivals never drive a better car than the player's in the folk
class. What grows is the driver: each event sets the share of their
skill the rivals drive at (`fieldSkill`), from 0.4 in the first race to
0.85 at the final, so the fifth race is the hardest without a single
part the player could not have bought. The later three came down from
0.7, 0.9 and 1.1 on 2026-10-06, when a scrubbing tyre began to cost
speed (`SCRUB`, physics.ts): the bot brakes for a bend and never
scrubs, a thumb at full stretch always does, so the same fields were
suddenly a second a lap quicker than the thumb. A folk rival brings one can of
oil to the early races and two from the fourth: on a 400 m loop two
cans each covered the road in slicks by lap two. The
parts and the pace gap arrive with the classes: C fields are stock
for two races, then lightly built; B and A fields are built. This was
changed on 2026-10-04 after the field gained a part a race and a new
player in a stock Tauno met cars 2 s a lap faster than his by the
fourth race, and asked why the rivals had better cars. The proof is
in `sim-check`: the thumb driver with the parts of the hour must win
the first two folk races from every grid.

1. **Kiviahon jokkis**, Kiviahon lenkki, 3 laps. The field is stock
   with oil, driving at 0.4 of its skill. The race must be fun in its
   first ten seconds: the crest on the start straight lifts the whole
   field on lap one, the first bend is a long sweeper, and right after
   it the road jumps a river from its bank.
2. **Hirvisuon jokkis**, Hirvisuon lenkki, 3 laps. A longer straight
   over a crest, a right-left, a sweeping right onto the bottom
   straight with the river on it. Skill 0.5.
3. **Kiviahon kahlaus**, Kiviahon lenkki, 4 laps. Skill 0.7, more oil.
4. **Hirvisuon pitkä**, Hirvisuon lenkki, 4 laps. Skill 0.9.
5. **Jokkisfinaali**, Kiviahon lenkki, 6 laps. Skill 1.1, and the field
   has a ram bar, an engine and tyres, the parts a winning Tauno has by
   then.

Winning the five pays for the Kortteli with a ram bar and tyres on the
Tauno along the way.

## The first tracks

What Vesa asked for (2026-10-04): at least one jump on track one, a
river crossing early, and a shortcut worth taking; then, the same day,
that the jumps be part of the track, a jump over a river, not planked
kickers. Then (2026-10-05) that the first tracks were too long and too
fast for the folk car: the folk class now races two short loops,
Kiviahon lenkki and Hirvisuon lenkki, each about 400 m with a crest on
the start straight and an 8 m river jumped from its bank, the Kiviaho
one with a shortcut; the full Kiviaho and Hirvisuo arrive with class C.
Kiviahon lenkki has all three asked for, the jump being its river. The
shortcut is a gap in the forest across the inside of the loop's
hairpin, a car and a half wide, on grass: shorter, slower underfoot,
walled by the trees, and a gamble when the field is on your bumper. The
bots drive the road; the shortcut is the player's.

The checks: `sim-check` jumps every river with the cars of the classes
that race there and asserts it is cleared every lap at racing speed and
every flight lands on the road, and drives the shortcut and asserts it
saves time against the road without being a free lap; `physics-check`
holds that the Tauno flat out clears the folk river and at a crawl
falls in and drives out; `make drive-log` takes the river by touch on
an emulated phone and prints the flight.
