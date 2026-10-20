declare const booking: { status: string };
declare const party: string;

export const noShow = booking.status === 'no_show'; // expect: comparison
export const notConfirmed = booking.status !== "confirmed"; // expect: comparison
export const loose = 'tenant' == party; // expect: comparison
export const looseNot = party != 'carrier'; // expect: comparison
export const template = booking.status === `done`; // expect: comparison
