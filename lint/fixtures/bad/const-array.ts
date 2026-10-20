export const PARTIES = ['tenant', 'carrier', 'driver'] as const; // expect: const-array
export type Party = (typeof PARTIES)[number];

export const STEPS = [ // expect: const-array
  'slot',
  'details',
] as const;
