import { L, type Text } from '../../i18n';

/**
 * Things on the road. Each spawn point on a track has one; taken, it
 * grows back after a while. The kinds rotate per point so a lap has a
 * bit of everything. Death Rally's rule: the number of things on the
 * track is constant.
 */
export type PickupKind = 'cash' | 'nitro' | 'wrench' | 'missile' | 'mine';

export interface PickupDef {
  kind: PickupKind;
  name: Text;
  colour: string;
  /** credits, boost (0..1), damage repaired, or shots */
  amount: number;
}

export const PICKUPS: Record<PickupKind, PickupDef> = {
  cash: { kind: 'cash', name: L('Rahaa', 'Cash'), colour: '#ffd870', amount: 30 },
  nitro: { kind: 'nitro', name: L('Nitro', 'Nitro'), colour: '#6ad0ff', amount: 0.5 },
  wrench: { kind: 'wrench', name: L('Korjaus', 'Repair'), colour: '#8ae070', amount: 25 },
  missile: { kind: 'missile', name: L('Ohjus', 'Missile'), colour: '#ff8a3a', amount: 1 },
  mine: { kind: 'mine', name: L('Miina', 'Mine'), colour: '#e0e0e0', amount: 1 },
};

/** metres between spawn points along the lap, and seconds until a taken one grows back */
export const PICKUP_SPACING = 85;
/**
 * Off the line: a pickup sits this share of the half-width out from the
 * centreline, sides alternating, cash furthest out. A car takes one when
 * its centre comes within the reach, and the reach is less than the
 * offset, so a car on the centreline drives past. Taking one is a line
 * choice, which is the reason Death Rally put them on the road.
 */
export const PICKUP_OFFSET = 0.6;
export const PICKUP_OFFSET_CASH = 0.85;
export const PICKUP_REACH = 1.5;
export const PICKUP_RESPAWN = 9;
/**
 * The rotation of kinds along the lap. Cash is two in eight and small: the
 * road tops the purse up, the fight is where the money is (WRECK_BOUNTY).
 */
export const PICKUP_ORDER: PickupKind[] = ['cash', 'nitro', 'wrench', 'missile', 'nitro', 'cash', 'mine', 'nitro'];
