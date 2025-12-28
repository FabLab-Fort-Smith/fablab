"use client";
import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Button, IconButton, 
    Dialog, DialogTitle, DialogContent, DialogActions, 
    TextField, Grid, Stack, Container, Alert,
    Card, CardContent, CardActions, CardMedia,
    CircularProgress, InputAdornment,
    FormControl, InputLabel, Select, MenuItem, Chip
} from '@mui/material';
import { 
    Add as AddIcon, 
    Edit as EditIcon, 
    Delete as DeleteIcon,
    CloudUpload as CloudUploadIcon,
    Search as SearchIcon
} from '@mui/icons-material';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { uploadFileToS3 } from '@/utils/s3.util';

export default function BadgeManagementPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    
    const [badges, setBadges] = useState([]);
    const [filteredBadges, setFilteredBadges] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    
    const [dialogOpen, setDialogOpen] = useState(false);
    const [currentBadge, setCurrentBadge] = useState(null);
    const [formData, setFormData] = useState({
        id: '',
        name: '',
        description: '',
        icon: '',
        imageUrl: '',
        type: 'admin'
    });
    
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (status === 'authenticated') {
            if (session.user.role !== 'admin') {
                router.push('/dashboard');
            } else {
                fetchBadges();
            }
        }
    }, [status, session, router]);

    useEffect(() => {
        if (searchQuery.trim() === '') {
            setFilteredBadges(badges);
        } else {
            const lowerQuery = searchQuery.toLowerCase();
            setFilteredBadges(badges.filter(badge => 
                badge.name.toLowerCase().includes(lowerQuery) || 
                badge.description.toLowerCase().includes(lowerQuery) ||
                badge.id.toLowerCase().includes(lowerQuery)
            ));
        }
    }, [searchQuery, badges]);

    const fetchBadges = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/v1/badges');
            const badgesData = res.data.badges || [];
            setBadges(badgesData);
            setFilteredBadges(badgesData);
        } catch (err) {
            console.error("Failed to fetch badges", err);
            setError("Failed to load badges.");
        } finally {
            setLoading(false);
        }
    };

    const handleOpenDialog = (badge = null) => {
        if (badge) {
            setCurrentBadge(badge);
            setFormData({
                id: badge.id,
                name: badge.name,
                description: badge.description,
                icon: badge.icon || '',
                imageUrl: badge.imageUrl || '',
                type: badge.type || 'admin'
            });
        } else {
            setCurrentBadge(null);
            setFormData({
                id: '',
                name: '',
                description: '',
                icon: '🏅',
                imageUrl: '',
                type: 'admin'
            });
        }
        setDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setDialogOpen(false);
        setCurrentBadge(null);
        setError('');
    };

    const handleNameChange = (e) => {
        const name = e.target.value;
        // If creating a new badge, auto-generate ID from name
        if (!currentBadge) {
            const id = name.toLowerCase()
                .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
                .replace(/\s+/g, '_');        // Replace spaces with underscores
            setFormData(prev => ({ ...prev, name, id }));
        } else {
            setFormData(prev => ({ ...prev, name }));
        }
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        try {
            // Upload to S3 (badges folder)
            const url = await uploadFileToS3(file, 'badges');
            setFormData(prev => ({ ...prev, imageUrl: url }));
        } catch (err) {
            console.error("Upload failed", err);
            setError("Failed to upload image.");
        } finally {
            setUploading(false);
        }
    };

    const handleSave = async () => {
        try {
            if (currentBadge) {
                // Update
                await axios.put(`/api/v1/badges/${currentBadge.id}`, formData);
            } else {
                // Create
                await axios.post('/api/v1/badges', formData);
            }
            fetchBadges();
            handleCloseDialog();
        } catch (err) {
            console.error("Error saving badge:", err);
            setError(err.response?.data?.error || "Failed to save badge.");
        }
    };

    const handleDelete = async (id) => {
        if (confirm('Are you sure you want to delete this badge? Users who have it will keep it, but it will be removed from the system.')) {
            try {
                await axios.delete(`/api/v1/badges/${id}`);
                fetchBadges();
            } catch (err) {
                console.error("Error deleting badge:", err);
                setError("Failed to delete badge.");
            }
        }
    };

    if (status === 'loading') return <Box p={3} display="flex" justifyContent="center"><CircularProgress /></Box>;

    return (
        <Container maxWidth="xl" sx={{ pb: 8 }}>
            <Box sx={{ my: 4 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2} mb={3}>
                    <Typography variant="h4" component="h1">
                        Badge Management
                    </Typography>
                    <Button 
                        variant="contained" 
                        startIcon={<AddIcon />}
                        onClick={() => handleOpenDialog()}
                        fullWidth={false}
                    >
                        Create Badge
                    </Button>
                </Stack>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                <TextField
                    fullWidth
                    placeholder="Search badges..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    sx={{ mb: 3 }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon />
                            </InputAdornment>
                        ),
                    }}
                />

                {loading ? (
                    <Box display="flex" justifyContent="center" p={4}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Grid container spacing={2}>
                        {filteredBadges.map((badge) => (
                            <Grid item xs={12} sm={6} md={4} lg={3} key={badge.id}>
                                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                                    <Box sx={{ pt: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', height: 140, bgcolor: 'action.hover' }}>
                                        {badge.imageUrl ? (
                                            <Box 
                                                component="img"
                                                src={badge.imageUrl}
                                                alt={badge.name}
                                                sx={{ maxHeight: 100, maxWidth: 100, objectFit: 'contain' }}
                                            />
                                        ) : (
                                            <Typography variant="h1">{badge.icon || '🏅'}</Typography>
                                        )}
                                    </Box>
                                    <CardContent sx={{ flexGrow: 1 }}>
                                        <Typography gutterBottom variant="h6" component="div">
                                            {badge.name}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                                            ID: {badge.id}
                                        </Typography>
                                        <Box sx={{ mb: 1 }}>
                                            <Chip 
                                                label={badge.type || 'admin'} 
                                                size="small" 
                                                color={badge.type === 'system' ? 'primary' : badge.type === 'bounty' ? 'secondary' : 'default'} 
                                                variant="outlined"
                                                sx={{ textTransform: 'capitalize' }}
                                            />
                                        </Box>
                                        <Typography variant="body2" color="text.secondary" sx={{ 
                                            display: '-webkit-box',
                                            WebkitLineClamp: 3,
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden'
                                        }}>
                                            {badge.description}
                                        </Typography>
                                    </CardContent>
                                    <CardActions>
                                        <Button size="small" startIcon={<EditIcon />} onClick={() => handleOpenDialog(badge)}>Edit</Button>
                                        <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={() => handleDelete(badge.id)}>Delete</Button>
                                    </CardActions>
                                </Card>
                            </Grid>
                        ))}
                        {filteredBadges.length === 0 && (
                            <Grid item xs={12}>
                                <Paper sx={{ p: 4, textAlign: 'center' }}>
                                    <Typography color="text.secondary">No badges found.</Typography>
                                </Paper>
                            </Grid>
                        )}
                    </Grid>
                )}

                <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                    <DialogTitle>{currentBadge ? 'Edit Badge' : 'Create New Badge'}</DialogTitle>
                    <DialogContent>
                        <Box component="form" sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <TextField
                                label="Name"
                                fullWidth
                                value={formData.name}
                                onChange={handleNameChange}
                            />
                            {/* ID is auto-generated from name */}
                            <FormControl fullWidth>
                                <InputLabel>Type</InputLabel>
                                <Select
                                    value={formData.type}
                                    label="Type"
                                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                >
                                    <MenuItem value="admin">Admin (Manual Award)</MenuItem>
                                    <MenuItem value="system">System (Programmatic)</MenuItem>
                                    <MenuItem value="bounty">Bounty (Task Based)</MenuItem>
                                </Select>
                            </FormControl>
                            <TextField
                                label="Description"
                                fullWidth
                                multiline
                                rows={3}
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            />
                            
                            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
                                <Typography variant="subtitle2" gutterBottom>Badge Image</Typography>
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <Box 
                                        sx={{ 
                                            width: 80, 
                                            height: 80, 
                                            display: 'flex', 
                                            justifyContent: 'center', 
                                            alignItems: 'center',
                                            bgcolor: 'action.hover',
                                            borderRadius: 1,
                                            border: '1px dashed',
                                            borderColor: 'text.secondary'
                                        }}
                                    >
                                        {formData.imageUrl ? (
                                            <Box component="img" src={formData.imageUrl} sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                        ) : (
                                            <Typography variant="h3">{formData.icon || '?'}</Typography>
                                        )}
                                    </Box>
                                    <Box sx={{ flex: 1 }}>
                                        <Button
                                            component="label"
                                            variant="outlined"
                                            startIcon={uploading ? <CircularProgress size={20} /> : <CloudUploadIcon />}
                                            disabled={uploading}
                                            fullWidth
                                            sx={{ mb: 1 }}
                                        >
                                            Upload Image
                                            <input type="file" hidden accept="image/*" onChange={handleImageUpload} />
                                        </Button>
                                        <TextField
                                            label="Or use Emoji Icon"
                                            size="small"
                                            fullWidth
                                            value={formData.icon}
                                            onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                                            placeholder="e.g. 🏅"
                                        />
                                    </Box>
                                </Stack>
                            </Box>
                        </Box>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleCloseDialog}>Cancel</Button>
                        <Button onClick={handleSave} variant="contained" disabled={uploading}>Save</Button>
                    </DialogActions>
                </Dialog>
            </Box>
        </Container>
    );
}
