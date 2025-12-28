"use client";
import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Avatar, Grid, Chip, Paper, IconButton, 
    Stack, Divider, Button, Container, Link,
    Tabs, Tab, ImageList, ImageListItem, Card, CardContent, CardMedia,
    Dialog, DialogTitle, DialogContent, Snackbar, useTheme, Tooltip
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { useSession } from 'next-auth/react';
import GitHubIcon from '@mui/icons-material/GitHub';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import TwitterIcon from '@mui/icons-material/Twitter';
import LanguageIcon from '@mui/icons-material/Language';
import InstagramIcon from '@mui/icons-material/Instagram';
import CollectionsIcon from '@mui/icons-material/Collections';
import AssignmentIcon from '@mui/icons-material/Assignment';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SchoolIcon from '@mui/icons-material/School';
import PaletteIcon from '@mui/icons-material/Palette';
import FavoriteIcon from '@mui/icons-material/Favorite';
import CloseIcon from '@mui/icons-material/Close';
import StarIcon from '@mui/icons-material/Star';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { useRouter } from 'next/navigation';
import Constants from '@/lib/constants';
import StakeLedger from './tabs/StakeLedger';

export default function UserProfileView({ user, isPublicView = false }) {
    const router = useRouter();
    const theme = useTheme();
    const { data: session } = useSession();
    const [tabValue, setTabValue] = useState(0);
    const [showcaseItems, setShowcaseItems] = useState([]);
    const [bounties, setBounties] = useState([]);
    const [selectedShowcaseItem, setSelectedShowcaseItem] = useState(null);
    const [loadingData, setLoadingData] = useState(false);
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

        if (user?.userID) {
            setLoadingData(true);
            // Fetch Showcase Items
            fetch(`/api/v1/portfolio?userID=${user.userID}`)
                .then(res => res.json())
                .then(data => setShowcaseItems(Array.isArray(data) ? data : []))
                .catch(err => console.error("Failed to fetch showcase items", err));

            // Fetch Bounties
            fetch(`/api/v1/bounties?creatorID=${user.userID}`)
                .then(res => res.json())
                .then(data => {
                    const userBounties = (data.bounties || []).filter(b => b.creatorID === user.userID);
                    setBounties(userBounties);
                })
                .catch(err => console.error("Failed to fetch bounties", err))
                .finally(() => setLoadingData(false));
        }
    }, [user]);

    if (!user) return null;

    // Helper to get badge details
    const getBadgeDetails = (badgeEntry) => {
        // Handle both string IDs and legacy object storage
        const badgeId = typeof badgeEntry === 'object' ? badgeEntry.id : badgeEntry;
        return badges[badgeId] || null;
    };

    const SocialLink = ({ icon, url }) => {
        if (!url) return null;
        // Ensure URL has protocol
        const href = url.startsWith('http') ? url : `https://${url}`;
        return (
            <IconButton component={Link} href={href} target="_blank" rel="noopener noreferrer" color="primary">
                {icon}
            </IconButton>
        );
    };

    const isOwnProfile = session?.user?.userID === user.userID;

    return (
        <Box sx={{ width: '100%', minHeight: '100vh', bgcolor: 'background.default' }}>
            {/* Header Section */}
            <Box sx={{ p: 2, maxWidth: 935, mx: 'auto' }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
                    {/* Avatar */}
                    <Avatar 
                        src={user.image} 
                        alt={user.username}
                        sx={{ 
                            width: { xs: 77, md: 150 }, 
                            height: { xs: 77, md: 150 },
                            mr: { xs: 2, md: 4 },
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}
                    />
                    
                    {/* Info Section */}
                    <Box sx={{ flex: 1, mt: { xs: 1, md: 0 } }}>
                        <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2} sx={{ mb: 2 }}>
                            <Typography variant="h6" fontWeight="bold" sx={{ fontSize: { xs: '1.1rem', md: '1.5rem' } }}>
                                {user.username}
                            </Typography>
                            
                            {/* Desktop Action Buttons */}
                            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                                {isOwnProfile ? (
                                    <Button 
                                        variant="contained" 
                                        size="small" 
                                        onClick={() => router.push(`/dashboard/${user.userID}/profile`)}
                                        sx={{ 
                                            bgcolor: 'rgba(255,255,255,0.1)', 
                                            color: 'white',
                                            textTransform: 'none',
                                            fontWeight: 600,
                                            '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' }
                                        }}
                                    >
                                        Edit Profile
                                    </Button>
                                ) : isPublicView && (
                                    <Button variant="contained" size="small" href="/login">
                                        Connect
                                    </Button>
                                )}
                            </Box>
                        </Stack>

                        {/* Desktop Bio */}
                        <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                            <Typography variant="subtitle1" fontWeight="bold">
                                {user.firstName} {user.lastName}
                            </Typography>
                            {user.bio && (
                                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 1 }}>
                                    {user.bio}
                                </Typography>
                            )}
                            {user.socials?.website && (
                                <Link href={user.socials.website} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.875rem', fontWeight: 600 }}>
                                    <LanguageIcon fontSize="small" /> {user.socials.website.replace(/^https?:\/\//, '')}
                                </Link>
                            )}
                        </Box>
                    </Box>
                </Box>

                {/* Mobile Bio Section */}
                <Box sx={{ display: { xs: 'block', md: 'none' }, mb: 2 }}>
                    <Typography variant="subtitle1" fontWeight="bold">
                        {user.firstName} {user.lastName}
                    </Typography>
                    {user.boardPosition && (
                        <Typography variant="subtitle2" color="primary" sx={{ mb: 1, fontWeight: 'bold' }}>
                            {user.boardPosition}
                        </Typography>
                    )}
                    {user.bio && (
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 1 }}>
                            {user.bio}
                        </Typography>
                    )}
                    {user.socials?.website && (
                        <Link href={user.socials.website} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.875rem', fontWeight: 600 }}>
                            <LanguageIcon fontSize="small" /> {user.socials.website.replace(/^https?:\/\//, '')}
                        </Link>
                    )}
                </Box>

                {/* Mobile Action Buttons */}
                <Box sx={{ display: { xs: 'block', md: 'none' }, mb: 2 }}>
                    {isOwnProfile ? (
                        <Button 
                            fullWidth 
                            variant="contained" 
                            onClick={() => router.push(`/dashboard/${user.userID}/profile`)}
                            sx={{ 
                                bgcolor: 'rgba(255,255,255,0.1)', 
                                color: 'white',
                                textTransform: 'none',
                                fontWeight: 600,
                                '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' }
                            }}
                        >
                            Edit Profile
                        </Button>
                    ) : isPublicView && (
                        <Button fullWidth variant="contained" href="/login">
                            Connect
                        </Button>
                    )}
                </Box>

                {/* Social Icons Row */}
                <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                    <SocialLink icon={<GitHubIcon />} url={user.socials?.github} />
                    <SocialLink icon={<LinkedInIcon />} url={user.socials?.linkedin} />
                    <SocialLink icon={<TwitterIcon />} url={user.socials?.twitter} />
                    <SocialLink icon={<InstagramIcon />} url={user.socials?.instagram} />
                </Stack>
            </Box>

            <Divider />

            {/* Tabs for Showcase and Bounties */}
            <Box sx={{ maxWidth: 935, mx: 'auto' }}>
                <Tabs 
                    value={tabValue} 
                    onChange={(e, v) => setTabValue(v)} 
                    centered 
                    textColor="primary" 
                    indicatorColor="primary"
                    sx={{ 
                        '& .MuiTab-root': { minHeight: 48, minWidth: 0, flex: 1 } 
                    }}
                >
                    <Tab icon={<CollectionsIcon />} aria-label="posts" />
                    <Tab icon={<AssignmentIcon />} aria-label="bounties" />
                    <Tab icon={<EmojiEventsIcon />} aria-label="badges" />
                    <Tab icon={<AutoAwesomeIcon />} aria-label="interests" />
                    {isOwnProfile && <Tab icon={<ReceiptLongIcon />} aria-label="ledger" />}
                </Tabs>
            </Box>

            {/* Showcase Grid */}
            {tabValue === 0 && (
                <Box sx={{ maxWidth: 935, mx: 'auto' }}>
                    {showcaseItems.length > 0 ? (
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: { xs: 0.5, md: 3 } }}>
                            {showcaseItems.map((item) => (
                                <Box 
                                    key={item.id} 
                                    sx={{ 
                                        aspectRatio: '1/1', 
                                        position: 'relative', 
                                        cursor: 'pointer',
                                        '&:hover .overlay': { opacity: 1 }
                                    }}
                                    onClick={() => setSelectedShowcaseItem(item)}
                                >
                                    <img
                                        src={item.imageUrls[0]}
                                        alt={item.title}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                    {/* Hover Overlay */}
                                    <Box 
                                        className="overlay"
                                        sx={{ 
                                            position: 'absolute', 
                                            top: 0, 
                                            left: 0, 
                                            width: '100%', 
                                            height: '100%', 
                                            bgcolor: 'rgba(0,0,0,0.3)', 
                                            opacity: 0, 
                                            transition: 'opacity 0.2s',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: 'white',
                                            gap: 2
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <StarIcon fontSize="small" /> {item.likes?.length || 0}
                                        </Box>
                                    </Box>
                                </Box>
                            ))}
                        </Box>
                    ) : (
                        <Box sx={{ py: 8, textAlign: 'center' }}>
                            <Box sx={{ 
                                width: 60, 
                                height: 60, 
                                borderRadius: '50%', 
                                border: '2px solid', 
                                borderColor: 'text.secondary',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                mx: 'auto',
                                mb: 2
                            }}>
                                <CollectionsIcon fontSize="large" color="action" />
                            </Box>
                            <Typography variant="h6">Share Photos</Typography>
                            <Typography variant="body2" color="text.secondary">
                                When you share photos, they will appear on your profile.
                            </Typography>
                        </Box>
                    )}
                </Box>
            )}

            {/* Bounties Grid */}
            {tabValue === 1 && (
                <Box sx={{ maxWidth: 935, mx: 'auto' }}>
                    {bounties.length > 0 ? (
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: { xs: 0.5, md: 3 } }}>
                            {bounties.map((bounty) => (
                                <Box 
                                    key={bounty.bountyID} 
                                    sx={{ 
                                        aspectRatio: '1/1', 
                                        position: 'relative', 
                                        cursor: 'pointer',
                                        bgcolor: 'rgba(255,255,255,0.03)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        textAlign: 'center',
                                        '&:hover .overlay': { opacity: 1 }
                                    }}
                                    onClick={() => router.push(`/dashboard/bounties/${bounty.bountyID}`)}
                                >
                                    {bounty.imageUrl ? (
                                        <img
                                            src={bounty.imageUrl}
                                            alt={bounty.title}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0 }}
                                        />
                                    ) : (
                                        <Box sx={{ 
                                            width: '100%', 
                                            height: '100%', 
                                            display: 'flex', 
                                            flexDirection: 'column', 
                                            alignItems: 'center', 
                                            justifyContent: 'center',
                                            p: 1
                                        }}>
                                            <AssignmentIcon fontSize="large" color="primary" sx={{ mb: 1, opacity: 0.8 }} />
                                            <Typography variant="caption" fontWeight="bold" noWrap sx={{ width: '90%', textAlign: 'center', color: 'text.primary' }}>
                                                {bounty.title}
                                            </Typography>
                                            <Chip 
                                                label={`${bounty.rewardValue}`} 
                                                size="small" 
                                                variant="outlined"
                                                sx={{ height: 20, fontSize: '0.6rem', mt: 1, borderColor: 'rgba(255,255,255,0.2)' }}
                                            />
                                        </Box>
                                    )}
                                    
                                    {/* Hover Overlay */}
                                    <Box 
                                        className="overlay"
                                        sx={{ 
                                            position: 'absolute', 
                                            top: 0, 
                                            left: 0, 
                                            width: '100%', 
                                            height: '100%', 
                                            bgcolor: 'rgba(0,0,0,0.6)', 
                                            opacity: 0, 
                                            transition: 'opacity 0.2s',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: 'white',
                                            p: 1,
                                            zIndex: 2
                                        }}
                                    >
                                        <Typography variant="body2" fontWeight="bold" align="center" sx={{ mb: 1 }}>
                                            {bounty.title}
                                        </Typography>
                                        <Chip 
                                            label={bounty.status.toUpperCase()} 
                                            color={bounty.status === 'open' ? 'success' : 'default'} 
                                            size="small" 
                                        />
                                    </Box>
                                </Box>
                            ))}
                        </Box>
                    ) : (
                        <Box sx={{ py: 8, textAlign: 'center' }}>
                            <Box sx={{ 
                                width: 60, 
                                height: 60, 
                                borderRadius: '50%', 
                                border: '2px solid', 
                                borderColor: 'text.secondary',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                mx: 'auto',
                                mb: 2
                            }}>
                                <AssignmentIcon fontSize="large" color="action" />
                            </Box>
                            <Typography variant="h6">No Bounties</Typography>
                            <Typography variant="body2" color="text.secondary">
                                This user hasn't posted any bounties yet.
                            </Typography>
                        </Box>
                    )}
                </Box>
            )}

            {/* Badges Grid */}
            {tabValue === 2 && (
                <Box sx={{ maxWidth: 935, mx: 'auto' }}>
                    {user.badges && user.badges.length > 0 ? (
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: { xs: 0.5, md: 3 } }}>
                            {user.badges.map((badgeEntry, index) => {
                                const badge = getBadgeDetails(badgeEntry);
                                if (!badge) return null;
                                
                                // Ensure unique key even if badgeEntry is an object or duplicate
                                const badgeId = typeof badgeEntry === 'object' ? (badgeEntry.id || index) : badgeEntry;
                                const key = `${badgeId}-${index}`;

                                return (
                                    <Box 
                                        key={key} 
                                        sx={{ 
                                            aspectRatio: '1/1', 
                                            position: 'relative', 
                                            cursor: 'pointer',
                                            bgcolor: 'rgba(255,255,255,0.03)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            textAlign: 'center',
                                            '&:hover .overlay': { opacity: 1 }
                                        }}
                                    >
                                        {badge.imageUrl ? (
                                            <Box 
                                                component="img"
                                                src={badge.imageUrl}
                                                alt={badge.name}
                                                sx={{ 
                                                    width: '60%', 
                                                    height: '60%', 
                                                    objectFit: 'contain' 
                                                }}
                                            />
                                        ) : (
                                            <Box sx={{ fontSize: '4rem' }}>
                                                {badge.icon}
                                            </Box>
                                        )}
                                        
                                        {/* Hover Overlay */}
                                        <Box 
                                            className="overlay"
                                            sx={{ 
                                                position: 'absolute', 
                                                top: 0, 
                                                left: 0, 
                                                width: '100%', 
                                                height: '100%', 
                                                bgcolor: 'rgba(0,0,0,0.6)', 
                                                opacity: 0, 
                                                transition: 'opacity 0.2s',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: 'white',
                                                p: 1,
                                                zIndex: 2
                                            }}
                                        >
                                            <Typography variant="body2" fontWeight="bold" align="center">
                                                {badge.name}
                                            </Typography>
                                            <Typography variant="caption" align="center" sx={{ mt: 1, display: { xs: 'none', sm: 'block' } }}>
                                                {badge.description}
                                            </Typography>
                                        </Box>
                                    </Box>
                                );
                            })}
                        </Box>
                    ) : (
                        <Box sx={{ py: 8, textAlign: 'center' }}>
                            <Box sx={{ 
                                width: 60, 
                                height: 60, 
                                borderRadius: '50%', 
                                border: '2px solid', 
                                borderColor: 'text.secondary',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                mx: 'auto',
                                mb: 2
                            }}>
                                <EmojiEventsIcon fontSize="large" color="action" />
                            </Box>
                            <Typography variant="h6">No Badges Yet</Typography>
                            <Typography variant="body2" color="text.secondary">
                                This user hasn't earned any badges yet.
                            </Typography>
                        </Box>
                    )}
                </Box>
            )}

            {/* Interests/Skills Grid */}
            {tabValue === 3 && (
                <Box sx={{ maxWidth: 935, mx: 'auto' }}>
                    {(() => {
                        const interests = user.interests || [];
                        const allItems = [
                            ...interests.map(i => ({ type: 'INTEREST', label: i, icon: <AutoAwesomeIcon fontSize="large" /> }))
                        ];

                        if (allItems.length === 0) {
                            return (
                                <Box sx={{ py: 8, textAlign: 'center' }}>
                                    <Box sx={{ 
                                        width: 60, 
                                        height: 60, 
                                        borderRadius: '50%', 
                                        border: '2px solid', 
                                        borderColor: 'text.secondary',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        mx: 'auto',
                                        mb: 2
                                    }}>
                                        <AutoAwesomeIcon fontSize="large" color="action" />
                                    </Box>
                                    <Typography variant="h6">No Interests Yet</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        This user hasn't added any interests yet.
                                    </Typography>
                                </Box>
                            );
                        }

                        return (
                            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: { xs: 0.5, md: 3 } }}>
                                {allItems.map((item, index) => (
                                    <Box 
                                        key={index} 
                                        sx={{ 
                                            aspectRatio: '1/1', 
                                            position: 'relative', 
                                            cursor: 'default',
                                            bgcolor: 'rgba(255,255,255,0.03)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            textAlign: 'center',
                                            p: 1,
                                            '&:hover .overlay': { opacity: 1 }
                                        }}
                                    >
                                        <Box sx={{ mb: 1, opacity: 0.7 }}>
                                            {item.icon}
                                        </Box>
                                        <Typography variant="body2" fontWeight="bold" noWrap sx={{ width: '90%' }}>
                                            {item.label}
                                        </Typography>
                                        
                                        {/* Hover Overlay */}
                                        <Box 
                                            className="overlay"
                                            sx={{ 
                                                position: 'absolute', 
                                                top: 0, 
                                                left: 0, 
                                                width: '100%', 
                                                height: '100%', 
                                                bgcolor: 'rgba(0,0,0,0.8)', 
                                                opacity: 0, 
                                                transition: 'opacity 0.2s',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: 'white',
                                                p: 1,
                                                zIndex: 2
                                            }}
                                        >
                                            <Typography variant="caption" sx={{ letterSpacing: 1, mb: 1, opacity: 0.8 }}>
                                                {item.type}
                                            </Typography>
                                            <Typography variant="body1" fontWeight="bold" align="center">
                                                {item.label}
                                            </Typography>
                                        </Box>
                                    </Box>
                                ))}
                            </Box>
                        );
                    })()}
                </Box>
            )}

            {/* Ledger Tab */}
            {tabValue === 4 && isOwnProfile && (
                <StakeLedger stakeHistory={user.stakeHistory} currentStake={user.stake} />
            )}

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
        </Box>
    );
}
