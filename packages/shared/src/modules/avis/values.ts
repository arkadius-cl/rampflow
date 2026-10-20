import type { ValueOf } from '../../values/define.ts';

export const LoadUnitType = {
  eur_pallet: 'eur_pallet',
  eur_half_pallet: 'eur_half_pallet',
  industrial_pallet: 'industrial_pallet',
  one_way_pallet: 'one_way_pallet',
  box_pallet: 'box_pallet',
  roll_cage: 'roll_cage',
  small_load_carrier: 'small_load_carrier',
  carton: 'carton',
  parcel: 'parcel',
  loose: 'loose',
  coil: 'coil',
  bulk: 'bulk',
  ibc: 'ibc',
  other: 'other',
} as const;
export type LoadUnitType = ValueOf<typeof LoadUnitType>;

export const VehicleType = {
  van_3_5t: 'van_3_5t',
  rigid_truck: 'rigid_truck',
  truck_trailer: 'truck_trailer',
  semi_trailer: 'semi_trailer',
  mega_trailer: 'mega_trailer',
  swap_body: 'swap_body',
  container: 'container',
  reefer: 'reefer',
} as const;
export type VehicleType = ValueOf<typeof VehicleType>;

/** ADR dangerous goods classes; the values are not identifiers, so the keys spell them out. */
export const AdrClass = {
  class_1: '1',
  class_2: '2',
  class_3: '3',
  class_4_1: '4.1',
  class_4_2: '4.2',
  class_4_3: '4.3',
  class_5_1: '5.1',
  class_5_2: '5.2',
  class_6_1: '6.1',
  class_6_2: '6.2',
  class_7: '7',
  class_8: '8',
  class_9: '9',
} as const;
export type AdrClass = ValueOf<typeof AdrClass>;

export const PackingGroup = {
  I: 'I',
  II: 'II',
  III: 'III',
} as const;
export type PackingGroup = ValueOf<typeof PackingGroup>;

/** Reference kinds from domain research §1. */
export const ReferenceType = {
  purchase_order: 'purchase_order',
  delivery_note: 'delivery_note',
  shipment: 'shipment',
  transport_order: 'transport_order',
  customer_ref: 'customer_ref',
  container: 'container',
  other: 'other',
} as const;
export type ReferenceType = ValueOf<typeof ReferenceType>;

/** The unit of a dangerous goods quantity: kilograms or litres. */
export const DangerousGoodsUnit = {
  kg: 'kg',
  l: 'l',
} as const;
export type DangerousGoodsUnit = ValueOf<typeof DangerousGoodsUnit>;
