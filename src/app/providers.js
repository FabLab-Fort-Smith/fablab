"use client";
import React from 'react';
import { AppProvider } from "@toolpad/core/AppProvider";
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { SessionProvider } from "next-auth/react";
import { CssBaseline } from "@mui/material";
import theme from "../../theme";
import { signIn, signOut } from "next-auth/react";
import DashboardIcon from "@mui/icons-material/Dashboard";
import BuildIcon from "@mui/icons-material/Handyman";
import BarChartIcon from "@mui/icons-material/Insights";
import PeopleIcon from "@mui/icons-material/People";
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import AssignmentIcon from '@mui/icons-material/Assignment';
import RateReviewIcon from '@mui/icons-material/RateReview';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import CollectionsIcon from '@mui/icons-material/Collections';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import HistoryIcon from '@mui/icons-material/History';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import EmailIcon from '@mui/icons-material/Email';
import TerminalIcon from '@mui/icons-material/Terminal';
import CampaignIcon from '@mui/icons-material/Campaign';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';

const getUserNavigation = (userID) => [
    {
        segment: `dashboard/${userID}`,
        title: 'Dashboard',
        icon: <DashboardIcon />
    },
    {
        segment: `dashboard/${userID}/profile`,
        title: 'Profile',
        icon: <BuildIcon />,
    },
    {
        segment: `dashboard/${userID}/volunteer`,
        title: 'Volunteer Log',
        icon: <VolunteerActivismIcon />,
    },
    {
        segment: 'dashboard/community',
        title: 'Community',
        icon: <PeopleIcon />,
        children: [
            {
                segment: 'feed',
                title: 'The Lab Feed',
                icon: <CollectionsIcon />,
            },
            {
                segment: 'announcements',
                title: 'Announcements',
                icon: <CampaignIcon />,
            },
            {
                segment: 'directory',
                title: 'Member Directory',
                icon: <PeopleIcon />,
            },
            {
                segment: 'code-of-conduct',
                title: 'Code of Conduct',
                icon: <MenuBookIcon />,
            },
        ]
    },
    {
        segment: 'dashboard/activities',
        title: 'Activities',
        icon: <SportsEsportsIcon />,
        children: [
            {
                segment: 'arcade',
                title: 'The Glitch Arcade',
                icon: <SportsEsportsIcon />,
            },
            {
                segment: 'holodeck',
                title: 'The Holodeck (v2)',
                icon: <TerminalIcon />,
            },
            {
                segment: 'terminal',
                title: 'HackTheLab (Legacy)',
                icon: <TerminalIcon />,
            },
            {
                segment: 'bounties',
                title: 'Bounties',
                icon: <AssignmentIcon />,
            },
            {
                segment: 'leaderboard',
                title: 'Leaderboard',
                icon: <EmojiEventsIcon />,
            },
        ]
    },
    {
        segment: 'dashboard/resources',
        title: 'Resources',
        icon: <LightbulbIcon />,
        children: [
            {
                segment: 'badges',
                title: 'Badge Directory',
                icon: <EmojiEventsIcon />,
            },
            {
                segment: 'bugs',
                title: 'Bug Tracker',
                icon: <BuildIcon />,
            },
        ]
    }
];

const ADMIN_NAVIGATION = [
    {
        kind: 'divider',
    },
    {
        kind: 'header',
        title: 'Admin Tools'
    },
    {
        segment: 'dashboard/admin',
        title: 'Admin Panel',
        icon: <BuildIcon />,
        children: [
            {
                segment: 'analytics',
                title: 'Analytics',
                icon: <BarChartIcon />
            },
            {
                segment: 'members',
                title: 'Members',
                icon: <PeopleIcon />
            },
            {
                segment: 'volunteers',
                title: 'Volunteers',
                icon: <VolunteerActivismIcon />
            },
            {
                segment: 'checkin-log',
                title: 'Check-in Log',
                icon: <HistoryIcon />
            },
            {
                segment: 'onboarding-reviews',
                title: 'Onboarding Reviews',
                icon: <RateReviewIcon />
            },
            {
                segment: 'bounty-ideas',
                title: 'Bounty Ideas',
                icon: <LightbulbIcon />
            },
            {
                segment: 'badges',
                title: 'Badge Management',
                icon: <EmojiEventsIcon />
            },
            {
                segment: 'contact',
                title: 'Contact Submissions',
                icon: <EmailIcon />
            },
            {
                segment: 'announcements',
                title: 'Manage News',
                icon: <CampaignIcon />
            },
            {
                segment: 'donations',
                title: 'Donations',
                icon: <CardGiftcardIcon />
            },
            {
                segment: 'plans',
                title: 'Membership Plans',
                icon: <CreditCardIcon />
            },
            {
                segment: 'square-transactions',
                title: 'Square Transactions',
                icon: <ReceiptLongIcon />
            }
        ]
    }
];

const BRANDING = {
    logo: <img src='/logos/darkLogo.png' alt="[efd] Logo" style={{ maxWidth: '150px', height: 'auto' }} />,
    title: '',
};

const AUTHENTICATION = { signIn, signOut };

export default function Providers({ session, children }) {
    const userRole = session?.user?.role || "user";
    const userID = session?.user?.userID;
    
    const navigation = React.useMemo(() => {
        const userNav = getUserNavigation(userID);
        return userRole === "admin" 
            ? [...userNav, ...ADMIN_NAVIGATION] 
            : userNav;
    }, [userID, userRole]);

    return (
        <SessionProvider session={session}>
            <AppRouterCacheProvider>
                <AppProvider
                    session={session}
                    navigation={navigation}
                    branding={BRANDING}
                    authentication={AUTHENTICATION}
                    theme={theme}
                >
                    <CssBaseline />
                    {children}
                </AppProvider>
            </AppRouterCacheProvider>
        </SessionProvider>
    );
}
