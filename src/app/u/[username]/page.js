"use client";
import React, { useState, useEffect } from 'react';
import { Box, Typography, Container, Button, Alert } from '@mui/material';
import UsersService from '@/services/users';
import UserProfileView from '@/app/components/profile/UserProfileView';
import LoadingTerminal from '@/app/components/LoadingTerminal';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function PublicProfilePage() {
    const params = useParams();
    const username = params?.username;
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchUser = async () => {
            if (!username) return;
            try {
                const fetchedUser = await UsersService.getUserByQuery({ property: 'username', value: username });
                
                if (fetchedUser) {
                    if (fetchedUser.isPublic) {
                        setUser(fetchedUser);
                    } else {
                        setError("This profile is private.");
                    }
                } else {
                    setError("User not found.");
                }
            } catch (err) {
                console.error("Error fetching public profile:", err);
                setError("Could not load profile.");
            } finally {
                setLoading(false);
            }
        };

        fetchUser();
    }, [username]);

    if (loading) {
        return (
            <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#000' }}>
                <LoadingTerminal />
            </Box>
        );
    }

    if (error) {
        return (
            <Container maxWidth="sm" sx={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                <Typography variant="h4" gutterBottom fontWeight="bold">
                    😕
                </Typography>
                <Typography variant="h5" gutterBottom>
                    {error}
                </Typography>
                <Button component={Link} href="/" variant="contained" sx={{ mt: 2 }}>
                    Go Home
                </Button>
            </Container>
        );
    }

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
            <UserProfileView user={user} isPublicView={true} />
            
            <Box sx={{ textAlign: 'center', py: 4, opacity: 0.5 }}>
                <Typography variant="body2">
                    Powered by <Link href="/" style={{ color: 'inherit', textDecoration: 'underline' }}>The Lab</Link>
                </Typography>
            </Box>
        </Box>
    );
}
