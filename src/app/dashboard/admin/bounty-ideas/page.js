"use client";
import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Button, IconButton, Tooltip, 
    Dialog, DialogTitle, DialogContent, DialogActions, 
    TextField, Grid, Chip, Stack, Container, Alert,
    FormControl, InputLabel, Select, MenuItem, Checkbox, FormControlLabel,
    useTheme, useMediaQuery, Card, CardContent, CardActions
} from '@mui/material';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import { 
    Add as AddIcon, 
    Edit as EditIcon, 
    Delete as DeleteIcon, 
    RocketLaunch as PostIcon,
    ArrowBack as ArrowBackIcon
} from '@mui/icons-material';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function BountyIdeasPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    
    const [ideas, setIdeas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [postDialogOpen, setPostDialogOpen] = useState(false);
    const [currentIdea, setCurrentIdea] = useState(null);
    const [formData, setFormData] = useState({});
    const [postData, setPostData] = useState({});

    useEffect(() => {
        if (status === 'authenticated') {
            if (session.user.role !== 'admin') {
                router.push('/dashboard');
            } else {
                fetchIdeas();
            }
        }
    }, [status, session, router]);

    const fetchIdeas = async () => {
        try {
            const res = await fetch('/api/v1/bounty-ideas');
            if (res.ok) {
                const data = await res.json();
                setIdeas(data.ideas || []);
            }
        } catch (error) {
            console.error("Failed to fetch ideas", error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenDialog = (idea = null) => {
        if (idea) {
            setCurrentIdea(idea);
            setFormData({ ...idea, requirements: idea.requirements.join('\n') });
        } else {
            setCurrentIdea(null);
            setFormData({
                title: '',
                description: '',
                rewardType: 'custom',
                rewardValue: '',
                stakeValue: 5,
                requirements: '',
                recurrence: 'none',
                isInfinite: false,
                imageUrl: ''
            });
        }
        setDialogOpen(true);
    };

    const handleSaveIdea = async () => {
        const payload = {
            ...formData,
            requirements: typeof formData.requirements === 'string' 
                ? formData.requirements.split('\n').filter(r => r.trim()) 
                : formData.requirements
        };

        try {
            const url = currentIdea 
                ? `/api/v1/bounty-ideas/${currentIdea.ideaID}` 
                : '/api/v1/bounty-ideas';
            const method = currentIdea ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                fetchIdeas();
                setDialogOpen(false);
            } else {
                alert("Failed to save idea");
            }
        } catch (error) {
            console.error("Error saving idea:", error);
        }
    };

    const handleDeleteIdea = async (ideaID) => {
        if (!confirm("Are you sure you want to delete this idea?")) return;

        try {
            const res = await fetch(`/api/v1/bounty-ideas/${ideaID}`, { method: 'DELETE' });
            if (res.ok) {
                fetchIdeas();
            }
        } catch (error) {
            console.error("Error deleting idea:", error);
        }
    };

    const handleOpenPostDialog = (idea) => {
        setCurrentIdea(idea);
        // Set default dates
        const now = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(now.getDate() + 7);

        setPostData({
            ...idea,
            creatorID: session.user.userID,
            startsAt: now.toISOString().slice(0, 16),
            endsAt: nextWeek.toISOString().slice(0, 16)
        });
        setPostDialogOpen(true);
    };

    const handlePostBounty = async () => {
        try {
            const res = await fetch('/api/v1/bounties', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(postData)
            });

            if (res.ok) {
                alert("Bounty posted successfully! Notifications have been sent.");
                setPostDialogOpen(false);
            } else {
                const error = await res.json();
                alert(`Failed to post bounty: ${error.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error("Error posting bounty:", error);
            alert("Error posting bounty");
        }
    };

    const columns = [
        { field: 'title', headerName: 'Title', flex: 1 },
        { field: 'rewardValue', headerName: 'Reward', width: 150, 
          renderCell: (params) => `${params.value} ${params.row.rewardType}` 
        },
        { field: 'stakeValue', headerName: 'Stake', width: 100 },
        { field: 'recurrence', headerName: 'Recurrence', width: 120 },
        { 
            field: 'actions', 
            headerName: 'Actions', 
            width: 150,
            renderCell: (params) => (
                <Stack direction="row" spacing={1}>
                    <Tooltip title="Post as Bounty">
                        <IconButton color="success" size="small" onClick={() => handleOpenPostDialog(params.row)}>
                            <PostIcon />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit">
                        <IconButton color="primary" size="small" onClick={() => handleOpenDialog(params.row)}>
                            <EditIcon />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                        <IconButton color="error" size="small" onClick={() => handleDeleteIdea(params.row.ideaID)}>
                            <DeleteIcon />
                        </IconButton>
                    </Tooltip>
                </Stack>
            )
        }
    ];

    return (
        <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
            <Stack 
                direction={isMobile ? "column" : "row"} 
                justifyContent="space-between" 
                alignItems={isMobile ? "stretch" : "center"} 
                spacing={2}
                sx={{ mb: 3 }}
            >
                <Stack direction="row" alignItems="center" spacing={2}>
                    <IconButton onClick={() => router.back()}>
                        <ArrowBackIcon />
                    </IconButton>
                    <Typography variant={isMobile ? "h5" : "h4"} component="h1" fontWeight="bold">
                        Bounty Ideas
                    </Typography>
                </Stack>
                <Button 
                    variant="contained" 
                    startIcon={<AddIcon />} 
                    onClick={() => handleOpenDialog()}
                    fullWidth={isMobile}
                >
                    New Idea
                </Button>
            </Stack>

            {isMobile ? (
                <Stack spacing={2}>
                    {ideas.map((idea) => (
                        <Card key={idea.ideaID} variant="outlined">
                            <CardContent>
                                <Typography variant="h6" gutterBottom>{idea.title}</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ 
                                    display: '-webkit-box',
                                    overflow: 'hidden',
                                    WebkitBoxOrient: 'vertical',
                                    WebkitLineClamp: 3,
                                    mb: 2
                                }}>
                                    {idea.description}
                                </Typography>
                                <Stack direction="row" spacing={1} flexWrap="wrap" gap={1}>
                                    <Chip label={`${idea.rewardValue} ${idea.rewardType}`} size="small" color="primary" variant="outlined" />
                                    <Chip label={`${idea.stakeValue} Stake`} size="small" color="secondary" variant="outlined" />
                                    {idea.recurrence !== 'none' && (
                                        <Chip label={idea.recurrence} size="small" />
                                    )}
                                </Stack>
                            </CardContent>
                            <CardActions>
                                <Button 
                                    size="small" 
                                    startIcon={<PostIcon />} 
                                    color="success"
                                    onClick={() => handleOpenPostDialog(idea)}
                                >
                                    Post
                                </Button>
                                <Button 
                                    size="small" 
                                    startIcon={<EditIcon />} 
                                    onClick={() => handleOpenDialog(idea)}
                                >
                                    Edit
                                </Button>
                                <Button 
                                    size="small" 
                                    startIcon={<DeleteIcon />} 
                                    color="error"
                                    onClick={() => handleDeleteIdea(idea.ideaID)}
                                >
                                    Delete
                                </Button>
                            </CardActions>
                        </Card>
                    ))}
                </Stack>
            ) : (
                <Paper sx={{ height: 600, width: '100%', p: 2 }}>
                    <DataGrid
                        rows={ideas}
                        columns={columns}
                        getRowId={(row) => row.ideaID}
                        loading={loading}
                        components={{ Toolbar: GridToolbar }}
                    />
                </Paper>
            )}

            {/* Create/Edit Dialog */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth fullScreen={isMobile}>
                <DialogTitle>{currentIdea ? 'Edit Idea' : 'New Idea'}</DialogTitle>
                <DialogContent dividers>
                    <Grid container spacing={2}>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Title"
                                value={formData.title || ''}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                multiline
                                rows={3}
                                label="Description"
                                value={formData.description || ''}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <FormControl fullWidth>
                                <InputLabel>Reward Type</InputLabel>
                                <Select
                                    value={formData.rewardType || 'custom'}
                                    label="Reward Type"
                                    onChange={(e) => setFormData({ ...formData, rewardType: e.target.value })}
                                >
                                    <MenuItem value="custom">Custom</MenuItem>
                                    <MenuItem value="hours">Hours</MenuItem>
                                    <MenuItem value="cash">Cash</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                fullWidth
                                label="Reward Value"
                                value={formData.rewardValue || ''}
                                onChange={(e) => setFormData({ ...formData, rewardValue: e.target.value })}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                fullWidth
                                type="number"
                                label="Stake Value (Points)"
                                value={formData.stakeValue || ''}
                                onChange={(e) => setFormData({ ...formData, stakeValue: Number(e.target.value) })}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <FormControl fullWidth>
                                <InputLabel>Recurrence</InputLabel>
                                <Select
                                    value={formData.recurrence || 'none'}
                                    label="Recurrence"
                                    onChange={(e) => setFormData({ ...formData, recurrence: e.target.value })}
                                >
                                    <MenuItem value="none">None</MenuItem>
                                    <MenuItem value="daily">Daily</MenuItem>
                                    <MenuItem value="weekly">Weekly</MenuItem>
                                    <MenuItem value="monthly">Monthly</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                multiline
                                rows={3}
                                label="Requirements (One per line)"
                                value={formData.requirements || ''}
                                onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
                                helperText="Enter each requirement on a new line"
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={formData.isInfinite || false}
                                        onChange={(e) => setFormData({ ...formData, isInfinite: e.target.checked })}
                                    />
                                }
                                label="Infinite Claims (Multiple users can claim)"
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSaveIdea} variant="contained">Save</Button>
                </DialogActions>
            </Dialog>

            {/* Post Bounty Dialog */}
            <Dialog open={postDialogOpen} onClose={() => setPostDialogOpen(false)} maxWidth="md" fullWidth fullScreen={isMobile}>
                <DialogTitle>Post Bounty</DialogTitle>
                <DialogContent dividers>
                    <Alert severity="info" sx={{ mb: 2 }}>
                        This will create a live bounty visible to all members. Notifications (Email, Discord, In-App) will be sent immediately.
                    </Alert>
                    <Grid container spacing={2}>
                        <Grid item xs={12}>
                            <Typography variant="h6">{postData.title}</Typography>
                            <Typography variant="body2" color="text.secondary" paragraph>{postData.description}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                fullWidth
                                type="datetime-local"
                                label="Starts At"
                                value={postData.startsAt || ''}
                                onChange={(e) => setPostData({ ...postData, startsAt: e.target.value })}
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                fullWidth
                                type="datetime-local"
                                label="Ends At"
                                value={postData.endsAt || ''}
                                onChange={(e) => setPostData({ ...postData, endsAt: e.target.value })}
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPostDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handlePostBounty} variant="contained" color="success" startIcon={<PostIcon />}>
                        Post Live Bounty
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}