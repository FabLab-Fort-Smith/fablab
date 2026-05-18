"use client";

import * as React from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import DashboardIcon from '@mui/icons-material/Dashboard';
import BuildIcon from '@mui/icons-material/Build';
import BarChartIcon from '@mui/icons-material/BarChart';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import { createTheme } from '@mui/material/styles';
import { AppProvider } from '@toolpad/core/AppProvider';
import { DashboardLayout } from '@toolpad/core/DashboardLayout';
import { useDemoRouter } from '@toolpad/core/internal';
import { useSession, signOut } from 'next-auth/react';
import RepairsPage from '../repairs/page';
import AnalyticsPage from './analytics';

// ✅ Updated Navigation to Include Analytics
const getNavigation = (role) => [
    { segment: 'dashboard', title: 'Dashboard', icon: <DashboardIcon /> },
    { segment: 'repairs', title: 'Repairs', icon: <BuildIcon /> },
    { segment: 'analytics', title: 'Analytics', icon: <BarChartIcon /> }, // Added Analytics here
    ...(role === 'admin' ? [{ segment: 'admin', title: 'Admin Page', icon: <AdminPanelSettingsIcon /> }] : []),
];

const demoTheme = createTheme({
    cssVariables: { colorSchemeSelector: 'data-toolpad-color-scheme' },
    colorSchemes: { light: true, dark: true },
    breakpoints: { values: { xs: 0, sm: 600, md: 600, lg: 1200, xl: 1536 } }
});

/** ✅ Fetch Repairs Function **/
const fetchRepairs = async (setRepairs) => {
    try {
        const response = await fetch('/api/repairs');
        const data = await response.json();
        setRepairs(data);
    } catch (error) {
        console.error("Failed to fetch repairs:", error);
    }
};

// ✅ Repairs Page Component
function RepairsPageContent({ repairs }) {
    return (
        <Box sx={{ py: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <RepairsPage repairs={repairs} />
        </Box>
    );
}

RepairsPageContent.propTypes = {
    repairs: PropTypes.array.isRequired
};

// ✅ Analytics Page Component
function AnalyticsPageContent({ repairs }) {
    return (
        <Box sx={{ py: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <AnalyticsPage repairs={repairs} />
        </Box>
    );
}

AnalyticsPageContent.propTypes = {
    repairs: PropTypes.array.isRequired
};

// ✅ Updated Content Section with Analytics Prop Passing
function DemoPageContent({ pathname, role, repairs }) {
    switch (pathname) {
        case '/repairs':
            return <RepairsPageContent repairs={repairs} />;
        case '/analytics':
            return <AnalyticsPageContent repairs={repairs} />;
        default:
            return (
                <Box sx={{ py: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                    {role === 'admin' ? (
                        <>
                            <Typography variant="h4">Admin Dashboard</Typography>
                            <Typography>You have full access.</Typography>
                        </>
                    ) : (
                        <Typography variant="h4">Welcome to Your Dashboard!</Typography>
                    )}
                </Box>
            );
    }
}

DemoPageContent.propTypes = {
    pathname: PropTypes.string.isRequired,
    role: PropTypes.string.isRequired,
    repairs: PropTypes.array.isRequired
};

// ✅ Main Layout with State Management for Repairs
function DashboardLayoutAccount(props) {
    const router = useDemoRouter('/dashboard');
    const { data: session, status } = useSession();
    const [repairs, setRepairs] = React.useState([]);

    React.useEffect(() => {
        fetchRepairs(setRepairs);
    }, []);

    const authentication = React.useMemo(() => ({
        signIn: () => console.log("Sign-in triggered"),
        signOut: () => signOut({ callbackUrl: "/" }),
    }), []);

    if (status === "loading") {
        return <Typography>Loading...</Typography>;
    }

    if (!session) {
        return <Typography>Redirecting to login...</Typography>;
    }

    const role = session.user?.role || 'client';
    const NAVIGATION = getNavigation(role);

    return (
        <AppProvider
            session={session}
            authentication={authentication}
            navigation={NAVIGATION}
            router={router}
            theme={demoTheme}
            window={props.window}
        >
            <DashboardLayout>
                <DemoPageContent pathname={router.pathname} role={role} repairs={repairs} />
            </DashboardLayout>
        </AppProvider>
    );
}

DashboardLayoutAccount.propTypes = {
    window: PropTypes.func,
};

export default DashboardLayoutAccount;