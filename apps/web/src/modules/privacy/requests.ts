import type {
  EraseResult,
  SubjectMatches,
  SubjectQuery,
} from '@rampflow/shared/modules/privacy/api';
import { api, call } from '@/lib/api';
import { saveDownload } from '@/modules/report/queries';

// TN-06 calls. Mutations, not queries: the identifiers are personal data and stay out of the
// query cache and the URL.

const privacy = () => api.t[':orgId'].privacy;

export const searchSubject = (orgId: string, json: SubjectQuery) =>
  call<SubjectMatches>(privacy().search.$post({ param: { orgId }, json }));

export async function exportSubject(orgId: string, json: SubjectQuery): Promise<void> {
  const res = await privacy().export.$post({ param: { orgId }, json });
  await saveDownload(res as unknown as Response, 'privacy-export.json');
}

export const eraseSubject = (orgId: string, json: SubjectQuery) =>
  call<EraseResult>(privacy().erase.$post({ param: { orgId }, json: { ...json, confirm: true } }));
