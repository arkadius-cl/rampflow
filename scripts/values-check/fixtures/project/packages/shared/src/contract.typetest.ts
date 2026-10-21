// Inside `defineModule(...)` a literal that has a set is still reported; the manifest only keeps its own keys
// and its module id.
import type { Role } from './values/roles.ts';

interface NavItem<K extends string = string> {
  readonly permission: K;
  readonly role: Role;
}
interface Manifest<I extends string, P> {
  readonly id: I;
  readonly permissions: P;
  readonly nav: readonly NavItem<keyof P & string>[];
}
declare function defineModule<const I extends string, const P extends Record<string, true>>(
  m: Manifest<I, P>,
): void;

const permissions = { 'demo.view': true } as const;

defineModule({
  id: 'admin', // → silent
  permissions,
  nav: [{ permission: 'demo.view', role: 'admin' }], // → Role.admin
});
