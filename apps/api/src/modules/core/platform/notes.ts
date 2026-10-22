import type { ListStateOf } from '@rampflow/shared/contract/list';
import type {
  TenantNoteList,
  TenantNoteListQuery,
  TenantNoteView,
} from '@rampflow/shared/modules/core/api.platform';
import { TenantNoteKind } from '@rampflow/shared/modules/core/values';
import { ErrorCode, OrgKind, values } from '@rampflow/shared/values';
import { and, count, eq, inArray } from 'drizzle-orm';
import type { TenantId, UserId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { contains, facetCounts, orderBy, pageOf, pageWindow } from '../../../kernel/list.ts';
import { appUser, org, tenantNote } from '../schema.ts';

// The platform's notes on a tenant (PL-08). Runs under the platform party, the only party that
// reads or inserts tenant_note; nothing updates or deletes a note.

/** 404 for an id that is not a tenant org, so notes never attach to a carrier or the platform. */
export async function requireTenantOrg(tx: Tx, tenantId: TenantId): Promise<{ name: string }> {
  const [row] = await tx
    .select({ name: org.name })
    .from(org)
    .where(and(eq(org.id, tenantId), eq(org.kind, OrgKind.tenant)));
  if (!row) throw new ApiError(ErrorCode.not_found);
  return row;
}

export interface NewNote {
  tenantId: TenantId;
  kind: TenantNoteKind;
  body: string;
  authorId: UserId;
}

/** Appends a note of any kind; the caller has checked the tenant. */
export async function insertNote(tx: Tx, note: NewNote, now: Date) {
  const [row] = await tx
    .insert(tenantNote)
    .values({ ...note, createdAt: now })
    .returning();
  if (!row) throw new Error(`no note inserted for ${note.tenantId}`);
  return row;
}

interface NoteRow {
  id: string;
  kind: TenantNoteKind;
  body: string;
  createdAt: Date;
  authorId: string | null;
  authorName: string | null;
}

const viewOf = (r: NoteRow): TenantNoteView => ({
  id: r.id,
  kind: r.kind,
  body: r.body,
  author:
    r.authorId !== null && r.authorName !== null ? { id: r.authorId, name: r.authorName } : null,
  createdAt: r.createdAt.toISOString(),
});

/** PL-08: a free note by a platform admin. */
export async function createNote(
  tx: Tx,
  tenantId: TenantId,
  body: string,
  authorId: UserId,
  now: Date,
): Promise<TenantNoteView> {
  await requireTenantOrg(tx, tenantId);
  const row = await insertNote(tx, { tenantId, kind: TenantNoteKind.note, body, authorId }, now);
  const [author] = await tx
    .select({ name: appUser.name })
    .from(appUser)
    .where(eq(appUser.id, authorId));
  return viewOf({ ...row, authorId: author ? authorId : null, authorName: author?.name ?? null });
}

export type TenantNoteListState = ListStateOf<typeof TenantNoteListQuery>;

/** PL-08: one page of a tenant's notes, newest first by default, with the kind counts. */
export async function listNotes(
  tx: Tx,
  tenantId: TenantId,
  state: TenantNoteListState,
): Promise<TenantNoteList> {
  await requireTenantOrg(tx, tenantId);
  const criteria = and(eq(tenantNote.tenantId, tenantId), contains(state.q, tenantNote.body));
  const kinds = state.kind.length > 0 ? inArray(tenantNote.kind, state.kind) : undefined;
  const where = and(criteria, kinds);
  const [totalRow] = await tx.select({ n: count() }).from(tenantNote).where(where);
  // The kind counts ignore the kind selection, so they show what another choice adds.
  const byKind = await tx
    .select({ value: tenantNote.kind, count: count() })
    .from(tenantNote)
    .where(criteria)
    .groupBy(tenantNote.kind);
  const { limit, offset } = pageWindow(state);
  const rows = await tx
    .select({
      id: tenantNote.id,
      kind: tenantNote.kind,
      body: tenantNote.body,
      createdAt: tenantNote.createdAt,
      authorId: appUser.id,
      authorName: appUser.name,
    })
    .from(tenantNote)
    .leftJoin(appUser, eq(appUser.id, tenantNote.authorId))
    .where(where)
    .orderBy(...orderBy(state, { createdAt: tenantNote.createdAt }, tenantNote.id))
    .limit(limit)
    .offset(offset);
  return {
    ...pageOf(state, totalRow?.n ?? 0, rows.map(viewOf)),
    facets: { kind: facetCounts(values(TenantNoteKind), byKind) },
  };
}
