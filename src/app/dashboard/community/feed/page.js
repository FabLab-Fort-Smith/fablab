"use client";
import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Grid, Card, CardMedia, 
    Container, Button, TextField, Dialog, DialogTitle, 
    DialogContent, DialogActions, IconButton, Avatar, 
    CircularProgress, Alert, Fab, ImageList, ImageListItem,
    ToggleButton, ToggleButtonGroup, List, ListItem, 
    ListItemAvatar, ListItemText, Snackbar, Chip, Menu, MenuItem
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import SendIcon from '@mui/icons-material/Send';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ShareIcon from '@mui/icons-material/Share';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import AccessAlarmIcon from '@mui/icons-material/AccessAlarm';
import StarIcon from '@mui/icons-material/Star';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import MobileStepper from '@mui/material/MobileStepper';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

const ImageCarousel = ({ images, alt, onClick }) => {
    const [activeStep, setActiveStep] = useState(0);
    const [touchStart, setTouchStart] = useState(null);
    const [touchEnd, setTouchEnd] = useState(null);
    const maxSteps = images?.length || 0;

    if (!images || images.length === 0) return null;

    const minSwipeDistance = 50;

    const onTouchStart = (e) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;
        
        if (isLeftSwipe && activeStep < maxSteps - 1) {
            setActiveStep(prev => prev + 1);
        }
        if (isRightSwipe && activeStep > 0) {
            setActiveStep(prev => prev - 1);
        }
    };

    const handleNext = (e) => {
        e.stopPropagation();
        setActiveStep((prevStep) => prevStep + 1);
    };

    const handleBack = (e) => {
        e.stopPropagation();
        setActiveStep((prevStep) => prevStep - 1);
    };

    return (
        <Box 
            sx={{ position: 'relative', width: '100%', bgcolor: 'black' }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            <CardMedia
                component="img"
                image={images[activeStep]}
                alt={alt}
                sx={{ 
                    width: '100%', 
                    height: 'auto',
                    maxHeight: '80vh',
                    objectFit: 'contain',
                    cursor: 'pointer'
                }}
                onClick={onClick}
            />
            {maxSteps > 1 && (
                <>
                    <IconButton
                        size="small"
                        onClick={handleBack}
                        disabled={activeStep === 0}
                        sx={{
                            display: { xs: 'none', md: 'flex' },
                            position: 'absolute',
                            left: 8,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            bgcolor: 'rgba(0,0,0,0.5)',
                            color: 'white',
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
                            display: { xs: 'none', md: 'flex' },
                            position: 'absolute',
                            right: 8,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            bgcolor: 'rgba(0,0,0,0.5)',
                            color: 'white',
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
                            maxWidth: 400,
                            flexGrow: 1,
                            bgcolor: 'transparent',
                            position: 'absolute',
                            bottom: 0,
                            width: '100%',
                            justifyContent: 'center',
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

export default function FeedPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const searchParams = useSearchParams();
    
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sort, setSort] = useState('latest');
    const [commentText, setCommentText] = useState({});

    // Share State
    const [openShare, setOpenShare] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
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
    const [menuTargetItem, setMenuTargetItem] = useState(null);

    useEffect(() => {
        fetchFeed();
    }, [sort]);

    // Handle Highlight
    useEffect(() => {
        const highlight = searchParams.get('highlight');
        if (highlight && items.length > 0 && !loading) {
            setTimeout(() => {
                const element = document.getElementById(`feed-item-${highlight}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    element.style.transition = 'box-shadow 0.5s';
                    element.style.boxShadow = '0 0 20px #00ff00';
                    setTimeout(() => {
                        element.style.boxShadow = 'none';
                    }, 3000);
                }
            }, 500);
        }
    }, [items, loading, searchParams]);

    const fetchFeed = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/feed?limit=20&sort=${sort}`);
            if (res.ok) {
                const data = await res.json();
                setItems(data);
            }
        } catch (error) {
            console.error("Failed to fetch feed:", error);
        } finally {
            setLoading(false);
        }
    };

    // --- Actions ---

    const handleLike = async (item) => {
        if (!session) return;
        const id = item.type === 'bounty' ? item.bountyID : item.id;
        const endpoint = item.type === 'bounty' ? '/api/v1/bounties' : '/api/v1/portfolio';
        const queryParam = item.type === 'bounty' ? `?bountyID=${id}&action=like` : '';
        const body = item.type === 'bounty' ? { userID: session.user.userID } : { id, userID: session.user.userID };

        // Optimistic Update
        setItems(prev => prev.map(i => {
            if ((i.type === 'bounty' && i.bountyID === id) || (i.type === 'showcase' && i.id === id)) {
                const isLiked = i.likes?.includes(session.user.userID);
                const newLikes = isLiked 
                    ? i.likes.filter(uid => uid !== session.user.userID)
                    : [...(i.likes || []), session.user.userID];
                return { ...i, likes: newLikes };
            }
            return i;
        }));

        try {
            await fetch(`${endpoint}${queryParam}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
        } catch (error) {
            console.error("Error liking item:", error);
            fetchFeed(); // Revert
        }
    };

    const handleCommentSubmit = async (item) => {
        const id = item.type === 'bounty' ? item.bountyID : item.id;
        if (!session || !commentText[id]?.trim()) return;
        
        const text = commentText[id];
        const endpoint = item.type === 'bounty' ? '/api/v1/bounties' : '/api/v1/portfolio';
        const queryParam = item.type === 'bounty' ? `?bountyID=${id}&action=comment` : '';
        const body = item.type === 'bounty' 
            ? { userID: session.user.userID, text } 
            : { id, userID: session.user.userID, action: 'comment', text };

        // Optimistic Update
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

        setItems(prev => prev.map(i => {
            if ((i.type === 'bounty' && i.bountyID === id) || (i.type === 'showcase' && i.id === id)) {
                return { ...i, comments: [...(i.comments || []), newComment] };
            }
            return i;
        }));
        
        setCommentText(prev => ({ ...prev, [id]: '' }));

        try {
            await fetch(`${endpoint}${queryParam}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
        } catch (error) {
            console.error("Error posting comment:", error);
            fetchFeed(); // Revert
        }
    };

    // --- Share Logic ---

    const handleOpenShare = (item) => {
        setSelectedItem(item);
        setOpenShare(true);
        fetchUsers();
    };

    const handleCloseShare = () => {
        setOpenShare(false);
        setSelectedItem(null);
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
        const id = selectedItem.type === 'bounty' ? selectedItem.bountyID : selectedItem.id;
        const isBounty = selectedItem.type === 'bounty';
        
        const url = isBounty 
            ? `${window.location.origin}/dashboard/activities/bounties/${id}`
            : `${window.location.origin}/dashboard/community/feed/${id}`;

        navigator.clipboard.writeText(url);
        setSnackbar({ open: true, message: 'Link copied to clipboard!', severity: 'success' });
        handleCloseShare();
    };

    const handleNativeShare = async () => {
        if (navigator.share && selectedItem) {
            const id = selectedItem.type === 'bounty' ? selectedItem.bountyID : selectedItem.id;
            const isBounty = selectedItem.type === 'bounty';
            const url = isBounty 
                ? `${window.location.origin}/dashboard/activities/bounties/${id}`
                : `${window.location.origin}/dashboard/community/feed/${id}`;

            try {
                await navigator.share({
                    title: selectedItem.title,
                    text: `Check this out: ${selectedItem.title}`,
                    url
                });
                handleCloseShare();
            } catch (error) {
                console.error('Error sharing:', error);
            }
        }
    };

    const handleShareToUser = async (recipientID) => {
        try {
            const id = selectedItem.type === 'bounty' ? selectedItem.bountyID : selectedItem.id;
            const endpoint = selectedItem.type === 'bounty' ? '/api/v1/bounties' : '/api/v1/portfolio';
            const body = selectedItem.type === 'bounty' 
                ? { bountyID: id, action: 'share', senderID: session.user.userID, recipientID }
                : { id, action: 'share', senderID: session.user.userID, recipientID };

            const res = await fetch(endpoint, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
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

    const handleOpenTip = (item) => {
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
            
            setSnackbar({ open: true, message: `Successfully tipped ${tipAmount} stake to ${tipRecipient.username}!`, severity: 'success' });
            setTipDialogOpen(false);
        } catch (err) {
            setSnackbar({ open: true, message: err.message, severity: 'error' });
        } finally {
            setTipLoading(false);
        }
    };

    const handleMenuOpen = (event, item) => {
        setMenuAnchorEl(event.currentTarget);
        setMenuTargetItem(item);
    };

    const handleMenuClose = () => {
        setMenuAnchorEl(null);
        setMenuTargetItem(null);
    };

    const handleViewDetails = () => {
        if (!menuTargetItem) return;
        const isBounty = menuTargetItem.type === 'bounty';
        const id = isBounty ? menuTargetItem.bountyID : menuTargetItem.id;
        
        if (isBounty) {
            router.push(`/dashboard/activities/bounties/${id}`);
        } else {
            // Navigate to dedicated post page
            router.push(`/dashboard/community/feed/${id}`);
        }
        handleMenuClose();
    };

    const handleMenuCopyLink = () => {
         if (!menuTargetItem) return;
         const isBounty = menuTargetItem.type === 'bounty';
         const id = isBounty ? menuTargetItem.bountyID : menuTargetItem.id;
         const url = isBounty 
            ? `${window.location.origin}/dashboard/activities/bounties/${id}`
            : `${window.location.origin}/dashboard/community/feed/${id}`; // Link to detail page
            
         navigator.clipboard.writeText(url);
         setSnackbar({ open: true, message: 'Link copied to clipboard!', severity: 'success' });
         handleMenuClose();
    };

    return (
        <Container maxWidth={false} disableGutters sx={{ py: { xs: 0, md: 4 } }}>
            <Box sx={{ mb: 4, textAlign: 'center', display: { xs: 'none', md: 'block' } }}>
                <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
                    The Lab Feed
                </Typography>
                <Typography variant="h6" color="text.secondary">
                    See what's happening in the community
                </Typography>
            </Box>

            {/* Mobile Sort Toggle */}
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                <ToggleButtonGroup
                    value={sort}
                    exclusive
                    onChange={(e, newSort) => { if (newSort) setSort(newSort); }}
                    aria-label="feed sort"
                    size="small"
                >
                    <ToggleButton value="latest"><AccessTimeIcon sx={{ mr: 1 }} /> Latest</ToggleButton>
                    <ToggleButton value="trending"><WhatshotIcon sx={{ mr: 1 }} /> Trending</ToggleButton>
                </ToggleButtonGroup>
            </Box>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
            ) : (
                <Grid container spacing={0} justifyContent="center">
                    {items.map((item) => {
                        const isBounty = item.type === 'bounty';
                        const id = isBounty ? item.bountyID : item.id;
                        const creator = item.creator || {};
                        
                        return (
                            <Grid item xs={12} sm={10} md={9} lg={8} xl={7} key={`${item.type}-${id}`} sx={{ mb: { xs: 0, md: 4 } }}>
                                <Card id={`feed-item-${id}`} sx={{ 
                                    width: '100%',
                                    mx: 'auto',
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
                                                src={creator.image} 
                                                sx={{ width: 32, height: 32, border: '1px solid #333' }} 
                                            />
                                            <Box>
                                                <Typography variant="subtitle2" fontWeight="bold" sx={{ fontSize: '0.9rem' }}>
                                                    {creator.firstName} {creator.lastName}
                                                </Typography>
                                                {isBounty && (
                                                    <Typography variant="caption" color="primary.main" sx={{ fontWeight: 'bold' }}>
                                                        POSTED A BOUNTY
                                                    </Typography>
                                                )}
                                                {!isBounty && (
                                                    <Typography variant="caption" color="secondary.main" sx={{ fontWeight: 'bold' }}>
                                                        SHARED A PROJECT
                                                    </Typography>
                                                )}
                                            </Box>
                                        </Box>
                                        <IconButton size="small" onClick={(e) => handleMenuOpen(e, item)}>
                                            <MoreHorizIcon />
                                        </IconButton>
                                    </Box>

                                    {/* Content */}
                                    {isBounty ? (
                                        // BOUNTY CARD CONTENT
                                        <Box 
                                            sx={{ 
                                                width: '100%', 
                                                aspectRatio: '16/9', 
                                                bgcolor: 'rgba(0, 255, 0, 0.05)', 
                                                border: '1px dashed #00ff00',
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                p: 2,
                                                position: 'relative'
                                            }}
                                            onClick={() => router.push(`/dashboard/bounties/${id}`)}
                                        >
                                            <Typography variant="h5" fontWeight="bold" align="center" color="primary" sx={{ wordBreak: 'break-word', zIndex: 1 }}>
                                                {item.title}
                                            </Typography>
                                            <Chip 
                                                label={`${item.rewardValue} ${item.rewardType}`} 
                                                color="success" 
                                                size="small" 
                                                sx={{ position: 'absolute', bottom: 16, right: 16 }}
                                            />
                                        </Box>
                                    ) : (
                                        // SHOWCASE CARD CONTENT
                                        <ImageCarousel 
                                            images={item.imageUrls} 
                                            alt={item.title} 
                                            onClick={() => router.push(`/dashboard/community/feed/${id}`)}
                                        />
                                    )}

                                    {/* Actions */}
                                    <Box sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                                            <IconButton onClick={() => handleLike(item)} color={item.likes?.includes(session?.user?.userID) ? "error" : "default"}>
                                                {item.likes?.includes(session?.user?.userID) ? <FavoriteIcon /> : <FavoriteBorderIcon />}
                                            </IconButton>
                                            <IconButton>
                                                <ChatBubbleOutlineIcon />
                                            </IconButton>
                                            <IconButton onClick={() => handleOpenShare(item)} sx={{ transform: 'rotate(-30deg)', mt: -0.5 }}>
                                                <SendIcon />
                                            </IconButton>
                                            <IconButton onClick={() => handleOpenTip(item)} color="primary">
                                                <StarIcon />
                                            </IconButton>
                                        </Box>
                                        {isBounty && (
                                            <Chip 
                                                icon={item.rewardType === 'cash' ? <MonetizationOnIcon /> : <AccessAlarmIcon />} 
                                                label={`${item.rewardValue} ${item.rewardType}`} 
                                                color="success" 
                                                variant="outlined" 
                                                size="small"
                                            />
                                        )}
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
                                            {creator.firstName} {creator.lastName}
                                        </Typography>
                                        <Typography variant="body2" component="span">
                                            {isBounty ? item.description : `${item.title} - ${item.description}`}
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
                                        <Box sx={{ display: 'flex', alignItems: 'center', borderTop: '1px solid #333', pt: 1.5 }}>
                                            <TextField 
                                                placeholder="Add a comment..." 
                                                variant="standard" 
                                                fullWidth 
                                                size="small"
                                                value={commentText[id] || ''}
                                                onChange={(e) => setCommentText({ ...commentText, [id]: e.target.value })}
                                                InputProps={{ disableUnderline: true, style: { fontSize: '0.9rem' } }}
                                            />
                                            {commentText[id] && (
                                                <Button 
                                                    size="small" 
                                                    sx={{ minWidth: 'auto', fontWeight: 'bold' }}
                                                    onClick={() => handleCommentSubmit(item)}
                                                >
                                                    Post
                                                </Button>
                                            )}
                                        </Box>
                                    </Box>
                                </Card>
                            </Grid>
                        );
                    })}
                </Grid>
            )}

            {/* Share Dialog */}
            <Dialog open={openShare} onClose={handleCloseShare} maxWidth="xs" fullWidth>
                <DialogTitle>Share {selectedItem?.type === 'bounty' ? 'Bounty' : 'Project'}</DialogTitle>
                <DialogContent>
                    <List>
                        <ListItem button onClick={handleCopyLink}>
                            <ListItemAvatar>
                                <Avatar sx={{ bgcolor: 'primary.main' }}><ContentCopyIcon /></Avatar>
                            </ListItemAvatar>
                            <ListItemText primary="Copy Link" secondary="Copy link to clipboard" />
                        </ListItem>
                        
                        {typeof navigator !== 'undefined' && navigator.share && (
                            <ListItem button onClick={handleNativeShare}>
                                <ListItemAvatar>
                                    <Avatar sx={{ bgcolor: 'secondary.main' }}><ShareIcon /></Avatar>
                                </ListItemAvatar>
                                <ListItemText primary="Share via..." secondary="Use native share sheet" />
                            </ListItem>
                        )}

                        <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, color: 'text.secondary' }}>
                            Send to Member
                        </Typography>
                        
                        {loadingUsers ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress size={24} /></Box>
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

            {/* Tip Dialog */}
            <Dialog open={tipDialogOpen} onClose={() => setTipDialogOpen(false)}>
                <DialogTitle>Tip Stake to {tipRecipient?.username}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        Send some of your stake to show appreciation!
                    </Typography>
                    <TextField
                        autoFocus
                        margin="dense"
                        id="amount"
                        label="Stake Amount"
                        type="number"
                        fullWidth
                        variant="outlined"
                        value={tipAmount}
                        onChange={(e) => setTipAmount(e.target.value)}
                        InputProps={{ inputProps: { min: 1 } }}
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
                        <Button onClick={() => setTipDialogOpen(false)}>Cancel</Button>
                        <Button 
                            variant="contained" 
                            onClick={handleTip} 
                            disabled={tipLoading || !tipAmount || parseInt(tipAmount) <= 0}
                        >
                            {tipLoading ? "Sending..." : `Send ${tipAmount || 0} Stake`}
                        </Button>
                    </Box>
                </DialogContent>
            </Dialog>

            {/* Context Menu */}
            <Menu
                anchorEl={menuAnchorEl}
                open={Boolean(menuAnchorEl)}
                onClose={handleMenuClose}
                MenuListProps={{ 'aria-labelledby': 'basic-button' }}
            >
                <MenuItem onClick={handleViewDetails}>View Post</MenuItem>
                <MenuItem onClick={handleMenuCopyLink}>Copy Link</MenuItem>
            </Menu>

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
