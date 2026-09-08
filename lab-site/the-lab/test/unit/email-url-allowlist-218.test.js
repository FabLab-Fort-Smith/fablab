// #218 (defense-in-depth, CWE-79 / CWE-20): email templates interpolate link
// params into an unescaped href="...". All CURRENT callers pass trusted
// server-composed (NEXT_PUBLIC_URL-derived) URLs, so there is no live vuln —
// but a future caller passing an untrusted URL could smuggle a javascript:/
// data:/vbscript: URI (script execution on click) or break out of the attribute.
// safeEmailUrl() allowlists the scheme at the template and falls back to the
// site base URL for anything else. These tests fail against the pre-#218
// templates that inlined the raw link, and assert a normal https link is
// UNCHANGED so real emails don't regress.

const mockSendMail = jest.fn().mockResolvedValue({ response: 'ok' });
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

const {
  safeEmailUrl,
  sendStatusChangeEmail,
  sendNudgeEmail,
} = require('@/app/utils/email.util');

/** Return the HTML body of the single email sent during a test. */
function sentHtml() {
  expect(mockSendMail).toHaveBeenCalledTimes(1);
  return mockSendMail.mock.calls[0][0].html;
}

beforeEach(() => { mockSendMail.mockClear(); });

// jest.setup.js sets NEXT_PUBLIC_URL = "http://localhost:3000" — the same base
// the templates (and the safe fallback) derive from.
const BASE = process.env.NEXT_PUBLIC_URL;

describe('safeEmailUrl() scheme allowlist', () => {
  test('passes an https link through UNCHANGED', () => {
    const url = 'https://fablabfortsmith.org/dashboard?highlight=b-1';
    expect(safeEmailUrl(url)).toBe(url);
  });

  test('passes an http (localhost/dev) link through unchanged', () => {
    const url = 'http://localhost:3000/auth/verify-email?token=abc123';
    expect(safeEmailUrl(url)).toBe(url);
  });

  test('allows a mailto link', () => {
    const url = 'mailto:hello@fablabfortsmith.org';
    expect(safeEmailUrl(url)).toBe(url);
  });

  test('preserves a hyphenated host (not treated as a breakout char)', () => {
    const url = 'https://my-lab-site.example.com/x';
    expect(safeEmailUrl(url)).toBe(url);
  });

  test.each([
    ['javascript: URI', 'javascript:alert(1)'],
    ['data: URI', 'data:text/html,<script>alert(1)</script>'],
    ['vbscript: URI', 'vbscript:msgbox(1)'],
    ['file: URI', 'file:///etc/passwd'],
    ['blob: URI', 'blob:https://x/uuid'],
    ['newline-obfuscated javascript', 'java\nscript:alert(1)'],
    ['leading-tab javascript', '\tjavascript:alert(1)'],
    ['attribute breakout with quote', 'https://x.com/a"><script>alert(1)</script>'],
    ['single-quote breakout', "https://x.com/a'onmouseover=alert(1)"],
    ['relative path (no base)', '/dashboard'],
    ['protocol-relative', '//evil.example.com'],
    ['empty string', ''],
    ['malformed', 'ht!tp:// nope'],
  ])('neutralizes %s to the safe fallback', (_label, bad) => {
    expect(safeEmailUrl(bad)).toBe(BASE);
  });

  test('non-string input falls back (fails closed)', () => {
    expect(safeEmailUrl(null)).toBe(BASE);
    expect(safeEmailUrl(undefined)).toBe(BASE);
    expect(safeEmailUrl({})).toBe(BASE);
  });
});

describe('templates neutralize a malicious link param in href', () => {
  // sendNudgeEmail takes a caller-supplied `actionLink` interpolated into an
  // href — the real injection point. This test FAILS against the pre-#218
  // template that inlined `${actionLink}` raw.

  test('nudge email neutralizes a javascript: actionLink to the fallback', async () => {
    // message/actionText are pre-escaped-by-contract server fragments (#199);
    // actionLink is the untrusted param under test.
    await sendNudgeEmail(
      'u@x.com',
      'Ada',
      'Complete Profile',
      'Please finish your profile.',
      'javascript:alert(document.cookie)',
      'Go',
    );
    const html = sentHtml();
    // The dangerous scheme never reaches the href...
    expect(html).not.toContain('javascript:alert(document.cookie)');
    expect(html).not.toMatch(/href="\s*javascript:/i);
    // ...it degrades to the safe site-base fallback.
    expect(html).toContain(`href="${BASE}"`);
  });

  test('normal status-change email keeps its real trusted link (no regression)', async () => {
    await sendStatusChangeEmail('u@x.com', 'Ada', 'active');
    const html = sentHtml();
    // The genuine dashboard link is still present, unchanged.
    expect(html).toContain(`href="${BASE}/dashboard"`);
    // And no dangerous scheme leaked into any href.
    expect(html).not.toMatch(/href="\s*javascript:/i);
    expect(html).not.toMatch(/href="\s*data:/i);
  });
});
