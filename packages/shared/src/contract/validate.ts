import { OrgKind } from '../values/roles.ts';
import { type Catalog, findEntitlement } from './catalog.ts';
import { isValidEntitlementValue } from './entitlements.ts';
import { ROLE_PARTY } from './module.ts';

/** Route map of ADR-0011: every screen of an area lives under its prefix. */
const AREA_PREFIX = {
  tenant: '/t/$orgId/',
  carrier: '/c/$orgId/',
  platform: '/platform/',
} as const;

type LoosePackages = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

function checkFeatureRef(catalog: Catalog, where: string, key: string): string[] {
  const found = findEntitlement(catalog, key);
  if (!found) return [`${where}: unknown entitlement ${key}`];
  if (found.def.reserved) return [`${where}: reserved entitlement ${key}`];
  if (found.def.kind !== 'feature') return [`${where}: ${key} is a limit, not a feature`];
  return [];
}

/**
 * Structural problems in the catalog and packages. The compiler already rejects most of them
 * in `defineModule` and `PackageValuesOf`; this check also covers data typed loosely, and a
 * test runs it in CI.
 */
export function validateCatalog(catalog: Catalog, packages: LoosePackages): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const module of catalog) {
    const at = `module ${module.id}`;
    if (seen.has(module.id)) problems.push(`${at}: duplicate module id`);
    for (const dep of module.dependsOn) {
      if (!seen.has(dep)) problems.push(`${at}: depends on ${dep}, which is not listed before it`);
    }
    seen.add(module.id);

    const records = [module.entitlements, module.permissions, module.settings];
    for (const key of records.flatMap((r) => Object.keys(r))) {
      if (!key.startsWith(`${module.id}.`)) problems.push(`${at}: key ${key} lacks the prefix`);
    }
    if (module.enabledBy !== null && !(module.enabledBy in module.entitlements)) {
      problems.push(`${at}: enabledBy ${module.enabledBy} is not declared by the module`);
    } else if (module.enabledBy !== null) {
      problems.push(...checkFeatureRef(catalog, `${at} enabledBy`, module.enabledBy));
    }
    for (const [key, def] of Object.entries(module.permissions)) {
      if (def.roles.length === 0) problems.push(`${at}: permission ${key} grants no role`);
    }
    for (const [key, def] of Object.entries(module.settings)) {
      if (def.requires !== undefined) {
        problems.push(...checkFeatureRef(catalog, `setting ${key} requires`, def.requires));
      }
      if (!def.schema.safeParse(def.default).success) {
        problems.push(`setting ${key}: default does not match its schema`);
      }
      if (new Set(def.scopes).size !== def.scopes.length) {
        problems.push(`setting ${key}: duplicate scope`);
      }
    }
    for (const item of module.nav) {
      const where = `nav ${module.id}.${item.id}`;
      if (!item.to.startsWith(AREA_PREFIX[item.area])) {
        problems.push(`${where}: ${item.to} is outside ${AREA_PREFIX[item.area]}`);
      }
      const permission = module.permissions[item.permission];
      if (!permission) {
        problems.push(`${where}: permission ${item.permission} is not declared by ${module.id}`);
      } else if (!permission.roles.some((r) => ROLE_PARTY[r] === item.area)) {
        problems.push(`${where}: no ${item.area} role holds ${item.permission}`);
      }
      if (item.area === OrgKind.tenant && item.entitlement !== undefined) {
        problems.push(...checkFeatureRef(catalog, where, item.entitlement));
      }
    }
  }

  for (const [id, values] of Object.entries(packages)) {
    for (const [key, value] of Object.entries(values)) {
      const found = findEntitlement(catalog, key);
      if (!found) problems.push(`package ${id}: unknown entitlement ${key}`);
      else if (found.def.reserved) problems.push(`package ${id}: reserved entitlement ${key}`);
      else if (!isValidEntitlementValue(found.def, value)) {
        problems.push(`package ${id}: ${key} has an invalid value`);
      }
    }
  }
  return problems;
}
