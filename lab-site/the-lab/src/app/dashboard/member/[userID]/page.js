"use client";
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import UsersService from '@/services/users';
import UserProfileView from '@/app/components/profile/UserProfileView';
import LoadingTerminal from '@/app/components/LoadingTerminal';

export default function MemberProfilePage() {
    const params = useParams();
    const userID = params?.userID;
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const router = useRouter();

    useEffect(() => {
        if (!userID) return;
        UsersService.getUserByQuery({ property: 'userID', value: userID })
            .then(u => { if (u) setUser(u); else setError('User not found.'); })
            .catch(() => setError('Could not load member profile.'))
            .finally(() => setLoading(false));
    }, [userID]);

    if (loading) return <LoadingTerminal />;

    if (error || !user) return (
        <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ border: '1px solid var(--red)', color: 'var(--red)', padding: '14px 18px', marginBottom: 20, fontFamily: 'var(--mono)', fontSize: 12, display: 'inline-block' }}>
                ✕ {error || 'User not found'}
            </div>
            <br />
            <button className="btn btn--ghost btn--sm" style={{ fontSize: 10 }} onClick={() => router.back()}>← go back</button>
        </div>
    );

    return <UserProfileView user={user} isPublicView={true} />;
}
