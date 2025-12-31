"use client";
import React from 'react';
import { Box, Typography, Grid, Card, CardActionArea, useTheme, Chip } from '@mui/material';
import { motion } from 'motion/react';
import AssignmentIcon from '@mui/icons-material/Assignment';
import EventIcon from '@mui/icons-material/Event';
import Image from 'next/image';
import Link from 'next/link';
import QRCode from "react-qr-code";
// chore force deploy

const MotionCard = motion(Card);

const menuItems = [
    {
        title: 'Bounty Board',
        description: 'View and claim available tasks',
        icon: <AssignmentIcon sx={{ fontSize: 60, color: 'primary.main' }} />,
        href: '/board/bounties',
        color: 'primary.main'
    },
    {
        title: 'Upcoming Events',
        description: 'Workshops and meetups',
        icon: <EventIcon sx={{ fontSize: 60, color: 'secondary.main' }} />,
        href: '#', // Placeholder
        color: 'secondary.main',
        disabled: true
    }
];

export default function BoardDashboard() {
    const theme = useTheme();

    return (
        <Box sx={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: 4,
            background: `radial-gradient(circle at center, ${theme.palette.background.paper} 0%, ${theme.palette.background.default} 100%)`
        }}>
            <motion.div
                initial={{ opacity: 0, y: -50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
            >
                <Box sx={{ textAlign: 'center', mb: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Box sx={{ position: 'relative', width: 300, height: 120, mb: 2 }}>
                        <Image 
                            src="/logos/darkLogo.png" 
                            alt="FabLab Logo" 
                            fill
                            style={{ objectFit: 'contain' }}
                            priority
                        />
                    </Box>
                    <Typography variant="h5" color="text.secondary" sx={{ mt: 2 }}>
                        Community Dashboard
                    </Typography>
                    <Box sx={{ mt: 4, p: 2, bgcolor: 'white', borderRadius: 2, boxShadow: 3 }}>
                        <QRCode
                            value={`${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/dashboard/checkin`}
                            size={150}
                        />
                    </Box>
                    <Typography variant="subtitle1" sx={{ mt: 2, fontWeight: 'bold', color: 'text.primary' }}>
                        Scan to Check In
                    </Typography>
                </Box>
            </motion.div>

            <Grid container spacing={3} direction="column" alignItems="center" sx={{ maxWidth: 600, width: '100%' }}>
                {menuItems.map((item, index) => (
                    <Grid item xs={12} key={item.title} sx={{ width: '100%' }}>
                        <MotionCard
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1, duration: 0.4 }}
                            whileTap={{ scale: item.disabled ? 1 : 0.98 }}
                            sx={{
                                width: '100%',
                                opacity: item.disabled ? 0.6 : 1,
                                bgcolor: 'background.paper',
                                border: `1px solid ${theme.palette.divider}`,
                                boxShadow: theme.shadows[4],
                                borderRadius: 3
                            }}
                        >
                            <CardActionArea
                                component={item.disabled ? 'div' : Link}
                                href={item.href}
                                sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left' }}
                                disabled={item.disabled}
                            >
                                <Box sx={{ mr: 3, display: 'flex', alignItems: 'center' }}>
                                    {item.icon}
                                </Box>
                                <Box sx={{ flexGrow: 1 }}>
                                    <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold', mb: 0.5 }}>
                                        {item.title}
                                    </Typography>
                                    <Typography variant="body1" color="text.secondary">
                                        {item.description}
                                    </Typography>
                                    {item.disabled && (
                                        <Chip label="Coming Soon" size="small" sx={{ mt: 1 }} />
                                    )}
                                </Box>
                            </CardActionArea>
                        </MotionCard>
                    </Grid>
                ))}
            </Grid>

        </Box>
    );
}
