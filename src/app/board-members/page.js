"use client";
import React, { useState, useEffect } from 'react';
import { Container, Typography, Grid, Card, CardContent, CardMedia, Box, Skeleton, useTheme } from '@mui/material';
import { motion } from 'motion/react';

export default function BoardMembersPage() {
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const theme = useTheme();

    useEffect(() => {
        const fetchMembers = async () => {
            try {
                // Fetch admin users
                const res = await fetch('/api/v1/users?role=admin&isPublic=true');
                const data = await res.json();
                if (data.users) {
                    setMembers(data.users);
                }
            } catch (error) {
                console.error("Failed to fetch board members", error);
            } finally {
                setLoading(false);
            }
        };
        fetchMembers();
    }, []);

    return (
        <Container maxWidth="lg" sx={{ py: 8 }}>
            <Typography variant="h3" component="h1" gutterBottom align="center" color="primary" sx={{ mb: 6 }}>
                Board Members
            </Typography>
            
            {loading ? (
                <Grid container spacing={4}>
                    {[1, 2, 3].map((i) => (
                        <Grid item xs={12} sm={6} md={4} key={i}>
                            <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 2 }} />
                        </Grid>
                    ))}
                </Grid>
            ) : (
                <Grid container spacing={4} justifyContent="center">
                    {members.length > 0 ? (
                        members.map((member, index) => (
                            <Grid item xs={12} sm={6} md={4} key={member._id || index}>
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.1 }}
                                >
                                    <Card sx={{ 
                                        height: '100%', 
                                        display: 'flex', 
                                        flexDirection: 'column',
                                        transition: 'transform 0.2s',
                                        '&:hover': {
                                            transform: 'translateY(-5px)'
                                        }
                                    }}>
                                        <CardMedia
                                            component="img"
                                            height="300"
                                            image={member.image || '/logos/darkLogo.png'} 
                                            alt={`${member.firstName} ${member.lastName}`}
                                            sx={{ objectFit: 'cover' }}
                                        />
                                        <CardContent sx={{ flexGrow: 1, textAlign: 'center' }}>
                                            <Typography gutterBottom variant="h5" component="h2">
                                                {member.firstName} {member.lastName}
                                            </Typography>
                                            <Typography variant="subtitle1" color="primary" gutterBottom>
                                                {member.boardPosition || "Board Member"}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {member.bio || "Dedicated to building the maker community in Fort Smith."}
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            </Grid>
                        ))
                    ) : (
                        <Typography variant="h6" align="center" color="text.secondary">
                            No board members found.
                        </Typography>
                    )}
                </Grid>
            )}
        </Container>
    );
}
