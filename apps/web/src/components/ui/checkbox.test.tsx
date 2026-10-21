import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Checkbox } from './checkbox.tsx';

describe('Checkbox', () => {
  it('shows a minus for the mixed state', () => {
    render(<Checkbox aria-label="EU" indeterminate />);
    const box = screen.getByRole('checkbox', { name: 'EU' });
    expect(box.getAttribute('aria-checked')).toBe('mixed');
    expect(box.querySelector('.lucide-minus')).not.toBeNull();
    expect(box.querySelector('.lucide-check')).toBeNull();
  });

  it('shows a check when checked', () => {
    render(<Checkbox aria-label="EU" checked />);
    const box = screen.getByRole('checkbox', { name: 'EU' });
    expect(box.getAttribute('aria-checked')).toBe('true');
    expect(box.querySelector('.lucide-check')).not.toBeNull();
    expect(box.querySelector('.lucide-minus')).toBeNull();
  });
});
