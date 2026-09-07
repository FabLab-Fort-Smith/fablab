// CWE-79 regression: user-controlled fields interpolated into HTML email bodies
// must be HTML-escaped so a member (or the public contact form) cannot inject markup
// or script into a rendered email. Fails against the pre-fix templates that inlined
// raw `${firstName}` / `${name}` / `${message}` / `${bounty.title}` etc.
//
// Refs #83 (google-retirement deferred cleanups, item 2).

const mockSendMail = jest.fn().mockResolvedValue({ response: 'ok' });
jest.mock('nodemailer', () => ({
  // Every createTransport() call returns the same stub so the module-level
  // transporter uses our capturing sendMail.
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

const {
  escapeHtml,
  sendContactEmail,
  sendBountyNotificationEmail,
  sendGoogleRetirementEmail,
  sendVolunteerHoursApprovedEmail,
} = require('@/app/utils/email.util');

/** Return the HTML body of the single email sent during a test. */
function sentHtml() {
  expect(mockSendMail).toHaveBeenCalledTimes(1);
  return mockSendMail.mock.calls[0][0].html;
}

beforeEach(() => { mockSendMail.mockClear(); });

describe('escapeHtml() helper', () => {
  test('neutralizes the five HTML metacharacters', () => {
    expect(escapeHtml('<script>alert(1)</script>'))
      .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml(`"&'<>`)).toBe('&quot;&amp;&#39;&lt;&gt;');
  });

  test('escapes & first so output is not double-escaped', () => {
    expect(escapeHtml('a & <b>')).toBe('a &amp; &lt;b&gt;');
  });

  test('coerces non-strings; null/undefined become empty string', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('CWE-79: templates escape user-supplied fields', () => {
  const XSS = '<script>alert(document.cookie)</script>';
  const IMG = '</p><img src=x onerror=alert(1)>';

  test('contact form escapes name, email, and message (public, untrusted)', async () => {
    await sendContactEmail(XSS, `evil"<b>@x.com`, IMG);
    const html = sentHtml();
    // Raw payloads must NOT survive into the body...
    expect(html).not.toContain(XSS);
    expect(html).not.toContain('<img src=x onerror');
    // ...they are neutralized to entity form.
    expect(html).toContain('&lt;script&gt;alert(document.cookie)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  test('bounty notification escapes firstName, title, and description', async () => {
    await sendBountyNotificationEmail('u@x.com', XSS, {
      bountyID: 'b1',
      title: '<b>t</b>',
      description: IMG,
      rewardType: 'cash',
      rewardValue: 5,
      stakeValue: 0,
    });
    const html = sentHtml();
    expect(html).not.toContain(XSS);
    expect(html).not.toContain('<img src=x onerror');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;t&lt;/b&gt;');
  });

  test('google retirement notice escapes firstName', async () => {
    await sendGoogleRetirementEmail('u@x.com', XSS);
    const html = sentHtml();
    expect(html).not.toContain(XSS);
    expect(html).toContain('&lt;script&gt;alert(document.cookie)&lt;/script&gt;');
  });

  test('volunteer-hours approval escapes firstName and description', async () => {
    await sendVolunteerHoursApprovedEmail('u@x.com', XSS, 3, IMG);
    const html = sentHtml();
    expect(html).not.toContain(XSS);
    expect(html).not.toContain('<img src=x onerror');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
