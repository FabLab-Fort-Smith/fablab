"use client";
import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Avatar, Grid, Chip, Paper, IconButton, 
    Divider, Container, CircularProgress, Alert, Button, Snackbar,
    ImageList, ImageListItem, Card, CardContent, CardMedia, Tabs, Tab,
    Dialog, DialogContent, DialogTitle
} from '@mui/material';
import { FaDiscord } from 'react-icons/fa';
import GitHubIcon from '@mui/icons-material/GitHub';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import TwitterIcon from '@mui/icons-material/Twitter';
import LanguageIcon from '@mui/icons-material/Language';
import InstagramIcon from '@mui/icons-material/Instagram';
import EmailIcon from '@mui/icons-material/Email';
import StarIcon from '@mui/icons-material/Star';
import CollectionsIcon from '@mui/icons-material/Collections';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CloseIcon from '@mui/icons-material/Close';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import Constants from '@/lib/constants';

export default function PublicProfilePage() {
    const { slug } = useParams();
    const { data: session } = useSession();
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [showcaseItems, setShowcaseItems] = useState([]);
    const [bounties, setBounties] = useState([]);
    const [tabValue, setTabValue] = useState(0);
    const [selectedShowcaseItem, setSelectedShowcaseItem] = useState(null);
    const [badges, setBadges] = useState({});

    useEffect(() => {
        // Fetch Badges
        fetch('/api/v1/badges')
            .then(res => res.json())
            .then(data => {
                const badgeMap = {};
                (data.badges || []).forEach(b => badgeMap[b.id] = b);
                setBadges(badgeMap);
            })
            .catch(err => console.error("Failed to fetch badges", err));
    }, []);

    // Helper to get badge details
    const getBadgeDetails = (badgeId) => {
        return badges[badgeId] || null;
    };

    const handleDiscordClick = () => {
        if (user.discordId) {
            window.open(`https://discord.com/users/${user.discordId}`, '_blank');
        } else if (user.discordHandle) {
            navigator.clipboard.writeText(user.discordHandle);
            setSnackbarOpen(true);
        }
    };

    useEffect(() => {
        const fetchUser = async () => {
            try {
                // Try fetching by username first
                let res = await fetch(`/api/v1/users?username=${slug}`);
                
                // If not found, try fetching by userID (backward compatibility)
                if (!res.ok && res.status === 404) {
                    res = await fetch(`/api/v1/users?userID=${slug}`);
                }

                if (res.ok) {
                    const data = await res.json();
                    const userProfile = data.user;
                    
                    if (!userProfile) {
                        setError("User not found.");
                        return;
                    }

                    // Check if profile is public or if viewer is admin/self
                    const isSelf = session?.user?.userID === userProfile.userID;
                    const isAdmin = session?.user?.role === 'admin';
                    const isActiveMember = ['active', 'probation'].includes(userProfile.membership?.status) || userProfile.membership?.isWaived === true;
                    
                    if ((userProfile.isPublic !== false && isActiveMember) || isSelf || isAdmin) {
                        setUser(userProfile);
                        
                        // Fetch Showcase Items
                        fetch(`/api/v1/portfolio?userID=${userProfile.userID}`)
                            .then(res => res.json())
                            .then(data => setShowcaseItems(data))
                            .catch(err => console.error("Failed to fetch showcase items", err));

                        // Fetch Bounties (Created by user)
                        // Note: We might want to show bounties assigned to them too, but let's start with created
                        // Since the API supports filtering by any field, we can do this.
                        // However, the current API implementation for getAllBounties takes a filter object in the Service/Model,
                        // but the Controller might not expose all filters.
                        // Let's check the controller.
                        // The controller for bounties doesn't seem to support arbitrary filters via query params yet.
                        // It supports 'status'.
                        // I might need to update BountyController to support userID/creatorID filter.
                        // For now, let's try fetching all and filtering client side if the list isn't huge, 
                        // OR better, update the controller.
                        // I'll assume I updated the controller or will update it.
                        // Actually, I haven't updated BountyController yet.
                        // Let's fetch all and filter for now to be safe, or update the controller.
                        // Updating the controller is better.
                        fetch(`/api/v1/bounties?creatorID=${userProfile.userID}`)
                            .then(res => res.json())
                            .then(data => {
                                // If the API ignores creatorID, we get all. Filter client side just in case.
                                const userBounties = (data.bounties || []).filter(b => b.creatorID === userProfile.userID);
                                setBounties(userBounties);
                            })
                            .catch(err => console.error("Failed to fetch bounties", err));

                    } else {
                        setError("This profile is private or unavailable.");
                    }
                } else {
                    setError("User not found.");
                }
            } catch (err) {
                console.error(err);
                setError("Failed to load profile.");
            } finally {
                setLoading(false);
            }
        };

        if (slug) fetchUser();
    }, [slug, session]);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>;
    if (error) return <Container maxWidth="md" sx={{ mt: 4 }}><Alert severity="error">{error}</Alert></Container>;
    if (!user) return null;

    const SocialLink = ({ icon, url }) => {
        if (!url) return null;
        // Ensure URL has protocol
        const href = url.startsWith('http') ? url : `https://${url}`;
        return (
            <IconButton component="a" href={href} target="_blank" color="primary">
                {icon}
            </IconButton>
        );
    };

    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Paper sx={{ p: 4, borderRadius: 2 }}>
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: 'center', gap: 4 }}>
                    <Avatar 
                        src={user.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || user.firstName)}&background=random`} 
                        sx={{ width: 150, height: 150, border: '4px solid #4caf50' }}
                    />
                    <Box sx={{ flex: 1, textAlign: { xs: 'center', md: 'left' } }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: { xs: 'center', md: 'flex-start' }, flexWrap: 'wrap' }}>
                            <Typography variant="h4" fontWeight="bold">
                                {user.username || `${user.firstName} ${user.lastName}`}
                            </Typography>
                            {user.role === 'admin' && user.boardPosition && (
                                <Chip 
                                    label={user.boardPosition} 
                                    color="secondary" 
                                    size="small" 
                                    sx={{ fontWeight: 'bold' }}
                                />
                            )}
                            <Chip 
                                icon={<StarIcon />} 
                                label={`${user.stake || 0} Stake`} 
                                color="warning" 
                                size="small" 
                                variant="outlined"
                            />
                            {!user.isPublic && (
                                <Chip 
                                    label="Private View" 
                                    color="error" 
                                    size="small" 
                                    variant="outlined"
                                    title="Visible only to you and admins"
                                />
                            )}
                        </Box>
                        
                        <Typography variant="subtitle1" color="text.secondary" gutterBottom>
                            {user.role === 'admin' ? 'Administrator' : 'Member'} • Joined {new Date(user.createdAt).toLocaleDateString()}
                        </Typography>

                        <Box sx={{ mt: 1 }}>
                            {(user.creatorType || []).map(type => (
                                <Chip key={type} label={type} size="small" sx={{ mr: 1, mb: 1 }} />
                            ))}
                        </Box>

                        <Box sx={{ mt: 2 }}>
                            <SocialLink icon={<GitHubIcon />} url={user.socials?.github} />
                            <SocialLink icon={<LinkedInIcon />} url={user.socials?.linkedin} />
                            <SocialLink icon={<TwitterIcon />} url={user.socials?.twitter} />
                            <SocialLink icon={<InstagramIcon />} url={user.socials?.instagram} />
                            <SocialLink icon={<LanguageIcon />} url={user.socials?.website} />
                        </Box>
                    </Box>
                </Box>

                <Divider sx={{ my: 4 }} />

                <Grid container spacing={4}>
                    <Grid item xs={12} md={8}>
                        <Typography variant="h6" gutterBottom>About</Typography>
                        <Typography variant="body1" paragraph>
                            {user.bio || "No bio provided."}
                        </Typography>

                        <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>Badges</Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
                            {user.badges && user.badges.length > 0 ? (
                                user.badges.map((badgeId) => {
                                    const badge = getBadgeDetails(badgeId);
                                    if (!badge) return null;
                                    return (
                                        <Chip 
                                            key={badgeId} 
                                            label={`${badge.icon} ${badge.name}`} 
                                            variant="outlined" 
                                            color="primary"
                                            title={badge.description}
                                            sx={{ fontWeight: 'bold' }}
                                        />
                                    );
                                })
                            ) : (
                                <Typography variant="body2" color="text.secondary">No badges earned yet.</Typography>
                            )}
                        </Box>

                        <Typography variant="h6" gutterBottom>Interests & Skills</Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {(user.interests || []).length > 0 ? (
                                user.interests.map(interest => (
                                    <Chip key={interest} label={interest} variant="outlined" />
                                ))
                            ) : (
                                <Typography variant="body2" color="text.secondary">No interests listed.</Typography>
                            )}
                        </Box>
                    </Grid>

                    <Grid item xs={12} md={4}>
                        <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
                            <Typography variant="subtitle2" gutterBottom>Contact</Typography>
                            {user.isPublic ? (
                                <>
                                    {(user.privacy?.showEmail ?? true) && (
                                        <Button 
                                            startIcon={<EmailIcon />} 
                                            fullWidth 
                                            variant="contained" 
                                            href={`mailto:${user.email}`}
                                        >
                                            Send Email
                                        </Button>
                                    )}
                                    {(user.privacy?.showDiscord ?? true) && user.discordHandle && (
                                        <Button 
                                            startIcon={<FaDiscord />} 
                                            fullWidth 
                                            variant="outlined" 
                                            sx={{ mt: 1, borderColor: '#5865F2', color: '#5865F2' }}
                                            onClick={handleDiscordClick}
                                        >
                                            {user.discordId ? "Add on Discord" : "Copy Discord Handle"}
                                        </Button>
                                    )}
                                    {!(user.privacy?.showEmail ?? true) && (!(user.privacy?.showDiscord ?? true) || !user.discordHandle) && (
                                        <Typography variant="body2" color="text.secondary">
                                            No contact information shared.
                                        </Typography>
                                    )}
                                </>
                            ) : (
                                <Typography variant="body2" color="text.secondary">
                                    Contact info is private.
                                </Typography>
                            )}
                        </Paper>
                    </Grid>
                </Grid>

                <Divider sx={{ my: 4 }} />

                {/* Tabs for Showcase and Bounties */}
                <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                    <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} centered>
                        <Tab icon={<CollectionsIcon />} label={`Showcase (${showcaseItems.length})`} />
                        <Tab icon={<AssignmentIcon />} label={`Bounties (${bounties.length})`} />
                    </Tabs>
                </Box>

                {/* Showcase Grid */}
                {tabValue === 0 && (
                    <Box>
                        {showcaseItems.length > 0 ? (
                            <ImageList cols={3} gap={8} sx={{ display: { xs: 'none', md: 'grid' } }}>
                                {showcaseItems.map((item) => (
                                    <ImageListItem key={item.id} sx={{ cursor: 'pointer' }} onClick={() => setSelectedShowcaseItem(item)}>
                                        <img
                                            src={`${item.imageUrls[0]}?w=248&fit=crop&auto=format`}
                                            srcSet={`${item.imageUrls[0]}?w=248&fit=crop&auto=format&dpr=2 2x`}
                                            alt={item.title}
                                            loading="lazy"
                                            style={{ borderRadius: 8, aspectRatio: '1/1', objectFit: 'cover' }}
                                        />
                                    </ImageListItem>
                                ))}
                            </ImageList>
                        ) : (
                            <Typography align="center" color="text.secondary" sx={{ py: 4 }}>
                                No showcase items yet.
                            </Typography>
                        )}
                        {/* Mobile View for Showcase */}
                        <Box sx={{ display: { xs: 'grid', md: 'none' }, gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.5 }}>
                            {showcaseItems.map((item) => (
                                <Box 
                                    key={item.id} 
                                    component="img"
                                    src={item.imageUrls[0]}
                                    alt={item.title}
                                    sx={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', cursor: 'pointer' }}
                                    onClick={() => setSelectedShowcaseItem(item)}
                                />
                            ))}
                        </Box>
                    </Box>
                )}

                {/* Bounties Grid */}
                {tabValue === 1 && (
                    <Grid container spacing={3}>
                        {bounties.length > 0 ? (
                            bounties.map((bounty) => (
                                <Grid item xs={12} sm={6} md={4} key={bounty.bountyID}>
                                    <Card 
                                        sx={{ height: '100%', display: 'flex', flexDirection: 'column', cursor: 'pointer' }}
                                        onClick={() => router.push(`/dashboard/bounties?highlight=${bounty.bountyID}`)}
                                    >
                                        {bounty.imageUrl && (
                                            <CardMedia
                                                component="img"
                                                height="140"
                                                image={bounty.imageUrl}
                                                alt={bounty.title}
                                            />
                                        )}
                                        <CardContent sx={{ flexGrow: 1 }}>
                                            <Typography gutterBottom variant="h6" component="div" noWrap>
                                                {bounty.title}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary" sx={{ 
                                                display: '-webkit-box',
                                                WebkitLineClamp: 3,
                                                WebkitBoxOrient: 'vertical',
                                                overflow: 'hidden'
                                            }}>
                                                {bounty.description}
                                            </Typography>
                                            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                                                <Chip 
                                                    label={bounty.status.toUpperCase()} 
                                                    color={bounty.status === 'open' ? 'success' : 'default'} 
                                                    size="small" 
                                                />
                                                <Chip 
                                                    label={`${bounty.rewardValue} ${bounty.rewardType === 'hours' ? 'Hrs' : ''}`} 
                                                    size="small" 
                                                    variant="outlined"
                                                />
                                            </Box>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            ))
                        ) : (
                            <Grid item xs={12}>
                                <Typography align="center" color="text.secondary" sx={{ py: 4 }}>
                                    No bounties created.
                                </Typography>
                            </Grid>
                        )}
                    </Grid>
                )}
            </Paper>
            <Snackbar
                open={snackbarOpen}
                autoHideDuration={3000}
                onClose={() => setSnackbarOpen(false)}
                message={`Discord handle copied: ${user?.discordHandle}`}
            />

            {/* Showcase Item Dialog */}
            <Dialog 
                open={!!selectedShowcaseItem} 
                onClose={() => setSelectedShowcaseItem(null)}
                maxWidth="md"
                fullWidth
            >
                {selectedShowcaseItem && (
                    <>
                        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            {selectedShowcaseItem.title}
                            <IconButton onClick={() => setSelectedShowcaseItem(null)}>
                                <CloseIcon />
                            </IconButton>
                        </DialogTitle>
                        <DialogContent>
                            <Box sx={{ mb: 2 }}>
                                <img 
                                    src={selectedShowcaseItem.imageUrls[0]} 
                                    alt={selectedShowcaseItem.title} 
                                    style={{ width: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: 8 }} 
                                />
                            </Box>
                            <Typography variant="body1" paragraph>
                                {selectedShowcaseItem.description}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                <Chip 
                                    icon={<StarIcon />} 
                                    label={`${selectedShowcaseItem.likes?.length || 0} Likes`} 
                                    color="primary" 
                                    variant="outlined" 
                                />
                                <Typography variant="caption" color="text.secondary">
                                    Posted on {new Date(selectedShowcaseItem.createdAt).toLocaleDateString()}
                                </Typography>
                            </Box>
                        </DialogContent>
                    </>
                )}
            </Dialog>
        </Container>
    );
}
