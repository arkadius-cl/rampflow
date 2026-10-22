import { BookingWizardStep } from '@rampflow/shared/modules/booking/values';
import { isValueOf, PageWidth, Permission } from '@rampflow/shared/values';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Page } from '@/components/shells/page';
import { guard } from '@/lib/access';
import { BookingWizard, type WizardSearch } from '@/modules/portal/wizard';

// BK-04, BK-06: /c/$orgId/book, the carrier's booking wizard. `tenant` preselects a warehouse
// (from the warehouses page), `from` books again from an earlier booking, `booking` names the
// confirmed booking on the last step.

const text = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);

export const Route = createFileRoute('/c/$orgId/book/')({
  validateSearch: (search: Record<string, unknown>): WizardSearch => ({
    step: isValueOf(BookingWizardStep, search.step) ? search.step : BookingWizardStep.where,
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
    <Page width={PageWidth.narrow} title={t(($) => $.portal.wizard.title)} className="gap-6">
      <BookingWizard orgId={orgId} search={search} go={go} />
    </Page>
  );
}
