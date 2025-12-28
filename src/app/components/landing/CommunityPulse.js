"use client";
import React, { useState, useEffect } from 'react';
import { Box, Container, Typography, Grid, Card, CardContent, CardMedia, Chip, Stack, Button, useTheme, Skeleton } from '@mui/material';
import { motion } from 'motion/react';
import EngineeringIcon from '@mui/icons-material/Engineering';
import GroupsIcon from '@mui/icons-material/Groups';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';

const ActivityCard = ({ title, description, type, tags, image }) => (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
        {image && (
            <CardMedia
                component="img"
                height="140"
                image={image}
                alt={title}
                sx={{ objectFit: 'cover' }}
            />
        )}
        <CardContent sx={{ flexGrow: 1 }}>
            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                {tags.map((tag, i) => (
                    <Chip key={i} label={tag} size="small" color="primary" variant="outlined" />
                ))}
            </Stack>
            <Typography variant="h6" gutterBottom fontWeight="bold">
                {title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{
                display: '-webkit-box',
                overflow: 'hidden',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 3,
            }}>
                {description}
            </Typography>
        </CardContent>
    </Card>
);

const CommunityPulse = () => {
    const theme = useTheme();
    const [bounties, setBounties] = useState([]);
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);

    const staticProjects = [
        {
            title: "Community Garden Automated Watering",
            description: "Designed and printed automated watering spikes for the downtown community garden using the Prusa XL.",
            tags: ["Showcase", "Eco-Friendly"],
            image: "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=600&auto=format&fit=crop&q=60"
        },
        {
            title: "Retro Console Restoration",
            description: "Restored a 1989 GameBoy with a new IPS screen and rechargeable battery mod.",
            tags: ["Showcase", "Electronics"],
            image: "https://images.unsplash.com/photo-1593118247619-e2d6f056869e?w=600&auto=format&fit=crop&q=60"
        },
        {
            title: "Custom CNC Furniture",
            description: "A parametric bench design cut on the ShopBot and assembled for the new lounge area.",
            tags: ["Showcase", "Woodworking"],
            image: "https://images.unsplash.com/photo-1611486212557-88be5ff6f941?w=600&auto=format&fit=crop&q=60"
        }
    ];

    const staticBounties = [
        {
            title: "Teach a 'Intro to Soldering' Class",
            description: "We need a member to lead a 1-hour workshop for beginners. Materials provided.",
            tags: ["Bounty", "50 Stake", "Cash"],
            image: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=600&auto=format&fit=crop&q=60"
        },
        {
            title: "Fix the Laser Cutter Exhaust",
            description: "The exhaust fan on Laser #2 is rattling. Diagnose and repair.",
            tags: ["Bounty", "100 Stake", "Hours"],
            image: "https://images.unsplash.com/photo-1581092921461-eab62e97a782?w=600&auto=format&fit=crop&q=60"
        },
        {
            title: "Organize the Scrap Wood Bin",
            description: "Sort usable scraps from waste and label the bins.",
            tags: ["Bounty", "25 Stake", "Hours"],
            image: "https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=600&auto=format&fit=crop&q=60"
        }
    ];

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch Bounties and Projects in parallel
                const [bountiesRes, projectsRes] = await Promise.all([
                    fetch('/api/v1/bounties?status=open&limit=3'),
                    fetch('/api/v1/portfolio?limit=3&sort=latest')
                ]);

                // Process Bounties
                if (bountiesRes.ok) {
                    const data = await bountiesRes.json();
                    if (data.bounties && data.bounties.length > 0) {
                        setBounties(data.bounties.map(b => ({
                            title: b.title,
                            description: b.description,
                            tags: ["Bounty", `${b.stakeValue} Stake`, b.rewardType === 'cash' ? '$$$' : 'Hours'],
                            image: b.imageUrl
                        })));
                    } else {
                        setBounties(staticBounties);
                    }
                } else {
                    setBounties(staticBounties);
                }

                // Process Projects
                if (projectsRes.ok) {
                    const data = await projectsRes.json();
                    if (Array.isArray(data) && data.length > 0) {
                        setProjects(data.map(p => ({
                            title: p.title,
                            description: p.description,
                            tags: ["Showcase"],
                            image: p.imageUrls?.[0]
                        })));
                    } else {
                        setProjects(staticProjects);
                    }
                } else {
                    setProjects(staticProjects);
                }

            } catch (error) {
                console.error("Failed to fetch public data", error);
                setBounties(staticBounties);
                setProjects(staticProjects);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    return (
        <Box sx={{ py: 8, bgcolor: 'background.default' }}>
            <Container maxWidth="lg">
                <Box sx={{ textAlign: 'center', mb: 8 }}>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                    >
                        <Typography variant="overline" color="primary" fontWeight="bold" letterSpacing={2}>
                            HAPPENING NOW IN FORT SMITH
                        </Typography>
                        <Typography variant="h3" component="h2" fontWeight="bold" sx={{ mb: 2 }}>
                            The Pulse of The Lab
                        </Typography>
                        <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 700, mx: 'auto' }}>
                            A living, breathing community of creators.
                        </Typography>
                    </motion.div>
                </Box>

                {/* Projects Section */}
                <Box sx={{ mb: 8 }}>
                    <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 4 }}>
                        <EngineeringIcon color="primary" fontSize="large" />
                        <Box>
                            <Typography variant="h4" fontWeight="bold">
                                What We're Building
                            </Typography>
                            <Typography variant="body1" color="text.secondary">
                                See what our members are working on this week.
                            </Typography>
                        </Box>
                    </Stack>
                    
                    <Grid container spacing={4}>
                        {loading ? (
                            [1, 2, 3].map((i) => (
                                <Grid item xs={12} md={4} key={i}>
                                    <Card sx={{ height: 200 }}>
                                        <CardContent>
                                            <Skeleton variant="text" width="60%" height={30} />
                                            <Skeleton variant="text" width="100%" />
                                            <Skeleton variant="text" width="80%" />
                                        </CardContent>
                                    </Card>
                                </Grid>
                            ))
                        ) : (
                            projects.map((project, index) => (
                                <Grid item xs={12} md={4} key={index}>
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ duration: 0.6, delay: index * 0.1 }}
                                    >
                                        <ActivityCard {...project} />
                                    </motion.div>
                                </Grid>
                            ))
                        )}
                    </Grid>
                </Box>

                {/* Bounties Section */}
                <Box>
                    <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 4 }}>
                        <EmojiEventsIcon color="secondary" fontSize="large" />
                        <Box>
                            <Typography variant="h4" fontWeight="bold">
                                Why We Need You
                            </Typography>
                            <Typography variant="body1" color="text.secondary">
                                Your skills are needed. Earn Stake to build your reputation and fuel your own projects.
                            </Typography>
                        </Box>
                    </Stack>

                    <Grid container spacing={4}>
                        {loading ? (
                            [1, 2, 3].map((i) => (
                                <Grid item xs={12} md={4} key={i}>
                                    <Card sx={{ height: 200 }}>
                                        <CardContent>
                                            <Skeleton variant="text" width="60%" height={30} />
                                            <Skeleton variant="text" width="100%" />
                                            <Skeleton variant="text" width="80%" />
                                        </CardContent>
                                    </Card>
                                </Grid>
                            ))
                        ) : (
                            bounties.map((bounty, index) => (
                                <Grid item xs={12} md={4} key={index}>
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ duration: 0.6, delay: index * 0.1 }}
                                    >
                                        <ActivityCard {...bounty} />
                                    </motion.div>
                                </Grid>
                            ))
                        )}
                    </Grid>
                </Box>

                <Box sx={{ mt: 8, textAlign: 'center' }}>
                    <Button variant="contained" size="large" color="secondary" href="/auth/register">
                        Join the Action
                    </Button>
                </Box>
            </Container>
        </Box>
    );
};

export default CommunityPulse;
