/**
 * @jest-environment jsdom
 *
 * AD-2: Addon config popup (modal). Verifies dialog semantics + a11y: role/aria-modal,
 * labelled by title, focus moves in on open, Tab focus-trap, Esc closes, focus returns
 * to the invoking control on close, every field type renders the right control, the
 * secret field is write-only with a set/not-set indicator, and axe is clean when open.
 */
import React, { useState } from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import '@testing-library/jest-dom';

expect.extend(toHaveNoViolations);

import AddonConfigModal from '@/app/dashboard/admin/plugins/AddonConfigModal';

// An addon exercising every CONFIG_TYPE (number/string/text/boolean/select/string[]/secret).
const ADDON = {
  id: 'demo', name: 'Demo Addon', version: '1.2.3',
  description: 'Every field type, for coverage.',
  icon: '★', category: 'Testing', enabled: true,
  configSchema: {
    count: { type: 'number', default: 1, min: 0, max: 10, description: 'a number' },
    label: { type: 'string', max: 40, description: 'a string' },
    notes: { type: 'text', description: 'multiline' },
    active: { type: 'boolean', default: true, description: 'a flag' },
    mode: { type: 'select', options: ['fast', 'slow'], default: 'fast', description: 'pick one' },
    tags: { type: 'string[]', description: 'a list' },
    apiKey: { type: 'secret', description: 'the secret key' },
  },
  config: { count: 3, label: 'hi', notes: 'x', active: false, mode: 'slow', tags: ['a', 'b'] },
  secretsSet: { apiKey: true },
};

const noop = () => {};

test('renders a labelled modal dialog with every field type', () => {
  render(<AddonConfigModal addon={ADDON} onSave={noop} onClose={noop} />);
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  // Named by its title (WCAG 4.1.2).
  expect(within(dialog).getByRole('heading', { name: /Demo Addon/i })).toBeInTheDocument();

  // One control per type, each with an associated <label>.
  expect(within(dialog).getByRole('spinbutton', { name: /count/i })).toBeInTheDocument();      // number
  expect(within(dialog).getByRole('textbox', { name: /label/i })).toBeInTheDocument();         // string
  expect(within(dialog).getByRole('textbox', { name: /notes/i })).toBeInTheDocument();         // text (textarea)
  expect(within(dialog).getByRole('checkbox', { name: /active/i })).toBeInTheDocument();       // boolean
  expect(within(dialog).getByRole('combobox', { name: /mode/i })).toBeInTheDocument();         // select
  expect(within(dialog).getByRole('textbox', { name: /tags/i })).toBeInTheDocument();          // string[]
});

test('secret field is write-only (empty, password) with a "set" indicator', () => {
  render(<AddonConfigModal addon={ADDON} onSave={noop} onClose={noop} />);
  const secret = document.getElementById('addon-cfg-apiKey');
  expect(secret).toBeInTheDocument();
  expect(secret).toHaveAttribute('type', 'password'); // never a visible text control
  expect(secret).toHaveValue('');                     // never prefilled with the stored value
  // Set/not-set indicator reflects secretsSet.
  expect(screen.getByText('● set')).toBeInTheDocument();
});

test('secret shows "not set" when unset', () => {
  const unset = { ...ADDON, secretsSet: { apiKey: false } };
  render(<AddonConfigModal addon={unset} onSave={noop} onClose={noop} />);
  expect(screen.getByText('○ not set')).toBeInTheDocument();
});

test('a blank secret is omitted from the save payload (keeps current)', () => {
  const onSave = jest.fn();
  render(<AddonConfigModal addon={ADDON} onSave={onSave} onClose={noop} />);
  fireEvent.submit(screen.getByRole('dialog').querySelector('form'));
  expect(onSave).toHaveBeenCalledTimes(1);
  const [, patch] = onSave.mock.calls[0];
  expect(patch).not.toHaveProperty('apiKey'); // blank secret not sent
  expect(patch).toHaveProperty('count', 3);
});

test('a typed secret IS sent in the save payload', () => {
  const onSave = jest.fn();
  render(<AddonConfigModal addon={ADDON} onSave={onSave} onClose={noop} />);
  fireEvent.change(document.getElementById('addon-cfg-apiKey'), { target: { value: 's3cret' } });
  fireEvent.submit(screen.getByRole('dialog').querySelector('form'));
  const [, patch] = onSave.mock.calls[0];
  expect(patch.apiKey).toBe('s3cret');
});

test('moves focus into the dialog on open and Esc closes it', () => {
  const onClose = jest.fn();
  render(<AddonConfigModal addon={ADDON} onSave={noop} onClose={onClose} />);
  const dialog = screen.getByRole('dialog');
  // Focus landed inside the dialog (first focusable).
  expect(dialog.contains(document.activeElement)).toBe(true);
  // Esc triggers onClose (WCAG 2.1.2 / dialog convention).
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('Tab wraps within the dialog (focus trap)', () => {
  render(<AddonConfigModal addon={ADDON} onSave={noop} onClose={noop} />);
  const dialog = screen.getByRole('dialog');
  const focusables = dialog.querySelectorAll(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
  );
  const last = focusables[focusables.length - 1];
  last.focus();
  fireEvent.keyDown(dialog, { key: 'Tab' });
  // Tab past the last focusable wraps to the first (trap holds focus inside).
  expect(dialog.contains(document.activeElement)).toBe(true);
  expect(document.activeElement).toBe(focusables[0]);
});

test('restores focus to the invoking control when closed', async () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <div>
        <button type="button" data-testid="opener" onClick={() => setOpen(true)}>open</button>
        {open && <AddonConfigModal addon={ADDON} onSave={noop} onClose={() => setOpen(false)} />}
      </div>
    );
  }
  render(<Harness />);
  const opener = screen.getByTestId('opener');
  opener.focus();
  expect(document.activeElement).toBe(opener);

  fireEvent.click(opener); // open -> focus moves into dialog
  const dialog = screen.getByRole('dialog');
  expect(dialog.contains(document.activeElement)).toBe(true);

  fireEvent.keyDown(dialog, { key: 'Escape' }); // close -> cleanup restores focus
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(document.activeElement).toBe(opener);
});

test('modal is axe-clean when open', async () => {
  const { container } = render(<AddonConfigModal addon={ADDON} onSave={noop} onClose={noop} />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});

test('an addon with no config schema shows a no-settings message', () => {
  const bare = { ...ADDON, configSchema: {}, config: {}, secretsSet: {} };
  render(<AddonConfigModal addon={bare} onSave={noop} onClose={noop} />);
  expect(screen.getByText(/no configurable settings/i)).toBeInTheDocument();
});
