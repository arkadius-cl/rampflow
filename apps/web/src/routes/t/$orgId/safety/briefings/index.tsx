import type { Instruction } from '@rampflow/shared/modules/safety/api.authoring';
import { VersionStatus } from '@rampflow/shared/modules/safety/values';
import { BadgeSize, EditMode, Permission } from '@rampflow/shared/values';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { EllipsisIcon, PlusIcon, ShieldCheckIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shells/office-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { guard, tenantContextQuery } from '@/lib/access';
import { api, call } from '@/lib/api';
import { useDate, VersionStatusBadge } from '@/modules/safety/display';
import { InstructionDialog } from '@/modules/safety/instruction-dialog';
import { instructionsQuery, safetyKey } from '@/modules/safety/queries';

// SF-01: the tenant's briefings, with the sites each applies to and its published and draft
// versions. A row opens the editor.

export const Route = createFileRoute('/t/$orgId/safety/briefings/')({
  beforeLoad: guard({ permission: Permission.safety.manage_briefings }),
  component: BriefingsPage,
});

type Dialog = { kind: 'create' } | { kind: 'edit'; instruction: Instruction } | null;

function BriefingsPage() {
  const { t } = useTranslation('safety');
  const { orgId } = Route.useParams();
  const navigate = useNavigate();
  const context = useQuery(tenantContextQuery(orgId)).data;
  const instructions = useQuery(instructionsQuery(orgId));
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const sites = context?.sites ?? [];
  const limit = context?.entitlements.limits['safety.max_briefing_templates'] ?? null;
  const all = instructions.data ?? [];
  const active = all.filter((i) => i.archivedAt === null);
  const shown = showArchived ? all : active;
  const full = limit !== null && active.length >= limit;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t(($) => $.briefings.title)}
        description={t(($) => $.briefings.description)}
        actions={
          <Button size="sm" disabled={full} onClick={() => setDialog({ kind: EditMode.create })}>
            <PlusIcon /> {t(($) => $.briefings.new)}
          </Button>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
          <Label htmlFor="show-archived">{t(($) => $.briefings.show_archived)}</Label>
        </div>
        {limit !== null ? (
          <div className="w-64 rounded-lg border bg-background p-3 text-xs">
            <div className="flex justify-between">
              <span className="font-medium">{t(($) => $.briefings.usage)}</span>
              <span className="tabular-nums text-muted-foreground">
                {t(($) => $.briefings.usage_value, { used: active.length, limit })}
              </span>
            </div>
            <Progress
              value={Math.min(100, (active.length / Math.max(limit, 1)) * 100)}
              className="mt-1.5"
              aria-label={t(($) => $.briefings.usage)}
            />
            <p className="mt-2 text-muted-foreground">
              {full
                ? t(($) => $.briefings.limit_reached, { limit })
                : t(($) => $.briefings.usage_hint)}
            </p>
          </div>
        ) : null}
      </div>

      {instructions.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : shown.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldCheckIcon />
            </EmptyMedia>
            <EmptyTitle>{t(($) => $.briefings.empty.title)}</EmptyTitle>
            <EmptyDescription>{t(($) => $.briefings.empty.description)}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button disabled={full} onClick={() => setDialog({ kind: EditMode.create })}>
              <PlusIcon /> {t(($) => $.briefings.new)}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">{t(($) => $.briefings.columns.name)}</TableHead>
                <TableHead>{t(($) => $.briefings.columns.sites)}</TableHead>
                <TableHead>{t(($) => $.briefings.columns.published)}</TableHead>
                <TableHead>{t(($) => $.briefings.columns.draft)}</TableHead>
                <TableHead className="pr-4 text-right">
                  <span className="sr-only">{t(($) => $.briefings.columns.actions)}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((instruction) => (
                <InstructionRow
                  key={instruction.id}
                  orgId={orgId}
                  instruction={instruction}
                  siteNames={new Map(sites.map((s) => [s.id, s.name]))}
                  canRestore={!full}
                  onEdit={() => setDialog({ kind: EditMode.edit, instruction })}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {dialog ? (
        <InstructionDialog
          key={dialog.kind === EditMode.edit ? dialog.instruction.id : 'new'}
          orgId={orgId}
          sites={sites}
          instruction={dialog.kind === EditMode.edit ? dialog.instruction : undefined}
          open
          onOpenChange={(open) => (open ? undefined : setDialog(null))}
          onSaved={(saved) => {
            if (dialog.kind === EditMode.create) {
              void navigate({
                to: '/t/$orgId/safety/briefings/$instructionId',
                params: { orgId, instructionId: saved.id },
              });
            }
          }}
        />
      ) : null}
    </div>
  );
}

function InstructionRow({
  orgId,
  instruction,
  siteNames,
  canRestore,
  onEdit,
}: {
  orgId: string;
  instruction: Instruction;
  siteNames: ReadonlyMap<string, string>;
  canRestore: boolean;
  onEdit: () => void;
}) {
  const { t } = useTranslation('safety');
  const date = useDate();
  const queryClient = useQueryClient();
  const archived = instruction.archivedAt !== null;
  const setArchived = useMutation({
    mutationFn: (value: boolean) =>
      call<Instruction>(
        api.t[':orgId'].safety.instructions[':instructionId'].$patch({
          param: { orgId, instructionId: instruction.id },
          json: { archived: value },
        }),
      ),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: safetyKey(orgId) });
      toast.success(
        saved.archivedAt
          ? t(($) => $.briefings.archived_toast, { name: saved.name })
          : t(($) => $.briefings.restored_toast, { name: saved.name }),
      );
    },
  });
  const sites = instruction.allSites
    ? t(($) => $.briefings.all_sites)
    : instruction.siteIds
        .map((id) => siteNames.get(id) ?? '')
        .filter(Boolean)
        .join(', ');

  return (
    <TableRow className={archived ? 'text-muted-foreground' : undefined}>
      <TableCell className="pl-4">
        <Link
          to="/t/$orgId/safety/briefings/$instructionId"
          params={{ orgId, instructionId: instruction.id }}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {instruction.name}
        </Link>
        {archived ? (
          <Badge variant="outline" className="ml-2">
            {t(($) => $.briefings.archived)}
          </Badge>
        ) : null}
      </TableCell>
      <TableCell className="max-w-64 truncate">{sites}</TableCell>
      <TableCell>
        {instruction.published ? (
          <span className="inline-flex items-center gap-2">
            <VersionStatusBadge
              status={VersionStatus.published}
              size={BadgeSize.sm}
              label={t(($) => $.briefings.version, { version: instruction.published.version })}
            />
            <span className="text-xs text-muted-foreground">
              {t(($) => $.briefings.published_on, {
                date: date(instruction.published.publishedAt),
              })}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">{t(($) => $.briefings.not_published)}</span>
        )}
      </TableCell>
      <TableCell>
        {instruction.draft ? (
          <VersionStatusBadge
            status={VersionStatus.draft}
            size={BadgeSize.sm}
            label={t(($) => $.briefings.draft_open, { version: instruction.draft.version })}
          />
        ) : null}
      </TableCell>
      <TableCell className="pr-4 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t(($) => $.briefings.menu.open, { name: instruction.name })}
              />
            }
          >
            <EllipsisIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>{t(($) => $.briefings.menu.edit)}</DropdownMenuItem>
            {archived ? (
              <DropdownMenuItem disabled={!canRestore} onClick={() => setArchived.mutate(false)}>
                {t(($) => $.briefings.menu.restore)}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => setArchived.mutate(true)}>
                {t(($) => $.briefings.menu.archive)}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
