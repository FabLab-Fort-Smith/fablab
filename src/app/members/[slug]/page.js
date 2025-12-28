"use client";
import React, { useState, useEffect } from 'react';
import { Box, Container, CircularProgress, Alert } from '@mui/material';
import { useSession } from 'next-auth/react';
import { useParams } from 'next/navigation';
import UserProfileView from '@/app/components/profile/UserProfileView';

export default function PublicProfilePage() {
    const { slug } = useParams();
    const { data: session } = useSession();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchUser = async () => {
            try {
                // Try fetching by username first
                let res = await fetch(`/api/v1/users?username=${slug}`);
                
                // If not found, try fetching by userID (backward compatibility)
                if (!res.ok && res.status === 404) {
                    res = await fetch(`/api/v1/users?userID=${slug}`);
                }

                if (res.ok) {
                    const data = await res.json();
                    const userProfile = data.user;
                    
                    if (!userProfile) {
                        setError("User not found.");
                        return;
                    }

                    // Check if profile is public or if viewer is admin/self
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

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>;
    if (error) return <Container maxWidth="md" sx={{ mt: 4 }}><Alert severity="error">{error}</Alert></Container>;
    if (!user) return null;

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
            <UserProfileView user={user} isPublicView={true} />
        </Box>
    );
}
