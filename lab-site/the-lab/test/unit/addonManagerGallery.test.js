/**
 * @jest-environment jsdom
 *
 * AD-2: Addon Manager gallery. Verifies the gallery page renders a card per addon
 * from a mocked GET /api/v1/admin/plugins payload (icon, name, description,
 * category, enabled state + toggle), covers loading/empty/error states, opens the
 * config modal on card click, and is axe-clean with the modal closed.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import '@testing-library/jest-dom';

expect.extend(toHaveNoViolations);

const push = jest.fn();
jest.mock('next/navigation', () => ({ __esModule: true, useRouter: () => ({ push }) }));
jest.mock('next-auth/react', () => ({
  __esModule: true,
  useSession: () => ({ data: { user: { role: 'admin', userID: 'admin-1' } }, status: 'authenticated' }),
}));

import AdminAddonManagerPage from '@/app/dashboard/admin/plugins/page';

const PAYLOAD = {
  plugins: [
    {
      id: 'member-email', name: 'Member Email', version: '1.0.0',
      description: 'Self-service @fablabfortsmith.org mailboxes.',
      icon: '@', category: 'Communications', enabled: true,
      configSchema: { maxMailboxes: { type: 'number', default: 1, min: 1, max: 5, description: 'Cap' } },
      config: { maxMailboxes: 1 }, secretsSet: {},
    },
    {
      id: 'door-access-controller', name: 'Door Access', version: '2.0.0',
      description: 'Membership-gated door unlocking.',
      icon: '⌸', category: 'Access', enabled: false,
      configSchema: {}, config: {}, secretsSet: {},
    },
  ],
};

function mockFetchOnce(body, ok = true, statusCode = 200) {
  global.fetch = jest.fn(() => Promise.resolve({ ok, status: statusCode, json: () => Promise.resolve(body) }));
}
afterEach(() => { delete global.fetch; push.mockClear(); });

test('renders a card per addon with icon, category, and enabled state', async () => {
  mockFetchOnce(PAYLOAD);
  render(<AdminAddonManagerPage />);

  // Two cards, each labelled by its title (article[aria-labelledby]).
  await waitFor(() => expect(screen.getByText('Member Email')).toBeInTheDocument());
  expect(screen.getByText('Door Access')).toBeInTheDocument();

  // Card metadata surfaced (icon rendered, category shown).
  expect(screen.getByText('@')).toBeInTheDocument();
  expect(screen.getByText('Communications')).toBeInTheDocument();
  expect(screen.getByText('Access')).toBeInTheDocument();

  // Enabled/disabled conveyed as text (not color alone) + reflected in the toggle.
  const emailToggle = screen.getByRole('checkbox', { name: /Member Email enabled/i });
  expect(emailToggle).toBeChecked();
  const doorToggle = screen.getByRole('checkbox', { name: /Door Access enabled/i });
  expect(doorToggle).not.toBeChecked();
});

test('shows the empty state when no addons are installed', async () => {
  mockFetchOnce({ plugins: [] });
  render(<AdminAddonManagerPage />);
  await waitFor(() => expect(screen.getByText(/no addons installed/i)).toBeInTheDocument());
});

test('surfaces a load error', async () => {
  mockFetchOnce({}, false, 500);
  render(<AdminAddonManagerPage />);
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Failed to load addons/i));
});

test('clicking a card opens the config modal', async () => {
  mockFetchOnce(PAYLOAD);
  render(<AdminAddonManagerPage />);
  await waitFor(() => expect(screen.getByText('Member Email')).toBeInTheDocument());

  // The open-button's accessible name comes from its text content (icon is aria-hidden).
  const openBtn = screen.getAllByRole('button', { name: /Member Email/i })
    .find((b) => b.getAttribute('aria-haspopup') === 'dialog');
  fireEvent.click(openBtn);
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(within(dialog).getByRole('heading', { name: /Member Email/i })).toBeInTheDocument();
});

test('gallery is axe-clean with the modal closed', async () => {
  mockFetchOnce(PAYLOAD);
  const { container } = render(<AdminAddonManagerPage />);
  await waitFor(() => expect(screen.getByText('Member Email')).toBeInTheDocument());
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
