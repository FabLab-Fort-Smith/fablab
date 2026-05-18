'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import UsersService from '@/services/users';
import UserProfileView from '@/app/components/profile/UserProfileView';
import MatrixRain from '@/app/components/effects/MatrixRain';

export default function PublicProfilePage() {
  const params = useParams();
  const username = params?.username;
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!username) return;
    UsersService.getUserByQuery({ property: 'username', value: username })
      .then(fetchedUser => {
        if (!fetchedUser) { setError('user not found.'); }
        else if (fetchedUser.isPublic === false) { setError('this profile is private.'); }
        else { setUser(fetchedUser); }
      })
      .catch(() => setError('could not load profile.'))
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', flexDirection: 'column', gap: 16 }}>
        <div style={{ color: 'var(--text-dim)', fontSize: 12, fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>
          <span style={{ color: 'var(--green)' }}>$</span> ./user --lookup {username}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text-mid)', fontSize: 11 }}>
          <span className="dot pulse" style={{ background: 'var(--green)' }} /> loading
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: '2rem', color: 'var(--red)', letterSpacing: '-0.04em', marginBottom: 16 }}>error</div>
        <div style={{ color: 'var(--text-mid)', fontSize: 13, marginBottom: 24 }}>{error}</div>
        <Link href="/" className="btn btn--ghost" style={{ fontSize: 11 }}>$ cd /home</Link>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Matrix rain banner */}
      <div style={{ position: 'relative', height: 140, overflow: 'hidden', borderBottom: '1px solid var(--bd-1)' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.5 }}>
          <MatrixRain density={0.7} />
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, var(--bg) 0%, transparent 20%, transparent 80%, var(--bg) 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', padding: '0 24px 20px' }}>
          <div>
            <div style={{ color: 'var(--text-dim)', fontSize: 9, letterSpacing: '0.14em', marginBottom: 4 }}>
              <span style={{ color: 'var(--green)' }}>$</span> ./user --profile {username}
            </div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '1.6rem', letterSpacing: '-0.04em', color: 'var(--text-bright)' }}>
              {user?.name || user?.username}
            </div>
          </div>
        </div>
      </div>

      <UserProfileView user={user} isPublicView={true} />

      <div style={{ textAlign: 'center', padding: '24px', borderTop: '1px solid var(--bd)', color: 'var(--text-dim)', fontSize: 10, fontFamily: 'var(--mono)' }}>
        <span style={{ color: 'var(--green)' }}>$</span> powered by <Link href="/" style={{ color: 'var(--text-mid)', textDecoration: 'none' }}>the lab</Link>
      </div>
    </div>
  );
}
