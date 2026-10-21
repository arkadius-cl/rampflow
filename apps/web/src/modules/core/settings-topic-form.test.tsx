import type { SettingKey } from '@rampflow/shared';
import type { SettingsView } from '@rampflow/shared/modules/core/api.settings';
import {
  ErrorCode,
  Setting,
  SettingScope,
  SettingSource,
  SettingsTopic,
  ZodIssueCode,
} from '@rampflow/shared/values';
import { useParams } from '@tanstack/react-router';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiFailure } from '@/lib/api';
import { renderRoutes } from '@/test/router';
import { type EntryOverride, settingsView } from '@/test/settings';
import { type SettingChanges, SettingsTopicForm } from './settings-topic-form.tsx';

const horizon = Setting.booking.horizon_days;
const minLead = Setting.booking.min_lead_minutes;
const visits = Setting.privacy.retention.visit_days;

/** Fails a save the way the API's 422 does, with an issue at `["set", key]`. */
const rejectAt = (key: SettingKey) =>
  new ApiFailure(422, ErrorCode.validation_failed, 'Invalid', {
    issues: [{ path: ['set', key], code: ZodIssueCode.too_big, message: 'Too big' }],
  });

/**
 * A tenant topic page at `/settings/$topic` with the given stored values, next to an `/other`
 * page. `refetch` swaps the view as a background refetch would.
 */
function openTopic(
  topic: SettingsTopic,
  overrides: Partial<Record<SettingKey, EntryOverride>> = {},
  answer?: (changes: SettingChanges) => Promise<SettingsView>,
) {
  const initial = settingsView(SettingScope.tenant, overrides);
  const save = vi.fn(answer ?? (async () => initial));
  let refetch: (view: SettingsView) => void = () => {};
  function TopicPage() {
    const params = useParams({ strict: false }) as { topic: SettingsTopic };
    const [view, setView] = useState(initial);
    refetch = setView;
    return <SettingsTopicForm view={view} topic={params.topic} save={save} />;
  }
  const rendered = renderRoutes(
    { '/settings/$topic': TopicPage, '/other': () => <p>Other page</p> },
    `/settings/${topic}`,
  );
  return { ...rendered, save, refetch: (view: SettingsView) => act(() => refetch(view)) };
}

const input = (label: string) => screen.findByLabelText<HTMLInputElement>(label);
const button = (name: string | RegExp) => screen.getByRole('button', { name });

async function retype(user: ReturnType<typeof userEvent.setup>, label: string, text: string) {
  const field = await input(label);
  await user.clear(field);
  await user.type(field, text);
}

const tenantHorizon45: Partial<Record<SettingKey, EntryOverride>> = {
  [horizon]: {
    value: 45,
    source: SettingSource.tenant,
    inherited: { value: 30, source: SettingSource.platform },
  },
};

describe('SettingsTopicForm', () => {
  it('sends only the changed key in one PATCH', async () => {
    const user = userEvent.setup();
    const { save } = openTopic(SettingsTopic.booking);
    await retype(user, 'Booking horizon', '45');
    expect(screen.getByText('Unsaved changes: 1')).toBeTruthy();
    await user.click(button('Save'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]?.[0]).toEqual({ set: { [horizon]: 45 }, reset: [] });
  });

  it('discards edits and sends nothing', async () => {
    const user = userEvent.setup();
    const { save } = openTopic(SettingsTopic.booking);
    await retype(user, 'Booking horizon', '45');
    await retype(user, 'Minimum lead time', '60');
    await user.click(button('Discard'));
    expect((await input('Booking horizon')).value).toBe('30');
    expect((await input('Minimum lead time')).value).toBe('120');
    expect(screen.getByText('No unsaved changes')).toBeTruthy();
    expect((button('Save') as HTMLButtonElement).disabled).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it('keeps every edit and shows a client error at its field', async () => {
    const user = userEvent.setup();
    const { save } = openTopic(SettingsTopic.booking);
    await retype(user, 'Booking horizon', '0');
    await retype(user, 'Minimum lead time', '60');
    await user.click(button('Save'));
    expect(await screen.findByText('Enter a whole number from 1 to 365.')).toBeTruthy();
    expect((await input('Minimum lead time')).value).toBe('60');
    expect(save).not.toHaveBeenCalled();
    const horizonInput = screen.getByRole('spinbutton', {
      name: 'Booking horizon',
      description: /Enter a whole number from 1 to 365\./,
    });
    await waitFor(() => expect(document.activeElement).toBe(horizonInput));
  });

  it('keeps every edit and puts a 422 issue on its field', async () => {
    const user = userEvent.setup();
    const { save } = openTopic(SettingsTopic.booking, {}, async () => {
      throw rejectAt(horizon);
    });
    await retype(user, 'Booking horizon', '45');
    await retype(user, 'Minimum lead time', '60');
    await user.click(button('Save'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const field = (await screen.findByRole('alert')).closest('[data-setting]');
    expect(field?.getAttribute('data-setting')).toBe(horizon);
    expect((await input('Booking horizon')).value).toBe('45');
    expect((await input('Minimum lead time')).value).toBe('60');
  });

  it('sends a pending "use inherited value" as a reset', async () => {
    const user = userEvent.setup();
    const { save } = openTopic(SettingsTopic.booking, tenantHorizon45);
    await user.click(await screen.findByRole('button', { name: 'Use inherited value (30)' }));
    const field = document.querySelector(`[data-setting="${horizon}"]`) as HTMLElement;
    expect(within(field).getByTestId('setting-origin').textContent).toBe(
      'From platform · Uses the inherited value after saving',
    );
    expect((await input('Booking horizon')).value).toBe('30');
    await user.click(button('Save'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]?.[0]).toEqual({ set: {}, reset: [horizon] });
  });

  it('undoes a pending "use inherited value" on discard', async () => {
    const user = userEvent.setup();
    const { save } = openTopic(SettingsTopic.booking, tenantHorizon45);
    await user.click(await screen.findByRole('button', { name: 'Use inherited value (30)' }));
    await user.click(button('Discard'));
    expect((await input('Booking horizon')).value).toBe('45');
    const field = document.querySelector(`[data-setting="${horizon}"]`) as HTMLElement;
    expect(within(field).getByTestId('setting-origin').textContent).toBe(
      'Set for this tenant · Inherited: 30 (From platform)',
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('keeps edits through a background refetch and updates the other fields', async () => {
    const user = userEvent.setup();
    const { refetch } = openTopic(SettingsTopic.booking);
    await retype(user, 'Booking horizon', '45');
    refetch(
      settingsView(SettingScope.tenant, {
        [minLead]: { value: 90, source: SettingSource.tenant },
      }),
    );
    await waitFor(async () => expect((await input('Minimum lead time')).value).toBe('90'));
    expect((await input('Booking horizon')).value).toBe('45');
  });
});

describe('admitted countries', () => {
  it('refuses an empty list at the field and sends nothing', async () => {
    const user = userEvent.setup();
    const save = vi.fn(async () => settingsView(SettingScope.platform));
    renderRoutes(
      {
        '/': () => (
          <SettingsTopicForm
            view={settingsView(SettingScope.platform)}
            topic={SettingsTopic.general}
            save={save}
          />
        ),
      },
      '/',
    );
    await user.click(await screen.findByRole('checkbox', { name: 'EU member states' }));
    expect(screen.getByText('0 of 57 selected')).toBeTruthy();
    await user.click(button('Save'));
    expect(await screen.findByText('Select at least one country.')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('group', { name: 'Admitted countries' }),
      ),
    );
  });
});

describe('retention confirmation', () => {
  const stored: Partial<Record<SettingKey, EntryOverride>> = {
    [visits]: {
      value: 395,
      source: SettingSource.tenant,
      inherited: { value: 365, source: SettingSource.platform },
    },
  };

  it('asks before a shorter period and saves on confirm', async () => {
    const user = userEvent.setup();
    const { save } = openTopic(SettingsTopic.privacy, stored);
    await retype(user, 'Keep visits', '180');
    await user.click(button('Save'));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Keep visits: 395 → 180 days')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Shorten and save' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]?.[0]).toEqual({ set: { [visits]: 180 }, reset: [] });
  });

  it('saves a longer period without asking', async () => {
    const user = userEvent.setup();
    const { save } = openTopic(SettingsTopic.privacy, stored);
    await retype(user, 'Keep visits', '730');
    await user.click(button('Save'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('asks before inheriting a shorter period', async () => {
    const user = userEvent.setup();
    openTopic(SettingsTopic.privacy, stored);
    await user.click(await screen.findByRole('button', { name: 'Use inherited value (365)' }));
    await user.click(button('Save'));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Keep visits: 395 → 365 days')).toBeTruthy();
  });

  it('writes the periods in the UI language number format', async () => {
    const user = userEvent.setup();
    openTopic(SettingsTopic.privacy, { [visits]: { value: 1500, source: SettingSource.tenant } });
    await retype(user, 'Keep visits', '1000');
    await user.click(button('Save'));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Keep visits: 1,500 → 1,000 days')).toBeTruthy();
  });

  it('saves a shorter driver link lifetime without asking, as it deletes nothing', async () => {
    const user = userEvent.setup();
    const save = vi.fn(async () => settingsView(SettingScope.platform));
    renderRoutes(
      {
        '/': () => (
          <SettingsTopicForm
            view={settingsView(SettingScope.platform)}
            topic={SettingsTopic.privacy}
            save={save}
          />
        ),
      },
      '/',
    );
    await retype(user, 'Driver link lifetime after departure', '1');
    await user.click(button('Save'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('sends nothing on cancel and keeps the edit', async () => {
    const user = userEvent.setup();
    const { save } = openTopic(SettingsTopic.privacy, stored);
    await retype(user, 'Keep visits', '180');
    await user.click(button('Save'));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(save).not.toHaveBeenCalled();
    expect((await input('Keep visits')).value).toBe('180');
  });
});

describe('unsaved-changes guard', () => {
  it('asks before another topic, and "Stay" keeps the edit', async () => {
    const user = userEvent.setup();
    const { router } = openTopic(SettingsTopic.booking);
    await retype(user, 'Booking horizon', '45');
    void router.navigate({ href: '/settings/yard' });
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Leave without saving?')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Stay' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(router.state.location.pathname).toBe('/settings/booking');
    expect((await input('Booking horizon')).value).toBe('45');
  });

  it('leaves on "Leave"', async () => {
    const user = userEvent.setup();
    const { router } = openTopic(SettingsTopic.booking);
    await retype(user, 'Booking horizon', '45');
    void router.navigate({ href: '/other' });
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Leave' }));
    expect(await screen.findByText('Other page')).toBeTruthy();
  });

  it('lets an anchor on the same page through', async () => {
    const user = userEvent.setup();
    const { router } = openTopic(SettingsTopic.booking);
    await retype(user, 'Booking horizon', '45');
    await act(() => router.navigate({ href: `/settings/booking#${minLead}` }));
    expect(router.state.location.hash).toBe(minLead);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((await input('Booking horizon')).value).toBe('45');
  });

  it('does not ask after a save', async () => {
    const user = userEvent.setup();
    const { router, save } = openTopic(SettingsTopic.booking, {}, async () =>
      settingsView(SettingScope.tenant, { [horizon]: { value: 45, source: SettingSource.tenant } }),
    );
    await retype(user, 'Booking horizon', '45');
    await user.click(button('Save'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await screen.findByText('No unsaved changes');
    await act(() => router.navigate({ href: '/other' }));
    expect(await screen.findByText('Other page')).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('setting anchor', () => {
  it('focuses the title of the hash, highlights it, and Tab reaches its input', async () => {
    const user = userEvent.setup();
    const { router } = openTopic(SettingsTopic.booking);
    await input('Booking horizon');
    await act(() => router.navigate({ href: `/settings/booking#${horizon}` }));
    await waitFor(() => expect(document.activeElement?.id).toBe(horizon));
    const field = document.querySelector(`[data-setting="${horizon}"]`);
    expect(field?.hasAttribute('data-highlighted')).toBe(true);
    await user.tab();
    expect(document.activeElement?.id).toBe(`input-${horizon}`);
  });

  it('opens the same field again when the same link is chosen twice', async () => {
    const user = userEvent.setup();
    const { router } = openTopic(SettingsTopic.booking);
    await input('Booking horizon');
    await act(() => router.navigate({ href: `/settings/booking#${horizon}` }));
    await waitFor(() => expect(document.activeElement?.id).toBe(horizon));
    await user.click(await input('Minimum lead time'));
    await act(() => router.navigate({ href: `/settings/booking#${horizon}` }));
    await waitFor(() => expect(document.activeElement?.id).toBe(horizon));
  });

  it('ignores an unknown hash', async () => {
    const { router } = openTopic(SettingsTopic.booking);
    await input('Booking horizon');
    await act(() => router.navigate({ href: '/settings/booking#nope' }));
    expect(document.activeElement).toBe(document.body);
    expect(document.querySelector('[data-highlighted]')).toBeNull();
  });
});
