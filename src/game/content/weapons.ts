import { L, type Text } from '../../i18n';
import { CLASS_RANK, type CarClass } from '../types';

/**
 * Combat. Everything fires itself, the Räkkä way: oil leaks when a car
 * is close behind, the machine gun fires at a car in the cone ahead, a
 * missile once the lock holds, a mine when a car is close behind. The
 * driver decides where to drive and when to boost. The armoury sells
 * oil, mines and missiles by the shot; the gun is a part. A weapon
 * arrives with a class (`from`, ADR 0004): oil in JM, mines and the gun
 * in C, missiles in B; a car carries only what its class allows. Damage
 * is a number on the car: at 100 it is a wreck, burns, and comes back a
 * few seconds later with half its health.
 */
export type WeaponId = 'oil' | 'mine' | 'missile';

export interface WeaponDef {
  id: WeaponId;
  name: Text;
  desc: Text;
  price: number;
  max: number;
  /** the lowest class whose cars carry it */
  from: CarClass;
}

export const WEAPONS: WeaponDef[] = [
  { id: 'oil', name: L('Öljykanisteri', 'Oil can'), desc: L('Vuotaa tielle itsestään, kun auto on ihan takanasi. Lätäkössä renkaat eivät pidä, ja perä lähtee.', 'Leaks onto the road by itself when a car is right behind you. On the slick the tyres hold nothing and the tail goes.'), price: 25, max: 9, from: 'JM' },
  { id: 'mine', name: L('Miina', 'Mine'), desc: L('Putoaa itsestään, kun auto on ihan takanasi. Räjähtää alta.', 'Drops itself when a car is right behind you. Goes off underneath.'), price: 60, max: 9, from: 'C' },
  { id: 'missile', name: L('Ohjus', 'Missile'), desc: L('Laukeaa itsestään, kun auto on pysynyt tähtäimessä hetken. Osuma pyöräyttää ja tekee ison reiän.', 'Launches itself once a car has sat in the sights for a moment. A hit spins them and tears a hole.'), price: 90, max: 9, from: 'B' },
];

export const WEAPON_BY_ID: Record<WeaponId, WeaponDef> = Object.fromEntries(WEAPONS.map((w) => [w.id, w])) as Record<WeaponId, WeaponDef>;

/** Can a car of this class carry this weapon. */
export function canCarry(cls: CarClass, id: WeaponId): boolean {
  return CLASS_RANK[cls] >= CLASS_RANK[WEAPON_BY_ID[id].from];
}

/** What a car of this class takes into a race from a boot that holds all three. */
export function carried(cls: CarClass, boot: { oil: number; mines: number; missiles: number }): { oil: number; mines: number; missiles: number } {
  return { oil: canCarry(cls, 'oil') ? boot.oil : 0, mines: canCarry(cls, 'mine') ? boot.mines : 0, missiles: canCarry(cls, 'missile') ? boot.missiles : 0 };
}

/** damage per thing (0..100 is a car) */
export const DAMAGE = { bullet: 0.7, missile: 24, mine: 20, ram: 0.9, tree: 5 };
/**
 * the machine gun: cone half-angle, range, shots a second, seconds of fire before it overheats,
 * and `spray`, how much wider a skill-0 driver's spread is (times 1 - skill). Level 0 is no gun
 */
// reach is about what the player can see ahead of the car, so the gun never fires at cars off the screen
export const GUN = { cone: 0.3, range: 22, rate: 9, heat: 2.0, cool: 1.6, holdOff: 3, spray: 4 };
/**
 * Oil: a can leaks a slick when a car is this close behind on this line, at most one every
 * `every` seconds; the slick is `r` metres across, lies for `life` seconds, and a tyre that
 * crosses it keeps `grip` of its hold for `slick` seconds, the rear least (physics.ts),
 * and takes `kick` rad/s on the yaw as it goes in, so the tail comes round.
 */
export const OIL = { behind: 12, every: 4, r: 1.5, life: 30, slick: 0.9, grip: 0.3, rearGrip: 0.12, kick: 1.6 };
/** credits for a slick that spins a car, per class rank + 1: in JM it is the only weapon, so it pays more than a ram */
export const OIL_CREDIT = 40;
/** the missile: lock time, range, cone, speed over the car's, life, turn rate */
export const MISSILE = { lock: 0.5, range: 24, cone: 0.45, speed: 42, life: 2.2, turn: 3.5, every: 2.5 };
export const MINE = { behind: 14, every: 3.5, r: 1.6, life: 40 };
/**
 * Seconds a car must sit on a driver's tail before a skill-0 driver gets
 * the oil or a mine out; times (1 - skill), so the player and the top
 * rivals drop at once and a JM rival only when you dawdle behind it.
 */
export const FUMBLE = 10;
/** at 100 damage the car has lost this much of its pull and top speed */
export const DAMAGE_PACE = 0.25;
/** seconds the car is a passenger after a missile or mine */
export const SPIN_TIME = 1.0;
/** a wreck burns this long, then comes back on the centreline with this much damage */
export const WRECK_TIME = 3;
export const RESPAWN_DAMAGE = 55;
/**
 * Credits for wrecking a car and for a ram that spins one, per class
 * rank + 1, paid on the spot with a toast. Death Rally pays for the
 * fight in the race, and a race driven at the field has to pay more
 * than one driven round it picking up cash (sim-check measures it).
 */
export const WRECK_BOUNTY = 200;
export const RAM_CREDIT = 25;
/** the repair after a race: this share of the car's price at 100 damage */
export const REPAIR_SHARE = 0.1;
/** boost: full meter seconds of nitro, the pull and top speed it adds, what fills it */
export const BOOST = { seconds: 2.4, accel: 1.8, top: 1.3, perDriftSecond: 0.27, perWreck: 1, perRam: 0.1, burst: 0.34 };
/** the nitro part: the tank holds this much more a level, and the meter fills this much faster */
export const NITRO = { tank: 0.25, fill: 0.15 };
/** seconds of nitro in a full tank for this car */
export function nitroTank(def: { nitro?: number }): number {
  return BOOST.seconds * (1 + NITRO.tank * (def.nitro ?? 0));
}
/** what the meter's refills (a drift, a wreck, a ram) are multiplied by for this car */
export function nitroFill(def: { nitro?: number }): number {
  return 1 + NITRO.fill * (def.nitro ?? 0);
}
/** ramming: closing speed above this hurts; a shove past this throws the victim into a spin */
export const RAM = { minClosing: 4, spinClosing: 11 };
