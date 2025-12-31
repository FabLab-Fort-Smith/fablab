"use client";
import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Button, Grid, Card, CardContent, CardActions, 
    Chip, Dialog, DialogTitle, DialogContent, DialogActions, 
    TextField, MenuItem, Select, InputLabel, FormControl, 
    Tabs, Tab, Alert, LinearProgress, IconButton, Tooltip, Fab, Zoom, useTheme,
    Checkbox, FormControlLabel, List, ListItem, ListItemText, ListItemSecondaryAction, Pagination
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import StarIcon from '@mui/icons-material/Star';
import LoopIcon from '@mui/icons-material/Loop';
import LockIcon from '@mui/icons-material/Lock';
import EditIcon from '@mui/icons-material/Edit';
import UndoIcon from '@mui/icons-material/Undo';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PersonIcon from '@mui/icons-material/Person';
import DeleteIcon from '@mui/icons-material/Delete';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';

export default function BountiesPage() {
    const { data: session } = useSession();
    const theme = useTheme();
    const router = useRouter();
    const searchParams = useSearchParams();
    const highlightId = searchParams.get('highlight');
    const action = searchParams.get('action');
    
    const [bounties, setBounties] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [userMembership, setUserMembership] = useState(null);
    const [tabValue, setTabValue] = useState(0); // 0: All, 1: Hours, 2: Community, 3: Completed
    const [openCreate, setOpenCreate] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [editingBountyId, setEditingBountyId] = useState(null);
    const [openSubmit, setOpenSubmit] = useState(false);
    const [submissionNote, setSubmissionNote] = useState('');
    const [submittingBountyId, setSubmittingBountyId] = useState(null);
    const [openClaims, setOpenClaims] = useState(false);
    const [selectedBountyForClaims, setSelectedBountyForClaims] = useState(null);
    const [newBounty, setNewBounty] = useState({
        title: '',
        description: '',
        rewardType: 'custom', // default for users
        rewardValue: '',
        stakeValue: 0, // Default additional stake is 0
        recurrence: 'none',
        isInfinite: false,
        endsAt: '',
        imageUrl: ''
    });
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (action === 'new') {
            setEditMode(false);
            setNewBounty({
                title: '',
                description: '',
                rewardType: 'custom',
                rewardValue: '',
                stakeValue: 0,
                recurrence: 'none',
                isInfinite: false,
                endsAt: '',
                imageUrl: ''
            });
            setOpenCreate(true);
        }
    }, [action]);

    useEffect(() => {
        if (highlightId && bounties.length > 0) {
            const element = document.getElementById(`bounty-${highlightId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [highlightId, bounties]);

    useEffect(() => {
        const init = async () => {
            if (session?.user?.userID) {
                // Fetch user to check membership
                try {
                    const userRes = await fetch(`/api/v1/users?userID=${session.user.userID}`);
                    if (userRes.ok) {
                        const userData = await userRes.json();
                        setUserMembership(userData.user?.membership);
                    }
                } catch (e) {
                    console.error("Failed to fetch user membership", e);
                }
            }
            fetchBounties(1);
        };
        init();
    }, [session]);

    const fetchBounties = async (pageNum = 1) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/bounties?page=${pageNum}&limit=9`);
            if (res.ok) {
                const data = await res.json();
                setBounties(data.bounties || []);
                setTotalPages(data.totalPages || 1);
                setPage(data.page || 1);
            }
        } catch (error) {
            console.error("Failed to fetch bounties", error);
        } finally {
            setLoading(false);
        }
    };

    const handlePageChange = (event, value) => {
        setPage(value);
        fetchBounties(value);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Check if user has access (Admin OR Active/Probation Membership OR Community Member)
    const hasAccess = session?.user?.role === 'admin' || 
                      (userMembership && (
                          userMembership.status === 'active' || 
                          userMembership.status === 'probation' || 
                          userMembership.type === 'community'
                      ));

    if (loading) return <LinearProgress />;

    if (!hasAccess) {
        return (
            <Box sx={{ p: 4, textAlign: 'center', mt: 4 }}>
                <LockIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h4" gutterBottom>Membership Required</Typography>
                <Typography variant="body1" color="text.secondary" paragraph>
                    You need an active membership to access the Bounty Board and Volunteer features.
                </Typography>
                <Button variant="contained" component={Link} href={`/dashboard/${session?.user?.userID}/membership`}>
                    View Membership Options
                </Button>
            </Box>
        );
    }

    const handleOpenCreate = () => {
        setEditMode(false);
        setEditingBountyId(null);
        setNewBounty({ 
            title: '', 
            description: '', 
            rewardType: 'custom', 
            rewardValue: '', 
            stakeValue: 0, 
            recurrence: 'none',
            isInfinite: false,
            endsAt: '',
            imageUrl: ''
        });
        setOpenCreate(true);
    };

    const handleOpenEdit = (bounty) => {
        setEditMode(true);
        setEditingBountyId(bounty.bountyID);
        setNewBounty({
            title: bounty.title,
            description: bounty.description,
            rewardType: bounty.rewardType,
            rewardValue: bounty.rewardValue,
            stakeValue: bounty.stakeValue,
            recurrence: bounty.recurrence || 'none',
            isInfinite: bounty.isInfinite || false,
            endsAt: bounty.endsAt ? new Date(bounty.endsAt).toISOString().split('T')[0] : '',
            imageUrl: bounty.imageUrl || ''
        });
        setOpenCreate(true);
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            
            if (res.ok) {
                const data = await res.json();
                setNewBounty(prev => ({ ...prev, imageUrl: data.url }));
            } else {
                console.error("Upload failed");
                alert("Failed to upload image");
            }
        } catch (error) {
            console.error("Error uploading image:", error);
            alert("Error uploading image");
        } finally {
            setUploading(false);
        }
    };

    const handleSubmitBounty = async () => {
        try {
            let url = '/api/v1/bounties';
            let method = 'POST';
            let body = {
                ...newBounty,
                creatorID: session.user.userID
            };

            if (editMode) {
                url = `/api/v1/bounties?bountyID=${editingBountyId}&action=edit`;
                method = 'PUT';
                body = {
                    userID: session.user.userID,
                    updateData: newBounty
                };
            }

            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                setOpenCreate(false);
                fetchBounties();
                setNewBounty({ title: '', description: '', rewardType: 'custom', rewardValue: '', stakeValue: 0, recurrence: 'none' });
            }
        } catch (error) {
            console.error("Failed to save bounty", error);
        }
    };

    const handleClaim = async (bountyID) => {
        try {
            const res = await fetch(`/api/v1/bounties?bountyID=${bountyID}&action=assign`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userID: session.user.userID })
            });
            if (res.ok) fetchBounties();
        } catch (error) {
            console.error("Failed to claim bounty", error);
        }
    };

    const handleClawback = async (bountyID) => {
        if (!confirm("Are you sure you want to unassign this bounty? It will be set back to 'Open' status.")) return;
        try {
            const res = await fetch(`/api/v1/bounties?bountyID=${bountyID}&action=clawback`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userID: session.user.userID })
            });
            if (res.ok) fetchBounties();
        } catch (error) {
            console.error("Failed to clawback bounty", error);
        }
    };

    const handleOpenSubmit = (bountyID) => {
        setSubmittingBountyId(bountyID);
        setSubmissionNote('');
        setOpenSubmit(true);
    };

    const handleSubmitWork = async () => {
        try {
            const res = await fetch(`/api/v1/bounties?bountyID=${submittingBountyId}&action=submit`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    userID: session.user.userID,
                    submission: { note: submissionNote }
                })
            });
            if (res.ok) {
                setOpenSubmit(false);
                fetchBounties();
            }
        } catch (error) {
            console.error("Failed to submit work", error);
        }
    };

    const handleVerify = async (bountyID, claimUserID = null) => {
        try {
            const body = { verifierID: session.user.userID };
            if (claimUserID) body.claimUserID = claimUserID;

            const res = await fetch(`/api/v1/bounties?bountyID=${bountyID}&action=verify`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                fetchBounties();
                // If we are in the claims dialog, we might want to refresh that view or close it?
                // For now, let's just refresh the bounties which updates the selectedBountyForClaims if we keep it in sync
                if (selectedBountyForClaims && selectedBountyForClaims.bountyID === bountyID) {
                    // We need to re-fetch or update the selected bounty locally
                    // Ideally fetchBounties updates 'bounties' state, and we can derive selectedBounty from there
                    // But selectedBountyForClaims is a separate state object. 
                    // Let's just close the dialog for simplicity or re-fetch.
                    setOpenClaims(false); 
                }
            }
        } catch (error) {
            console.error("Failed to verify bounty", error);
        }
    };

    const handleClawbackClaim = async (bountyID, claimUserID) => {
        if (!confirm("Are you sure you want to remove this claim?")) return;
        try {
            const res = await fetch(`/api/v1/bounties?bountyID=${bountyID}&action=clawback`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    userID: session.user.userID,
                    claimUserID: claimUserID 
                })
            });
            if (res.ok) {
                fetchBounties();
                setOpenClaims(false);
            }
        } catch (error) {
            console.error("Failed to remove claim", error);
        }
    };

    const handleOpenClaims = (bounty) => {
        setSelectedBountyForClaims(bounty);
        setOpenClaims(true);
    };

    const getUserClaim = (bounty) => {
        if (!bounty.isInfinite || !bounty.claims) return null;
        return bounty.claims.find(c => c.userID === session?.user?.userID);
    };

    const filteredBounties = bounties.filter(b => {
        if (tabValue === 3) return b.status === 'completed' || b.status === 'verified';
        if (b.status === 'completed' || b.status === 'verified') return false; // Don't show completed in other tabs
        if (tabValue === 1) return b.rewardType === 'hours';
        if (tabValue === 2) return b.rewardType !== 'hours';
        return true;
    });

    return (
        <Box sx={{ p: { xs: 2, md: 3 }, pb: { xs: 10, md: 3 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', md: '2.125rem' } }}>Bounty Board</Typography>
                <Box>
                    <Button 
                        variant="outlined" 
                        component={Link}
                        href="/dashboard/bounties/feed"
                        sx={{ mr: 2, display: { xs: 'none', md: 'inline-flex' } }}
                    >
                        Feed View
                    </Button>
                    <Button 
                        variant="contained" 
                        startIcon={<AddIcon />} 
                        onClick={handleOpenCreate}
                        sx={{ display: { xs: 'none', md: 'inline-flex' } }}
                    >
                        Create Bounty
                    </Button>
                </Box>
            </Box>

            <Tabs 
                value={tabValue} 
                onChange={(e, v) => setTabValue(v)} 
                sx={{ mb: 3 }}
                variant="scrollable"
                scrollButtons="auto"
                allowScrollButtonsMobile
            >
                <Tab label="All Open" />
                <Tab label="Volunteer Opportunities" />
                <Tab label="Community Requests" />
                <Tab label="Completed" />
            </Tabs>

            {loading ? <LinearProgress /> : (
                <Grid container spacing={3}>
                    {filteredBounties.map(bounty => {
                        const isCreator = bounty.creatorID === session?.user?.userID;
                        const isAdmin = session?.user?.role === 'admin';
                        const canEdit = isCreator || isAdmin;
                        const canClawback = (isCreator || isAdmin) && bounty.status === 'assigned';
                        const isHighlighted = highlightId === bounty.bountyID;

                        return (
                            <Grid item xs={12} md={6} lg={4} key={bounty.bountyID} id={`bounty-${bounty.bountyID}`}>
                                <Card sx={{ 
                                    height: '100%', 
                                    display: 'flex', 
                                    flexDirection: 'column',
                                    border: isHighlighted ? `2px solid ${theme.palette.primary.main}` : (bounty.rewardType === 'hours' ? '1px solid #4caf50' : '1px solid #9c27b0'),
                                    boxShadow: isHighlighted ? `0 0 20px ${theme.palette.primary.main}` : 'none',
                                    opacity: bounty.status === 'completed' ? 0.8 : 1,
                                    transform: isHighlighted ? 'scale(1.02)' : 'scale(1)',
                                    transition: 'all 0.3s ease-in-out'
                                }}>
                                    {bounty.imageUrl && (
                                        <Box 
                                            component="img"
                                            src={bounty.imageUrl}
                                            alt={bounty.title}
                                            sx={{
                                                width: '100%',
                                                height: 140,
                                                objectFit: 'cover',
                                                borderBottom: '1px solid rgba(0,0,0,0.12)'
                                            }}
                                        />
                                    )}
                                    <CardContent sx={{ flexGrow: 1, p: { xs: 2, md: 2 } }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                                <Chip 
                                                    label={bounty.status === 'completed' ? 'PENDING VERIFICATION' : bounty.status.toUpperCase()} 
                                                    color={
                                                        bounty.status === 'open' ? 'success' : 
                                                        bounty.status === 'completed' ? 'info' : 
                                                        bounty.status === 'verified' ? 'success' : 
                                                        'default'
                                                    } 
                                                    size="small" 
                                                    sx={{ fontWeight: 'bold', fontSize: '0.75rem' }}
                                                />
                                                {bounty.recurrence && bounty.recurrence !== 'none' && (
                                                    <Chip 
                                                        icon={<LoopIcon sx={{ fontSize: '1rem !important' }} />} 
                                                        label={bounty.recurrence} 
                                                        size="small" 
                                                        color="info" 
                                                        variant="outlined"
                                                        sx={{ textTransform: 'capitalize' }}
                                                    />
                                                )}
                                            </Box>
                                            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                                                <Chip 
                                                    icon={<StarIcon sx={{ fontSize: '1rem !important' }} />} 
                                                    label={`${bounty.stakeValue} Stake`} 
                                                    color="warning" 
                                                    variant="outlined" 
                                                    size="small" 
                                                />
                                                {canEdit && (
                                                    <Tooltip title="Edit Bounty">
                                                        <IconButton size="small" onClick={() => handleOpenEdit(bounty)} sx={{ ml: 0.5 }}>
                                                            <EditIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                            </Box>
                                        </Box>
                                        <Link href={`/dashboard/bounties/${bounty.bountyID}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                                            <Typography variant="h6" gutterBottom sx={{ 
                                                fontWeight: 'bold',
                                                fontSize: { xs: '1.1rem', md: '1.25rem' },
                                                '&:hover': { textDecoration: 'underline', color: 'primary.main' },
                                                lineHeight: 1.3
                                            }}>
                                                {bounty.title}
                                            </Typography>
                                        </Link>
                                        <Typography variant="body2" color="text.secondary" paragraph sx={{
                                            display: '-webkit-box',
                                            WebkitLineClamp: 3,
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden',
                                            mb: 2,
                                            fontSize: '0.875rem'
                                        }}>
                                            {bounty.description}
                                        </Typography>
                                        
                                        <Box sx={{ mt: 'auto', display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                            {bounty.rewardType === 'hours' ? (
                                                <Chip icon={<AccessTimeIcon sx={{ fontSize: '1rem !important' }} />} label={`${bounty.rewardValue} Hours`} color="success" size="small" variant="filled" />
                                            ) : (
                                                <Chip icon={<MonetizationOnIcon sx={{ fontSize: '1rem !important' }} />} label={bounty.rewardValue} color="secondary" size="small" variant="filled" />
                                            )}
                                            
                                            {bounty.isInfinite && (
                                                <Chip 
                                                    label="Infinite" 
                                                    color="secondary" 
                                                    variant="outlined" 
                                                    size="small" 
                                                />
                                            )}

                                            {bounty.assignedTo && !bounty.isInfinite && (
                                                <Chip 
                                                    icon={<PersonIcon sx={{ fontSize: '1rem !important' }} />} 
                                                    label={`Claimed by: ${bounty.assignedToUsername || bounty.assignedTo}`} 
                                                    variant="outlined" 
                                                    size="small"
                                                    sx={{ maxWidth: '100%' }}
                                                />
                                            )}
                                        </Box>
                                    </CardContent>
                                    <CardActions sx={{ p: 2, pt: 0 }}>
                                        <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
                                            <Button 
                                                size="medium" 
                                                variant="outlined" 
                                                component={Link} 
                                                href={`/dashboard/bounties/${bounty.bountyID}`}
                                                fullWidth
                                                sx={{ borderRadius: 2 }}
                                            >
                                                View Details
                                            </Button>
                                            {bounty.isInfinite ? (
                                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                    {canEdit && (
                                                        <Button 
                                                            size="medium" 
                                                            variant="outlined" 
                                                            fullWidth 
                                                            onClick={() => handleOpenClaims(bounty)}
                                                            sx={{ borderRadius: 2 }}
                                                        >
                                                            View Claims ({bounty.claims?.length || 0})
                                                        </Button>
                                                    )}
                                                    
                                                    {(() => {
                                                        const userClaim = getUserClaim(bounty);
                                                        if (!userClaim) {
                                                            return (
                                                                <Button 
                                                                    size="medium" 
                                                                    variant="contained" 
                                                                    fullWidth 
                                                                    onClick={() => handleClaim(bounty.bountyID)}
                                                                    sx={{ borderRadius: 2 }}
                                                                >
                                                                    Claim Bounty
                                                                </Button>
                                                            );
                                                        }
                                                        if (userClaim.status === 'assigned') {
                                                            return (
                                                                <Button 
                                                                    size="medium" 
                                                                    variant="contained" 
                                                                    color="warning" 
                                                                    fullWidth
                                                                    onClick={() => handleOpenSubmit(bounty.bountyID)}
                                                                    sx={{ borderRadius: 2 }}
                                                                >
                                                                    Submit Work
                                                                </Button>
                                                            );
                                                        }
                                                        if (userClaim.status === 'completed') {
                                                            return (
                                                                <Button size="medium" disabled fullWidth startIcon={<CheckCircleIcon />} sx={{ borderRadius: 2 }}>
                                                                    Pending Verification
                                                                </Button>
                                                            );
                                                        }
                                                        if (userClaim.status === 'verified') {
                                                            return (
                                                                <Button size="medium" disabled fullWidth startIcon={<CheckCircleIcon />} sx={{ borderRadius: 2 }}>
                                                                    Verified
                                                                </Button>
                                                            );
                                                        }
                                                    })()}
                                                </Box>
                                            ) : (
                                                <>
                                                    {bounty.status === 'open' && (
                                                        <Button 
                                                            size="medium" 
                                                            variant="contained" 
                                                            fullWidth 
                                                            onClick={() => handleClaim(bounty.bountyID)}
                                                            sx={{ borderRadius: 2 }}
                                                        >
                                                            Claim Bounty
                                                        </Button>
                                                    )}
                                                    {bounty.status === 'assigned' && bounty.assignedTo === session?.user?.userID && (
                                                        <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
                                                            <Button 
                                                                size="medium" 
                                                                variant="contained" 
                                                                color="warning" 
                                                                fullWidth
                                                                onClick={() => handleOpenSubmit(bounty.bountyID)}
                                                                sx={{ borderRadius: 2 }}
                                                            >
                                                                Submit Work
                                                            </Button>
                                                            {canClawback && (
                                                                <Tooltip title="Unassign User (Clawback)">
                                                                    <Button 
                                                                        size="medium" 
                                                                        color="error" 
                                                                        variant="outlined" 
                                                                        onClick={() => handleClawback(bounty.bountyID)}
                                                                        sx={{ borderRadius: 2, minWidth: 'auto', px: 2 }}
                                                                    >
                                                                        <UndoIcon />
                                                                    </Button>
                                                                </Tooltip>
                                                            )}
                                                        </Box>
                                                    )}
                                                    {bounty.status === 'assigned' && bounty.assignedTo !== session?.user?.userID && (
                                                        <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
                                                            <Button 
                                                                size="medium" 
                                                                disabled 
                                                                fullWidth 
                                                                variant="outlined"
                                                                sx={{ borderRadius: 2 }}
                                                            >
                                                                Assigned
                                                            </Button>
                                                            {canClawback && (
                                                                <Tooltip title="Unassign User (Clawback)">
                                                                    <Button 
                                                                        size="medium" 
                                                                        color="error" 
                                                                        variant="outlined" 
                                                                        onClick={() => handleClawback(bounty.bountyID)}
                                                                        sx={{ borderRadius: 2, minWidth: 'auto', px: 2 }}
                                                                    >
                                                                        <UndoIcon />
                                                                    </Button>
                                                                </Tooltip>
                                                            )}
                                                        </Box>
                                                    )}
                                                    {bounty.status === 'completed' && (
                                                        canEdit ? (
                                                            <Button 
                                                                size="medium" 
                                                                variant="contained" 
                                                                color="success" 
                                                                fullWidth 
                                                                onClick={() => handleVerify(bounty.bountyID)}
                                                                sx={{ borderRadius: 2 }}
                                                            >
                                                                Verify & Award
                                                            </Button>
                                                        ) : (
                                                            <Button size="medium" disabled fullWidth startIcon={<CheckCircleIcon />} sx={{ borderRadius: 2 }}>
                                                                Pending Verification
                                                            </Button>
                                                        )
                                                    )}
                                                    {bounty.status === 'verified' && (
                                                        <Button size="medium" disabled fullWidth startIcon={<CheckCircleIcon />} sx={{ borderRadius: 2 }}>
                                                            Verified
                                                        </Button>
                                                    )}
                                                </>
                                            )}
                                        </Box>
                                    </CardActions>
                                </Card>
                            </Grid>
                        );
                    })}
                </Grid>
            )}

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



            <Dialog open={openCreate} onClose={() => setOpenCreate(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{editMode ? 'Edit Bounty' : 'Create New Bounty'}</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                        <TextField 
                            label="Title" 
                            fullWidth 
                            value={newBounty.title}
                            onChange={(e) => setNewBounty({...newBounty, title: e.target.value})}
                        />
                        <TextField 
                            label="Description" 
                            fullWidth 
                            multiline 
                            rows={3}
                            value={newBounty.description}
                            onChange={(e) => setNewBounty({...newBounty, description: e.target.value})}
                        />

                        <Box>
                            <input
                                accept="image/*"
                                style={{ display: 'none' }}
                                id="raised-button-file"
                                type="file"
                                onChange={handleImageUpload}
                            />
                            <label htmlFor="raised-button-file">
                                <Button 
                                    variant="outlined" 
                                    component="span" 
                                    startIcon={<CloudUploadIcon />}
                                    disabled={uploading}
                                    fullWidth
                                >
                                    {uploading ? 'Uploading...' : 'Upload Image (Optional)'}
                                </Button>
                            </label>
                            {newBounty.imageUrl && (
                                <Box sx={{ mt: 1, position: 'relative' }}>
                                    <img 
                                        src={newBounty.imageUrl} 
                                        alt="Preview" 
                                        style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 4 }} 
                                    />
                                    <IconButton 
                                        size="small" 
                                        sx={{ position: 'absolute', top: 5, right: 5, bgcolor: 'rgba(255,255,255,0.8)' }}
                                        onClick={() => setNewBounty({...newBounty, imageUrl: ''})}
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                </Box>
                            )}
                        </Box>
                        
                        {session?.user?.role === 'admin' && (
                            <>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={newBounty.isInfinite || false}
                                            onChange={(e) => setNewBounty({...newBounty, isInfinite: e.target.checked})}
                                        />
                                    }
                                    label="Infinite Claims (Multi-user)"
                                />
                                
                                {newBounty.isInfinite && (
                                    <TextField
                                        label="End Date (Optional)"
                                        type="date"
                                        fullWidth
                                        InputLabelProps={{ shrink: true }}
                                        value={newBounty.endsAt || ''}
                                        onChange={(e) => setNewBounty({...newBounty, endsAt: e.target.value})}
                                    />
                                )}

                                <FormControl fullWidth>
                                    <InputLabel>Recurrence</InputLabel>
                                    <Select
                                        value={newBounty.recurrence || 'none'}
                                        label="Recurrence"
                                        onChange={(e) => setNewBounty({...newBounty, recurrence: e.target.value})}
                                    >
                                        <MenuItem value="none">None (One-time)</MenuItem>
                                        <MenuItem value="daily">Daily</MenuItem>
                                        <MenuItem value="weekly">Weekly</MenuItem>
                                        <MenuItem value="monthly">Monthly</MenuItem>
                                    </Select>
                                </FormControl>
                            </>
                        )}

                        <FormControl fullWidth>
                            <InputLabel>Reward Type</InputLabel>
                            <Select
                                value={newBounty.rewardType}
                                label="Reward Type"
                                onChange={(e) => setNewBounty({...newBounty, rewardType: e.target.value})}
                            >
                                <MenuItem value="custom">Custom Reward</MenuItem>
                                {session?.user?.role === 'admin' && (
                                    <MenuItem value="hours">Volunteer Hours</MenuItem>
                                )}
                            </Select>
                        </FormControl>

                        <TextField 
                            label={newBounty.rewardType === 'hours' ? "Hours Amount" : "Reward Description"}
                            fullWidth 
                            type={newBounty.rewardType === 'hours' ? "number" : "text"}
                            value={newBounty.rewardValue}
                            onChange={(e) => setNewBounty({...newBounty, rewardValue: e.target.value})}
                            helperText={newBounty.rewardType === 'hours' ? "Hours count towards monthly membership requirement" : "e.g. 0.001 BTC, Lunch, High Five"}
                        />

                        <TextField 
                            label="Additional Stake (Optional)" 
                            fullWidth 
                            type="number"
                            value={newBounty.stakeValue}
                            onChange={(e) => setNewBounty({...newBounty, stakeValue: e.target.value})}
                            helperText={`Base Stake: 3. Total Reward: ${3 + (Number(newBounty.stakeValue) || 0)} Stake.`}
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenCreate(false)}>Cancel</Button>
                    <Button onClick={handleSubmitBounty} variant="contained">
                        {editMode ? 'Save Changes' : 'Create Bounty'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={openSubmit} onClose={() => setOpenSubmit(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Submit Work</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" paragraph sx={{ mt: 1 }}>
                        Provide a brief description of the work you completed, or a link to the pull request/document.
                    </Typography>
                    <TextField 
                        label="Submission Notes / Link" 
                        fullWidth 
                        multiline 
                        rows={4}
                        value={submissionNote}
                        onChange={(e) => setSubmissionNote(e.target.value)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenSubmit(false)}>Cancel</Button>
                    <Button onClick={handleSubmitWork} variant="contained" color="success">
                        Submit for Verification
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Claims Dialog */}
            <Dialog open={openClaims} onClose={() => setOpenClaims(false)} maxWidth="md" fullWidth>
                <DialogTitle>Claims for {selectedBountyForClaims?.title}</DialogTitle>
                <DialogContent>
                    <List>
                        {selectedBountyForClaims?.claims?.length === 0 && (
                            <Typography color="text.secondary" sx={{ p: 2 }}>No claims yet.</Typography>
                        )}
                        {selectedBountyForClaims?.claims?.map((claim) => (
                            <ListItem key={claim.claimID} divider>
                                <ListItemText
                                    primary={claim.username || claim.userID}
                                    secondary={
                                        <>
                                            <Typography component="span" variant="body2" color="text.primary">
                                                Status: {claim.status}
                                            </Typography>
                                            {claim.submission && (
                                                <Box sx={{ mt: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                                                    <Typography variant="caption" display="block">Submission:</Typography>
                                                    {claim.submission.note}
                                                </Box>
                                            )}
                                        </>
                                    }
                                />
                                <ListItemSecondaryAction>
                                    {claim.status === 'completed' && (
                                        <Button 
                                            variant="contained" 
                                            color="success" 
                                            size="small"
                                            onClick={() => handleVerify(selectedBountyForClaims.bountyID, claim.userID)}
                                            sx={{ mr: 1 }}
                                        >
                                            Verify
                                        </Button>
                                    )}
                                    {claim.status === 'verified' && (
                                        <Chip label="Verified" color="success" size="small" icon={<CheckCircleIcon />} sx={{ mr: 1 }} />
                                    )}
                                    <IconButton 
                                        edge="end" 
                                        aria-label="delete"
                                        onClick={() => handleClawbackClaim(selectedBountyForClaims.bountyID, claim.userID)}
                                        color="error"
                                        size="small"
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                </ListItemSecondaryAction>
                            </ListItem>
                        ))}
                    </List>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenClaims(false)}>Close</Button>
                </DialogActions>
            </Dialog>

            <Zoom in={true} style={{ transitionDelay: '300ms' }}>
                <Fab 
                    color="secondary" 
                    aria-label="feed" 
                    sx={{ position: 'fixed', bottom: 16, right: 16, display: { xs: 'flex', md: 'none' } }}
                    onClick={() => router.push('/dashboard/bounties/feed')}
                >
                    <WhatshotIcon />
                </Fab>
            </Zoom>
        </Box>
    );
}
