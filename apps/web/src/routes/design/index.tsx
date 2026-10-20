import { PrototypeDriverStep } from '@rampflow/shared/modules/driver/values';
import { DeviceClass } from '@rampflow/shared/values';
import { createFileRoute, Link } from '@tanstack/react-router';
import { MonitorIcon, SmartphoneIcon, TabletIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createFileRoute('/design/')({
  component: DesignIndex,
});

type Device = DeviceClass;

const deviceIcon = { desktop: MonitorIcon, tablet: TabletIcon, phone: SmartphoneIcon };

type Screen = {
  to: string;
  step?: PrototypeDriverStep;
  title: string;
  stories: string;
  device: Device;
  role: string;
};

const screens: Screen[] = [
  {
    to: '/design/plan-board',
    title: 'Dispatcher plan board',
    stories: 'BK-01, BK-02, BK-03, MD-03',
    device: DeviceClass.desktop,
    role: 'Dispatcher',
  },
  {
    to: '/design/booking-wizard',
    title: 'Carrier booking wizard',
    stories: 'BK-04, AV-01, BK-06, CR-06',
    device: DeviceClass.desktop,
    role: 'Carrier',
  },
  {
    to: '/design/carrier-bookings',
    title: 'Carrier bookings across tenants',
    stories: 'CR-05, BK-05, CR-06',
    device: DeviceClass.desktop,
    role: 'Carrier',
  },
  {
    to: '/design/gate',
    title: 'Gate: expected trucks and check-in',
    stories: 'YD-01, YD-02, YD-03, YD-04, YD-05',
    device: DeviceClass.tablet,
    role: 'Gate operator',
  },
  {
    to: '/design/dock',
    title: 'Dock overview and call-to-dock',
    stories: 'YD-06, YD-07, YD-08',
    device: DeviceClass.tablet,
    role: 'Dock operator',
  },
  {
    to: '/design/driver',
    step: PrototypeDriverStep.booking,
    title: 'Driver: booking',
    stories: 'DR-01, DR-02',
    device: DeviceClass.phone,
    role: 'Driver',
  },
  {
    to: '/design/driver',
    step: PrototypeDriverStep.briefing,
    title: 'Driver: safety briefing',
    stories: 'SF-04',
    device: DeviceClass.phone,
    role: 'Driver',
  },
  {
    to: '/design/driver',
    step: PrototypeDriverStep.quiz,
    title: 'Driver: quiz',
    stories: 'SF-02, SF-04',
    device: DeviceClass.phone,
    role: 'Driver',
  },
  {
    to: '/design/driver',
    step: PrototypeDriverStep.waiting,
    title: 'Driver: waiting',
    stories: 'DR-03',
    device: DeviceClass.phone,
    role: 'Driver',
  },
  {
    to: '/design/driver',
    step: PrototypeDriverStep.called,
    title: 'Driver: called to dock',
    stories: 'DR-03',
    device: DeviceClass.phone,
    role: 'Driver',
  },
  {
    to: '/design/driver',
    step: PrototypeDriverStep.done,
    title: 'Driver: done',
    stories: 'YD-05',
    device: DeviceClass.phone,
    role: 'Driver',
  },
  {
    to: '/design/master-data',
    title: 'Tenant admin: sites, halls, docks, pools',
    stories: 'MD-01, MD-02, MD-03',
    device: DeviceClass.desktop,
    role: 'Tenant admin',
  },
  {
    to: '/design/settings',
    title: 'Tenant admin: settings with inheritance',
    stories: 'TN-02, PL-02',
    device: DeviceClass.desktop,
    role: 'Tenant admin',
  },
  {
    to: '/design/platform-admin',
    title: 'Platform admin: tenant, package, overrides',
    stories: 'PL-01, PL-02, PL-04',
    device: DeviceClass.desktop,
    role: 'Platform admin',
  },
];

function DesignIndex() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">rampflow design prototype</h1>
        <p className="mt-1 text-muted-foreground">
          Dev-only screens with mock data. See docs/explanation/ux-concept.md for the concept.
          Viewports: desktop 1440×900, tablet 1024×768, phone 390×844.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {screens.map((s) => {
          const Icon = deviceIcon[s.device];
          return (
            <Link
              key={s.to + (s.step ?? '')}
              to={s.to}
              search={s.step ? { step: s.step } : undefined}
              className="group outline-none"
            >
              <Card className="h-full transition-colors group-hover:border-primary group-focus-visible:ring-3 group-focus-visible:ring-ring/50">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="gap-1">
                      <Icon className="size-3" />
                      {s.device}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{s.role}</span>
                  </div>
                  <CardTitle className="text-base">{s.title}</CardTitle>
                  <CardDescription>{s.stories}</CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {s.to}
                  {s.step ? `?step=${s.step}` : ''}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
