import { SettingScope } from '@rampflow/shared/values';
import { createFileRoute } from '@tanstack/react-router';
import { Building2Icon, MapPinIcon } from 'lucide-react';
import { UpsellHint } from '@/components/entitlement-gate';
import { SettingField } from '@/components/settings-field';
import { OfficeShell, PageHeader } from '@/components/shells/office-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type SettingRow, siteSettings } from './-mock';
import { dispatcherUser, memberships, startTenantMembership, tenantNav } from './-nav';

export const Route = createFileRoute('/design/settings')({
  component: SettingsScreen,
});

const sections: { title: string; description: string; prefix: string; upsell?: React.ReactNode }[] =
  [
    { title: 'Booking rules', description: 'What carriers may book and when.', prefix: 'booking.' },
    { title: 'Yard', description: 'Punctuality, no-shows and detention.', prefix: 'yard.' },
    {
      title: 'Safety briefings',
      description: 'Validity and enforcement of driver briefings.',
      prefix: 'safety.',
      upsell: (
        <UpsellHint
          feature="Quiz and gate enforcement"
          packageName="Pro"
          benefit="Let drivers prove they understood the rules, and block check-in until they did. Two more settings appear here."
          compact
        />
      ),
    },
    { title: 'Notifications', description: 'Emails to carriers.', prefix: 'notify.' },
  ];

function SettingsScreen() {
  return (
    <OfficeShell
      org={startTenantMembership}
      memberships={memberships}
      nav={tenantNav('settings')}
      breadcrumbs={['Administration', 'Settings', 'Bremen Kühlhaus']}
      user={dispatcherUser}
    >
      <PageHeader
        title="Settings"
        description="Each value shows where it comes from. A site value overrides the tenant, which overrides the platform default."
        actions={
          <>
            <Button variant="ghost" size="sm">
              Discard
            </Button>
            <Button size="sm">Save changes</Button>
          </>
        }
      />
      <Tabs defaultValue="site-brm">
        <TabsList>
          <TabsTrigger value="tenant">
            <Building2Icon /> Nordfrost Lager AG
          </TabsTrigger>
          <TabsTrigger value="site-brm">
            <MapPinIcon /> Bremen Kühlhaus
          </TabsTrigger>
          <TabsTrigger value="site-ol">
            <MapPinIcon /> Oldenburg
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex max-w-5xl flex-col gap-6">
        {sections.map((section) => {
          const rows = siteSettings.filter((r) => r.key.startsWith(section.prefix) && r.entitled);
          return (
            <section
              key={section.prefix}
              className="rounded-lg border bg-background"
              aria-labelledby={`s-${section.prefix}`}
            >
              <div className="border-b px-5 py-3">
                <h2 id={`s-${section.prefix}`} className="font-semibold">
                  {section.title}
                </h2>
                <p className="text-sm text-muted-foreground">{section.description}</p>
              </div>
              <div className="divide-y px-5">
                {rows.map((row) => (
                  <SettingField
                    key={row.key}
                    id={row.key}
                    label={row.label}
                    description={row.description}
                    source={row.source}
                    scope={SettingScope.site}
                    inheritedValue={inheritedValue(row)}
                    control={<Control row={row} />}
                  />
                ))}
              </div>
              {section.upsell ? <div className="border-t px-5 py-3">{section.upsell}</div> : null}
            </section>
          );
        })}
      </div>
    </OfficeShell>
  );
}

function inheritedValue(row: SettingRow): string | undefined {
  if (row.source !== SettingScope.site) return undefined;
  return row.key === 'booking.horizon_days' ? '30 days' : '15 min';
}

function Control({ row }: { row: SettingRow }) {
  if (row.value === 'On' || row.value === 'Off') {
    return (
      <label htmlFor={row.key} className="flex h-8 items-center gap-2 text-sm">
        <Switch id={row.key} defaultChecked={row.value === 'On'} />
        {row.value}
      </label>
    );
  }
  if (row.key === 'booking.slot_grid_minutes') {
    return (
      <NativeSelect id={row.key} defaultValue="30">
        {[5, 10, 15, 20, 30, 60].map((n) => (
          <NativeSelectOption key={n} value={String(n)}>
            {n} min
          </NativeSelectOption>
        ))}
      </NativeSelect>
    );
  }
  const [num, unit] = row.value.split(' ');
  return (
    <div className="flex items-center gap-2">
      <Input id={row.key} type="number" defaultValue={num} className="w-28 tabular-nums" />
      <span className="text-sm text-muted-foreground">{unit}</span>
    </div>
  );
}
