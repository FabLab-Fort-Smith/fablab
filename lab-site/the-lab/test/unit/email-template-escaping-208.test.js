// CWE-79 — #208: single-source-of-truth HTML escaping in email templates.
//
// Prior work (#199/#207) escaped user data in emails. #208 audits every template
// function and asserts the escaping happens EXACTLY ONCE, in the right layer:
//
//   * PURE user-data params (names, bounty/contact/volunteer fields) are escaped at
//     the TEMPLATE layer; callers pass them RAW. This suite proves the rendered body
//     contains the SINGLE-escaped form and NEVER the double-escaped form (&amp;lt;) —
//     i.e. no caller also escapes them (no double-escape) and none is left raw
//     (no under-escape).
//
//   * MIXED params (sendNudgeEmail / sendAdminNotificationEmail `message`/`actionText`)
//     are pre-escaped-at-composition by contract: the caller composes a body fragment
//     that may legitimately contain server-authored HTML AND escapes any untrusted
//     substring. The template MUST NOT blanket-escape them. This suite proves server
//     HTML still renders while a caller-escaped substring stays single-escaped.
//
//   * The one under-escape fix: sendStatusChangeEmail's default-branch `message`
//     embeds `newStatus` (which can originate from a client `membership.status`
//     override) — now escaped at composition. Fails against the pre-#208 template that
//     inlined `${newStatus.toUpperCase()}` raw.

const mockSendMail = jest.fn().mockResolvedValue({ response: 'ok' });
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

const {
  escapeHtml,
  sendContactEmail,
  sendBountyClaimedEmail,
  sendBountySubmittedEmail,
  sendBountyVerifiedEmail,
  sendDeclineEmail,
  sendApplicationReceivedEmail,
  sendProfileCompletionEmail,
  sendVolunteerHoursApprovedEmail,
  sendGoogleRetirementEmail,
  sendStatusChangeEmail,
  sendNudgeEmail,
  sendAdminNotificationEmail,
} = require('@/app/utils/email.util');

/** Return the HTML body of the single email sent during a test. */
function sentHtml() {
  expect(mockSendMail).toHaveBeenCalledTimes(1);
  return mockSendMail.mock.calls[0][0].html;
}

beforeEach(() => { mockSendMail.mockClear(); });

const XSS = '<script>alert(document.cookie)</script>';
const XSS_SINGLE = '&lt;script&gt;alert(document.cookie)&lt;/script&gt;';
const AMP = 'a & <b>';                 // exercises the &-first ordering
const AMP_SINGLE = 'a &amp; &lt;b&gt;';
const DOUBLE_MARKER = '&amp;lt;';       // the tell-tale of a double-escape

describe('#208 PURE user-data params: escaped exactly once at the template layer', () => {
  // Each case passes RAW user input; the template is the single escaping layer.
  const cases = [
    ['sendContactEmail(name)', () => sendContactEmail(AMP, 'u@x.com', 'hi'), AMP_SINGLE],
    ['sendContactEmail(message)', () => sendContactEmail('n', 'u@x.com', XSS), XSS_SINGLE],
    ['sendBountyClaimedEmail(claimerName)', () => sendBountyClaimedEmail('u@x.com', 'c', { bountyID: 'b', title: 't' }, XSS), XSS_SINGLE],
    ['sendBountySubmittedEmail(submitterName)', () => sendBountySubmittedEmail('u@x.com', 'c', { bountyID: 'b', title: 't' }, XSS), XSS_SINGLE],
    ['sendBountyVerifiedEmail(bounty.title)', () => sendBountyVerifiedEmail('u@x.com', 'a', { bountyID: 'b', title: XSS, rewardType: 'cash', rewardValue: 5, stakeValue: 0 }), XSS_SINGLE],
    ['sendDeclineEmail(firstName)', () => sendDeclineEmail('u@x.com', XSS), XSS_SINGLE],
    ['sendApplicationReceivedEmail(firstName)', () => sendApplicationReceivedEmail('u@x.com', XSS), XSS_SINGLE],
    ['sendProfileCompletionEmail(firstName)', () => sendProfileCompletionEmail('u@x.com', XSS, 'uid1'), XSS_SINGLE],
    ['sendVolunteerHoursApprovedEmail(description)', () => sendVolunteerHoursApprovedEmail('u@x.com', 'f', 3, XSS), XSS_SINGLE],
    ['sendGoogleRetirementEmail(firstName)', () => sendGoogleRetirementEmail('u@x.com', XSS), XSS_SINGLE],
  ];

  test.each(cases)('%s: single-escaped present, raw absent, double-escape absent', async (_label, run, expectedSingle) => {
    await run();
    const html = sentHtml();
    // single-escaped form present
    expect(html).toContain(expectedSingle);
    // raw payload absent (not under-escaped)
    if (expectedSingle === XSS_SINGLE) {
      expect(html).not.toContain(XSS);
    } else {
      expect(html).not.toContain('<b>');
    }
    // double-escaped form absent (not double-escaped)
    expect(html).not.toContain(DOUBLE_MARKER);
  });
});

describe('#208 under-escape fix: sendStatusChangeEmail escapes newStatus in the default message', () => {
  test('unknown (client-overridable) status is HTML-escaped, firstName escaped, no double', async () => {
    // A status not matched by any switch case falls to the default `message`,
    // which interpolates newStatus. Pre-#208 that was raw → stored XSS.
    await sendStatusChangeEmail('u@x.com', XSS, '<script>alert(1)</script>');
    const html = sentHtml();
    // newStatus is upper-cased then escaped
    expect(html).toContain('&lt;SCRIPT&gt;ALERT(1)&lt;/SCRIPT&gt;');
    expect(html).not.toContain('<SCRIPT>');
    expect(html).not.toContain('<script>alert(1)</script>');
    // firstName (PURE) escaped at the template layer
    expect(html).toContain(XSS_SINGLE);
    expect(html).not.toContain(XSS);
    // nothing double-escaped
    expect(html).not.toContain(DOUBLE_MARKER);
  });

  test('a known status keeps its static server message (no user substrings)', async () => {
    await sendStatusChangeEmail('u@x.com', 'Ann', 'active');
    const html = sentHtml();
    expect(html).toContain('full 24/7 access');
    expect(html).not.toContain(DOUBLE_MARKER);
  });
});

describe('#208 MIXED params: caller pre-escapes; template renders server HTML unchanged', () => {
  test('sendNudgeEmail: server HTML renders; caller-escaped substring stays single-escaped', async () => {
    const serverHtml = '<strong>Reminder</strong>';
    const userEscaped = escapeHtml(XSS);        // caller escapes the untrusted substring
    await sendNudgeEmail(
      'u@x.com',
      'Ann',                                     // firstName PURE → template escapes (no-op here)
      'Complete Profile',
      `${serverHtml} ${userEscaped}`,            // MIXED message: server markup + escaped user text
      'https://example.org/dashboard',
      escapeHtml('<b>Go</b>'),                    // MIXED actionText, caller-escaped
    );
    const html = sentHtml();
    expect(html).toContain('<strong>Reminder</strong>');        // server HTML NOT escaped
    expect(html).toContain(XSS_SINGLE);                          // user substring single-escaped
    expect(html).toContain('&lt;b&gt;Go&lt;/b&gt;');            // actionText single-escaped
    expect(html).not.toContain(XSS);                             // raw payload absent
    expect(html).not.toContain(DOUBLE_MARKER);                   // not double-escaped
  });

  test('sendAdminNotificationEmail: server HTML renders; caller-escaped substring stays single-escaped', async () => {
    const serverHtml = '<strong>Action</strong>';
    const userEscaped = escapeHtml('</p><img src=x onerror=alert(1)>');
    await sendAdminNotificationEmail('Subj', `${serverHtml} ${userEscaped}`, 'https://example.org', 'View');
    const html = sentHtml();
    expect(html).toContain('<strong>Action</strong>');
    expect(html).toContain('&lt;/p&gt;&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x onerror');
    expect(html).not.toContain(DOUBLE_MARKER);
  });
});
