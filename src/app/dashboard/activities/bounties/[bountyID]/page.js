"use client";
import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Button, Card, CardContent, CardActions, 
    Chip, Dialog, DialogTitle, DialogContent, DialogActions, 
    TextField, LinearProgress, IconButton, Tooltip, useTheme,
    List, ListItem, ListItemText, ListItemSecondaryAction,
    Breadcrumbs, Link as MuiLink
} from '@mui/material';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import StarIcon from '@mui/icons-material/Star';
import LoopIcon from '@mui/icons-material/Loop';
import EditIcon from '@mui/icons-material/Edit';
import UndoIcon from '@mui/icons-material/Undo';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PersonIcon from '@mui/icons-material/Person';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

export default function BountyDetailPage() {
    const { data: session } = useSession();
    const theme = useTheme();
    const params = useParams();
    const router = useRouter();
    const { bountyID } = params;
    
    const [bounty, setBounty] = useState(null);
    const [loading, setLoading] = useState(true);
    const [openSubmit, setOpenSubmit] = useState(false);
    const [submissionNote, setSubmissionNote] = useState('');
    const [openClaims, setOpenClaims] = useState(false);

    useEffect(() => {
        if (bountyID) {
            fetchBounty();
        }
    }, [bountyID]);

    const fetchBounty = async () => {
        try {
            const res = await fetch(`/api/v1/bounties?bountyID=${bountyID}`);
            if (res.ok) {
                const data = await res.json();
                setBounty(data.bounty);
            } else {
                console.error("Failed to fetch bounty");
            }
        } catch (error) {
            console.error("Failed to fetch bounty", error);
        } finally {
            setLoading(false);
        }
    };

    const handleClaim = async () => {
        try {
            const res = await fetch(`/api/v1/bounties?bountyID=${bountyID}&action=assign`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userID: session.user.userID })
            });
            if (res.ok) fetchBounty();
        } catch (error) {
            console.error("Failed to claim bounty", error);
        }
    };

    const handleClawback = async () => {
        if (!confirm("Are you sure you want to unassign this bounty? It will be set back to 'Open' status.")) return;
        try {
            const res = await fetch(`/api/v1/bounties?bountyID=${bountyID}&action=clawback`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userID: session.user.userID })
            });
            if (res.ok) fetchBounty();
        } catch (error) {
            console.error("Failed to clawback bounty", error);
        }
    };

    const handleSubmitWork = async () => {
        try {
            const res = await fetch(`/api/v1/bounties?bountyID=${bountyID}&action=submit`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    userID: session.user.userID,
                    submission: { note: submissionNote }
                })
            });
            if (res.ok) {
                setOpenSubmit(false);
                fetchBounty();
            }
        } catch (error) {
            console.error("Failed to submit work", error);
        }
    };

    const handleVerify = async (claimUserID = null) => {
        try {
            const body = { verifierID: session.user.userID };
            if (claimUserID) body.claimUserID = claimUserID;

            const res = await fetch(`/api/v1/bounties?bountyID=${bountyID}&action=verify`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                fetchBounty();
                // If verifying a specific claim, we might want to refresh claims list or close dialog
                // But fetchBounty updates the whole object including claims
            }
        } catch (error) {
            console.error("Failed to verify bounty", error);
        }
    };

    const handleClawbackClaim = async (claimUserID) => {
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
                fetchBounty();
            }
        } catch (error) {
            console.error("Failed to remove claim", error);
        }
    };

    const getUserClaim = () => {
        if (!bounty?.isInfinite || !bounty?.claims) return null;
        return bounty.claims.find(c => c.userID === session?.user?.userID);
    };

    if (loading) return <LinearProgress />;
    if (!bounty) return <Typography sx={{ p: 4 }}>Bounty not found.</Typography>;

    const isCreator = bounty.creatorID === session?.user?.userID;
    const isAdmin = session?.user?.role === 'admin';
    const canEdit = isCreator || isAdmin;
    const canClawback = (isCreator || isAdmin) && bounty.status === 'assigned';

    return (
        <Box sx={{ p: { xs: 2, md: 3 }, pb: { xs: 10, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
            <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
                <MuiLink component={Link} underline="hover" color="inherit" href="/dashboard">
                    Dashboard
                </MuiLink>
                <MuiLink component={Link} underline="hover" color="inherit" href="/dashboard/bounties">
                    Bounties
                </MuiLink>
                <Typography color="text.primary">{bounty.title}</Typography>
            </Breadcrumbs>

            <Button 
                startIcon={<ArrowBackIcon />} 
                component={Link} 
                href="/dashboard/bounties"
                sx={{ mb: 3 }}
            >
                Back to Board
            </Button>

            <Card sx={{ 
                border: bounty.rewardType === 'hours' ? '1px solid #4caf50' : '1px solid #9c27b0',
                boxShadow: 3
            }}>
                {bounty.imageUrl && (
                    <Box 
                        component="img"
                        src={bounty.imageUrl}
                        alt={bounty.title}
                        sx={{
                            width: '100%',
                            maxHeight: 400,
                            objectFit: 'cover',
                            borderBottom: '1px solid rgba(0,0,0,0.12)'
                        }}
                    />
                )}
                <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Chip 
                                label={bounty.status === 'completed' ? 'PENDING VERIFICATION' : bounty.status.toUpperCase()} 
                                color={
                                    bounty.status === 'open' ? 'success' : 
                                    bounty.status === 'completed' ? 'info' : 
                                    bounty.status === 'verified' ? 'success' : 
                                    'default'
                                } 
                            />
                            {bounty.recurrence && bounty.recurrence !== 'none' && (
                                <Chip 
                                    icon={<LoopIcon />} 
                                    label={bounty.recurrence} 
                                    color="info" 
                                    variant="outlined"
                                    sx={{ textTransform: 'capitalize' }}
                                />
                            )}
                        </Box>
                        <Chip 
                            icon={<StarIcon />} 
                            label={`${bounty.stakeValue} Stake`} 
                            color="warning" 
                            variant="outlined" 
                        />
                    </Box>

                    <Typography variant="h3" gutterBottom>{bounty.title}</Typography>
                    
                    <Box sx={{ my: 3, p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
                        <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                            {bounty.description}
                        </Typography>
                    </Box>
                    
                    <Box sx={{ mt: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                        {bounty.rewardType === 'hours' ? (
                            <Chip icon={<AccessTimeIcon />} label={`${bounty.rewardValue} Hours Reward`} color="success" />
                        ) : (
                            <Chip icon={<MonetizationOnIcon />} label={`Reward: ${bounty.rewardValue}`} color="secondary" />
                        )}
                        
                        {bounty.isInfinite && (
                            <Chip 
                                label="Infinite Claims (Multi-user)" 
                                color="secondary" 
                                variant="outlined" 
                            />
                        )}

                        {bounty.assignedTo && !bounty.isInfinite && (
                            <Chip 
                                icon={<PersonIcon />} 
                                label={`Claimed by: ${bounty.assignedToUsername || bounty.assignedTo}`} 
                                variant="outlined" 
                            />
                        )}
                    </Box>
                </CardContent>
                <CardActions sx={{ p: 2, justifyContent: 'flex-end', gap: 2, flexWrap: 'wrap' }}>
                    {bounty.isInfinite ? (
                        <Box sx={{ display: 'flex', gap: 2, width: '100%', justifyContent: 'flex-end' }}>
                            {canEdit && (
                                <Button 
                                    variant="outlined" 
                                    onClick={() => setOpenClaims(true)}
                                >
                                    View Claims ({bounty.claims?.length || 0})
                                </Button>
                            )}
                            
                            {(() => {
                                const userClaim = getUserClaim();
                                if (!userClaim) {
                                    return (
                                        <Button variant="contained" size="large" onClick={handleClaim}>
                                            Claim Bounty
                                        </Button>
                                    );
                                }
                                if (userClaim.status === 'assigned') {
                                    return (
                                        <Button 
                                            variant="contained" 
                                            color="warning" 
                                            size="large"
                                            onClick={() => {
                                                setSubmissionNote('');
                                                setOpenSubmit(true);
                                            }}
                                        >
                                            Submit Work
                                        </Button>
                                    );
                                }
                                if (userClaim.status === 'completed') {
                                    return (
                                        <Button disabled variant="contained" startIcon={<CheckCircleIcon />}>
                                            Pending Verification
                                        </Button>
                                    );
                                }
                                if (userClaim.status === 'verified') {
                                    return (
                                        <Button disabled variant="contained" startIcon={<CheckCircleIcon />}>
                                            Verified
                                        </Button>
                                    );
                                }
                            })()}
                        </Box>
                    ) : (
                        <>
                            {bounty.status === 'open' && (
                                <Button variant="contained" size="large" onClick={handleClaim}>
                                    Claim Bounty
                                </Button>
                            )}
                            {bounty.status === 'assigned' && bounty.assignedTo === session?.user?.userID && (
                                <Box sx={{ display: 'flex', gap: 2 }}>
                                    <Button 
                                        variant="contained" 
                                        color="warning" 
                                        size="large"
                                        onClick={() => {
                                            setSubmissionNote('');
                                            setOpenSubmit(true);
                                        }}
                                    >
                                        Submit Work
                                    </Button>
                                    {canClawback && (
                                        <Button 
                                            color="error" 
                                            variant="outlined" 
                                            onClick={handleClawback}
                                            startIcon={<UndoIcon />}
                                        >
                                            Unassign
                                        </Button>
                                    )}
                                </Box>
                            )}
                            {bounty.status === 'assigned' && bounty.assignedTo !== session?.user?.userID && (
                                <Box sx={{ display: 'flex', gap: 2 }}>
                                    <Button disabled variant="outlined">Assigned</Button>
                                    {canClawback && (
                                        <Button 
                                            color="error" 
                                            variant="outlined" 
                                            onClick={handleClawback}
                                            startIcon={<UndoIcon />}
                                        >
                                            Unassign User
                                        </Button>
                                    )}
                                </Box>
                            )}
                            {bounty.status === 'completed' && (
                                canEdit ? (
                                    <Button 
                                        variant="contained" 
                                        color="success" 
                                        size="large"
                                        onClick={() => handleVerify()}
                                    >
                                        Verify & Award
                                    </Button>
                                ) : (
                                    <Button disabled variant="contained" startIcon={<CheckCircleIcon />}>
                                        Pending Verification
                                    </Button>
                                )
                            )}
                            {bounty.status === 'verified' && (
                                <Button disabled variant="contained" startIcon={<CheckCircleIcon />}>
                                    Verified
                                </Button>
                            )}
                        </>
                    )}
                </CardActions>
            </Card>

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

            {/* Claims Dialog for Infinite Bounties */}
            <Dialog open={openClaims} onClose={() => setOpenClaims(false)} maxWidth="md" fullWidth>
                <DialogTitle>Claims for {bounty.title}</DialogTitle>
                <DialogContent>
                    <List>
                        {bounty.claims?.length === 0 && (
                            <Typography color="text.secondary" sx={{ p: 2 }}>No claims yet.</Typography>
                        )}
                        {bounty.claims?.map((claim) => (
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
                                            onClick={() => handleVerify(claim.userID)}
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
                                        onClick={() => handleClawbackClaim(claim.userID)}
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
        </Box>
    );
}
