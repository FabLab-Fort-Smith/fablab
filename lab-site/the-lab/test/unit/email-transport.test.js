// The transactional mailer sends via PurelyMail SMTP (our own mail infra), not Gmail.
// Asserts the nodemailer transport config: PurelyMail defaults, EMAIL_HOST/EMAIL_PORT overrides,
// secure derived from the port, auth from EMAIL_USER/EMAIL_PASS, and NO `service:'gmail'`.
// Regression: fails against the old `createTransport({ service:'gmail', ... })`.

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: jest.fn().mockResolvedValue({ response: 'ok' }) })),
}));

const OLD_ENV = { ...process.env };

/** (Re)load the mailer module with the current env and return the transport config passed to nodemailer. */
function transportConfig() {
  jest.resetModules();
  const nodemailer = require('nodemailer');
  nodemailer.createTransport.mockClear();
  require('@/app/utils/email.util');
  expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
  return nodemailer.createTransport.mock.calls[0][0];
}

afterEach(() => { process.env = { ...OLD_ENV }; });

describe('transactional mailer transport (PurelyMail SMTP)', () => {
  test('defaults to PurelyMail SMTP on 465 (implicit TLS)', () => {
    delete process.env.EMAIL_HOST; delete process.env.EMAIL_PORT;
    process.env.EMAIL_USER = 'noreply@fablabfortsmith.org';
    process.env.EMAIL_PASS = 'secret-app-pw';
    const cfg = transportConfig();
    expect(cfg.host).toBe('smtp.purelymail.com');
    expect(cfg.port).toBe(465);
    expect(cfg.secure).toBe(true);
    expect(cfg.auth).toEqual({ user: 'noreply@fablabfortsmith.org', pass: 'secret-app-pw' });
    expect(cfg.service).toBeUndefined(); // regression: not Gmail
  });

  test('port 587 => STARTTLS (secure false)', () => {
    process.env.EMAIL_PORT = '587';
    const cfg = transportConfig();
    expect(cfg.port).toBe(587);
    expect(cfg.secure).toBe(false);
  });

  test('EMAIL_HOST overrides the SMTP host', () => {
    process.env.EMAIL_HOST = 'smtp.example.net';
    process.env.EMAIL_PORT = '465';
    const cfg = transportConfig();
    expect(cfg.host).toBe('smtp.example.net');
    expect(cfg.secure).toBe(true);
  });

  test('never configures Gmail service', () => {
    const cfg = transportConfig();
    expect(cfg.service).toBeUndefined();
    expect(cfg.host).toBeTruthy();
  });
});
