import React, { useState } from 'react';
import { Box, IconButton, Menu, MenuItem, Tabs, Tab, Chip, Tooltip, Snackbar, Alert } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import StarIcon from '@mui/icons-material/Star';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ShareIcon from '@mui/icons-material/Share';
import UsersService from '@/services/users'; 

const UserHeader = ({ onSave, hasChanges, activeTab, setActiveTab, user }) => {
    const [anchorEl, setAnchorEl] = useState(null);
    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const open = Boolean(anchorEl);

    const handleClick = (event) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleTabChange = (event, newValue) => {
        setActiveTab(newValue);
    };

    const handleViewProfile = () => {
        if (user?.username) {
            window.open(`/u/${user.username}`, '_blank');
        }
    };

    const handleShareProfile = () => {
        if (user?.username) {
            const url = `${window.location.origin}/u/${user.username}`;
            navigator.clipboard.writeText(url);
            setSnackbarOpen(true);
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 2 }}>
            
            {/* Tabs Section - Integrated into the header */}
            <Tabs 
                value={activeTab} 
                onChange={handleTabChange}
                variant="scrollable"
                scrollButtons="auto"
                allowScrollButtonsMobile
                sx={{ width: { xs: '100%', md: 'auto' } }}
            >
                <Tab label="User Details" />
                <Tab label="Membership" />
                <Tab 
                    label="Public Profile" 
                    disabled={user?.membership?.status === 'suspended'}
                />
                <Tab label="Settings" />
            </Tabs>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {user && (
                    <>
                        <Tooltip title="View Public Profile">
                            <IconButton onClick={handleViewProfile} color="primary">
                                <VisibilityIcon />
                            </IconButton>
                        </Tooltip>
                        
                        <Tooltip title="Share Profile Link">
                            <IconButton onClick={handleShareProfile} color="primary">
                                <ShareIcon />
                            </IconButton>
                        </Tooltip>

                        <Tooltip title="Community Stake Score">
                            <Chip 
                                icon={<StarIcon />} 
                                label={`${user.stake || 0} Stake`} 
                                color="warning" 
                                variant="outlined" 
                                sx={{ ml: 1 }}
                            />
                        </Tooltip>

                        {user.badges && user.badges.some(b => b.id === 'top-runner') && (
                            <Tooltip title="Top Runner: Weekly Arcade Champion">
                                <Chip 
                                    icon={<span style={{ fontSize: '1.2rem' }}>👑</span>} 
                                    label="Top Runner" 
                                    color="secondary" 
                                    variant="filled" 
                                    sx={{ 
                                        ml: 1, 
                                        backgroundColor: '#FFD700', // Gold
                                        color: '#000',
                                        fontWeight: 'bold',
                                        '& .MuiChip-icon': { color: 'inherit' }
                                    }}
                                />
                            </Tooltip>
                        )}
                    </>
                )}

                {/* Three Dots for Actions Section */}
                <IconButton aria-label="more" onClick={handleClick}>
                    <MoreVertIcon />
                </IconButton>
            </Box>

            {/* Dropdown Menu for Actions */}
            <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
                {/* Save Changes Option */}
                <MenuItem onClick={onSave} disabled={!hasChanges}>
                    Save Changes
                </MenuItem>
                
                {user?.role === 'admin' && (
                    <MenuItem onClick={() => window.location.href = '/dashboard/admin/bounty-ideas'}>
                        Manage Bounty Ideas
                    </MenuItem>
                )}
            </Menu>

            <Snackbar 
                open={snackbarOpen} 
                autoHideDuration={3000} 
                onClose={() => setSnackbarOpen(false)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert onClose={() => setSnackbarOpen(false)} severity="success" sx={{ width: '100%' }}>
                    Profile link copied to clipboard!
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default UserHeader;
