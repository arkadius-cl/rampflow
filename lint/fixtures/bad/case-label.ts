export function label(status: string): number {
  switch (status) {
    case 'requested': // expect: case-label
      return 1;
    case `confirmed`: // expect: case-label
      return 2;
    default:
      return 0;
  }
}
