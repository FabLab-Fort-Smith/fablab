"use client";
import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Card, CardContent, Chip, 
    LinearProgress, useTheme, Dialog, DialogContent, IconButton,
    CardActionArea, Button, Stack, Container, Avatar
} from '@mui/material';
import { motion, AnimatePresence } from 'motion/react';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import StarIcon from '@mui/icons-material/Star';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LoopIcon from '@mui/icons-material/Loop';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Link from 'next/link';
import QRCode from "react-qr-code";

const MotionCard = motion(Card);

export default function BoardBountiesPage() {
    const theme = useTheme();
    const [bounties, setBounties] = useState([]);
    const [loading, setLoading] = useState(true);
    const [baseUrl, setBaseUrl] = useState('');
    const [selectedBounty, setSelectedBounty] = useState(null);

    useEffect(() => {
        setBaseUrl(window.location.origin);
        const fetchBounties = async () => {
            try {
                const res = await fetch('/api/v1/bounties');
                if (res.ok) {
                    const data = await res.json();
                    const openBounties = (data.bounties || []).filter(b => b.status === 'open');
                    setBounties(openBounties);
                }
            } catch (error) {
                console.error("Failed to fetch bounties", error);
            } finally {
                setLoading(false);
            }
        };

        fetchBounties();
        const interval = setInterval(fetchBounties, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const handleCardClick = (bounty) => {
        setSelectedBounty(bounty);
    };

    const handleClose = () => {
        setSelectedBounty(null);
    };

    if (loading) return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <LinearProgress sx={{ width: '50%' }} />
        </Box>
    );

    return (
        <Box sx={{ 
            minHeight: '100vh', 
            bgcolor: 'background.default',
            p: 3
        }}>
            <Container maxWidth="sm" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <Button 
                        component={Link} 
                        href="/board" 
                        startIcon={<ArrowBackIcon />}
                        sx={{ 
                            position: 'absolute', 
                            left: 0,
                            minWidth: 'auto',
                            p: 1,
                            borderRadius: '50%',
                            bgcolor: 'action.hover'
                        }}
                    >
                    </Button>
                    <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold', width: '100%', textAlign: 'center' }}>
                        Bounties
                    </Typography>
                </Box>

                {/* Bounties List */}
                <Stack spacing={2} sx={{ flexGrow: 1, pb: 4 }}>
                    <AnimatePresence>
                        {bounties.map((bounty, index) => (
                            <MotionCard 
                                key={bounty._id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                                layout
                                sx={{ 
                                    borderRadius: 4,
                                    overflow: 'visible',
                                    boxShadow: theme.shadows[2],
                                    bgcolor: 'background.paper'
                                }}
                            >
                                <CardActionArea onClick={() => handleCardClick(bounty)} sx={{ p: 2 }}>
                                    <Stack direction="row" spacing={2} alignItems="center">
                                        {/* Icon Avatar */}
                                        <Avatar sx={{ 
                                            bgcolor: bounty.rewardType === 'hours' ? 'primary.light' : 'success.light',
                                            color: bounty.rewardType === 'hours' ? 'primary.main' : 'success.main',
                                            width: 56, height: 56
                                        }}>
                                            {bounty.rewardType === 'hours' ? <AccessTimeIcon fontSize="large" /> : <MonetizationOnIcon fontSize="large" />}
                                        </Avatar>

                                        {/* Content */}
                                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                            <Typography variant="h6" noWrap sx={{ fontWeight: 'bold' }}>
                                                {bounty.title}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary" noWrap>
                                                {bounty.description}
                                            </Typography>
                                            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                                <Chip 
                                                    size="small" 
                                                    label={bounty.rewardType === 'hours' ? `${bounty.rewardValue} Hrs` : bounty.rewardValue} 
                                                    color={bounty.rewardType === 'hours' ? 'primary' : 'success'}
                                                    variant="outlined"
                                                />
                                                {bounty.stakeValue > 0 && (
                                                    <Chip 
                                                        size="small" 
                                                        icon={<StarIcon sx={{ fontSize: '1rem !important' }} />}
                                                        label={`+${bounty.stakeValue}`} 
                                                        color="warning" 
                                                        variant="outlined"
                                                    />
                                                )}
                                            </Stack>
                                        </Box>

                                        <ChevronRightIcon color="action" />
                                    </Stack>
                                </CardActionArea>
                            </MotionCard>
                        ))}
                    </AnimatePresence>
                    
                    {bounties.length === 0 && (
                        <Box sx={{ textAlign: 'center', mt: 8, opacity: 0.6 }}>
                            <Typography variant="h6">All caught up!</Typography>
                            <Typography variant="body2">No active bounties right now.</Typography>
                        </Box>
                    )}
                </Stack>
            </Container>

            {/* Detail Modal */}
            <Dialog 
                open={!!selectedBounty} 
                onClose={handleClose}
                fullScreen
                TransitionComponent={motion.div} // Simple transition
                PaperProps={{
                    sx: { bgcolor: 'background.default' }
                }}
            >
                {selectedBounty && (
                    <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                            <IconButton onClick={handleClose} size="large" sx={{ bgcolor: 'action.hover' }}>
                                <CloseIcon />
                            </IconButton>
                        </Box>

                        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                            <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', mb: 1 }}>
                                {selectedBounty.title}
                            </Typography>
                            
                            <Stack direction="row" spacing={1} sx={{ mb: 4, justifyContent: 'center' }}>
                                <Chip 
                                    icon={selectedBounty.rewardType === 'hours' ? <AccessTimeIcon /> : <MonetizationOnIcon />} 
                                    label={selectedBounty.rewardType === 'hours' ? `${selectedBounty.rewardValue} Hours` : selectedBounty.rewardValue} 
                                    color={selectedBounty.rewardType === 'hours' ? 'primary' : 'success'}
                                />
                                {selectedBounty.recurrence && selectedBounty.recurrence !== 'none' && (
                                    <Chip icon={<LoopIcon />} label={selectedBounty.recurrence} variant="outlined" />
                                )}
                            </Stack>

                            <Box sx={{ 
                                p: 3, 
                                bgcolor: 'white', 
                                borderRadius: 4,
                                boxShadow: theme.shadows[4],
                                mb: 4
                            }}>
                                <QRCode
                                    value={`${baseUrl}/dashboard/bounties?highlight=${selectedBounty.bountyID}`}
                                    size={200}
                                />
                            </Box>

                            <Typography variant="h6" color="primary" gutterBottom sx={{ fontWeight: 'bold' }}>
                                SCAN TO CLAIM
                            </Typography>

                            <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 400, mx: 'auto', mb: 4 }}>
                                {selectedBounty.description}
                            </Typography>
                        </Box>
                    </Box>
                )}
            </Dialog>
        </Box>
    );
}
