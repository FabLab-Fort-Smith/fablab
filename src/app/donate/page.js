import Link from 'next/link';

export const metadata = {
  title: 'Donate | The Lab',
  description: 'Support Fab Lab Fort Smith with a one-time or recurring donation.',
};

const TIERS = [
  { amount: '$10', label: 'filament_fund', desc: 'Covers a spool of PLA for the community printer fleet.' },
  { amount: '$25', label: 'tool_maintenance', desc: 'Helps keep the laser cutter calibrated and blades sharp.' },
  { amount: '$50', label: 'workshop_sponsor', desc: 'Sponsors a free public workshop for the community.' },
  { amount: '$100', label: 'equipment_fund', desc: 'Goes directly toward new or replacement equipment.' },
];

export default function DonatePage() {
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingTop: 52 }}>
      <section style={{ padding: '80px 24px 60px', borderBottom: '1px solid var(--bd)', background: 'var(--bg-1)' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
            <span style={{ color: 'var(--green)' }}>$</span> ./donate --help
          </div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.8rem, 4vw, 3rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 16 }}>
            support the lab
          </h1>
          <p style={{ color: 'var(--text-mid)', fontSize: 13, lineHeight: 1.8, maxWidth: 580 }}>
            Fab Lab Fort Smith is a nonprofit community organization. Every dollar goes directly toward tools, materials, and programming that keeps the space open for everyone.
          </p>
        </div>
      </section>

      <section style={{ padding: '60px 24px', maxWidth: 860, margin: '0 auto' }}>
        <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', marginBottom: 24 }}>SELECT_AMOUNT</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 48 }}>
          {TIERS.map(t => (
            <div key={t.label} className="card" style={{ padding: '22px 18px' }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 32, color: 'var(--green)', letterSpacing: '-0.04em', marginBottom: 8, textShadow: '0 0 16px var(--green)' }}>{t.amount}</div>
              <div style={{ fontFamily: 'var(--mono)', color: 'var(--text-mid)', fontSize: 10, letterSpacing: '0.1em', marginBottom: 10 }}>{t.label}</div>
              <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.6, margin: 0 }}>{t.desc}</p>
            </div>
          ))}
        </div>

        <div style={{ border: '1px solid var(--bd-1)', padding: '32px 28px', background: 'var(--bg-card)', marginBottom: 24 }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', marginBottom: 20 }}>PAYMENT_OPTIONS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <a
              href="https://square.link/u/fablab"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--filled"
              style={{ fontSize: 11, justifyContent: 'flex-start' }}
            >
              $ ./donate --method=square
            </a>
            <a
              href="https://www.paypal.com/donate?hosted_button_id=FABLAB"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--ghost"
              style={{ fontSize: 11, justifyContent: 'flex-start' }}
            >
              $ ./donate --method=paypal
            </a>
            <div style={{ color: 'var(--text-dim)', fontSize: 11, paddingTop: 8 }}>
              Prefer to mail a check? Send to: Fab Lab Fort Smith · 805 N Greenwood Ave · Fort Smith, AR 72901
            </div>
          </div>
        </div>

        <div style={{ border: '1px solid var(--bd)', padding: '24px', background: 'var(--bg-card)' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', marginBottom: 12 }}>MEMBERSHIP_VS_DONATION</div>
          <p style={{ color: 'var(--text-mid)', fontSize: 12, lineHeight: 1.7, margin: '0 0 16px' }}>
            A membership gives you 24/7 facility access. A donation supports the space without requiring access. Both matter.
          </p>
          <Link href="/auth/register" style={{ color: 'var(--green)', fontSize: 12, textDecoration: 'none' }}>
            → view membership tiers
          </Link>
        </div>
      </section>
    </div>
  );
}
