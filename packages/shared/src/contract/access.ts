import { OrgKind, type Role } from '../values/roles.ts';
import type { Catalog, PermissionKeyOf } from './catalog.ts';
import type { ResolvedEntitlementsOf } from './entitlements.ts';
import { type NavItem, ROLE_INCLUDES } from './module.ts';

/** The role itself plus every role it includes, transitively. */
export function rolesHeldBy(role: Role): ReadonlySet<Role> {
  const held = new Set<Role>();
  const visit = (r: Role) => {
    if (held.has(r)) return;
    held.add(r);
    for (const included of ROLE_INCLUDES[r]) visit(included);
  };
  visit(role);
  return held;
}

export function permissionsFor<C extends Catalog>(
  catalog: C,
  role: Role,
): ReadonlySet<PermissionKeyOf<C>> {
  const held = rolesHeldBy(role);
  const granted = new Set<PermissionKeyOf<C>>();
  for (const module of catalog) {
    for (const [key, def] of Object.entries(module.permissions)) {
      // The key comes from the permissions record of a module in C.
      if (def.roles.some((r) => held.has(r))) granted.add(key as PermissionKeyOf<C>);
    }
  }
  return granted;
}

export type NavContext<C extends Catalog> =
  | {
      readonly area: typeof OrgKind.tenant;
      readonly permissions: ReadonlySet<PermissionKeyOf<C>>;
      readonly entitlements: ResolvedEntitlementsOf<C>;
    }
  | {
      readonly area: typeof OrgKind.carrier | typeof OrgKind.platform;
      readonly permissions: ReadonlySet<PermissionKeyOf<C>>;
    };

export type VisibleNavItem = NavItem & { readonly module: string };

/** Navigation for one area. The UI only hides; the API enforces the same keys. */
export function navFor<C extends Catalog>(catalog: C, ctx: NavContext<C>): VisibleNavItem[] {
  const permissions: ReadonlySet<string> = ctx.permissions;
  const visible: VisibleNavItem[] = [];
  for (const module of catalog) {
    if (ctx.area === OrgKind.tenant) {
      const modulesOn: Readonly<Record<string, boolean>> = ctx.entitlements.modules;
      if (!modulesOn[module.id]) continue;
    }
    for (const item of module.nav) {
      if (item.area !== ctx.area || !permissions.has(item.permission)) continue;
      if (
        item.area === OrgKind.tenant &&
        item.entitlement !== undefined &&
        ctx.area === OrgKind.tenant
      ) {
        const features: Readonly<Record<string, boolean>> = ctx.entitlements.features;
        if (!features[item.entitlement]) continue;
      }
      visible.push({ ...item, module: module.id });
    }
  }
  return visible;
}
