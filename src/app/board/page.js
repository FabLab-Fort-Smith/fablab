"use client";
import React from 'react';
import { Box, Typography, Grid, Card, CardActionArea, CardContent, useTheme, Chip } from '@mui/material';
import { motion } from 'motion/react';
import AssignmentIcon from '@mui/icons-material/Assignment';
import EventIcon from '@mui/icons-material/Event';
import PeopleIcon from '@mui/icons-material/People';
import Link from 'next/link';
import QRCode from "react-qr-code";

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
            height: '100vh', 
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
                <Box sx={{ textAlign: 'center', mb: 8 }}>
                    <img src="/logos/darkLogo.png" alt="FabLab Logo" style={{ height: 120, marginBottom: 20 }} />
                    <Typography variant="h5" color="text.secondary" sx={{ mt: 2 }}>
                        Community Dashboard
                    </Typography>
                    
                <QRCode 
                    value={`${process.env.NEXT_PUBLIC_URL}/dashboard/checkin`}
                    size={150}
                />
                <Typography variant="subtitle1" sx={{ mt: 1, fontWeight: 'bold', color: 'black' }}>
                    Scan to Check In
                </Typography>
                </Box>
            </motion.div>

            <Grid container spacing={4} justifyContent="center" sx={{ maxWidth: 1200 }}>
                {menuItems.map((item, index) => (
                    <Grid item xs={12} md={4} key={item.title}>
                        <MotionCard
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.2, duration: 0.5 }}
                            whileHover={{ scale: item.disabled ? 1 : 1.05 }}
                            whileTap={{ scale: item.disabled ? 1 : 0.95 }}
                            sx={{ 
                                height: '100%',
                                opacity: item.disabled ? 0.5 : 1,
                                bgcolor: 'background.paper',
                                border: `1px solid ${theme.palette.divider}`,
                                boxShadow: theme.shadows[4]
                            }}
                        >
                            <CardActionArea 
                                component={item.disabled ? 'div' : Link} 
                                href={item.href}
                                sx={{ height: '100%', p: 4, textAlign: 'center' }}
                                disabled={item.disabled}
                            >
                                <Box sx={{ mb: 3 }}>
                                    {item.icon}
                                </Box>
                                <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>
                                    {item.title}
                                </Typography>
                                <Typography variant="h6" color="text.secondary">
                                    {item.description}
                                </Typography>
                                {item.disabled && (
                                    <Chip label="Coming Soon" size="small" sx={{ mt: 2 }} />
                                )}
                            </CardActionArea>
                        </MotionCard>
                    </Grid>
                ))}
            </Grid>

        </Box>
    );
}
