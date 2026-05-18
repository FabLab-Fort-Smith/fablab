import Link from 'next/link';

export const metadata = {
  title: 'Code of Conduct | The Lab',
  description: 'Fab Lab Fort Smith community standards and code of conduct.',
};

const SECTIONS = [
  {
    num: '01',
    title: 'respect_and_inclusivity',
    items: [
      'Treat every person with respect, dignity, and kindness.',
      'No discrimination based on age, nationality, race, ability, gender identity, sexuality, religion, or any similar personal characteristic. All are welcome.',
    ],
  },
  {
    num: '02',
    title: 'safety_and_responsibility',
    items: [
      'Always prioritize safety. Use equipment per provided instructions and training.',
      'Report unsafe conditions, accidents, or hazards to staff immediately.',
      'Do not operate equipment you have not been trained on.',
    ],
  },
  {
    num: '03',
    title: 'collaboration_and_sharing',
    items: [
      'Share tools, equipment, and knowledge generously with fellow members.',
      'Replenish supplies you consume — monetarily or physically.',
      'Respect the intellectual property and creative rights of others. Ask before using or sharing someone else\'s work.',
    ],
  },
  {
    num: '04',
    title: 'cleanliness_and_order',
    items: [
      'Maintain cleanliness and order in the workspace. Return tools and materials to their rightful places after use.',
      'Dispose of waste properly and recycle whenever possible.',
      'Leave the space better than you found it.',
    ],
  },
  {
    num: '05',
    title: 'conflict_resolution',
    items: [
      'Address conflicts constructively and seek amicable resolutions.',
      'Involve a board member if conflicts escalate or mediation is needed.',
      'Harassment of any kind will result in immediate removal.',
    ],
  },
  {
    num: '06',
    title: 'facility_rules',
    items: [
      'Adhere to all lab rules, including those specific to tool usage, opening hours, and guest policies.',
      'All activities are limited to the downstairs lab area unless prior approval has been granted. Upstairs is off limits.',
      'Guests must be accompanied by a current member at all times.',
    ],
  },
];

export default function CodeOfConductPage() {
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingTop: 52 }}>
      <section style={{ padding: '80px 24px 60px', borderBottom: '1px solid var(--bd)', background: 'var(--bg-1)' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
            <span style={{ color: 'var(--green)' }}>$</span> cat ./conduct.md
          </div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.8rem, 4vw, 3rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 16 }}>
            code of conduct
          </h1>
          <p style={{ color: 'var(--text-mid)', fontSize: 13, lineHeight: 1.8, maxWidth: 620 }}>
            As a community of hackers, makers, inventors, and artists, we are committed to fostering an environment of creativity, innovation, and mutual respect. This document outlines the standards for behavior within our community and facilities.
          </p>
        </div>
      </section>

      <section style={{ padding: '60px 24px', maxWidth: 860, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {SECTIONS.map((sec, i) => (
            <div key={sec.num} style={{ borderBottom: '1px solid var(--bd)', padding: '32px 0' }}>
              <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 28, color: 'var(--text-dim)', letterSpacing: '-0.04em', flexShrink: 0, lineHeight: 1.2, minWidth: 40 }}>{sec.num}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--mono)', color: 'var(--green)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>
                    {sec.title}
                  </div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sec.items.map((item, j) => (
                      <li key={j} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: 'var(--text-mid)', fontSize: 13, lineHeight: 1.7 }}>
                        <span style={{ color: 'var(--green)', fontSize: 9, marginTop: 5, flexShrink: 0 }}>▸</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 48, border: '1px solid var(--bd-1)', padding: '28px 24px', background: 'var(--bg-card)' }}>
          <div style={{ fontFamily: 'var(--mono)', color: 'var(--green)', fontSize: 10, letterSpacing: '0.14em', marginBottom: 12 }}>CONCLUSION</div>
          <p style={{ color: 'var(--text)', fontSize: 13, lineHeight: 1.8, margin: 0 }}>
            Fab Lab Fort Smith is a space for creativity and growth. By adhering to this code, we build a stronger, more collaborative community. Let's innovate and inspire together.
          </p>
          <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/auth/register" className="btn btn--filled" style={{ fontSize: 11 }}>$ ./join --agree</Link>
            <Link href="/#contact" className="btn btn--ghost" style={{ fontSize: 11 }}>$ ./contact --questions</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
