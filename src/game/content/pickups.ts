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
  cash: { kind: 'cash', name: L('Rahaa', 'Cash'), colour: '#ffd870', amount: 60 },
  nitro: { kind: 'nitro', name: L('Nitro', 'Nitro'), colour: '#6ad0ff', amount: 0.5 },
  wrench: { kind: 'wrench', name: L('Korjaus', 'Repair'), colour: '#8ae070', amount: 25 },
  missile: { kind: 'missile', name: L('Ohjus', 'Missile'), colour: '#ff8a3a', amount: 1 },
  mine: { kind: 'mine', name: L('Miina', 'Mine'), colour: '#e0e0e0', amount: 1 },
};

/** metres between spawn points along the lap, and seconds until a taken one grows back */
export const PICKUP_SPACING = 85;
export const PICKUP_RESPAWN = 9;
/** the rotation of kinds along the lap */
export const PICKUP_ORDER: PickupKind[] = ['cash', 'nitro', 'cash', 'wrench', 'missile', 'nitro', 'cash', 'mine'];
