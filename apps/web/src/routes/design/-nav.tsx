import { EntitlementState } from '@rampflow/shared/modules/core/values';
import { OrgKind } from '@rampflow/shared/values';
import {
  Building2Icon,
  CalendarDaysIcon,
  ChartNoAxesColumnIcon,
  ClipboardListIcon,
  Columns3Icon,
  CrownIcon,
  DoorOpenIcon,
  GaugeIcon,
  KeyRoundIcon,
  LayersIcon,
  ListIcon,
  PackageIcon,
  ScanLineIcon,
  Settings2Icon,
  ShieldCheckIcon,
  TruckIcon,
  UsersIcon,
  WarehouseIcon,
} from 'lucide-react';
import type { Membership, NavGroup } from '@/components/shells/office-shell';

export const memberships: Membership[] = [
  { id: 'acme', name: 'Acme Logistics GmbH', kind: OrgKind.tenant, role: 'Tenant admin' },
  { id: 'nordfrost', name: 'Nordfrost Lager AG', kind: OrgKind.tenant, role: 'Tenant admin' },
  { id: 'transpol', name: 'Trans-Pol Sp. z o.o.', kind: OrgKind.carrier, role: 'Carrier admin' },
];

export const tenantMembership = memberships[0] as Membership;
export const startTenantMembership = memberships[1] as Membership;
export const carrierMembership = memberships[2] as Membership;
export const platformMembership: Membership = {
  id: 'platform',
  name: 'rampflow',
  kind: OrgKind.platform,
  role: 'Platform admin',
};

export const dispatcherUser = { name: 'Anna Lenz', initials: 'AL' };
export const carrierUser = { name: 'Piotr Nowak', initials: 'PN' };
export const platformUser = { name: 'Sam Ops', initials: 'SO' };

export function tenantNav(active: string): NavGroup[] {
  return [
    {
      label: 'Operations',
      items: [
        {
          label: 'Plan board',
          icon: Columns3Icon,
          href: '/design/plan-board',
          active: active === 'board',
        },
        { label: 'Bookings', icon: ListIcon, href: '#', badge: '14' },
        { label: 'Gate', icon: ScanLineIcon, href: '/design/gate' },
        { label: 'Docks', icon: DoorOpenIcon, href: '/design/dock' },
        { label: 'Reports', icon: ChartNoAxesColumnIcon, href: '#' },
      ],
    },
    {
      label: 'Administration',
      items: [
        {
          label: 'Sites and docks',
          icon: WarehouseIcon,
          href: '/design/master-data',
          active: active === 'master-data',
        },
        { label: 'Hours and closures', icon: CalendarDaysIcon, href: '#' },
        { label: 'Load types', icon: PackageIcon, href: '#' },
        { label: 'Carriers', icon: TruckIcon, href: '#' },
        { label: 'Safety briefings', icon: ShieldCheckIcon, href: '#' },
        { label: 'Staff', icon: UsersIcon, href: '#' },
        {
          label: 'Settings',
          icon: Settings2Icon,
          href: '/design/settings',
          active: active === 'settings',
        },
        {
          label: 'Carrier scorecard',
          icon: GaugeIcon,
          href: '#',
          entitlement: EntitlementState.upsell,
          upsellHint: 'Carrier scorecards are not in the MVP packages yet',
        },
      ],
    },
  ];
}

export function carrierNav(active: string): NavGroup[] {
  return [
    {
      items: [
        {
          label: 'Bookings',
          icon: ListIcon,
          href: '/design/carrier-bookings',
          active: active === 'bookings',
        },
        {
          label: 'New booking',
          icon: CalendarDaysIcon,
          href: '/design/booking-wizard',
          active: active === 'wizard',
        },
        { label: 'Warehouses', icon: Building2Icon, href: '#' },
        { label: 'Colleagues', icon: UsersIcon, href: '#' },
      ],
    },
  ];
}

export function platformNav(active: string): NavGroup[] {
  return [
    {
      items: [
        {
          label: 'Tenants',
          icon: Building2Icon,
          href: '/design/platform-admin',
          active: active === 'tenants',
        },
        { label: 'Packages', icon: CrownIcon, href: '#' },
        { label: 'Platform defaults', icon: Settings2Icon, href: '#' },
        { label: 'Usage', icon: LayersIcon, href: '#' },
        { label: 'Jobs', icon: ClipboardListIcon, href: '#' },
        { label: 'API keys', icon: KeyRoundIcon, href: '#', entitlement: EntitlementState.off },
      ],
    },
  ];
}
