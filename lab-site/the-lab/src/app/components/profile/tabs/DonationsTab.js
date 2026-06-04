"use client";

import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Button, Paper, Table, TableBody, TableCell, 
    TableContainer, TableHead, TableRow, Chip, CircularProgress, 
    Alert, useTheme
} from '@mui/material';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import PaidIcon from '@mui/icons-material/Paid';
import { useRouter } from 'next/navigation';

const DonationsTab = ({ user }) => {
    const [donations, setDonations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const router = useRouter();
    const theme = useTheme();

    useEffect(() => {
        const fetchDonations = async () => {
            if (!user?.userID) return;
            
            try {
                // If the logged-in user is viewing their own profile, no userID param needed 
                // (API uses session.user.userID if not admin)
                // However, if an admin views another user's profile, they might need to pass userID.
                // Assuming this tab is mainly for the user themselves for now.
                const query = user?.userID ? `?userID=${user.userID}` : '';
                const response = await fetch(`/api/v1/donations${query}`);
                
                if (!response.ok) {
                    if (response.status === 401 || response.status === 403) {
                       // Silent fail or specialized message? 
                       // Users can only see their own donations anyway unless api changes.
                    }
                    throw new Error("Failed to fetch donations");
                }
                
                const data = await response.json();
                setDonations(Array.isArray(data) ? data : []);
            } catch (err) {
                console.error("Error fetching donations:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchDonations();
    }, [user?.userID]);

    const handleDonateClick = () => {
        router.push('/donate');
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ maxWidth: 900, mx: 'auto', p: { xs: 2, md: 0 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <VolunteerActivismIcon color="primary" /> My Contributions
                </Typography>
                <Button 
                    variant="contained" 
                    color="primary" 
                    startIcon={<PaidIcon />}
                    onClick={handleDonateClick}
                >
                    Donate
                </Button>
            </Box>

            {donations.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.05)' }}>
                    <VolunteerActivismIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2, opacity: 0.5 }} />
                    <Typography variant="h6" gutterBottom>No contributions yet</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Your support helps us keep the lab open and free for everyone.
                    </Typography>
                    <Button variant="outlined" onClick={handleDonateClick}>
                        Make a Contribution
                    </Button>
                </Paper>
            ) : (
                <TableContainer component={Paper} sx={{ bgcolor: 'background.paper', mb: 3 }}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Date</TableCell>
                                <TableCell>Type</TableCell>
                                <TableCell>Amount</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Reference</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {donations.map((donation) => (
                                <TableRow key={donation._id || donation.id}>
                                    <TableCell>
                                        {new Date(donation.createdAt).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell>
                                        <Chip 
                                            label={donation.isRecurring ? 'Recurring' : 'One-time'} 
                                            size="small" 
                                            color="info" 
                                            variant="outlined" 
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2" fontWeight="bold">
                                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(donation.amount / 100)}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip 
                                            label={donation.status || 'Completed'} 
                                            color={donation.status === 'failed' ? 'error' : 'success'} 
                                            size="small" 
                                        />
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                                        {donation.orderId || '-'}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            <Alert severity="info" sx={{ mt: 3 }}>
                Thank you so much for your support! Your contributions directly fund our materials, tools, and community programs.
            </Alert>
        </Box>
    );
};

export default DonationsTab;
