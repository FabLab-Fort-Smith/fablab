"use client";
import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Grid, Card, CardContent, Avatar, Chip, 
    TextField, InputAdornment, Container, CircularProgress, 
    FormControl, InputLabel, Select, MenuItem, OutlinedInput,
    useTheme, Button, Alert, Paper,
    Dialog, DialogTitle, DialogContent, DialogActions, Radio, RadioGroup, FormControlLabel, Pagination
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import LockIcon from '@mui/icons-material/Lock';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

export default function MembersDirectory() {
    const theme = useTheme();
    const router = useRouter();
    const { data: session, status } = useSession();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedInterests, setSelectedInterests] = useState([]);
    const [hasAccess, setHasAccess] = useState(false);
    
    // Sponsorship Dialog State
    const [sponsorDialogOpen, setSponsorDialogOpen] = useState(false);
    const [selectedRecipient, setSelectedRecipient] = useState(null);
    const [sponsorshipType, setSponsorshipType] = useState('one-time');
    
    // Derived lists for filters
    const [allInterests, setAllInterests] = useState([]);

    useEffect(() => {
        const checkAccessAndFetch = async () => {
            if (status === 'loading') return;
            
            if (status === 'unauthenticated') {
                router.push('/auth/signin');
                return;
            }

            try {
                // Check membership status
                const userRes = await fetch(`/api/v1/users?userID=${session.user.userID}`);
                if (userRes.ok) {
                    const userData = await userRes.json();
                    const memberStatus = userData.user?.membership?.status;
                    const isWaived = userData.user?.membership?.isWaived;
                    const subscriptionStatus = userData.user?.membership?.subscriptionStatus;
                    
                    if (memberStatus === 'active' || memberStatus === 'probation' || isWaived || subscriptionStatus === 'ACTIVE' || session.user.role === 'admin') {
                        setHasAccess(true);
                        await fetchMembers(1);
                    } else {
                        setHasAccess(false);
                        setLoading(false);
                    }
                }
            } catch (error) {
                console.error("Error checking access:", error);
                setLoading(false);
            }
        };

        checkAccessAndFetch();
    }, [status, session, router]);

    const fetchMembers = async (pageNum = 1) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/users?isPublic=true&page=${pageNum}&limit=12`);
            if (res.ok) {
                const data = await res.json();
                setUsers(data.users || []);
                setTotalPages(data.totalPages || 1);
                setPage(data.page || 1);
                
                // Extract unique interests
                const interests = new Set();
                
                (data.users || []).forEach(user => {
                    (user.interests || []).forEach(interest => interests.add(interest));
                });
                
                setAllInterests(Array.from(interests).sort());
            }
        } catch (error) {
            console.error("Failed to fetch members", error);
        } finally {
            setLoading(false);
        }
    };

    const handlePageChange = (event, value) => {
        setPage(value);
        fetchMembers(value);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSponsorClick = (user) => {
        setSelectedRecipient(user);
        setSponsorshipType('one-time'); // Default
        setSponsorDialogOpen(true);
    };

    const handleConfirmSponsorship = async () => {
        if (!selectedRecipient) return;
        
        try {
            const res = await fetch('/api/v1/sponsorship/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    recipientId: selectedRecipient.userID,
                    donorId: session?.user?.userID,
                    type: sponsorshipType
                })
            });
            
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                alert("Failed to create sponsorship link.");
            }
        } catch (error) {
            console.error("Sponsorship Error:", error);
            alert("An error occurred.");
        }
    };

    const filteredUsers = users.filter(user => {
        const matchesSearch = (
            (user.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (user.firstName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (user.lastName || '').toLowerCase().includes(searchTerm.toLowerCase())
        );

        const matchesInterests = selectedInterests.length === 0 || 
            selectedInterests.every(interest => (user.interests || []).includes(interest));

        return matchesSearch && matchesInterests;
    });

    const handleCardClick = (userID) => {
        if (userID) {
            router.push(`/dashboard/member/${userID}`);
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: { xs: 4, md: 8 } }}>
                <CircularProgress />
            </Box>
        );
    }

    if (!hasAccess) {
        return (
            <Container maxWidth="md" sx={{ mt: { xs: 4, md: 8 }, textAlign: 'center' }}>
                <Box sx={{ p: { xs: 2, md: 4 }, border: '1px solid #333', borderRadius: 2, bgcolor: 'background.paper' }}>
                    <LockIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
                    <Typography variant="h4" gutterBottom>
                        Membership Required
                    </Typography>
                    <Typography variant="body1" color="text.secondary" paragraph>
                        The Member Directory is exclusive to active members. 
                        Please upgrade your membership to connect with the community.
                    </Typography>
                    <Button 
                        variant="contained" 
                        color="primary" 
                        component={Link} 
                        href={`/dashboard/${session?.user?.userID}/membership`}
                        sx={{ mt: 2 }}
                    >
                        View Membership Options
                    </Button>
                </Box>
            </Container>
        );
    }

    return (
        <Container maxWidth="xl" sx={{ py: { xs: 2, md: 4 }, px: { xs: 2, md: 3 } }}>
            <Box sx={{ mb: { xs: 3, md: 6 }, textAlign: 'center' }}>
                <Typography variant="h3" component="h1" gutterBottom fontWeight="bold" color="primary" sx={{ fontSize: { xs: '2rem', md: '3rem' } }}>
                    Member Directory
                </Typography>
                <Typography variant="h6" color="text.secondary" sx={{ fontSize: { xs: '1rem', md: '1.25rem' } }}>
                    Connect with other makers, creators, and innovators in our community.
                </Typography>
            </Box>

            {/* Filters & Search */}
            <Paper sx={{ p: { xs: 2, md: 3 }, mb: 4, borderRadius: 2 }} elevation={2}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={4}>
                        <TextField
                            fullWidth
                            placeholder="Search members..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon color="action" />
                                    </InputAdornment>
                                ),
                            }}
                        />
                    </Grid>
                    <Grid item xs={12} md={8}>
                        <FormControl fullWidth>
                            <InputLabel>Filter by Interests & Skills</InputLabel>
                            <Select
                                multiple
                                value={selectedInterests}
                                onChange={(e) => setSelectedInterests(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
                                input={<OutlinedInput label="Filter by Interests & Skills" />}
                                renderValue={(selected) => (
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                        {selected.map((value) => (
                                            <Chip key={value} label={value} size="small" />
                                        ))}
                                    </Box>
                                )}
                            >
                                {allInterests.map((interest) => (
                                    <MenuItem key={interest} value={interest}>
                                        {interest}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                </Grid>
            </Paper>

            {/* Results Grid */}
            <Grid container spacing={{ xs: 2, md: 3 }}>
                {filteredUsers.length > 0 ? (
                    filteredUsers.map((user) => (
                        <Grid item xs={12} sm={6} md={4} lg={3} key={user.userID}>
                            <Card 
                                sx={{ 
                                    height: '100%', 
                                    display: 'flex', 
                                    flexDirection: 'column',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease-in-out',
                                    border: `1px solid ${theme.palette.divider}`,
                                    backgroundColor: 'rgba(0, 255, 0, 0.02)',
                                    '&:hover': {
                                        transform: 'translateY(-4px)',
                                        boxShadow: `0 4px 20px rgba(0, 255, 0, 0.25)`,
                                        borderColor: theme.palette.primary.main
                                    }
                                }}
                                onClick={() => handleCardClick(user.userID)}
                            >
                                <Box sx={{ 
                                    height: 60, 
                                    background: `linear-gradient(180deg, ${theme.palette.action.hover} 0%, transparent 100%)`,
                                    mb: -5
                                }} />
                                <CardContent sx={{ flexGrow: 1, textAlign: 'center', pt: 0 }}>
                                    <Avatar
                                        src={user.image || "/default-avatar.png"}
                                        sx={{ 
                                            width: 100, 
                                            height: 100, 
                                            mx: 'auto', 
                                            mb: 2, 
                                            border: `2px solid ${theme.palette.primary.main}`,
                                            bgcolor: theme.palette.background.paper
                                        }}
                                    />
                                    <Typography variant="h6" component="div" sx={{ fontWeight: 'bold', color: theme.palette.primary.main }}>
                                        {user.username || `${user.firstName} ${user.lastName}`}
                                    </Typography>
                                    
                                    {user.role === 'admin' && (
                                        <Chip 
                                            label={user.boardPosition || "Admin"} 
                                            color="secondary" 
                                            size="small" 
                                            sx={{ mt: 1, mb: 2, fontWeight: 'bold' }} 
                                        />
                                    )}
                                    
                                    <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 0.5 }}>
                                        {(user.interests || []).slice(0, 3).map((interest) => (
                                            <Chip 
                                                key={interest} 
                                                label={interest} 
                                                size="small" 
                                                variant="outlined" 
                                                color="primary"
                                            />
                                        ))}
                                        {(user.interests || []).length > 3 && (
                                            <Chip label={`+${user.interests.length - 3}`} size="small" variant="outlined" color="primary" />
                                        )}
                                    </Box>

                                    <Typography variant="body2" color="text.secondary" sx={{ 
                                        display: '-webkit-box',
                                        WebkitLineClamp: 3,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                        mb: 2,
                                        minHeight: '3em' // Ensure consistent height for bio area
                                    }}>
                                        {user.bio || "No bio provided."}
                                    </Typography>
                                </CardContent>
                                <Box sx={{ p: 2, pt: 0 }}>
                                    <Button 
                                        fullWidth 
                                        variant="outlined" 
                                        color="primary" 
                                        size="small"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleSponsorClick(user);
                                        }}
                                        sx={{
                                            borderRadius: 2,
                                            '&:hover': {
                                                bgcolor: 'rgba(0, 255, 0, 0.1)'
                                            }
                                        }}
                                    >
                                        Sponsor Member
                                    </Button>
                                </Box>
                            </Card>
                        </Grid>
                    ))
                ) : (
                    <Grid item xs={12}>
                        <Box sx={{ textAlign: 'center', py: { xs: 4, md: 8 } }}>
                            <Typography variant="h6" color="text.secondary">
                                No members found matching your criteria.
                            </Typography>
                            <Button 
                                variant="text" 
                                onClick={() => {
                                    setSearchTerm('');
                                    setSelectedSkills([]);
                                    setSelectedInterests([]);
                                }}
                                sx={{ mt: 2 }}
                            >
                                Clear Filters
                            </Button>
                        </Box>
                    </Grid>
                )}
            </Grid>

            {/* Pagination */}
            {!loading && totalPages > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, mb: 2 }}>
                    <Pagination 
                        count={totalPages} 
                        page={page} 
                        onChange={handlePageChange} 
                        color="primary" 
                        size="large"
                        showFirstButton 
                        showLastButton
                    />
                </Box>
            )}

            {/* Sponsorship Dialog */}
            <Dialog open={sponsorDialogOpen} onClose={() => setSponsorDialogOpen(false)}>
                <DialogTitle>Sponsor {selectedRecipient?.firstName} {selectedRecipient?.lastName}</DialogTitle>
                <DialogContent>
                    <Typography variant="body1" gutterBottom>
                        Choose how you would like to sponsor this member.
                    </Typography>
                    <RadioGroup
                        value={sponsorshipType}
                        onChange={(e) => setSponsorshipType(e.target.value)}
                    >
                        <FormControlLabel 
                            value="one-time" 
                            control={<Radio />} 
                            label="One-Time Gift ($45 for 30 Days)" 
                        />
                        <FormControlLabel 
                            value="subscription" 
                            control={<Radio />} 
                            label="Monthly Sponsorship ($45/month, Recurring)" 
                        />
                    </RadioGroup>
                    <Alert severity="info" sx={{ mt: 2 }}>
                        {sponsorshipType === 'one-time' 
                            ? "This will grant the member 30 days of access (Basic Membership). It is a single payment."
                            : "You will be billed $45 monthly. The member will have access as long as your subscription is active."
                        }
                    </Alert>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setSponsorDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleConfirmSponsorship} variant="contained" color="primary">
                        Proceed to Checkout
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}
