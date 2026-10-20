declare function emit(event: object): void;

emit({ type: 'booking.confirmed', at: new Date() }); // expect: member
emit({ status: "no_show" }); // expect: member
emit({ 'mode': `capacity` }); // expect: member
export const row = {
  id: 1,
  party: 'carrier', // expect: member
  role: 'gate', // expect: member
  label: 'Gate 1',
};
