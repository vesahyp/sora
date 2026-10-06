import { L } from '../../i18n';
import type { CarDef } from '../types';

/**
 * The cars, one per class, slowest first. Numbers are the balance knobs;
 * the bot in tools/ reports what they do to a lap. The classes should be
 * a clear step apart with stock parts, and a fully built car of one class
 * should be close to a stock car of the next, so the choice at the dealer
 * is a real one. The career starts in the Tauno (docs/progression.md).
 * All four are the player's red; the body, the livery and the number
 * tell them apart. The footprint is real: the car model reads it, and
 * it climbs with the class (the ladder is in rivals.ts): the Tauno is a
 * tiny boxy old saloon, a Fiat 126 of a car.
 *
 * The first car of each class is the class car: the rivals' pace and the
 * licence targets are read off it (classCar()). After the four come the
 * dealer's wild buys, Hill Climb Racing's garage in a class's money: a
 * Niva and a Valmet tractor in C, a monster truck in B, a hearse in A.
 * Each handles like what it is, so the choice is a character, not a
 * faster number.
 *
 * The pace (2026-10-04, the phone playthrough, scripts/playthrough.mjs): the lap is grip-limited,
 * so every car's grip went up 12% together, after a thumb lapped Kiviaho in 37 s against the
 * bot's 32. The bot laps Kiviaho in 27.6 in the Kortteli, 25.7 in the Sorsa, 23.7 in the Kiila
 * (tools/dbg/gripsweep.ts); the drag was not the lever, a third of it moved the lap half a second.
 *
 * The Tauno is slow on purpose (2026-10-05, after the owner played it: "the speed now is like a
 * really upgraded car"). Stock it pulls 10 m/s² and runs out at about 83 km/h on a straight
 * (`topSpeed` is that speed since ADR 0005: rig.ts sets the engine's power and the air's drag
 * to meet there), with 1.3 g of grip;
 * before, 15 m/s², 105 km/h and 1.9 g, and a thumb at that speed got 60 to 80% of the yaw it
 * asked for and ran wide, while a first engine upgrade made the thumb's lap slower, not faster
 * (tools/dbg/jmlaps.ts). The folk class races its own short loops (tracks.ts, the lenkki
 * tracks), where a new thumb laps in about 25 s stock and the full car is a clear step: the
 * engine parts show as top speed and as pull out of every bend, the tyres as a corner taken
 * without the pedal. JM to C is a bigger step than the other classes' tenth; the C car is as
 * it was.
 */
export const CARS: CarDef[] = [
  {
    id: 'tauno',
    name: L('Tauno 2.0'),
    cls: 'JM',
    shape: 'saloon',
    price: 1200,
    blurb: L('Pieni kulmikas jokkisauto: takaveto, pehmeä ja väsynyt. Vuotaa öljyä, ja se on ainoa aseesi.', 'A tiny boxy folk-racing saloon: rear drive, soft and tired. It leaks oil, and that is your only weapon.'),
    accel: 10,
    topSpeed: 23.1,
    brake: 10,
    turnRate: 2.6,
    grip: 13,
    mass: 1.25,
    armour: 0,
    ram: 0,
    gun: 0,
    length: 2.9,
    width: 1.35,
    colour: '#c8352a',
    accent: '#e6dfcc',
    livery: 'roof',
    number: 7,
  },
  {
    id: 'kortteli',
    name: L('Kortteli 1.3'),
    cls: 'C',
    shape: 'hatch',
    price: 2500,
    blurb: L('Väsynyt kaupunkiauto soranastoilla. Kaikki alkaa tästä.', 'A tired town car on gravel tyres. Everyone starts here.'),
    accel: 18,
    topSpeed: 37.8,
    brake: 16,
    turnRate: 2.8,
    grip: 22.5,
    mass: 1,
    armour: 0,
    ram: 0,
    gun: 0,
    length: 3.7,
    width: 1.65,
    colour: '#c8352a',
    accent: '#e6dfcc',
    livery: 'band',
    number: 13,
  },
  {
    id: 'sorsa',
    name: L('Sorsa 1.6 GT'),
    cls: 'B',
    shape: 'coupe',
    price: 9000,
    blurb: L('Kevyt ja terävä. Ei anna anteeksi, mutta kääntyy.', 'Light and sharp. Unforgiving, but it turns.'),
    accel: 24.5,
    topSpeed: 46.4,
    brake: 19,
    turnRate: 3.0,
    grip: 26,
    mass: 0.95,
    armour: 0,
    ram: 0,
    gun: 0,
    length: 4.4,
    width: 1.75,
    colour: '#c8352a',
    accent: '#e6dfcc',
    livery: 'twin',
    number: 22,
  },
  {
    id: 'kiila',
    name: L('Kiila 4x4 Turbo'),
    cls: 'A',
    shape: 'rally',
    price: 28000,
    blurb: L('Neliveto ja turbo. Metsän kuningas.', 'Four-wheel drive and a turbo. King of the forest.'),
    accel: 28.5,
    topSpeed: 53.8,
    brake: 22,
    turnRate: 3.1,
    grip: 29,
    frontDrive: 0.3,
    mass: 1.25,
    armour: 0,
    ram: 0,
    gun: 0,
    length: 4.7,
    width: 1.9,
    colour: '#c8352a',
    accent: '#e8c040',
    livery: 'works',
    number: 1,
  },
  {
    id: 'niva',
    name: L('Niva 1.7 4x4'),
    cls: 'C',
    shape: 'niva',
    price: 3800,
    blurb: L('Korkea lyhyt laatikko, neliveto ja vararengas takaovessa. Pientare on sille tietä.', 'A tall short box, four-wheel drive and a spare on the back door. The verge is road to it.'),
    accel: 17,
    topSpeed: 35.3,
    brake: 15,
    turnRate: 2.9,
    grip: 21.5,
    frontDrive: 0.5,
    offroad: 0.65,
    mass: 1.15,
    armour: 0,
    ram: 0,
    gun: 0,
    length: 3.7,
    width: 1.7,
    colour: '#c8352a',
    accent: '#e6dfcc',
    livery: 'stripe',
    number: 4,
  },
  {
    id: 'valmet',
    name: L('Valmet 702'),
    cls: 'C',
    shape: 'tractor',
    price: 3200,
    blurb: L('Traktori. Suoralla kaikki menevät ohi, mutkassa se kääntyy paikallaan, ja kolarissa se jyrää kenet tahansa.', 'A tractor. Everyone passes it on a straight; it turns on the spot, and in a shunt it flattens anyone.'),
    accel: 21,
    topSpeed: 26.0,
    brake: 17,
    turnRate: 3.7,
    grip: 23.5,
    offroad: 0.85,
    mass: 2.6,
    armour: 0,
    ram: 0,
    gun: 0,
    length: 3.6,
    width: 1.9,
    colour: '#c8352a',
    accent: '#e6dfcc',
    livery: 'roof',
    number: 7,
  },
  {
    id: 'monsteri',
    name: L('Monsteri'),
    cls: 'B',
    shape: 'monster',
    price: 13500,
    blurb: L('Lava-auto renkailla, jotka ovat isompia kuin hytti. Pomppii, ja kenen päälle se tulee, se pyörähtää.', 'A pickup on tyres bigger than its cab. It bounces, and whoever it lands on spins.'),
    accel: 23.5,
    topSpeed: 43.8,
    brake: 16,
    turnRate: 2.8,
    grip: 23.5,
    frontDrive: 0.4,
    offroad: 0.6,
    spinOnShunt: true,
    mass: 2.1,
    armour: 0,
    ram: 0,
    gun: 0,
    length: 4.6,
    width: 2.6,
    colour: '#c8352a',
    accent: '#e8c040',
    livery: 'split',
    number: 88,
  },
  {
    id: 'ruumis',
    name: L('Ruumisauto'),
    cls: 'A',
    shape: 'hearse',
    price: 31000,
    blurb: L('Pitkä farmari lasiperällä, arkku ja seppele kyydissä. Nopea ja hiljainen, eikä kukaan halua sen eteen.', 'A long estate with a glass back, a coffin and a wreath aboard. Fast and quiet, and nobody wants to be in front of it.'),
    accel: 27.5,
    topSpeed: 55.4,
    brake: 21,
    turnRate: 2.9,
    grip: 28,
    mass: 1.4,
    armour: 0,
    ram: 0,
    gun: 0,
    length: 5.2,
    width: 1.8,
    colour: '#c8352a',
    accent: '#16130f',
    livery: 'band',
    number: 44,
  },
];

/** The class car: the first of its class, whose numbers the rivals race on. */
export function classCar(cls: CarDef['cls']): CarDef {
  return CARS.find((c) => c.cls === cls)!;
}

export const CAR_BY_ID: Record<string, CarDef> = Object.fromEntries(CARS.map((c) => [c.id, c]));
