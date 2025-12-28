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
        segment: 'dashboard/terminal',
        title: 'HackTheLab',
        icon: <TerminalIcon />,
    },
    {
        segment: 'dashboard/feed',
        title: 'The Lab Feed',
        icon: <CollectionsIcon />,
    },
    {
        segment: 'dashboard/leaderboard',
        title: 'Leaderboard',
        icon: <EmojiEventsIcon />,
    },
    {
        segment: `dashboard/${userID}/volunteer`,
        title: 'Volunteer Log',
        icon: <VolunteerActivismIcon />,
    },
    {
        segment: 'dashboard/bounties',
        title: 'Bounties',
        icon: <AssignmentIcon />,
    },
    {
        segment: 'dashboard/bugs',
        title: 'Bug Tracker',
        icon: <BuildIcon />,
    },
    {
        segment: 'dashboard/badges',
        title: 'Badge Directory',
        icon: <EmojiEventsIcon />,
    },
    {
        segment: 'dashboard/directory',
        title: 'Member Directory',
        icon: <PeopleIcon />,
    },
    {
        segment: 'dashboard/code-of-conduct',
        title: 'Code of Conduct',
        icon: <MenuBookIcon />,
    },
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
        segment: 'dashboard/analytics',
        title: 'Analytics',
        icon: <BarChartIcon />
    },
    {
        segment: 'dashboard/members',
        title: 'Members',
        icon: <PeopleIcon />
    },
    {
        segment: 'dashboard/onboarding-reviews',
        title: 'Onboarding Reviews',
        icon: <RateReviewIcon />
    },
    {
        segment: 'dashboard/volunteers',
        title: 'Volunteers',
        icon: <VolunteerActivismIcon />
    },
    {
        segment: 'dashboard/checkin-log',
        title: 'Check-in Log',
        icon: <HistoryIcon />
    },
    {
        segment: 'dashboard/admin/bounty-ideas',
        title: 'Bounty Ideas',
        icon: <LightbulbIcon />
    },
    {
        segment: 'dashboard/admin/badges',
        title: 'Badge Management',
        icon: <EmojiEventsIcon />
    },
    {
        segment: 'dashboard/admin/contact',
        title: 'Contact Submissions',
        icon: <EmailIcon />
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
