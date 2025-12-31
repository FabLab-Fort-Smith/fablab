
"use client";
import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Button, IconButton, 
    Dialog, DialogTitle, DialogContent, DialogActions, 
    TextField, Grid, Stack, Container, Alert,
    Card, CardContent, CardActions,
    CircularProgress, FormControl, InputLabel, Select, MenuItem, Chip,
    FormControlLabel, Checkbox
} from '@mui/material';
import { 
    Add as AddIcon, 
    Edit as EditIcon, 
    Delete as DeleteIcon,
    Campaign as CampaignIcon
} from '@mui/icons-material';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

export default function AnnouncementManagementPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    
    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [dialogOpen, setDialogOpen] = useState(false);
    const [currentAnnouncement, setCurrentAnnouncement] = useState(null);
    const [formData, setFormData] = useState({
        title: '',
        content: '',
        type: 'info',
        isActive: true,
        postToDiscord: false
    });
    
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (status === 'authenticated') {
            if (session.user.role !== 'admin') {
                router.push('/dashboard');
            } else {
                fetchAnnouncements();
            }
        } else if (status === 'unauthenticated') {
            router.push('/auth/signin');
        }
    }, [status, session, router]);

    const fetchAnnouncements = async () => {
        try {
            const response = await axios.get('/api/v1/announcements');
            setAnnouncements(response.data);
        } catch (err) {
            console.error("Error fetching announcements:", err);
            setError("Failed to load announcements");
        } finally {
            setLoading(false);
        }
    };

    const handleOpenDialog = (announcement = null) => {
        if (announcement) {
            setCurrentAnnouncement(announcement);
            setFormData({
                title: announcement.title,
                content: announcement.content,
                type: announcement.type,
                isActive: announcement.isActive,
                postToDiscord: false // Don't repost on edit by default
            });
        } else {
            setCurrentAnnouncement(null);
            setFormData({
                title: '',
                content: '',
                type: 'info',
                isActive: true,
                postToDiscord: true
            });
        }
        setDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setDialogOpen(false);
        setError('');
    };

    const handleSave = async () => {
        setSaving(true);
        setError('');
        try {
            if (currentAnnouncement) {
                await axios.put(`/api/v1/announcements/${currentAnnouncement._id}`, formData);
            } else {
                await axios.post('/api/v1/announcements', formData);
            }
            fetchAnnouncements();
            handleCloseDialog();
        } catch (err) {
            console.error("Error saving announcement:", err);
            setError("Failed to save announcement");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm("Are you sure you want to delete this announcement?")) return;
        
        try {
            await axios.delete(`/api/v1/announcements/${id}`);
            fetchAnnouncements();
        } catch (err) {
            console.error("Error deleting announcement:", err);
            setError("Failed to delete announcement");
        }
    };

    const getTypeColor = (type) => {
        switch (type) {
            case 'warning': return 'warning';
            case 'alert': return 'error';
            case 'success': return 'success';
            default: return 'info';
        }
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={4}>
                <Typography variant="h4" component="h1" gutterBottom>
                    Announcements
                </Typography>
                <Button 
                    variant="contained" 
                    startIcon={<AddIcon />}
                    onClick={() => handleOpenDialog()}
                >
                    New Announcement
                </Button>
            </Stack>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Grid container spacing={3}>
                {announcements.map((announcement) => (
                    <Grid item xs={12} md={6} key={announcement._id}>
                        <Card>
                            <CardContent>
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={2}>
                                    <Chip 
                                        label={announcement.type.toUpperCase()} 
                                        color={getTypeColor(announcement.type)} 
                                        size="small" 
                                    />
                                    <Chip 
                                        label={announcement.isActive ? "Active" : "Inactive"} 
                                        variant="outlined"
                                        color={announcement.isActive ? "success" : "default"}
                                        size="small" 
                                    />
                                </Stack>
                                <Typography variant="h6" gutterBottom>
                                    {announcement.title}
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                                    {announcement.content}
                                </Typography>
                                <Typography variant="caption" display="block" sx={{ mt: 2, color: 'text.disabled' }}>
                                    Created: {new Date(announcement.createdAt).toLocaleDateString()}
                                </Typography>
                            </CardContent>
                            <CardActions>
                                <IconButton onClick={() => handleOpenDialog(announcement)} color="primary">
                                    <EditIcon />
                                </IconButton>
                                <IconButton onClick={() => handleDelete(announcement._id)} color="error">
                                    <DeleteIcon />
                                </IconButton>
                            </CardActions>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {currentAnnouncement ? 'Edit Announcement' : 'New Announcement'}
                </DialogTitle>
                <DialogContent>
                    <Stack spacing={3} sx={{ mt: 1 }}>
                        <TextField
                            label="Title"
                            fullWidth
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        />
                        <TextField
                            label="Content"
                            fullWidth
                            multiline
                            rows={4}
                            value={formData.content}
                            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                        />
                        <FormControl fullWidth>
                            <InputLabel>Type</InputLabel>
                            <Select
                                value={formData.type}
                                label="Type"
                                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                            >
                                <MenuItem value="info">Info</MenuItem>
                                <MenuItem value="warning">Warning</MenuItem>
                                <MenuItem value="alert">Alert</MenuItem>
                                <MenuItem value="success">Success</MenuItem>
                            </Select>
                        </FormControl>
                        
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={formData.isActive}
                                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                />
                            }
                            label="Active"
                        />

                        {!currentAnnouncement && (
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={formData.postToDiscord}
                                        onChange={(e) => setFormData({ ...formData, postToDiscord: e.target.checked })}
                                    />
                                }
                                label="Post to Discord"
                            />
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Cancel</Button>
                    <Button onClick={handleSave} variant="contained" disabled={saving}>
                        {saving ? 'Saving...' : 'Save'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}
