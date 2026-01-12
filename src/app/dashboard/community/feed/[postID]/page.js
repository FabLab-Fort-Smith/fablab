"use client";
import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Grid, Card, CardMedia, 
    Container, Button, TextField, Dialog, DialogTitle, 
    DialogContent, DialogActions, IconButton, Avatar, 
    CircularProgress, Alert, MobileStepper, List, ListItem, 
    ListItemAvatar, ListItemText, Snackbar, Chip, Menu, MenuItem
} from '@mui/material';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import SendIcon from '@mui/icons-material/Send';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import ShareIcon from '@mui/icons-material/Share';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import StarIcon from '@mui/icons-material/Star';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';

const ImageCarousel = ({ images, alt }) => {
    const [activeStep, setActiveStep] = useState(0);
    const maxSteps = images?.length || 0;

    if (!images || images.length === 0) return null;

    const handleNext = (e) => {
        e.stopPropagation();
        setActiveStep((prevStep) => prevStep + 1);
    };

    const handleBack = (e) => {
        e.stopPropagation();
        setActiveStep((prevStep) => prevStep - 1);
    };

    return (
        <Box sx={{ position: 'relative', width: '100%', bgcolor: 'black' }}>
            <CardMedia
                component="img"
                image={images[activeStep]}
                alt={alt}
                sx={{ 
                    width: '100%', 
                    height: 'auto',
                    maxHeight: '80vh',
                    objectFit: 'contain',
                    cursor: 'default'
                }}
            />
            {maxSteps > 1 && (
                <>
                    <IconButton
                        size="small"
                        onClick={handleBack}
                        disabled={activeStep === 0}
                        sx={{
                            position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                            bgcolor: 'rgba(0,0,0,0.5)', color: 'white',
                            '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
                            '&.Mui-disabled': { display: 'none' }
                        }}
                    >
                        <ChevronLeftIcon />
                    </IconButton>
                    <IconButton
                        size="small"
                        onClick={handleNext}
                        disabled={activeStep === maxSteps - 1}
                        sx={{
                            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                            bgcolor: 'rgba(0,0,0,0.5)', color: 'white',
                            '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
                            '&.Mui-disabled': { display: 'none' }
                        }}
                    >
                        <ChevronRightIcon />
                    </IconButton>
                    <MobileStepper
                        steps={maxSteps}
                        position="static"
                        activeStep={activeStep}
                        sx={{
                            maxWidth: 400, flexGrow: 1, bgcolor: 'transparent',
                            position: 'absolute', bottom: 0, width: '100%', justifyContent: 'center',
                            '.MuiMobileStepper-dot': { bgcolor: 'rgba(255,255,255,0.5)' },
                            '.MuiMobileStepper-dotActive': { bgcolor: 'white' }
                        }}
                        nextButton={null}
                        backButton={null}
                    />
                </>
            )}
        </Box>
    );
};

export default function PostPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const params = useParams();
    const { postID } = params;

    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [commentText, setCommentText] = useState('');
    
    // Share State
    const [openShare, setOpenShare] = useState(false);
    const [users, setUsers] = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

    // Tip State
    const [tipDialogOpen, setTipDialogOpen] = useState(false);
    const [tipAmount, setTipAmount] = useState(10);
    const [tipLoading, setTipLoading] = useState(false);
    const [tipRecipient, setTipRecipient] = useState(null);

    // Menu State
    const [menuAnchorEl, setMenuAnchorEl] = useState(null);

    useEffect(() => {
        if (postID) fetchPost();
    }, [postID]);

    const fetchPost = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/portfolio?id=${postID}`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    setItem(data[0]);
                } else {
                    setItem(null); // Not found
                }
            }
        } catch (error) {
            console.error("Failed to fetch post:", error);
        } finally {
            setLoading(false);
        }
    };

    // Actions
    const handleLike = async () => {
        if (!session || !item) return;
        const id = item.id;
        const isLiked = item.likes?.includes(session.user.userID);
        
        // Optimistic
        const newLikes = isLiked 
            ? item.likes.filter(uid => uid !== session.user.userID)
            : [...(item.likes || []), session.user.userID];
            
        setItem(prev => ({ ...prev, likes: newLikes }));

        try {
            await fetch(`/api/v1/portfolio`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, userID: session.user.userID })
            });
        } catch (error) {
            console.error("Error liking item:", error);
            fetchPost();
        }
    };

    const handleCommentSubmit = async () => {
        if (!session || !commentText.trim() || !item) return;
        const id = item.id;
        const text = commentText;

        // Optimistic
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

        setItem(prev => ({ ...prev, comments: [...(prev.comments || []), newComment] }));
        setCommentText('');

        try {
            await fetch(`/api/v1/portfolio?action=comment`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, userID: session.user.userID, action: 'comment', text })
            });
        } catch (error) {
            console.error("Error posting comment:", error);
            fetchPost();
        }
    };

    // Share/Tip/Menu
    const handleOpenShare = () => {
        setOpenShare(true);
        fetchUsers();
    };

    const handleCloseShare = () => setOpenShare(false);

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
        const url = `${window.location.origin}/dashboard/community/feed/${item.id}`;
        navigator.clipboard.writeText(url);
        setSnackbar({ open: true, message: 'Link copied!', severity: 'success' });
        handleCloseShare();
    };

    const handleNativeShare = async () => {
        if (navigator.share && item) {
            try {
                await navigator.share({
                    title: item.title,
                    text: `Check this out: ${item.title}`,
                    url: `${window.location.origin}/dashboard/community/feed/${item.id}`
                });
                handleCloseShare();
            } catch (error) {
                console.error('Error sharing:', error);
            }
        }
    };
    
    const handleShareToUser = async (recipientID) => {
        try {
            const res = await fetch('/api/v1/portfolio', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: item.id, action: 'share', senderID: session.user.userID, recipientID })
            });
            if (res.ok) {
                setSnackbar({ open: true, message: 'Sent!', severity: 'success' });
                handleCloseShare();
            }
        } catch (error) {
            setSnackbar({ open: true, message: 'Failed to send.', severity: 'error' });
        }
    };

    const handleOpenTip = () => {
        setTipRecipient(item.creator);
        setTipDialogOpen(true);
    };

    const handleTip = async () => {
        if (!tipRecipient) return;
        setTipLoading(true);
        try {
            const res = await fetch('/api/v1/transactions/tip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ receiverId: tipRecipient.userID, amount: parseInt(tipAmount) })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setSnackbar({ open: true, message: `Sent ${tipAmount} stake!`, severity: 'success' });
            setTipDialogOpen(false);
        } catch (err) {
            setSnackbar({ open: true, message: err.message, severity: 'error' });
        } finally {
            setTipLoading(false);
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
    if (!item) return <Box sx={{ p: 4, textAlign: 'center' }}><Typography>Post not found</Typography><Button onClick={() => router.push('/dashboard/community/feed')}>Back to Feed</Button></Box>;

    const creator = item.creator || {};

    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Button startIcon={<ArrowBackIcon />} onClick={() => router.push('/dashboard/community/feed')} sx={{ mb: 2 }}>
                Back to Feed
            </Button>
            
            <Card sx={{ width: '100%', borderRadius: 2, boxShadow: 3 }}>
                {/* Header */}
                <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Avatar src={creator.image} sx={{ width: 40, height: 40, border: '1px solid #333' }} />
                        <Box>
                            <Typography variant="subtitle1" fontWeight="bold">
                                {creator.firstName} {creator.lastName}
                            </Typography>
                            <Typography variant="caption" color="secondary.main" fontWeight="bold">
                                SHARED A PROJECT
                            </Typography>
                        </Box>
                    </Box>
                    <IconButton onClick={(e) => setMenuAnchorEl(e.currentTarget)}>
                        <MoreHorizIcon />
                    </IconButton>
                </Box>

                {/* Content */}
                <ImageCarousel images={item.imageUrls} alt={item.title} />

                {/* Actions */}
                <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <IconButton onClick={handleLike} color={item.likes?.includes(session?.user?.userID) ? "error" : "default"}>
                            {item.likes?.includes(session?.user?.userID) ? <FavoriteIcon /> : <FavoriteBorderIcon />}
                        </IconButton>
                        <IconButton>
                            <ChatBubbleOutlineIcon />
                        </IconButton>
                        <IconButton onClick={handleOpenShare} sx={{ transform: 'rotate(-30deg)', mt: -0.5 }}>
                            <SendIcon />
                        </IconButton>
                        <IconButton onClick={handleOpenTip} color="primary">
                            <StarIcon />
                        </IconButton>
                    </Box>
                    <Chip label="Project Showcase" size="small" variant="outlined" />
                </Box>

                {/* Details */}
                <Box sx={{ px: 2, mb: 2 }}>
                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                        {item.likes?.length || 0} likes
                    </Typography>
                    <Typography variant="body1">
                        <Box component="span" fontWeight="bold" sx={{ mr: 1 }}>
                            {creator.firstName} {creator.lastName}
                        </Box>
                        {item.title} - {item.description}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                        {new Date(item.createdAt).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </Typography>
                </Box>

                {/* Comments Section - Full */}
                <Box sx={{ px: 2, pb: 3 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>Comments ({item.comments?.length || 0})</Typography>
                    
                    <List disablePadding>
                        {(item.comments || []).map(comment => (
                            <ListItem key={comment.id} alignItems="flex-start" sx={{ px: 0 }}>
                                <ListItemAvatar>
                                    <Avatar src={comment.user?.image} sx={{ width: 32, height: 32 }}>{comment.user?.firstName?.[0]}</Avatar>
                                </ListItemAvatar>
                                <ListItemText 
                                    primary={
                                        <Typography variant="subtitle2" component="span" fontWeight="bold">
                                            {comment.user?.firstName} {comment.user?.lastName}
                                        </Typography>
                                    }
                                    secondary={
                                        <>
                                            <Typography variant="body2" component="span" color="text.primary" display="block">
                                                {comment.text}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {new Date(comment.createdAt).toLocaleDateString()}
                                            </Typography>
                                        </>
                                    }
                                />
                            </ListItem>
                        ))}
                    </List>

                    {/* Add Comment */}
                    <Box sx={{ display: 'flex', alignItems: 'center', mt: 2, gap: 1 }}>
                        <TextField 
                            placeholder="Add a comment..." 
                            variant="outlined" 
                            fullWidth 
                            size="small"
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            multiline
                            maxRows={4}
                        />
                        <Button 
                            variant="contained" 
                            disabled={!commentText.trim()}
                            onClick={handleCommentSubmit}
                        >
                            Post
                        </Button>
                    </Box>
                </Box>
            </Card>

            {/* Reuse User Share Dialog & Tip Dialog via Copy/Paste or extraction. 
                For brevity in this turn, I'm including simple implementations inline or skipping complex reiterations if possible.
                I included Share Dialog state/logic above, need to include the Dialog JSX.
            */}
             <Dialog open={openShare} onClose={handleCloseShare} maxWidth="xs" fullWidth>
                <DialogTitle>Share Project</DialogTitle>
                <DialogContent>
                    <List>
                        <ListItem button onClick={handleCopyLink}>
                            <ListItemAvatar><Avatar sx={{ bgcolor: 'primary.main' }}><ContentCopyIcon /></Avatar></ListItemAvatar>
                            <ListItemText primary="Copy Link" />
                        </ListItem>
                        {typeof navigator !== 'undefined' && navigator.share && (
                            <ListItem button onClick={handleNativeShare}>
                                <ListItemAvatar><Avatar sx={{ bgcolor: 'secondary.main' }}><ShareIcon /></Avatar></ListItemAvatar>
                                <ListItemText primary="Share via..." />
                            </ListItem>
                        )}
                        <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, color: 'text.secondary' }}>Send to Member</Typography>
                        {loadingUsers ? <CircularProgress /> : users.map(user => (
                            <ListItem button key={user.userID} onClick={() => handleShareToUser(user.userID)}>
                                <ListItemAvatar><Avatar src={user.image}>{user.firstName?.[0]}</Avatar></ListItemAvatar>
                                <ListItemText primary={`${user.firstName} ${user.lastName}`} secondary={user.discordId ? "Discord" : "App"} />
                            </ListItem>
                        ))}
                    </List>
                </DialogContent>
                <DialogActions><Button onClick={handleCloseShare}>Cancel</Button></DialogActions>
            </Dialog>

             <Dialog open={tipDialogOpen} onClose={() => setTipDialogOpen(false)}>
                <DialogTitle>Tip Stake to {tipRecipient?.username}</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus margin="dense" label="Stake Amount" type="number" fullWidth
                        value={tipAmount} onChange={(e) => setTipAmount(e.target.value)}
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
                        <Button onClick={() => setTipDialogOpen(false)}>Cancel</Button>
                        <Button variant="contained" onClick={handleTip} disabled={tipLoading}>Send</Button>
                    </Box>
                </DialogContent>
            </Dialog>

            <Menu
                anchorEl={menuAnchorEl}
                open={Boolean(menuAnchorEl)}
                onClose={() => setMenuAnchorEl(null)}
            >
                <MenuItem onClick={handleCopyLink}>Copy Link</MenuItem>
            </Menu>

            <Snackbar 
                open={snackbar.open} 
                autoHideDuration={3000} 
                onClose={() => setSnackbar({ ...snackbar, open: false })}
            >
                <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
            </Snackbar>
        </Container>
    );
}