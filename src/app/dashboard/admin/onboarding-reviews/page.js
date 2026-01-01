"use client";
import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Chip, IconButton, Tooltip, CircularProgress,
    Container, Card, CardContent, Stack, Avatar, useTheme, useMediaQuery,
    TextField, InputAdornment, Tabs, Tab
} from '@mui/material';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import SearchIcon from '@mui/icons-material/Search';
import EmailIcon from '@mui/icons-material/Email';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import ReviewDialog from '../../../components/admin/ReviewDialog';
import NudgeConfirmDialog from '../../../components/admin/NudgeConfirmDialog';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function OnboardingReviewsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [tabValue, setTabValue] = useState(0);

    // Nudge State
    const [nudgeDialogOpen, setNudgeDialogOpen] = useState(false);
    const [nudgeDetails, setNudgeDetails] = useState(null);
    const [nudgeLoading, setNudgeLoading] = useState(false);
    const [nudgeTargetUser, setNudgeTargetUser] = useState(null);

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/auth/signin');
        } else if (status === 'authenticated') {
            if (session.user.role !== 'admin') {
                router.push('/dashboard');
            } else {
                fetchApplicants();
            }
        }
    }, [status, session, router]);

    const fetchApplicants = async () => {
        try {
            const response = await fetch('/api/v1/users');
            if (response.ok) {
                const data = await response.json();
                // Filter for users who have applied (have applicationDate)
                const applicants = (data.users || []).filter(u => u.membership?.applicationDate);
                setUsers(applicants);
            }
        } catch (error) {
            console.error("Failed to fetch applicants", error);
        } finally {
            setLoading(false);
        }
    };

    const handleReviewClick = (user) => {
        setSelectedUser(user);
        setDialogOpen(true);
    };

    const handleNudge = async (e, user) => {
        e.stopPropagation();
        try {
            setNudgeLoading(true);
            setNudgeTargetUser(user);
            
            // 1. Preview the nudge first
            const previewResponse = await fetch('/api/v1/users/nudge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userID: user.userID, preview: true })
            });

            const previewData = await previewResponse.json();

            if (!previewResponse.ok) {
                alert(`Failed to preview nudge: ${previewData.error}`);
                return;
            }

            setNudgeDetails(previewData.details);
            setNudgeDialogOpen(true);
        } catch (error) {
            console.error("Error preparing nudge:", error);
            alert("Error preparing nudge.");
        } finally {
            setNudgeLoading(false);
        }
    };

    const handleConfirmNudge = async () => {
        if (!nudgeTargetUser) return;
        
        try {
            setNudgeLoading(true);
            const response = await fetch('/api/v1/users/nudge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userID: nudgeTargetUser.userID, preview: false })
            });
            
            if (response.ok) {
                alert(`Nudge sent to ${nudgeTargetUser.firstName}!`);
                setNudgeDialogOpen(false);
                setNudgeTargetUser(null);
            } else {
                const data = await response.json();
                alert(`Failed to send nudge: ${data.error}`);
            }
        } catch (error) {
            console.error("Error sending nudge:", error);
            alert("Error sending nudge.");
        } finally {
            setNudgeLoading(false);
        }
    };

    const handleToggleReviewStatus = async (user) => {
        const newStatus = user.membership?.reviewStatus === 'reviewed' ? 'pending' : 'reviewed';
        
        // If marking as reviewed, also mark as contacted if not already
        const updateData = {
            membership: {
                reviewStatus: newStatus
            }
        };

        if (newStatus === 'reviewed' && !user.membership?.contacted) {
            updateData.membership.contacted = true;
        }
        
        try {
            const response = await fetch(`/api/v1/users?userID=${user.userID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData)
            });

            if (response.ok) {
                const updatedUser = await response.json();
                // Update local state
                setUsers(prev => prev.map(u => u.userID === user.userID ? {
                    ...u,
                    membership: {
                        ...u.membership,
                        reviewStatus: newStatus,
                        contacted: (newStatus === 'reviewed' && !user.membership?.contacted) ? true : u.membership.contacted
                    }
                } : u));
                setDialogOpen(false);
            }
        } catch (error) {
            console.error("Failed to update review status", error);
        }
    };

    const handleTabChange = (event, newValue) => {
        setTabValue(newValue);
    };

    const getFilteredUsers = () => {
        let filtered = users;
        
        // Filter by Tab
        if (tabValue === 0) {
            filtered = filtered.filter(u => u.membership?.reviewStatus !== 'reviewed');
        } else {
            filtered = filtered.filter(u => u.membership?.reviewStatus === 'reviewed');
        }

        // Filter by Search
        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            filtered = filtered.filter(user => 
                user.firstName?.toLowerCase().includes(lowerTerm) ||
                user.lastName?.toLowerCase().includes(lowerTerm) ||
                user.email?.toLowerCase().includes(lowerTerm)
            );
        }
        
        return filtered;
    };

    const displayUsers = getFilteredUsers();

    const columns = [
        { field: 'firstName', headerName: 'First Name', flex: 1 },
        { field: 'lastName', headerName: 'Last Name', flex: 1 },
        { field: 'email', headerName: 'Email', flex: 1.5 },
        { 
            field: 'applicationDate', 
            headerName: 'Applied On', 
            flex: 1,
            valueGetter: (value, row) => {
                const date = row.membership?.applicationDate;
                return date ? new Date(date).toLocaleDateString() : 'N/A';
            }
        },
        {
            field: 'status',
            headerName: 'Status',
            flex: 1,
            renderCell: (params) => {
                const isReviewed = params.row.membership?.reviewStatus === 'reviewed';
                return (
                    <Chip 
                        icon={isReviewed ? <CheckCircleIcon /> : <PendingIcon />}
                        label={isReviewed ? "Reviewed" : "Needs Review"}
                        color={isReviewed ? "success" : "warning"}
                        variant="outlined"
                    />
                );
            }
        },
        {
            field: 'actions',
            headerName: 'Actions',
            flex: 0.7,
            sortable: false,
            renderCell: (params) => (
                <Box>
                    <Tooltip title="Review Application">
                        <IconButton onClick={() => handleReviewClick(params.row)}>
                            <VisibilityIcon />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Send Reminder (Nudge)">
                        <IconButton onClick={(e) => handleNudge(e, params.row)} color="warning">
                            <NotificationsActiveIcon />
                        </IconButton>
                    </Tooltip>
                </Box>
            )
        }
    ];

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>;

    return (
        <Container maxWidth="xl" sx={{ py: { xs: 2, md: 4 }, px: { xs: 2, md: 3 } }}>
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.75rem', md: '2.125rem' } }}>
                    Onboarding Reviews
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Review and approve new member applications
                </Typography>
            </Box>

            <Paper sx={{ mb: 3 }}>
                <Tabs 
                    value={tabValue} 
                    onChange={handleTabChange} 
                    indicatorColor="primary" 
                    textColor="primary"
                    variant="fullWidth"
                >
                    <Tab label="Needs Review" />
                    <Tab label="Reviewed" />
                </Tabs>
            </Paper>

            {isMobile ? (
                <Box>
                    <TextField
                        fullWidth
                        placeholder="Search applicants..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        sx={{ mb: 3, bgcolor: 'background.paper' }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon color="action" />
                                </InputAdornment>
                            ),
                        }}
                    />
                    <Stack spacing={2}>
                        {displayUsers.map((user) => {
                            const isReviewed = user.membership?.reviewStatus === 'reviewed';
                            const date = user.membership?.applicationDate ? new Date(user.membership.applicationDate).toLocaleDateString() : 'N/A';
                            
                            return (
                                <Card key={user.userID} elevation={2}>
                                    <CardContent>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                                            <Box sx={{ display: 'flex', gap: 2 }}>
                                                <Avatar sx={{ bgcolor: theme.palette.primary.main }}>
                                                    {user.firstName?.[0]}{user.lastName?.[0]}
                                                </Avatar>
                                                <Box>
                                                    <Typography variant="subtitle1" fontWeight="bold">
                                                        {user.firstName} {user.lastName}
                                                    </Typography>
                                                    <Chip 
                                                        icon={isReviewed ? <CheckCircleIcon /> : <PendingIcon />}
                                                        label={isReviewed ? "Reviewed" : "Needs Review"}
                                                        color={isReviewed ? "success" : "warning"}
                                                        variant="outlined"
                                                        size="small"
                                                        sx={{ mt: 0.5, height: 24 }}
                                                    />
                                                </Box>
                                            </Box>
                                            <Box>
                                                <IconButton onClick={() => handleReviewClick(user)} color="primary">
                                                    <VisibilityIcon />
                                                </IconButton>
                                                <IconButton onClick={(e) => handleNudge(e, user)} color="warning">
                                                    <NotificationsActiveIcon />
                                                </IconButton>
                                            </Box>
                                        </Box>

                                        <Stack spacing={1}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                                                <EmailIcon fontSize="small" />
                                                <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                                                    {user.email}
                                                </Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                                                <CalendarTodayIcon fontSize="small" />
                                                <Typography variant="body2">
                                                    Applied: {date}
                                                </Typography>
                                            </Box>
                                        </Stack>
                                    </CardContent>
                                </Card>
                            );
                        })}
                        {displayUsers.length === 0 && (
                            <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
                                No applicants found matching your search.
                            </Typography>
                        )}
                    </Stack>
                </Box>
            ) : (
                <Paper sx={{ height: 600, width: '100%' }}>
                    <DataGrid
                        rows={displayUsers}
                        columns={columns}
                        getRowId={(row) => row.userID}
                        slots={{ toolbar: GridToolbar }}
                        slotProps={{
                            toolbar: {
                                showQuickFilter: true,
                            },
                        }}
                        disableRowSelectionOnClick
                    />
                </Paper>
            )}
            
            <ReviewDialog 
                open={dialogOpen} 
                onClose={() => setDialogOpen(false)} 
                user={selectedUser}
                onReview={handleToggleReviewStatus}
            />

            <NudgeConfirmDialog 
                open={nudgeDialogOpen}
                onClose={() => setNudgeDialogOpen(false)}
                onConfirm={handleConfirmNudge}
                nudgeDetails={nudgeDetails}
                loading={nudgeLoading}
            />
        </Container>
    );
}
