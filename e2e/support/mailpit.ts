import { expect } from '@playwright/test';

// Mailpit's HTTP API (docs/how-to/run-locally.md): every email the outbox sends lands there.

const MAILPIT = `http://${process.env.SMTP_HOST ?? 'localhost'}:8025`;

interface Summary {
  ID: string;
  Subject: string;
  Created: string;
}

/** The newest email to `to`, waiting for the outbox worker (it ticks every 5 seconds). */
export async function latestEmailTo(to: string): Promise<{ subject: string; text: string }> {
  let found: Summary | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
        );
        const body = (await res.json()) as { messages: Summary[] };
        found = body.messages[0];
        return found !== undefined;
      },
      { timeout: 20_000, message: `an email to ${to}` },
    )
    .toBe(true);
  const res = await fetch(`${MAILPIT}/api/v1/message/${found?.ID}`);
  const message = (await res.json()) as { Subject: string; Text: string };
  return { subject: message.Subject, text: message.Text };
}

/** The first link in an email that starts with `prefix`, for example `${baseURL}/auth/magic#`. */
export function linkIn(text: string, path: string): string {
  const match = new RegExp(
    `https?://[^\\s"<>]*${path.replace(/[/#]/g, '\\$&')}[^\\s"<>)\\]]*`,
  ).exec(text);
  if (!match) throw new Error(`No ${path} link in:\n${text}`);
  return match[0];
}

/** No email to `to` after two outbox ticks, for actions that must send nothing. */
export async function expectNoEmailTo(to: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 11_000));
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  const body = (await res.json()) as { messages: Summary[] };
  expect(body.messages, `emails to ${to}`).toHaveLength(0);
}
