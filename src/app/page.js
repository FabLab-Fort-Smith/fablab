'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import MatrixRain from './components/effects/MatrixRain';

// ─── PublicNav ────────────────────────────────────────────────────────────────
function PublicNav() {
  const [ts, setTs] = useState('');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const tick = () => setTs(new Date().toLocaleTimeString('en-US', { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: scrolled ? 'rgba(5,8,5,0.95)' : 'rgba(5,8,5,0.85)',
      backdropFilter: 'blur(6px)',
      borderBottom: '1px solid var(--bd-1)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px', height: 52,
      transition: 'background 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <Link href="/" style={{ color: 'var(--green)', fontFamily: 'var(--display)', fontSize: 15, letterSpacing: '-0.04em', textDecoration: 'none', textShadow: '0 0 12px var(--green)' }}>
          THE_LAB
        </Link>
        <span style={{ color: 'var(--bd-hot)', opacity: 0.4, fontSize: 12 }}>|</span>
        <nav style={{ display: 'flex', gap: 20 }}>
          {[['#about', './about'], ['#pulse', './pulse'], ['#membership', './join'], ['#board', './board'], ['#contact', './contact']].map(([href, label]) => (
            <a key={href} href={href} style={{ color: 'var(--text-mid)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none', transition: 'color 0.12s' }}
              onMouseEnter={e => e.target.style.color = 'var(--green)'}
              onMouseLeave={e => e.target.style.color = 'var(--text-mid)'}
            >{label}</a>
          ))}
        </nav>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ color: 'var(--text-dim)', fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '0.05em' }}>{ts}</span>
        <span className="pill" style={{ background: 'rgba(57,255,20,0.1)' }}>
          <span className="dot pulse" style={{ background: 'var(--green)' }} />
          ONLINE
        </span>
        <Link href="/auth/register" className="btn btn--sm" style={{ fontSize: 10 }}>$ ./join</Link>
      </div>
    </nav>
  );
}

// ─── HeroBoot ─────────────────────────────────────────────────────────────────
const BOOT_LINES = [
  { text: '> ./fablab --init', delay: 0 },
  { text: 'checking workshops............[OK]', delay: 300 },
  { text: 'checking members...............[OK]', delay: 600 },
  { text: 'checking 3d_printers.......[ONLINE]', delay: 900 },
  { text: 'checking laser_cutter......[ONLINE]', delay: 1200 },
  { text: 'checking vinyl_cutter......[ONLINE]', delay: 1500 },
  { text: 'checking discord...............[OK]', delay: 1800 },
  { text: '> system ready. welcome, hacker.', delay: 2200, green: true },
];

function BootCard() {
  const [visible, setVisible] = useState([]);
  useEffect(() => {
    BOOT_LINES.forEach((line, i) => {
      setTimeout(() => setVisible(v => [...v, i]), line.delay);
    });
  }, []);

  return (
    <div className="card" style={{ padding: '20px 24px', minWidth: 340, fontFamily: 'var(--mono)', fontSize: 12 }}>
      <div className="card-header" style={{ marginBottom: 14 }}>
        <span style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.12em' }}>SYSTEM_INIT</span>
        <span className="pill" style={{ background: 'rgba(57,255,20,0.1)', fontSize: 9 }}>
          <span className="dot pulse" style={{ background: 'var(--green)' }} /> LIVE
        </span>
      </div>
      {BOOT_LINES.map((line, i) => (
        <div key={i} style={{
          color: line.green ? 'var(--green)' : 'var(--text)',
          opacity: visible.includes(i) ? 1 : 0,
          transform: visible.includes(i) ? 'none' : 'translateY(4px)',
          transition: 'opacity 0.3s, transform 0.3s',
          marginBottom: 4,
          textShadow: line.green ? '0 0 8px var(--green)' : 'none',
          fontWeight: line.green ? 700 : 400,
        }}>
          {line.text}
          {i === BOOT_LINES.length - 1 && visible.includes(i) && (
            <span className="caret-block" style={{ marginLeft: 4 }} />
          )}
        </div>
      ))}
    </div>
  );
}

function HeroBoot({ memberCount }) {
  return (
    <section style={{ position: 'relative', minHeight: 820, display: 'flex', alignItems: 'center', overflow: 'hidden', paddingTop: 52 }}>
      {/* Matrix rain background */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.55, zIndex: 0 }}>
        <MatrixRain />
      </div>
      {/* Grid overlay */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1,
        backgroundImage: 'linear-gradient(var(--bd) 1px, transparent 1px), linear-gradient(90deg, var(--bd) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        opacity: 0.3,
      }} />
      {/* Radial vignette */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 2,
        background: 'radial-gradient(ellipse 80% 80% at 50% 50%, transparent 30%, var(--bg) 100%)',
      }} />
      {/* Content */}
      <div style={{
        position: 'relative', zIndex: 3,
        width: '100%', maxWidth: 1200, margin: '0 auto', padding: '80px 24px',
        display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 64, alignItems: 'center',
      }} className="hero-grid">
        {/* Left: headline + CTAs */}
        <div>
          <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--green)' }}>//</span> Fort Smith, AR · Est. 2018
          </div>
          <h1 className="chroma" style={{
            fontFamily: 'var(--display)', fontSize: 'clamp(2.4rem, 5vw, 4rem)',
            letterSpacing: '-0.04em', lineHeight: 1.05, marginBottom: 20,
            color: 'var(--green)',
          }}>
            hack.<br />make.<br />create.
          </h1>
          <p style={{ color: 'var(--text)', fontSize: 14, lineHeight: 1.7, maxWidth: 460, marginBottom: 32 }}>
            Fort Smith's community makerspace. 3D printers, laser cutters, vinyl cutters, electronics lab — and a growing community of makers who show you how to use them. Open to everyone.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/auth/register" className="btn btn--filled" style={{ fontSize: 11 }}>$ ./join --now</Link>
            <a href="#about" className="btn btn--ghost" style={{ fontSize: 11 }}>$ ./tour</a>
            <a href="https://discord.gg/fablab" target="_blank" rel="noopener noreferrer" className="btn btn--ghost" style={{ fontSize: 11, borderColor: 'var(--magenta)', color: 'var(--magenta)' }}>$ ./discord</a>
          </div>
        </div>
        {/* Right: boot card */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <BootCard />
        </div>
      </div>
      {/* Stats strip */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 3,
        borderTop: '1px solid var(--bd-1)',
        background: 'rgba(5,8,5,0.85)',
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
      }}>
        {[
          { val: memberCount != null ? memberCount : '...', label: 'ACTIVE_MEMBERS' },
          { val: '24/7', label: 'FACILITY_ACCESS' },
        ].map(s => (
          <div key={s.label} style={{ padding: '18px 24px', textAlign: 'center', borderRight: '1px solid var(--bd-1)', lastChild: { borderRight: 'none' } }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 28, color: 'var(--green)', letterSpacing: '-0.04em', textShadow: '0 0 16px var(--green)' }}>{s.val}</div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.14em', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <style>{`
        @media (max-width: 700px) {
          .hero-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
        }
      `}</style>
    </section>
  );
}

// ─── AboutSection ─────────────────────────────────────────────────────────────
function AboutSection() {
  const EQUIPMENT = [
    { icon: '◈', name: '3D Printers', detail: 'FDM + resin' },
    { icon: '◉', name: 'Laser Cutter', detail: '60W CO₂' },
    { icon: '⊡', name: 'Vinyl Cutter', detail: 'Cricut + Silhouette' },
    { icon: '⊞', name: 'Electronics Lab', detail: 'Soldering, oscilloscope' },
    { icon: '⊟', name: 'Power Tools', detail: 'Drill press, saws' },
    { icon: '⊠', name: 'CNC Router', detail: 'Coming soon' },
  ];

  return (
    <section id="about" style={{ padding: '100px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
        <span style={{ color: 'var(--green)' }}>$</span> cat ./about.md
      </div>
      <h2 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 12 }}>
        what is the lab?
      </h2>
      <p style={{ color: 'var(--text-mid)', fontSize: 13, lineHeight: 1.8, maxWidth: 600, marginBottom: 64 }}>
        A community-owned makerspace in downtown Fort Smith. We provide access to professional fabrication tools, workshops led by members, and a network of makers who build real things. No prior experience needed — everyone starts somewhere.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {EQUIPMENT.map(eq => (
          <div key={eq.name} className="card" style={{ padding: '18px 20px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--green)', fontSize: 20, lineHeight: 1, flexShrink: 0, textShadow: '0 0 8px var(--green)' }}>{eq.icon}</span>
            <div>
              <div style={{ color: 'var(--text)', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', marginBottom: 2 }}>{eq.name}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>{eq.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── CommunityPulse ───────────────────────────────────────────────────────────
function CommunityPulseSection({ memberCount }) {
  const [bountyCount, setBountyCount] = useState(null);
  const [recentBounties, setRecentBounties] = useState([]);
  const [loadingBounties, setLoadingBounties] = useState(true);

  useEffect(() => {
    fetch('/api/v1/bounties?status=open&limit=6')
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        setBountyCount(data.total ?? null);
        setRecentBounties(data.bounties || []);
      })
      .catch(() => {})
      .finally(() => setLoadingBounties(false));
  }, []);

  const KPIS = [
    { label: 'ACTIVE_MEMBERS', val: memberCount != null ? memberCount : '...' },
    { label: 'OPEN_BOUNTIES',  val: bountyCount  != null ? bountyCount  : '...' },
  ];

  return (
    <section id="pulse" style={{ padding: '100px 24px', background: 'var(--bg-1)', borderTop: '1px solid var(--bd)', borderBottom: '1px solid var(--bd)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
          <span style={{ color: 'var(--green)' }}>$</span> ./monitor --live
        </div>
        <h2 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 48 }}>
          community pulse
        </h2>

        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 48 }}>
          {KPIS.map(k => (
            <div key={k.label} className="card" style={{ padding: '16px 18px' }}>
              <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', marginBottom: 8 }}>{k.label}</div>
              <span style={{ fontFamily: 'var(--display)', fontSize: 36, color: 'var(--green)', letterSpacing: '-0.04em', lineHeight: 1, textShadow: '0 0 16px var(--green)' }}>{k.val}</span>
            </div>
          ))}
        </div>

        {/* Activity stream */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }} className="pulse-grid">
          <div>
            <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', marginBottom: 12 }}>OPEN_BOUNTIES</div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {loadingBounties ? (
                <div style={{ padding: '16px 18px', color: 'var(--text-dim)', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="dot pulse" style={{ background: 'var(--green)', width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} />
                  loading bounties...
                </div>
              ) : recentBounties.length === 0 ? (
                <div style={{ padding: '16px 18px', color: 'var(--text-dim)', fontSize: 12 }}>[no open bounties]</div>
              ) : (
                <table className="term-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>TITLE</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentBounties.map((b) => (
                      <tr key={b._id || b.id}>
                        <td style={{ color: 'var(--text)' }}>{b.title}</td>
                        <td><span style={{ color: 'var(--green)', fontSize: 9, letterSpacing: '0.1em' }}>[{b.status || 'open'}]</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ASCII shop map */}
          <div>
            <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', marginBottom: 12 }}>FACILITY_MAP</div>
            <div className="card" style={{ padding: '16px 18px' }}>
              <pre style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-mid)', lineHeight: 1.5, margin: 0, whiteSpace: 'pre' }}>{`
┌──────────────────────────────┐
│  ENTRY        RESTROOMS      │
│   ▶                     ██   │
├──────────┬───────────────────┤
│ LOUNGE   │  FABRICATION LAB  │
│          │  [3D] [LASER]     │
│  ◈◈◈    │  [VINYL] [CNC]    │
├──────────┤                   │
│ OFFICE   │  ELECTRONICS AREA │
│          │  [SOLDER] [SCOPE] │
└──────────┴───────────────────┘
`.trim()}</pre>
              <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {[['◈', 'Seating'], ['[X]', 'Equipment'], ['▶', 'Entrance']].map(([sym, lbl]) => (
                  <div key={lbl} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 10, color: 'var(--text-dim)' }}>
                    <span style={{ color: 'var(--green)', fontFamily: 'var(--mono)' }}>{sym}</span> {lbl}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 700px) { .pulse-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </section>
  );
}

// ─── MembershipSection ────────────────────────────────────────────────────────
function MembershipSection() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/plans')
      .then(r => r.ok ? r.json() : [])
      .then(data => setPlans(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <section id="membership" style={{ padding: '100px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
        <span style={{ color: 'var(--green)' }}>$</span> ls ./membership/
      </div>
      <h2 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 12 }}>
        choose your tier
      </h2>
      <p style={{ color: 'var(--text-mid)', fontSize: 13, marginBottom: 52 }}>Cancel anytime. No BS contracts.</p>
      {loading ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="dot pulse" style={{ background: 'var(--green)', width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} />
          loading plans...
        </div>
      ) : plans.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>[no plans available — contact us to join]</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {plans.map((plan, i) => {
            const cadenceLabel = c => ({ MONTHLY: 'mo', ANNUAL: 'yr', WEEKLY: 'wk', DAILY: 'day', EVERY_TWO_YEARS: '2yr' }[c] || c?.toLowerCase());
            return (
              <div key={plan.id || i} className="card" style={{
                padding: '24px 22px',
                border: i === 0 ? '1px solid var(--green)' : '1px solid var(--bd)',
                boxShadow: i === 0 ? '0 0 24px rgba(57,255,20,0.12)' : 'none',
                display: 'flex', flexDirection: 'column',
              }}>
                <div style={{ fontFamily: 'var(--mono)', color: 'var(--green)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
                  {plan.name}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, flex: 1 }}>
                  {(plan.variations || []).map(v => (
                    <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ color: 'var(--text-mid)', fontSize: 11 }}>{v.name || cadenceLabel(v.cadence)}</span>
                      <span style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--text-bright)', letterSpacing: '-0.04em' }}>
                        {v.priceCents != null ? `$${(v.priceCents / 100).toFixed(0)}` : '—'}
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', marginLeft: 2 }}>/{cadenceLabel(v.cadence)}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <Link
                  href={`/auth/register?plan=${encodeURIComponent(plan.id || plan.name)}`}
                  className={i === 0 ? 'btn btn--filled btn--sm' : 'btn btn--ghost btn--sm'}
                  style={{ width: '100%', textAlign: 'center', fontSize: 10, marginTop: 'auto' }}
                >
                  $ ./join --plan={plan.name?.toLowerCase().replace(/\s+/g, '-') || 'now'}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── BoardSection ─────────────────────────────────────────────────────────────
function BoardSection() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/users?role=admin&isPublic=true')
      .then(r => r.ok ? r.json() : [])
      .then(data => { setMembers(Array.isArray(data) ? data : (data.users || [])); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <section id="board" style={{ padding: '100px 24px', background: 'var(--bg-1)', borderTop: '1px solid var(--bd)', borderBottom: '1px solid var(--bd)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
          <span style={{ color: 'var(--green)' }}>$</span> ./board --list
        </div>
        <h2 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 48 }}>
          board members
        </h2>
        {loading ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>loading<span className="caret-block" style={{ marginLeft: 4 }} /></div>
        ) : members.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>[no public board members listed]</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {members.map(m => (
              <div key={m._id || m.username} className="card" style={{ padding: '20px 18px', textAlign: 'center' }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 0,
                  background: 'var(--bg-elev)', border: '1px solid var(--bd-1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 14px', fontFamily: 'var(--display)',
                  fontSize: 22, color: 'var(--green)', letterSpacing: '-0.04em',
                }}>
                  {(m.name || m.username || '?').slice(0, 2).toUpperCase()}
                </div>
                <div style={{ color: 'var(--text)', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{m.name || m.username}</div>
                {m.title && <div style={{ color: 'var(--text-mid)', fontSize: 10, letterSpacing: '0.06em' }}>{m.title}</div>}
                <div style={{ marginTop: 10 }}>
                  <span className="pill" style={{ fontSize: 9 }}>board</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── ContactSection ───────────────────────────────────────────────────────────
function ContactSection() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [status, setStatus] = useState('idle');

  const handleSubmit = async e => {
    e.preventDefault();
    setStatus('sending');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setStatus(res.ok ? 'sent' : 'error');
      if (res.ok) setForm({ name: '', email: '', subject: '', message: '' });
    } catch {
      setStatus('error');
    }
  };

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <section id="contact" style={{ padding: '100px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
        <span style={{ color: 'var(--green)' }}>$</span> ./contact --send
      </div>
      <h2 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 48 }}>
        get in touch
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 64 }} className="contact-grid">
        {/* Info column */}
        <div>
          <div className="card" style={{ padding: '24px 22px', marginBottom: 16 }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', marginBottom: 14 }}>LOCATION</div>
            <div style={{ color: 'var(--text)', fontSize: 13, lineHeight: 1.8 }}>
              805 N Greenwood Ave.<br />
              Fort Smith, AR 72901
            </div>
          </div>
          <div className="card" style={{ padding: '24px 22px', marginBottom: 16 }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', marginBottom: 14 }}>CONTACT</div>
            <div style={{ color: 'var(--text)', fontSize: 13, lineHeight: 1.8 }}>
              <a href="mailto:info@fablabfortsmith.com" style={{ color: 'var(--green)', textDecoration: 'none' }}>info@fablabfortsmith.com</a>
            </div>
          </div>
          <div className="card" style={{ padding: '24px 22px' }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', marginBottom: 14 }}>OPEN_HOURS</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <tbody>
                {[
                  ['Members', '24/7 key fob'],
                  ['Public Events', 'Check calendar'],
                  ['Open Lab', 'Sat 10am – 4pm'],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ color: 'var(--text-mid)', padding: '4px 0' }}>{k}</td>
                    <td style={{ color: 'var(--text)', textAlign: 'right' }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Form column */}
        <div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>NAME</label>
                <input className="input" value={form.name} onChange={set('name')} required placeholder="your name" style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>EMAIL</label>
                <input className="input" type="email" value={form.email} onChange={set('email')} required placeholder="you@example.com" style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>SUBJECT</label>
              <input className="input" value={form.subject} onChange={set('subject')} placeholder="what's up?" style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 }}>MESSAGE</label>
              <textarea className="input" value={form.message} onChange={set('message')} required rows={6} placeholder="your message..." style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'var(--mono)', fontSize: 12 }} />
            </div>
            <button type="submit" className="btn btn--filled" disabled={status === 'sending'} style={{ alignSelf: 'flex-start', fontSize: 11 }}>
              {status === 'sending' ? '$ sending...' : '$ ./send --message'}
            </button>
            {status === 'sent' && (
              <div style={{ color: 'var(--green)', fontSize: 11, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="dot pulse" style={{ background: 'var(--green)' }} /> message transmitted. we'll reply soon.
              </div>
            )}
            {status === 'error' && (
              <div style={{ color: 'var(--red)', fontSize: 11 }}>transmission failed. email us directly at info@fablabfortsmith.com</div>
            )}
          </form>
        </div>
      </div>
      <style>{`
        @media (max-width: 700px) { .contact-grid { grid-template-columns: 1fr !important; gap: 32px !important; } }
      `}</style>
    </section>
  );
}

// ─── PublicFooter ─────────────────────────────────────────────────────────────
function PublicFooter() {
  return (
    <footer style={{ borderTop: '1px solid var(--bd)', background: 'var(--bg-1)', padding: '40px 24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 32 }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--green)', letterSpacing: '-0.04em', marginBottom: 8 }}>THE_LAB</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>Fort Smith's community makerspace</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 10, marginTop: 4 }}>805 N Greenwood Ave · Fort Smith, AR</div>
        </div>
        <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', marginBottom: 12 }}>NAVIGATE</div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[['/#about', './about'], ['/#membership', './join'], ['/board-members', './board'], ['/code-of-conduct', './conduct'], ['/donate', './donate']].map(([href, label]) => (
                <Link key={href} href={href} style={{ color: 'var(--text-mid)', fontSize: 11, textDecoration: 'none', letterSpacing: '0.06em' }}
                  onMouseEnter={e => e.target.style.color = 'var(--green)'}
                  onMouseLeave={e => e.target.style.color = 'var(--text-mid)'}
                >{label}</Link>
              ))}
            </nav>
          </div>
          <div>
            <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', marginBottom: 12 }}>ACCOUNT</div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[['/auth/login', './login'], ['/auth/register', './register'], ['/dashboard', './dashboard']].map(([href, label]) => (
                <Link key={href} href={href} style={{ color: 'var(--text-mid)', fontSize: 11, textDecoration: 'none', letterSpacing: '0.06em' }}
                  onMouseEnter={e => e.target.style.color = 'var(--green)'}
                  onMouseLeave={e => e.target.style.color = 'var(--text-mid)'}
                >{label}</Link>
              ))}
            </nav>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1200, margin: '32px auto 0', paddingTop: 20, borderTop: '1px solid var(--bd)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>© {new Date().getFullYear()} Fab Lab Fort Smith. All rights reserved.</div>
        <div style={{ color: 'var(--text-dim)', fontSize: 10, fontFamily: 'var(--mono)' }}>
          <span style={{ color: 'var(--green)' }}>$</span> uptime: 6 years
        </div>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const [memberCount, setMemberCount] = useState(null);

  useEffect(() => {
    fetch('/api/v1/users?limit=1')
      .then(r => r.ok ? r.json() : {})
      .then(data => setMemberCount(data.total ?? null))
      .catch(() => {});
  }, []);

  return (
    <>
      <PublicNav />
      <main style={{ paddingTop: 52 }}>
        <HeroBoot memberCount={memberCount} />
        <AboutSection />
        <CommunityPulseSection memberCount={memberCount} />
        <MembershipSection />
        <BoardSection />
        <ContactSection />
      </main>
      <PublicFooter />
    </>
  );
}
