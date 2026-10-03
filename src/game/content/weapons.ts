import { L, type Text } from '../../i18n';

/**
 * Combat. Everything fires itself, the Räkkä way: the machine gun at a
 * car in the cone ahead, a missile once the lock holds, a mine when a
 * car is close behind. The driver decides where to drive and when to
 * boost. The armoury sells missiles and mines by the shot; the gun is a
 * part. Damage is a number on the car: at 100 it is a wreck, burns,
 * and comes back a few seconds later with half its health.
 */
export interface WeaponDef {
  id: 'missile' | 'mine';
  name: Text;
  desc: Text;
  price: number;
  max: number;
}

export const WEAPONS: WeaponDef[] = [
  { id: 'missile', name: L('Ohjus', 'Missile'), desc: L('Laukeaa itsestään, kun auto on pysynyt tähtäimessä hetken. Osuma pyöräyttää ja tekee ison reiän.', 'Launches itself once a car has sat in the sights for a moment. A hit spins them and tears a hole.'), price: 90, max: 9 },
  { id: 'mine', name: L('Miina', 'Mine'), desc: L('Putoaa itsestään, kun auto on ihan takanasi. Räjähtää alta.', 'Drops itself when a car is right behind you. Goes off underneath.'), price: 60, max: 9 },
];

/** damage per thing (0..100 is a car) */
export const DAMAGE = { bullet: 0.7, missile: 24, mine: 20, ram: 0.9, tree: 5 };
/** the machine gun: cone half-angle, range, shots a second, seconds of fire before it overheats */
export const GUN = { cone: 0.3, range: 36, rate: 9, heat: 2.0, cool: 1.6, holdOff: 3 };
/** the missile: lock time, range, cone, speed over the car's, life, turn rate */
export const MISSILE = { lock: 0.5, range: 38, cone: 0.45, speed: 42, life: 2.2, turn: 3.5, every: 2.5 };
export const MINE = { behind: 14, every: 3.5, r: 1.6, life: 40 };
/** at 100 damage the car has lost this much of its pull and top speed */
export const DAMAGE_PACE = 0.25;
/** seconds the car is a passenger after a missile or mine */
export const SPIN_TIME = 1.0;
/** a wreck burns this long, then comes back on the centreline with this much damage */
export const WRECK_TIME = 3;
export const RESPAWN_DAMAGE = 55;
/** credits for wrecking a car, per class rank + 1 */
export const WRECK_BOUNTY = 120;
/** the repair after a race: this share of the car's price at 100 damage */
export const REPAIR_SHARE = 0.1;
/** boost: full meter seconds of nitro, the pull and top speed it adds, what fills it */
export const BOOST = { seconds: 2.4, accel: 1.8, top: 1.3, perDriftSecond: 0.22, perWreck: 1, perRam: 0.08, burst: 0.34 };
/** ramming: closing speed above this hurts; a shove past this throws the victim into a spin */
export const RAM = { minClosing: 4, spinClosing: 11 };
