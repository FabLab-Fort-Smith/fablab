'use client';
import ComputerRepairForm from '@/app/components/forms/computer-repair';

export default function ComputerRepairPage() {
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingTop: 52 }}>
      <section style={{ padding: '80px 24px 60px', borderBottom: '1px solid var(--bd)', background: 'var(--bg-1)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
            <span style={{ color: 'var(--green)' }}>$</span> ./services/computer-repair --request
          </div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 16 }}>
            computer repair
          </h1>
          <p style={{ color: 'var(--text-mid)', fontSize: 13, lineHeight: 1.8, maxWidth: 560 }}>
            Professional repair services at community rates. OS reinstallation, malware removal, hardware diagnostics, system cleanup, and more. Performed by certified members.
          </p>
          <div style={{ marginTop: 20, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[['OS reinstall', 'var(--green)'], ['Malware removal', 'var(--amber)'], ['Hardware diag', 'var(--cyan)'], ['Data recovery', 'var(--magenta)']].map(([s, c]) => (
              <div key={s} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: 'var(--text-mid)' }}>
                <span style={{ color: c, fontSize: 8 }}>◆</span> {s}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: '60px 24px', maxWidth: 760, margin: '0 auto' }}>
        <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', marginBottom: 24 }}>SUBMIT_REQUEST</div>
        <ComputerRepairForm />
      </section>
    </div>
  );
}
