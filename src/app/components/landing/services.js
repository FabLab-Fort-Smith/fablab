"use client";

import Link from "next/link";

const SERVICES = [
    { title: 'Computer Repair', description: 'Professional computer repair services.', link: '/services/computer-repair', active: true },
    { title: 'Laser Engraving', description: 'Coming soon', link: null, active: false },
    { title: '3D Printing', description: 'Coming soon', link: null, active: false },
];

const Services = () => (
    <div style={{ padding: '48px 32px', maxWidth: 960, margin: '0 auto' }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: '1.8rem', letterSpacing: '-0.04em', color: 'var(--green)', textAlign: 'center', marginBottom: 32 }}>
            Our Services
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
            {SERVICES.map((service) => (
                <div key={service.title} style={{ border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: service.active ? 'var(--green)' : 'var(--text-dim)' }}>
                        {service.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-mid)', flex: 1 }}>
                        {service.description}
                    </div>
                    {service.active && (
                        <Link href={service.link}>
                            <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }}>Learn More</button>
                        </Link>
                    )}
                    {!service.active && (
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--amber)', border: '1px solid var(--amber)', padding: '2px 8px', alignSelf: 'flex-start' }}>
                            Coming Soon
                        </span>
                    )}
                </div>
            ))}
        </div>
    </div>
);

export default Services;
