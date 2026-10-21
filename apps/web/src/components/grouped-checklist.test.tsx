import { EuCountry } from '@rampflow/shared/modules/core/values';
import { Setting, values } from '@rampflow/shared/values';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { controlOf, settingDef } from '@/modules/core/setting-control';
import { SettingInput } from '@/modules/core/setting-input';
import { renderUi } from '@/test/render';

const key = Setting.core.site_countries;

function Countries({ initial }: { initial: readonly string[] }) {
  const [value, setValue] = useState<unknown>(initial);
  return (
    <>
      <h3 id={key}>Admitted countries</h3>
      <SettingInput
        settingKey={key}
        spec={controlOf(key, settingDef(key).schema)}
        value={value}
        onChange={setValue}
        invalid={false}
      />
    </>
  );
}

const groupBox = (name: string) =>
  within(screen.getByRole('group', { name })).queryByRole('checkbox', { name });
const countryBoxes = () => screen.getAllByRole('checkbox').filter((b) => !b.closest('legend'));

describe('admitted countries editor', () => {
  it('shows the EU default as 27 of 57 with the EU group checked', () => {
    renderUi(<Countries initial={values(EuCountry)} />);
    expect(screen.getByText('27 of 57 selected')).toBeTruthy();
    expect(groupBox('EU member states')?.getAttribute('aria-checked')).toBe('true');
    expect(groupBox('Other countries')?.getAttribute('aria-checked')).toBe('false');
    expect(countryBoxes()).toHaveLength(57);
  });

  it('makes the EU group mixed when Malta is unchecked', async () => {
    const user = userEvent.setup();
    renderUi(<Countries initial={values(EuCountry)} />);
    await user.click(screen.getByRole('checkbox', { name: 'Malta' }));
    expect(groupBox('EU member states')?.getAttribute('aria-checked')).toBe('mixed');
    expect(screen.getByText('26 of 57 selected')).toBeTruthy();
  });

  it('checks every other country with its group checkbox', async () => {
    const user = userEvent.setup();
    renderUi(<Countries initial={values(EuCountry)} />);
    const other = groupBox('Other countries');
    if (!other) throw new Error('no group checkbox');
    await user.click(other);
    expect(screen.getByText('57 of 57 selected')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Türkiye' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('filters by name without accents and hides the group checkboxes', async () => {
    const user = userEvent.setup();
    renderUi(<Countries initial={values(EuCountry)} />);
    await user.type(screen.getByRole('searchbox', { name: 'Filter countries' }), 'slo');
    expect(countryBoxes()).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: 'Slovakia' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Slovenia' })).toBeTruthy();
    expect(groupBox('EU member states')).toBeNull();
    expect(screen.getByText('27 of 57 selected')).toBeTruthy();
  });

  it('finds Türkiye typed without its accent', async () => {
    const user = userEvent.setup();
    renderUi(<Countries initial={values(EuCountry)} />);
    await user.type(screen.getByRole('searchbox', { name: 'Filter countries' }), 'turkiye');
    expect(countryBoxes()).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: 'Türkiye' })).toBeTruthy();
  });

  it('finds Turkey by its code', async () => {
    const user = userEvent.setup();
    renderUi(<Countries initial={values(EuCountry)} />);
    await user.type(screen.getByRole('searchbox', { name: 'Filter countries' }), 'TR');
    expect(screen.getByRole('checkbox', { name: 'Türkiye' })).toBeTruthy();
  });
});
