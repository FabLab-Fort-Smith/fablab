"use client";
import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useParams } from 'next/navigation';
import UserProfileView from '@/app/components/profile/UserProfileView';
import LoadingTerminal from '@/app/components/LoadingTerminal';

export default function PublicProfilePage() {
    const { slug } = useParams();
    const { data: session } = useSession();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchUser = async () => {
            try {
                let res = await fetch(`/api/v1/users?username=${slug}`);
                if (!res.ok && res.status === 404) {
                    res = await fetch(`/api/v1/users?userID=${slug}`);
                }

                if (res.ok) {
                    const data = await res.json();
                    const userProfile = data.user;
                    if (!userProfile) { setError("User not found."); return; }

                    const isSelf = session?.user?.userID === userProfile.userID;
                    const isAdmin = session?.user?.role === 'admin';
                    const isActiveMember = ['active', 'probation'].includes(userProfile.membership?.status) || userProfile.membership?.isWaived === true || userProfile.membership?.subscriptionStatus === 'ACTIVE';

                    if ((userProfile.isPublic !== false && isActiveMember) || isSelf || isAdmin) {
                        setUser(userProfile);
                    } else {
                        setError("This profile is private or unavailable.");
                    }
                } else {
                    setError("User not found.");
                }
            } catch (err) {
                console.error(err);
                setError("Failed to load profile.");
            } finally {
                setLoading(false);
            }
        };

        if (slug) fetchUser();
    }, [slug, session]);

    if (loading) return <LoadingTerminal />;
    if (error) return (
        <div style={{ padding: '40px 24px', maxWidth: 600, margin: '0 auto' }}>
            <div style={{ border: '1px solid var(--red)', color: 'var(--red)', padding: '12px 16px', fontSize: 13, fontFamily: 'var(--mono)' }}>✕ {error}</div>
        </div>
    );
    if (!user) return null;

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
            <UserProfileView user={user} isPublicView={true} />
        </div>
    );
}
