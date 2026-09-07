// CWE-79 regression — Finding 1 from the PR #199 security review.
//
// A member's firstName/lastName is free text, stored raw. UserService.updateUser
// composes it into the admin-notification email body via sendAdminNotificationEmail
// (`${firstName} ${lastName} has submitted...`). Unescaped, a member whose name
// contains <script> is a STORED XSS against the admin inbox (same class fixed for
// the contact form). The remediation escapes the user-controlled substrings at
// composition in users/service.js.
//
// This drives the real application-submitted path (persistence + collaborators
// mocked, email.util and escapeHtml REAL) and asserts the injected markup is
// escaped in the sent HTML. It fails against the pre-fix (unescaped) composition.

const mockSendMail = jest.fn().mockResolvedValue({ response: 'ok' });
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

// Persistence + cross-feature collaborators are stubbed; email.util is left REAL
// so the composition, the template, and escapeHtml all execute for real.
jest.mock('@/app/api/v1/users/model', () => ({
  __esModule: true,
  default: { getUserByQuery: jest.fn(), updateUser: jest.fn() },
}));
jest.mock('@/app/api/v1/badges/model', () => ({ __esModule: true, default: { getBadgeById: jest.fn() } }));
jest.mock('@/app/api/v1/bounties/model', () => ({ __esModule: true, default: {} }));
jest.mock('@/app/api/v1/portfolio/model', () => ({ __esModule: true, default: {} }));
jest.mock('@/app/api/v1/wallet/service', () => ({ __esModule: true, default: { addStake: jest.fn().mockResolvedValue() } }));
jest.mock('@/app/api/v1/notifications/service', () => ({ __esModule: true, default: { create: jest.fn().mockResolvedValue() } }));
jest.mock('@/lib/discord', () => ({ __esModule: true, default: { syncCreatorRoles: jest.fn(), syncMembershipRole: jest.fn() } }));
jest.mock('@/lib/plugins/registry', () => ({ __esModule: true, emitEvent: jest.fn().mockResolvedValue() }));
jest.mock('@/app/api/auth/[...nextauth]/service', () => ({
  __esModule: true,
  default: {
    decryptEmail: (e) => e,
    decryptPhone: (p) => p,
    encryptEmail: (e) => e,
    encryptPhone: (p) => p,
  },
}));

// require (not import) so these load AFTER mockSendMail is initialized — an ES
// import is hoisted above the const and would trigger the transporter too early.
const UserService = require('@/app/api/v1/users/service').default;
const UserModel = require('@/app/api/v1/users/model').default;

/** Return the HTML body of the captured admin-notification email. */
function adminEmailHtml() {
  const msg = mockSendMail.mock.calls
    .map((c) => c[0])
    .find((m) => /Admin Alert/i.test(m.subject));
  expect(msg).toBeDefined();
  return msg.html;
}

beforeEach(() => { mockSendMail.mockClear(); });

test('SEC CWE-79 (Finding 1): member name in admin-notification body is HTML-escaped', async () => {
  const XSS_FIRST = '<script>alert(document.cookie)</script>';
  const XSS_LAST = 'O<img src=x onerror=alert(1)>';

  UserModel.getUserByQuery.mockResolvedValue({
    userID: 'u1',
    firstName: 'old',
    lastName: 'old',
    membership: { status: 'registered' }, // no applicationDate yet => submit is "new"
    badges: [],
    stakeHistory: [],
  });
  UserModel.updateUser.mockResolvedValue({
    userID: 'u1',
    email: 'admin-visible@example.com',
    firstName: XSS_FIRST,
    lastName: XSS_LAST,
    membership: { status: 'applicant', applicationDate: '2026-01-01' },
  });

  // actor omitted => trusted server caller; setting applicationDate triggers the
  // "New Membership Application" admin notification that embeds the member name.
  await UserService.updateUser(
    { userID: 'u1' },
    { membership: { applicationDate: '2026-01-01' } },
  );

  const html = adminEmailHtml();
  // Raw payloads must NOT reach the admin inbox body...
  expect(html).not.toContain(XSS_FIRST);
  expect(html).not.toContain('<img src=x onerror');
  // ...they are neutralized to entity form.
  expect(html).toContain('&lt;script&gt;alert(document.cookie)&lt;/script&gt;');
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
});
