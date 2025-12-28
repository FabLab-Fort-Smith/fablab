"use client";

import React from 'react';
import { Container, Typography, Box, Paper, Button, Grid, Card, CardContent, Avatar, useTheme } from '@mui/material';
import { motion } from 'motion/react';
import Link from 'next/link';
import HandymanIcon from '@mui/icons-material/Handyman';
import SchoolIcon from '@mui/icons-material/School';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import GroupsIcon from '@mui/icons-material/Groups';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import EmojiObjectsIcon from '@mui/icons-material/EmojiObjects';

const MotionBox = motion(Box);
const MotionTypography = motion(Typography);

export default function AboutPage() {
    const theme = useTheme();

    const features = [
        {
            icon: <PrecisionManufacturingIcon fontSize="large" color="primary" />,
            title: "Industrial Grade Tools",
            description: "Access to laser cutters, 3D printers, CNC routers, and electronics stations. Stop dreaming, start building."
        },
        {
            icon: <GroupsIcon fontSize="large" color="primary" />,
            title: "The Hive Mind",
            description: "Get stuck? Our community of engineers, artists, and developers is here to help you unblock your creativity."
        },
        {
            icon: <EmojiObjectsIcon fontSize="large" color="primary" />,
            title: "Learn by Doing",
            description: "No textbooks, just projects. We believe the best way to learn is to get your hands dirty and make something real."
        }
    ];

    const personas = [
        {
            icon: <HandymanIcon />,
            title: "The Tinkerer",
            text: "For the weekend warrior who needs a table saw that actually cuts straight and a soldering iron that gets hot enough."
        },
        {
            icon: <RocketLaunchIcon />,
            title: "The Entrepreneur",
            text: "Prototype your product, iterate fast, and get to market. We're the launchpad for your next big idea."
        },
        {
            icon: <SchoolIcon />,
            title: "The Learner",
            text: "Whether you're 8 or 80, there's always a new skill to master. Classes, workshops, and peer-to-peer learning."
        }
    ];

    return (
        <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', pb: 8 }}>
            {/* Hero Section */}
            <Box sx={{ 
                bgcolor: 'background.paper', 
                pt: { xs: 8, md: 12 }, 
                pb: { xs: 8, md: 12 },
                textAlign: 'center',
                borderBottom: `1px solid ${theme.palette.divider}`
            }}>
                <Container maxWidth="md">
                    <MotionTypography 
                        variant="h2" 
                        component="h1" 
                        gutterBottom 
                        sx={{ fontWeight: 800, color: 'primary.main' }}
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        More Than Just A Workshop.
                    </MotionTypography>
                    <MotionTypography 
                        variant="h5" 
                        color="text.secondary" 
                        paragraph
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3, duration: 0.5 }}
                    >
                        Fab Lab Fort Smith is a community of hackers, makers, and creators building the future of the River Valley.
                    </MotionTypography>
                </Container>
            </Box>

            <Container maxWidth="lg" sx={{ mt: 8 }}>
                {/* Mission Statement */}
                <Grid container spacing={6} alignItems="center" sx={{ mb: 12 }}>
                    <Grid item xs={12} md={6}>
                        <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>
                            Our Mission
                        </Typography>
                        <Typography variant="body1" paragraph sx={{ fontSize: '1.1rem', lineHeight: 1.8 }}>
                            We exist to democratize access to the tools of invention. We believe that when you give people the power to create, they build amazing things. 
                        </Typography>
                        <Typography variant="body1" paragraph sx={{ fontSize: '1.1rem', lineHeight: 1.8 }}>
                            We are reclaiming the word "Hacker". To us, a hacker is someone who looks at a system—whether it's a toaster, a line of code, or a piece of furniture—and asks, "How can I make this better?" We are a hackerspace in the truest sense: a place to take things apart, understand how they work, and put them back together in new and interesting ways.
                        </Typography>
                        <Typography variant="body1" paragraph sx={{ fontSize: '1.1rem', lineHeight: 1.8 }}>
                            From 3D printing prosthetics to laser-cutting wedding invitations, our members are constantly pushing the boundaries of what's possible. We are a "do-ocracy" — if you want to see it happen, you have the power to make it happen.
                        </Typography>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Box 
                            component="img"
                            src="/landing/hero-1.jpg" // Ensure this image exists or use a placeholder
                            alt="Makers working together"
                            sx={{ 
                                width: '100%', 
                                borderRadius: 4, 
                                boxShadow: theme.shadows[4],
                                filter: 'grayscale(20%) contrast(110%)'
                            }}
                            onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1581092921461-eab62e97a783?q=80&w=2070&auto=format&fit=crop'; }}
                        />
                    </Grid>
                </Grid>

                {/* Why Join? */}
                <Box sx={{ mb: 12 }}>
                    <Typography variant="h4" align="center" gutterBottom sx={{ fontWeight: 'bold', mb: 6 }}>
                        Why Join The Lab?
                    </Typography>
                    <Grid container spacing={4}>
                        {features.map((feature, index) => (
                            <Grid item xs={12} md={4} key={index}>
                                <MotionBox 
                                    whileHover={{ y: -10 }}
                                    sx={{ 
                                        p: 4, 
                                        height: '100%', 
                                        bgcolor: 'background.paper', 
                                        borderRadius: 2,
                                        border: `1px solid ${theme.palette.divider}`,
                                        textAlign: 'center'
                                    }}
                                >
                                    <Box sx={{ mb: 2 }}>{feature.icon}</Box>
                                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                                        {feature.title}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {feature.description}
                                    </Typography>
                                </MotionBox>
                            </Grid>
                        ))}
                    </Grid>
                </Box>

                {/* Who is this for? */}
                <Box sx={{ mb: 12 }}>
                    <Typography variant="h4" align="center" gutterBottom sx={{ fontWeight: 'bold', mb: 6 }}>
                        Who Belongs Here?
                    </Typography>
                    <Grid container spacing={4}>
                        {personas.map((persona, index) => (
                            <Grid item xs={12} md={4} key={index}>
                                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', p: 3 }}>
                                    <Avatar sx={{ bgcolor: 'primary.main', width: 60, height: 60, mb: 2 }}>
                                        {persona.icon}
                                    </Avatar>
                                    <CardContent sx={{ textAlign: 'center' }}>
                                        <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                                            {persona.title}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {persona.text}
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                </Box>

                {/* CTA */}
                <Box sx={{ 
                    textAlign: 'center', 
                    p: 8, 
                    bgcolor: 'primary.main', 
                    borderRadius: 4, 
                    color: 'primary.contrastText',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <Typography variant="h3" gutterBottom sx={{ fontWeight: 900 }}>
                        Ready to Build?
                    </Typography>
                    <Typography variant="h6" paragraph sx={{ mb: 4, opacity: 0.9 }}>
                        Join the Lab Rat Army today and start turning your ideas into reality.
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <Button 
                            variant="contained" 
                            size="large" 
                            component={Link} 
                            href="/auth/register"
                            sx={{ 
                                bgcolor: 'background.paper', 
                                color: 'primary.main',
                                '&:hover': { bgcolor: 'grey.100' }
                            }}
                        >
                            Become a Member
                        </Button>
                        <Button 
                            variant="outlined" 
                            size="large" 
                            component={Link} 
                            href="/code-of-conduct"
                            sx={{ 
                                borderColor: 'white', 
                                color: 'white',
                                '&:hover': { borderColor: 'grey.200', bgcolor: 'rgba(255,255,255,0.1)' }
                            }}
                        >
                            Read Code of Conduct
                        </Button>
                    </Box>
                </Box>
            </Container>
        </Box>
    );
}
