import { TenantNoteListQuery } from '@rampflow/shared/modules/core/api.platform';
import { createFileRoute } from '@tanstack/react-router';
import { canonicalSearch, useListState } from '@/components/data-table/use-list-state';
import { TenantNotes } from '@/modules/core/tenant-notes';

// PL-08: the Notes tab, a data table with the "Add note" sheet; its state lives in the URL.

export const Route = createFileRoute('/platform/tenants/$tenantId/notes')({
  validateSearch: TenantNoteListQuery.search,
  search: { middlewares: [canonicalSearch(TenantNoteListQuery)] },
  component: NotesTab,
});

function NotesTab() {
  const { tenantId } = Route.useParams();
  const navigate = Route.useNavigate();
  const controls = useListState(TenantNoteListQuery, Route.useSearch(), (search, replace) =>
    navigate({ to: '.', search, replace }),
  );
  return <TenantNotes tenantId={tenantId} controls={controls} />;
}
