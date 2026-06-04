'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useParams } from 'next/navigation';
import VolunteerLog from '@/app/components/profile/tabs/VolunteerLog';
import UsersService from '@/services/users';
import LoadingTerminal from '@/app/components/LoadingTerminal';

export default function VolunteerPage() {
    const { data: session } = useSession();
    const params = useParams();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!params?.userID) return;
        UsersService.getUserByQuery({ property: 'userID', value: params.userID })
            .then(userData => setUser(userData))
            .catch(() => setError('Failed to load user data.'))
            .finally(() => setLoading(false));
    }, [params?.userID]);

    const handleUpdate = (updatedUser) => setUser(updatedUser);

    if (loading) return <LoadingTerminal steps={['Loading volunteer data...']} />;

    if (error) return (
        <div style={{ padding: '40px 24px' }}>
            <div style={{ border: '1px solid var(--red)', color: 'var(--red)', padding: '12px 16px', fontSize: 11 }}>[ERROR] {error}</div>
        </div>
    );

    if (!user) return (
        <div style={{ padding: '40px 24px' }}>
            <div style={{ border: '1px solid var(--bd-1)', color: 'var(--text-dim)', padding: '12px 16px', fontSize: 11 }}>[WARN] User not found.</div>
        </div>
    );

    const hasAccess = session?.user?.role === 'admin' ||
        (user.membership && (
            user.membership.status === 'active' ||
            user.membership.status === 'probation' ||
            user.membership.type === 'community'
        ));

    if (!hasAccess) {
        return (
            <div style={{ padding: '80px 24px', maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 48, color: 'var(--text-dim)', marginBottom: 16 }}>⊠</div>
                <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 12 }}>ACCESS_DENIED</div>
                <h2 style={{ fontFamily: 'var(--display)', fontSize: '1.6rem', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 12 }}>
                    membership required
                </h2>
                <p style={{ color: 'var(--text-mid)', fontSize: 13, lineHeight: 1.7, marginBottom: 24 }}>
                    You need an active membership to access volunteer features.
                </p>
                <Link href={`/dashboard/${session?.user?.userID}/profile?tab=1`} className="btn btn--filled" style={{ fontSize: 11 }}>
                    $ ./view --membership-options
                </Link>
            </div>
        );
    }

    return (
        <div style={{ padding: '20px 24px' }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}>
                <span style={{ color: 'var(--green)' }}>$</span> ./volunteer --log
            </div>
            <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', letterSpacing: '-0.04em', color: 'var(--text-bright)', marginBottom: 8 }}>
                volunteer hours
            </h1>
            <p style={{ color: 'var(--text-mid)', fontSize: 13, marginBottom: 28 }}>
                Track your volunteer contributions to the lab.
            </p>

            <div className="card" style={{ padding: '24px 20px' }}>
                <VolunteerLog user={user} onUpdate={handleUpdate} />
            </div>
        </div>
    );
}
