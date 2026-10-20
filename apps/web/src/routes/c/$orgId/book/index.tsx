import { Permission } from '@rampflow/shared/values';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shells/office-shell';
import { guard } from '@/lib/access';
import { BookingWizard, STEPS, type Step, type WizardSearch } from '@/modules/portal/wizard';

// BK-04, BK-06: /c/$orgId/book, the carrier's booking wizard. `tenant` preselects a warehouse
// (from the warehouses page), `from` books again from an earlier booking, `booking` names the
// confirmed booking on the last step.

const text = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);

export const Route = createFileRoute('/c/$orgId/book/')({
  validateSearch: (search: Record<string, unknown>): WizardSearch => ({
    step: STEPS.includes(search.step as Step) ? (search.step as Step) : 'where',
    tenant: text(search.tenant),
    from: text(search.from),
    booking: text(search.booking),
  }),
  beforeLoad: guard({ permission: Permission.booking.book }),
  component: BookPage,
});

function BookPage() {
  const { t } = useTranslation('booking');
  const { orgId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const go = useCallback((next: WizardSearch) => void navigate({ search: next }), [navigate]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t(($) => $.portal.wizard.title)} className="mx-auto w-full max-w-6xl" />
      <BookingWizard orgId={orgId} search={search} go={go} />
    </div>
  );
}
