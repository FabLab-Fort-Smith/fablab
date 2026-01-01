"use client";
import React, { useState } from 'react';
import { BottomNavigation, BottomNavigationAction, Paper, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Box, Typography } from '@mui/material';
import RoomIcon from '@mui/icons-material/Room'; // Check In
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'; // Post
import PersonIcon from '@mui/icons-material/Person'; // Profile
import LeaderboardIcon from '@mui/icons-material/Leaderboard'; // Leaderboard
import CollectionsIcon from '@mui/icons-material/Collections';
import AssignmentIcon from '@mui/icons-material/Assignment';
import { useRouter, usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function MobileBottomNav() {
    const router = useRouter();
    const pathname = usePathname();
    const { data: session } = useSession();
    const [openPost, setOpenPost] = useState(false);

    // Determine value based on path
    let value = 0;
    if (pathname.includes('/dashboard/feed')) value = 0;
    else if (pathname.includes('/dashboard/checkin')) value = 1;
    else if (pathname.includes('/dashboard/member/') || pathname.includes('/profile')) value = 3;
    else if (pathname.includes('/dashboard/activities/leaderboard')) value = 4;
    else value = -1; // None selected

    const handlePostClick = () => {
        setOpenPost(true);
    };

    const handleNavigation = (newValue) => {
        if (newValue === 0) router.push('/dashboard/feed');
        if (newValue === 1) router.push('/dashboard/checkin');
        if (newValue === 2) handlePostClick();
        if (newValue === 3) router.push(`/dashboard/member/${session?.user?.userID}`);
        if (newValue === 4) router.push('/dashboard/activities/leaderboard');
    };

    return (
        <>
            <Paper 
                sx={{ 
                    position: 'fixed', 
                    bottom: 0, 
                    left: 0, 
                    right: 0, 
                    zIndex: 1000, 
                    display: { xs: 'block', md: 'none' },
                    bgcolor: '#000000',
                    borderTop: '1px solid #333'
                }} 
                elevation={0}
            >
                <BottomNavigation
                    showLabels
                    value={value}
                    onChange={(event, newValue) => handleNavigation(newValue)}
                    sx={{ height: 64, bgcolor: 'transparent' }}
                >
                    <BottomNavigationAction label="Feed" icon={<CollectionsIcon />} sx={{ minWidth: 0, px: 0.5 }} />
                    <BottomNavigationAction label="Check In" icon={<RoomIcon />} sx={{ minWidth: 0, px: 0.5 }} />
                    <BottomNavigationAction label="Post" icon={<AddCircleOutlineIcon sx={{ fontSize: 36, color: 'primary.main' }} />} sx={{ minWidth: 0, px: 0.5 }} />
                    <BottomNavigationAction label="Profile" icon={<PersonIcon />} sx={{ minWidth: 0, px: 0.5 }} />
                    <BottomNavigationAction label="Rank" icon={<LeaderboardIcon />} sx={{ minWidth: 0, px: 0.5 }} />
                </BottomNavigation>
            </Paper>

            <Drawer
                anchor="bottom"
                open={openPost}
                onClose={() => setOpenPost(false)}
            >
                <Box sx={{ p: 2, pb: 4 }}>
                    <Typography variant="h6" sx={{ mb: 2, textAlign: 'center' }}>Create New</Typography>
                    <List>
                        <ListItem disablePadding>
                            <ListItemButton onClick={() => { setOpenPost(false); router.push('/dashboard/showcase?action=new'); }}>
                                <ListItemIcon><CollectionsIcon color="primary" /></ListItemIcon>
                                <ListItemText primary="Showcase Project" secondary="Share what you made" />
                            </ListItemButton>
                        </ListItem>
                        <ListItem disablePadding>
                            <ListItemButton onClick={() => { setOpenPost(false); router.push('/dashboard/activities/bounties?action=new'); }}>
                                <ListItemIcon><AssignmentIcon color="secondary" /></ListItemIcon>
                                <ListItemText primary="Bounty" secondary="Request help or offer a task" />
                            </ListItemButton>
                        </ListItem>
                    </List>
                </Box>
            </Drawer>
        </>
    );
}
