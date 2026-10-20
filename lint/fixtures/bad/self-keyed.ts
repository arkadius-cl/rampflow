export const DriverChannel = { sms: 'sms', email: 'email' } as const; // expect: self-keyed

export const Quoted = { // expect: self-keyed
  'png': "png",
  webp: 'webp',
} as const;
