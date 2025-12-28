"use client";
import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Grid, Card, CardContent, CardMedia, 
    Container, Button, TextField, Dialog, DialogTitle, 
    DialogContent, DialogActions, IconButton, Avatar, 
    CircularProgress, Alert, Fab, ImageList, ImageListItem,
    ToggleButton, ToggleButtonGroup, List, ListItem, 
    ListItemAvatar, ListItemText, Snackbar
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import CollectionsIcon from '@mui/icons-material/Collections';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import SendIcon from '@mui/icons-material/Send';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ShareIcon from '@mui/icons-material/Share';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { uploadFileToS3 } from '@/utils/s3.util';

export default function ShowcasePage() {
    const { data: session } = useSession();
    const router = useRouter();
    const searchParams = useSearchParams();
    const action = searchParams.get('action');
    
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [sort, setSort] = useState('latest');
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        images: []
    });
    const [previewUrls, setPreviewUrls] = useState([]);

    // Share State
    const [openShare, setOpenShare] = useState(false);
    const [selectedShowcase, setSelectedShowcase] = useState(null);
    const [users, setUsers] = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

    useEffect(() => {
        fetchItems();
    }, [sort]);

    useEffect(() => {
        if (action === 'new') {
            setOpen(true);
        }
    }, [action]);

    const fetchItems = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/portfolio?sort=${sort}`);
            if (res.ok) {
                const data = await res.json();
                setItems(data);
            }
        } catch (error) {
            console.error("Failed to fetch showcase items:", error);
        } finally {
            setLoading(false);
        }
    };

    // Share Handlers
    const handleOpenShare = (item) => {
        setSelectedShowcase(item);
        setOpenShare(true);
        fetchUsers();
    };

    const handleCloseShare = () => {
        setOpenShare(false);
        setSelectedShowcase(null);
    };

    const fetchUsers = async () => {
        if (users.length > 0) return;
        setLoadingUsers(true);
        try {
            const res = await fetch('/api/v1/users?limit=100');
            if (res.ok) {
                const data = await res.json();
                setUsers(data.users || []);
            }
        } catch (error) {
            console.error("Failed to fetch users:", error);
        } finally {
            setLoadingUsers(false);
        }
    };

    const handleCopyLink = () => {
        const url = `${window.location.origin}/dashboard/showcase/${selectedShowcase.id}`;
        navigator.clipboard.writeText(url);
        setSnackbar({ open: true, message: 'Link copied to clipboard!', severity: 'success' });
        handleCloseShare();
    };

    const handleNativeShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: selectedShowcase.title,
                    text: `Check out this project: ${selectedShowcase.title}`,
                    url: `${window.location.origin}/dashboard/showcase/${selectedShowcase.id}`
                });
                handleCloseShare();
            } catch (error) {
                console.error('Error sharing:', error);
            }
        }
    };

    const handleShareToUser = async (recipientID) => {
        try {
            // We'll reuse the portfolio API to handle sharing notifications if we add that endpoint
            // For now, we can simulate it or add a specific endpoint. 
            // Since the user asked for the "same upgrade", I should probably check if the portfolio API supports sharing.
            // The bounty API had a specific 'share' action. I might need to add that to the portfolio API too.
            // For now, let's assume we will add it.
            
            const res = await fetch('/api/v1/portfolio', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    id: selectedShowcase.id, 
                    action: 'share',
                    senderID: session.user.userID,
                    recipientID: recipientID
                })
            });

            if (res.ok) {
                setSnackbar({ open: true, message: 'Sent to user!', severity: 'success' });
                handleCloseShare();
            } else {
                throw new Error('Failed to share');
            }
        } catch (error) {
            console.error("Share error:", error);
            setSnackbar({ open: true, message: 'Failed to send.', severity: 'error' });
        }
    };

    const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        setFormData({ ...formData, images: files });
        
        // Create preview URLs
        const urls = files.map(file => URL.createObjectURL(file));
        setPreviewUrls(urls);
    };

    const handleSubmit = async () => {
        if (!formData.title || formData.images.length === 0) return;
        
        setUploading(true);
        try {
            // 1. Upload images to S3
            const imageUrls = [];
            for (const file of formData.images) {
                const url = await uploadFileToS3(file);
                if (url) imageUrls.push(url);
            }

            if (imageUrls.length === 0) throw new Error("Failed to upload images");

            // 2. Create Portfolio Item
            const res = await fetch('/api/v1/portfolio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userID: session.user.userID,
                    userName: session.user.username || "Unknown User",
                    discordId: session.user.discordId,
                    title: formData.title,
                    description: formData.description,
                    imageUrls: imageUrls
                })
            });

            if (res.ok) {
                setOpen(false);
                setFormData({ title: '', description: '', images: [] });
                setPreviewUrls([]);
                fetchItems(); // Refresh list
            }
        } catch (error) {
            console.error("Error creating post:", error);
            alert("Failed to create post. Please try again.");
        } finally {
            setUploading(false);
        }
    };

    const [commentText, setCommentText] = useState({});

    const handleCommentSubmit = async (id) => {
        if (!session || !commentText[id]?.trim()) return;
        
        const text = commentText[id];
        
        // Optimistic update
        const newComment = {
            id: crypto.randomUUID(),
            userID: session.user.userID,
            text,
            createdAt: new Date().toISOString(),
            user: {
                firstName: session.user.firstName,
                lastName: session.user.lastName,
                image: session.user.image
            }
        };

        setItems(prev => prev.map(item => {
            if (item.id === id) {
                return { ...item, comments: [...(item.comments || []), newComment] };
            }
            return item;
        }));
        
        setCommentText(prev => ({ ...prev, [id]: '' }));

        try {
            await fetch('/api/v1/portfolio', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    id, 
                    userID: session.user.userID,
                    action: 'comment',
                    text 
                })
            });
        } catch (error) {
            console.error("Error posting comment:", error);
            fetchItems(); // Revert
        }
    };

    const handleLike = async (id) => {
        if (!session) return;
        
        // Optimistic update
        setItems(prev => prev.map(item => {
            if (item.id === id) {
                const isLiked = item.likes?.includes(session.user.userID);
                const newLikes = isLiked 
                    ? item.likes.filter(uid => uid !== session.user.userID)
                    : [...(item.likes || []), session.user.userID];
                return { ...item, likes: newLikes };
            }
            return item;
        }));

        try {
            await fetch('/api/v1/portfolio', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, userID: session.user.userID })
            });
        } catch (error) {
            console.error("Error liking item:", error);
            fetchItems(); // Revert on error
        }
    };

    return (
        <Container maxWidth={false} disableGutters sx={{ py: { xs: 0, md: 4 } }}>
            <Box sx={{ mb: 6, textAlign: 'center', display: { xs: 'none', md: 'block' } }}>
                <Typography variant="h3" component="h1" gutterBottom fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                    <CollectionsIcon fontSize="large" color="primary" />
                    Maker Showcase
                </Typography>
                <Typography variant="h6" color="text.secondary">
                    See what the community is building!
                </Typography>
            </Box>

            {/* Mobile Sort Toggle */}
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                <ToggleButtonGroup
                    value={sort}
                    exclusive
                    onChange={(e, newSort) => {
                        if (newSort) setSort(newSort);
                    }}
                    aria-label="feed sort"
                    size="small"
                >
                    <ToggleButton value="latest" aria-label="latest">
                        <AccessTimeIcon sx={{ mr: 1 }} /> Latest
                    </ToggleButton>
                    <ToggleButton value="trending" aria-label="trending">
                        <WhatshotIcon sx={{ mr: 1 }} /> Trending
                    </ToggleButton>
                </ToggleButtonGroup>
            </Box>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
                    <CircularProgress />
                </Box>
            ) : (
                <Grid container spacing={0} justifyContent="center">
                    {items.map((item) => (
                        <Grid item xs={12} sm={8} md={6} lg={5} key={item.id} sx={{ mb: { xs: 0, md: 4 } }}>
                            <Card sx={{ 
                                width: { xs: 'calc(100% + 32px)', md: '100%' },
                                mx: { xs: -2, md: 0 },
                                borderRadius: { xs: 0, md: 1 },
                                boxShadow: { xs: 'none', md: 1 },
                                borderBottom: { xs: '1px solid #333', md: 'none' },
                                bgcolor: { xs: 'transparent', md: 'background.paper' },
                                backgroundImage: 'none'
                            }}>
                                {/* Header */}
                                <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <Avatar 
                                            src={item.user.image} 
                                            sx={{ width: 32, height: 32, border: '1px solid #333' }} 
                                        />
                                        <Typography variant="subtitle2" fontWeight="bold" sx={{ fontSize: '0.9rem' }}>
                                            {item.user.firstName} {item.user.lastName}
                                        </Typography>
                                    </Box>
                                    <IconButton size="small">
                                        <MoreHorizIcon />
                                    </IconButton>
                                </Box>

                                {/* Image */}
                                <CardMedia
                                    component="img"
                                    image={item.imageUrls[0]}
                                    alt={item.title}
                                    sx={{ 
                                        width: '100%', 
                                        height: 'auto',
                                        maxHeight: '80vh',
                                        objectFit: 'contain',
                                        cursor: 'pointer',
                                        bgcolor: 'black'
                                    }}
                                    onClick={() => window.open(item.imageUrls[0], '_blank')}
                                />

                                {/* Actions */}
                                <Box sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                                        <IconButton onClick={() => handleLike(item.id)} color={item.likes?.includes(session?.user?.userID) ? "error" : "default"}>
                                            {item.likes?.includes(session?.user?.userID) ? <FavoriteIcon /> : <FavoriteBorderIcon />}
                                        </IconButton>
                                        <IconButton>
                                            <ChatBubbleOutlineIcon />
                                        </IconButton>
                                        <IconButton onClick={() => handleOpenShare(item)} sx={{ transform: 'rotate(-30deg)', mt: -0.5 }}>
                                            <SendIcon />
                                        </IconButton>
                                    </Box>
                                </Box>

                                {/* Likes Count */}
                                <Box sx={{ px: 2, mb: 1 }}>
                                    <Typography variant="subtitle2" fontWeight="bold" sx={{ fontSize: '0.9rem' }}>
                                        {item.likes?.length || 0} likes
                                    </Typography>
                                </Box>

                                {/* Caption */}
                                <Box sx={{ px: 2, mb: 1 }}>
                                    <Typography variant="body2" component="span" fontWeight="bold" sx={{ mr: 1 }}>
                                        {item.user.firstName} {item.user.lastName}
                                    </Typography>
                                    <Typography variant="body2" component="span">
                                        {item.title} - {item.description}
                                    </Typography>
                                </Box>

                                {/* Comments Section */}
                                <Box sx={{ px: 2, pb: 2 }}>
                                    {(item.comments || []).length > 0 && (
                                        <Box sx={{ mb: 1 }}>
                                            {(item.comments || []).length > 2 && (
                                                <Typography variant="body2" color="text.secondary" sx={{ cursor: 'pointer', mb: 0.5, display: 'block' }}>
                                                    View all {(item.comments || []).length} comments
                                                </Typography>
                                            )}
                                            {(item.comments || []).slice(-2).map(comment => (
                                                <Typography key={comment.id} variant="body2" sx={{ mb: 0.5 }}>
                                                    <Box component="span" fontWeight="bold" sx={{ mr: 1 }}>
                                                        {comment.user?.firstName}
                                                    </Box>
                                                    {comment.text}
                                                </Typography>
                                            ))}
                                        </Box>
                                    )}
                                    
                                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2, fontSize: '0.7rem', textTransform: 'uppercase' }}>
                                        {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
                                    </Typography>

                                    {/* Add Comment */}
                                    <Box sx={{ display: 'flex', alignItems: 'center', borderTop: '1px solid #efefef', pt: 1.5 }}>
                                        <TextField 
                                            placeholder="Add a comment..." 
                                            variant="standard" 
                                            fullWidth 
                                            size="small"
                                            value={commentText[item.id] || ''}
                                            onChange={(e) => setCommentText({ ...commentText, [item.id]: e.target.value })}
                                            InputProps={{ disableUnderline: true, style: { fontSize: '0.9rem' } }}
                                        />
                                        {commentText[item.id] && (
                                            <Button 
                                                size="small" 
                                                sx={{ minWidth: 'auto', fontWeight: 'bold' }}
                                                onClick={() => handleCommentSubmit(item.id)}
                                            >
                                                Post
                                            </Button>
                                        )}
                                    </Box>
                                </Box>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            <Fab 
                color="primary" 
                aria-label="add" 
                sx={{ position: 'fixed', bottom: 32, right: 32, display: { xs: 'none', md: 'flex' } }}
                onClick={() => setOpen(true)}
            >
                <AddIcon />
            </Fab>

            {/* Upload Dialog */}
            <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Share Your Project</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Project Title"
                        fullWidth
                        variant="outlined"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        margin="dense"
                        label="Description"
                        fullWidth
                        multiline
                        rows={4}
                        variant="outlined"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        sx={{ mb: 2 }}
                    />
                    
                    <Button
                        variant="outlined"
                        component="label"
                        fullWidth
                        sx={{ mb: 2, height: 100, borderStyle: 'dashed' }}
                    >
                        {previewUrls.length > 0 ? `${previewUrls.length} Image(s) Selected` : "Upload Images"}
                        <input
                            type="file"
                            hidden
                            multiple
                            accept="image/*"
                            onChange={handleFileChange}
                        />
                    </Button>

                    {previewUrls.length > 0 && (
                        <ImageList sx={{ height: 100 }} cols={3} rowHeight={100}>
                            {previewUrls.map((url, index) => (
                                <ImageListItem key={index}>
                                    <img src={url} alt={`Preview ${index}`} loading="lazy" style={{ height: '100%', objectFit: 'cover' }} />
                                </ImageListItem>
                            ))}
                        </ImageList>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={handleSubmit} variant="contained" disabled={uploading}>
                        {uploading ? 'Posting...' : 'Post Project'}
                    </Button>
                </DialogActions>
            </Dialog>
            {/* Share Dialog */}
            <Dialog open={openShare} onClose={handleCloseShare} maxWidth="xs" fullWidth>
                <DialogTitle>Share Project</DialogTitle>
                <DialogContent>
                    <List>
                        <ListItem button onClick={handleCopyLink}>
                            <ListItemAvatar>
                                <Avatar sx={{ bgcolor: 'primary.main' }}>
                                    <ContentCopyIcon />
                                </Avatar>
                            </ListItemAvatar>
                            <ListItemText primary="Copy Link" secondary="Copy link to clipboard" />
                        </ListItem>
                        
                        {typeof navigator !== 'undefined' && navigator.share && (
                            <ListItem button onClick={handleNativeShare}>
                                <ListItemAvatar>
                                    <Avatar sx={{ bgcolor: 'secondary.main' }}>
                                        <ShareIcon />
                                    </Avatar>
                                </ListItemAvatar>
                                <ListItemText primary="Share via..." secondary="Use native share sheet" />
                            </ListItem>
                        )}

                        <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, color: 'text.secondary' }}>
                            Send to Member
                        </Typography>
                        
                        {loadingUsers ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                                <CircularProgress size={24} />
                            </Box>
                        ) : (
                            users.map(user => (
                                <ListItem button key={user.userID} onClick={() => handleShareToUser(user.userID)}>
                                    <ListItemAvatar>
                                        <Avatar src={user.image}>{user.firstName?.[0]}</Avatar>
                                    </ListItemAvatar>
                                    <ListItemText 
                                        primary={`${user.firstName} ${user.lastName}`} 
                                        secondary={user.discordId ? "Discord Connected" : "In-App Only"} 
                                    />
                                </ListItem>
                            ))
                        )}
                    </List>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseShare}>Cancel</Button>
                </DialogActions>
            </Dialog>

            <Snackbar 
                open={snackbar.open} 
                autoHideDuration={3000} 
                onClose={() => setSnackbar({ ...snackbar, open: false })}
            >
                <Alert severity={snackbar.severity} sx={{ width: '100%' }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Container>
    );
}
