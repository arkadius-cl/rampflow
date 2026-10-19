import type { DriverBookingView } from '@rampflow/shared/modules/driver/api';
import type {
  AcknowledgementBody,
  AcknowledgementResult,
  AttemptBody,
  AttemptResult,
  DriverBriefingContent,
  DriverBriefingList,
} from '@rampflow/shared/modules/safety/api.driver';

// The driver API (docs/reference/api-routes.md, "Driver"). Same origin; the browser sends the
// HttpOnly `rf_driver` cookie on /api/driver/* by itself.

/** The server answered with an error envelope. */
export class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;
  readonly reason: string | undefined;
  constructor(status: number, code: string, reason?: string) {
    super(`${status} ${code}${reason ? ` ${reason}` : ''}`);
    this.status = status;
    this.code = code;
    this.reason = reason;
  }
}

/** No answer at all: offline, or the network dropped the request. */
export class NetworkFailure extends Error {}

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new NetworkFailure();
  }
  if (!res.ok) {
    const envelope = (await res.json().catch(() => null)) as {
      error?: { code?: string; details?: { reason?: string } };
    } | null;
    throw new ApiFailure(
      res.status,
      envelope?.error?.code ?? 'unknown',
      envelope?.error?.details?.reason,
    );
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  exchange: (token: string) => send<void>('POST', '/api/public/driver-session', { token }),
  booking: () => send<DriverBookingView>('GET', '/api/driver/booking'),
  briefings: () => send<DriverBriefingList>('GET', '/api/driver/briefings'),
  briefing: (instructionId: string, locale: string) =>
    send<DriverBriefingContent>(
      'GET',
      `/api/driver/briefings/${encodeURIComponent(instructionId)}?locale=${encodeURIComponent(locale)}`,
    ),
  attempt: (instructionId: string, body: AttemptBody) =>
    send<AttemptResult>(
      'POST',
      `/api/driver/briefings/${encodeURIComponent(instructionId)}/attempts`,
      body,
    ),
  acknowledge: (instructionId: string, body: AcknowledgementBody) =>
    send<AcknowledgementResult>(
      'POST',
      `/api/driver/briefings/${encodeURIComponent(instructionId)}/acknowledgement`,
      body,
    ),
};
