import Link from 'next/link';

export const metadata = {
  title: 'Thank You | The Lab',
  description: 'Your donation to Fab Lab Fort Smith was received.',
};

export default function DonateSuccessPage() {
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingTop: 52 }}>
      <section style={{ padding: '80px 24px', maxWidth: 860, margin: '0 auto' }}>
        <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
          <span style={{ color: 'var(--green)' }}>✓</span> ./donate --status
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.8rem, 4vw, 3rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 16 }}>
          thank you
        </h1>
        <p style={{ color: 'var(--text-mid)', fontSize: 13, lineHeight: 1.8, maxWidth: 580, marginBottom: 40 }}>
          Your donation to Fab Lab Fort Smith was received. Every contribution goes directly toward keeping the space open and the tools running.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/" className="btn btn--filled" style={{ fontSize: 11 }}>
            $ ./home
          </Link>
          <Link href="/donate" className="btn btn--ghost" style={{ fontSize: 11 }}>
            $ ./donate --again
          </Link>
        </div>
      </section>
    </div>
  );
}
