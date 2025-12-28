import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Card, CardContent, IconButton, Button, Chip, Slide
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CardMembershipIcon from '@mui/icons-material/CardMembership';
import BugReportIcon from '@mui/icons-material/BugReport';
import TerminalIcon from '@mui/icons-material/Terminal';
import CollectionsIcon from '@mui/icons-material/Collections';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import Constants from '@/lib/constants';
import { useRouter } from 'next/navigation';

const WaysToEarnStake = ({ user }) => {
    const router = useRouter();
    const [suggestions, setSuggestions] = useState([]);
    const [visible, setVisible] = useState(true);
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        if (!user) return;

        const newSuggestions = [];

        // 1. Verify Email
        if (user.status !== 'verified') {
            newSuggestions.push({
                id: 'verify_email',
                title: 'Verify Your Email',
                description: 'Secure your account and earn stake.',
                reward: Constants.ONBOARDING_REWARDS.VERIFY_EMAIL,
                icon: <VerifiedUserIcon color="primary" />,
                action: () => router.push('/dashboard/profile?tab=3'), // Settings tab
                actionLabel: 'Verify'
            });
        }

        // 2. Complete Profile
        if (!user.bio || !user.image) {
            newSuggestions.push({
                id: 'complete_profile',
                title: 'Complete Your Profile',
                description: 'Add a bio and profile picture.',
                reward: Constants.ONBOARDING_REWARDS.COMPLETE_PROFILE,
                icon: <AccountCircleIcon color="secondary" />,
                action: () => router.push(`/dashboard/${user.userID}/profile`),
                actionLabel: 'Edit Profile'
            });
        }

        // 3. Submit Application (if not applied)
        if (!user.membership?.applicationDate && user.membership?.status === 'registered') {
            newSuggestions.push({
                id: 'submit_application',
                title: 'Apply for Membership',
                description: 'Submit your application to join the lab.',
                reward: Constants.ONBOARDING_REWARDS.SUBMIT_APPLICATION,
                icon: <AssignmentIcon color="info" />,
                action: () => router.push(`/dashboard/${user.userID}/membership`),
                actionLabel: 'Apply'
            });
        }

        // 4. Subscribe (if applied but not subscribed)
        if (user.membership?.status === 'probation' && user.membership?.subscriptionStatus !== 'ACTIVE' && !user.membership?.isWaived) {
            newSuggestions.push({
                id: 'subscribe',
                title: 'Become a Member',
                description: 'Subscribe to a membership plan.',
                reward: Constants.ONBOARDING_REWARDS.SUBSCRIBE,
                icon: <CardMembershipIcon color="success" />,
                action: () => router.push(`/dashboard/${user.userID}/membership`),
                actionLabel: 'Subscribe'
            });
        }

        // 5. Showcase Pioneer (if badge missing)
        const hasShowcaseBadge = user.badges?.some(b => (typeof b === 'string' ? b : b.id) === 'showcase_pioneer');
        if (!hasShowcaseBadge) {
            newSuggestions.push({
                id: 'showcase',
                title: 'Post a Project',
                description: 'Share what you made in the Showcase.',
                reward: Constants.BADGES.SHOWCASE_PIONEER.stakeReward,
                icon: <CollectionsIcon color="warning" />,
                action: () => router.push('/dashboard/showcase'),
                actionLabel: 'Showcase'
            });
        }

        // 6. Script Kiddie (if badge missing)
        const hasScriptKiddieBadge = user.badges?.some(b => (typeof b === 'string' ? b : b.id) === 'script_kiddie');
        if (!hasScriptKiddieBadge) {
            newSuggestions.push({
                id: 'terminal',
                title: 'Hack the Lab',
                description: 'Find the hidden terminal and the first flag.',
                reward: Constants.BADGES.SCRIPT_KIDDIE.stakeReward,
                icon: <TerminalIcon sx={{ color: '#00ff00' }} />,
                action: () => router.push('/dashboard/terminal'),
                actionLabel: 'Enter Terminal'
            });
        }

        // 7. General: Report Bugs
        newSuggestions.push({
            id: 'bugs',
            title: 'Report Bugs',
            description: 'Found a glitch? Report it to earn stake.',
            reward: 'Var',
            icon: <BugReportIcon color="error" />,
            action: () => router.push('/dashboard/bugs'),
            actionLabel: 'Report'
        });

        setSuggestions(newSuggestions);
    }, [user, router]);

    const handleDismiss = () => {
        setExiting(true);
        setTimeout(() => {
            setSuggestions(prev => prev.slice(1));
            setExiting(false);
        }, 300); // Match transition duration
    };

    if (suggestions.length === 0 || !visible) return null;

    const currentCard = suggestions[0];

    return (
        <Box sx={{ mb: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <MonetizationOnIcon color="warning" /> Ways to Earn Stake
                </Typography>
                <Chip label={`${suggestions.length} Available`} size="small" color="default" />
            </Box>
            
            <Box sx={{ position: 'relative', minHeight: 100 }}>
                {/* Background Stack Effect */}
                {suggestions.length > 1 && (
                    <Card sx={{ 
                        position: 'absolute', 
                        top: 6, 
                        left: 0, 
                        right: 0, 
                        zIndex: 0,
                        opacity: 0.6,
                        transform: 'scale(0.98) translateY(4px)',
                        bgcolor: 'background.paper',
                        boxShadow: 1
                    }}>
                        <CardContent sx={{ height: 80 }} />
                    </Card>
                )}
                
                {suggestions.length > 2 && (
                    <Card sx={{ 
                        position: 'absolute', 
                        top: 12, 
                        left: 0, 
                        right: 0, 
                        zIndex: -1,
                        opacity: 0.3,
                        transform: 'scale(0.96) translateY(8px)',
                        bgcolor: 'background.paper',
                        boxShadow: 1
                    }}>
                        <CardContent sx={{ height: 80 }} />
                    </Card>
                )}

                {/* Active Card */}
                <Slide direction="left" in={!exiting} mountOnEnter unmountOnExit>
                    <Card sx={{ 
                        position: 'relative', 
                        zIndex: 1,
                        borderLeft: '4px solid',
                        borderColor: 'primary.main',
                        boxShadow: 3
                    }}>
                        <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'center', gap: 2 }}>
                                {/* Icon & Text Group */}
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                                    <Box sx={{ 
                                        p: 1, 
                                        borderRadius: '50%', 
                                        bgcolor: 'action.hover',
                                        display: 'flex',
                                        flexShrink: 0
                                    }}>
                                        {currentCard.icon}
                                    </Box>
                                    
                                    <Box sx={{ flex: 1 }}>
                                        <Typography variant="subtitle1" fontWeight="bold">
                                            {currentCard.title}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {currentCard.description}
                                        </Typography>
                                    </Box>
                                </Box>

                                {/* Actions Group */}
                                <Box sx={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: 1, 
                                    width: { xs: '100%', sm: 'auto' }, 
                                    justifyContent: { xs: 'space-between', sm: 'flex-end' },
                                    mt: { xs: 1, sm: 0 }
                                }}>
                                    <Chip 
                                        label={`+${currentCard.reward} Stake`} 
                                        color="warning" 
                                        size="small" 
                                        variant="outlined"
                                        sx={{ fontWeight: 'bold' }}
                                    />
                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                        <Button 
                                            variant="contained" 
                                            size="small" 
                                            endIcon={<ArrowForwardIcon />}
                                            onClick={currentCard.action}
                                            sx={{ minWidth: 90 }}
                                        >
                                            {currentCard.actionLabel}
                                        </Button>
                                        <IconButton 
                                            size="small" 
                                            onClick={handleDismiss}
                                            sx={{ color: 'text.disabled' }}
                                        >
                                            <CloseIcon fontSize="small" />
                                        </IconButton>
                                    </Box>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Slide>
            </Box>
        </Box>
    );
};

export default WaysToEarnStake;
