"use client";
import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, CircularProgress, Alert, Button } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import Link from 'next/link';
import VolunteerLog from '@/app/components/profile/tabs/VolunteerLog';
import UsersService from '@/services/users';
import LoadingTerminal from '@/app/components/LoadingTerminal';
import { useSession } from 'next-auth/react';
import { useParams } from 'next/navigation';

export default function VolunteerPage() {
    const { data: session } = useSession();
    const params = useParams();
    const resolvedParams = params; // Keep variable name to minimize changes
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const userData = await UsersService.getUserByQuery({ 
                    property: 'userID', 
                    value: resolvedParams.userID 
                });
                setUser(userData);
            } catch (err) {
                setError('Failed to load user data');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        if (resolvedParams?.userID) {
            fetchUser();
        }
    }, [resolvedParams]);

    const handleUpdate = (updatedUser) => {
        setUser(updatedUser);
    };

    if (loading) return <LoadingTerminal steps={['Loading volunteer data...']} />;
    if (error) return <Alert severity="error">{error}</Alert>;
    if (!user) return <Alert severity="warning">User not found</Alert>;

    // Check Access
    const hasAccess = session?.user?.role === 'admin' || 
                      (user.membership && (
                          user.membership.status === 'active' || 
                          user.membership.status === 'probation' ||
                          user.membership.type === 'community'
                      ));

    if (!hasAccess) {
        return (
            <Box sx={{ p: 4, textAlign: 'center', mt: 4 }}>
                <LockIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h4" gutterBottom>Membership Required</Typography>
                <Typography variant="body1" color="text.secondary" paragraph>
                    You need an active membership to access volunteer features.
                </Typography>
                <Button variant="contained" component={Link} href={`/dashboard/${session?.user?.userID}/membership`}>
                    View Membership Options
                </Button>
            </Box>
        );
    }

    return (
        <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, margin: '0 auto' }}>
            <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', md: '2.125rem' } }} gutterBottom>Volunteer Dashboard</Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
                Track your volunteer hours and contributions to the FabLab.
            </Typography>
            
            <Paper sx={{ p: { xs: 2, md: 3 } }}>
                <VolunteerLog user={user} onUpdate={handleUpdate} />
            </Paper>
        </Box>
    );
}
