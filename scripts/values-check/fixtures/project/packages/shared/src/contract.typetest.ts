// Inside `defineModule(...)` a literal that has a set is still reported; the manifest only keeps its own keys.
import type { Role } from './values/roles.ts';

interface NavItem<K extends string = string> {
  readonly permission: K;
  readonly role: Role;
}
interface Manifest<P> {
  readonly permissions: P;
  readonly nav: readonly NavItem<keyof P & string>[];
}
declare function defineModule<const P extends Record<string, true>>(m: Manifest<P>): void;

const permissions = { 'demo.view': true } as const;

defineModule({
  permissions,
  nav: [{ permission: 'demo.view', role: 'admin' }], // → Role.admin
});
