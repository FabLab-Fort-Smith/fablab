"use client";

const Footer = () => (
    <footer style={{ textAlign: 'center', padding: '24px 16px', background: 'var(--bg-card)', borderTop: '1px solid var(--bd)', color: 'var(--text-dim)' }}>
        <div style={{ fontSize: 11, fontFamily: 'var(--mono)', marginBottom: 8 }}>
            © {new Date().getFullYear()} Fab Lab Fort Smith. All rights reserved.
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11, fontFamily: 'var(--mono)' }}>
            {[
                { label: 'Code of Conduct', href: '/code-of-conduct' },
                { label: 'Board Members', href: '/board-members' },
                { label: 'About Us', href: '/about' },
            ].map(({ label, href }, i, arr) => (
                <span key={href} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <a href={href} style={{ color: 'var(--text-dim)', textDecoration: 'none' }}
                        onMouseEnter={e => e.target.style.color = 'var(--green)'}
                        onMouseLeave={e => e.target.style.color = 'var(--text-dim)'}>
                        {label}
                    </a>
                    {i < arr.length - 1 && <span style={{ color: 'var(--bd)' }}>|</span>}
                </span>
            ))}
        </div>
    </footer>
);

export default Footer;
