"use client";
import React, { useState, useEffect } from 'react';
import { Box, Typography, CircularProgress, Alert, Container, Button } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
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
        const fetchUser = async () => {
            if (!userID) return;
            try {
                // Fetch by custom userID
                const fetchedUser = await UsersService.getUserByQuery({ property: 'userID', value: userID });
                
                if (fetchedUser) {
                    setUser(fetchedUser);
                } else {
                    setError("User not found.");
                }
            } catch (err) {
                console.error("Error fetching member profile:", err);
                setError("Could not load member profile.");
            } finally {
                setLoading(false);
            }
        };

        fetchUser();
    }, [userID]);

    if (loading) {
        return <LoadingTerminal />;
    }

    if (error || !user) {
        return (
            <Container maxWidth="md" sx={{ py: 8, textAlign: 'center' }}>
                <Alert severity="error" sx={{ mb: 2 }}>{error || "User not found"}</Alert>
                <Button startIcon={<ArrowBackIcon />} onClick={() => router.back()}>
                    Go Back
                </Button>
            </Container>
        );
    }

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
            <UserProfileView user={user} isPublicView={true} />
        </Box>
    );
}
