import { L, type Text } from '../../i18n';

/**
 * The armoury. Two weapons, bought by the shot and carried from race to
 * race. A missile goes forward and spins what it hits; an oil slick is
 * dropped behind and spins what drives over it. Damage is a number on
 * the car that costs pace during the race and credits after it.
 */
export interface WeaponDef {
  id: 'missile' | 'oil';
  name: Text;
  desc: Text;
  price: number;
  /** how many at most in the boot */
  max: number;
}

export const WEAPONS: WeaponDef[] = [
  { id: 'missile', name: L('Ohjus', 'Missile'), desc: L('Lentää eteenpäin ja hakeutuu lähimpään autoon. Osuma pyöräyttää.', 'Flies ahead and homes on the nearest car. A hit spins them.'), price: 80, max: 12 },
  { id: 'oil', name: L('Öljy', 'Oil'), desc: L('Jää tielle taaksesi. Joka ajaa siihen, pyörii.', 'Left on the road behind you. Whoever drives in spins.'), price: 50, max: 12 },
];

/** what a missile hit, a slick and a hard tree do to the damage number (0..100) */
export const DAMAGE = { missile: 15, oil: 5, tree: 5, car: 2 };
/** at 100 damage the car has lost this much of its top speed and pull */
export const DAMAGE_PACE = 0.3;
/** the repair after a race: this share of the car's price at 100 damage */
export const REPAIR_SHARE = 0.12;
/** m/s on top of the car's own speed */
export const MISSILE_SPEED = 42;
export const MISSILE_LIFE = 2.2;
/** seconds the car is a passenger after a hit */
export const SPIN_TIME = 1.1;
/** seconds of no grip on a slick */
export const SLICK_TIME = 1.4;
export const SLICK_LIFE = 25;
