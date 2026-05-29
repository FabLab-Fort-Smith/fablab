import Link from 'next/link';

export const metadata = {
  title: 'About | The Lab',
  description: 'Fab Lab Fort Smith — community makerspace in downtown Fort Smith, AR.',
};

const EQUIPMENT = [
  { sym: '◈', name: '3D Printers', spec: 'FDM + resin; 0.1mm resolution' },
  { sym: '◉', name: 'Laser Cutter', spec: '60W CO₂; 24×18" bed' },
  { sym: '⊡', name: 'Vinyl Cutter', spec: 'Cricut Maker + Silhouette Cameo' },
  { sym: '⊞', name: 'Electronics Lab', spec: 'Soldering, oscilloscope, bench PSU' },
  { sym: '⊟', name: 'Power Tools', spec: 'Drill press, jigsaw, band saw' },
  { sym: '⊠', name: 'CNC Router', spec: 'Coming soon — 4×4" working area' },
];

const VALUES = [
  { label: 'open_access', desc: 'Tools should not be gated behind privilege. We provide professional equipment at community prices.' },
  { label: 'do-ocracy', desc: 'Want to see something happen? Make it happen. Consensus-by-doing, not committees.' },
  { label: 'teach_forward', desc: 'Learn from the member who learned before you. Pay it forward to the member who comes after.' },
  { label: 'safe_to_fail', desc: 'Iteration is how things get built. PLA is cheap. Good ideas are rare. Try stuff.' },
];

export default function AboutPage() {
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingTop: 52 }}>
      {/* Hero */}
      <section style={{ padding: '80px 24px 60px', borderBottom: '1px solid var(--bd)', background: 'var(--bg-1)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
            <span style={{ color: 'var(--green)' }}>$</span> cat ./about/mission.md
          </div>
          <h1 style={{
            fontFamily: 'var(--display)', fontSize: 'clamp(2rem, 5vw, 3.6rem)',
            letterSpacing: '-0.04em', color: 'var(--green)', marginBottom: 20, lineHeight: 1.05,
          }} className="chroma">
            more than a workshop.
          </h1>
          <p style={{ color: 'var(--text)', fontSize: 15, lineHeight: 1.8, maxWidth: 680 }}>
            Fab Lab Fort Smith is a community-owned hackerspace in downtown Fort Smith, AR. We provide 24/7 access to professional fabrication tools, a growing network of makers, and a culture that rewards curiosity over credentials.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section style={{ padding: '80px 24px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 24 }}>
          <span style={{ color: 'var(--green)' }}>$</span> ./mission --verbose
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'start' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--display)', fontSize: '1.8rem', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 20 }}>
              our mission
            </h2>
            <p style={{ color: 'var(--text-mid)', fontSize: 13, lineHeight: 1.9, marginBottom: 16 }}>
              We exist to democratize access to the tools of invention. When you give people the power to create, they build amazing things — from 3D-printed prosthetics to laser-cut art, PCB prototypes to custom furniture.
            </p>
            <p style={{ color: 'var(--text-mid)', fontSize: 13, lineHeight: 1.9, marginBottom: 16 }}>
              We&apos;re reclaiming the word &quot;hacker.&quot; To us, a hacker is anyone who looks at a system — a toaster, a line of code, a piece of furniture — and asks: &quot;How can I make this better?&quot;
            </p>
            <p style={{ color: 'var(--text-mid)', fontSize: 13, lineHeight: 1.9 }}>
              We are a do-ocracy: if you want to see it happen, you have the power to make it happen.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {VALUES.map(v => (
              <div key={v.label} className="card" style={{ padding: '16px 18px' }}>
                <div style={{ fontFamily: 'var(--mono)', color: 'var(--green)', fontSize: 10, letterSpacing: '0.12em', marginBottom: 6 }}>{v.label}</div>
                <div style={{ color: 'var(--text-mid)', fontSize: 12, lineHeight: 1.7 }}>{v.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Equipment */}
      <section style={{ padding: '80px 24px', background: 'var(--bg-1)', borderTop: '1px solid var(--bd)', borderBottom: '1px solid var(--bd)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
            <span style={{ color: 'var(--green)' }}>$</span> ls ./equipment/
          </div>
          <h2 style={{ fontFamily: 'var(--display)', fontSize: '1.8rem', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 40 }}>
            what we have
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {EQUIPMENT.map(eq => (
              <div key={eq.name} className="card" style={{ padding: '18px 20px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--green)', fontSize: 22, lineHeight: 1, flexShrink: 0, textShadow: '0 0 8px var(--green)', marginTop: 2 }}>{eq.sym}</span>
                <div>
                  <div style={{ color: 'var(--text)', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', marginBottom: 4 }}>{eq.name}</div>
                  <div style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5 }}>{eq.spec}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who */}
      <section style={{ padding: '80px 24px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
          <span style={{ color: 'var(--green)' }}>$</span> who --am-i
        </div>
        <h2 style={{ fontFamily: 'var(--display)', fontSize: '1.8rem', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 40 }}>
          who belongs here?
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginBottom: 56 }}>
          {[
            { label: 'the_tinkerer', desc: 'Weekend warrior who needs a table saw that cuts straight and a soldering iron that gets hot.' },
            { label: 'the_entrepreneur', desc: 'Prototype fast, iterate, get to market. We\'re a launchpad — not a red-tape factory.' },
            { label: 'the_learner', desc: 'Age 8 or 80, there\'s always a new skill. Classes, workshops, peer-to-peer learning.' },
            { label: 'the_artist', desc: 'Vinyl cutting, laser engraving, resin prints — physical media for digital-native creators.' },
          ].map(p => (
            <div key={p.label} className="card" style={{ padding: '20px 18px' }}>
              <div style={{ fontFamily: 'var(--mono)', color: 'var(--green)', fontSize: 10, letterSpacing: '0.12em', marginBottom: 10 }}>{p.label}</div>
              <p style={{ color: 'var(--text-mid)', fontSize: 12, lineHeight: 1.7, margin: 0 }}>{p.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA strip */}
        <div style={{ border: '1px solid var(--green)', padding: '40px 36px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 24, boxShadow: '0 0 24px rgba(57,255,20,0.08)' }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '1.6rem', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 8 }}>ready to build?</div>
            <div style={{ color: 'var(--text-mid)', fontSize: 13 }}>Join the lab and start turning ideas into reality.</div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/auth/register" className="btn btn--filled" style={{ fontSize: 11 }}>$ ./join --now</Link>
            <Link href="/code-of-conduct" className="btn btn--ghost" style={{ fontSize: 11 }}>$ cat conduct.md</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
