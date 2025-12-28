"use client";
import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Box, Typography, Button, Breadcrumbs, Link, Snackbar, useTheme, Fab, Zoom, Alert } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import UserHeader from '@/app/components/profile/header';
import UserDetailsForm from '@/app/components/profile/details';
import UserImage from '@/app/components/profile/image';
import UsersService from '@/services/users';
import MembershipTab from '@/app/components/profile/tabs/membership';
import PublicProfileTab from '@/app/components/profile/tabs/publicProfile';
import SettingsTab from '@/app/components/profile/tabs/settings';
import LoadingTerminal from '@/app/components/LoadingTerminal';

const ViewUserPage = () => {
    const { data: session } = useSession();
    const params = useParams();
    const searchParams = useSearchParams();
    const [userID, setUserID] = useState(params?.userID);
    const [user, setUser] = useState(null);
    const [updatedUser, setUpdatedUser] = useState({});
    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarSeverity, setSnackbarSeverity] = useState('info');
    const [hasChanges, setHasChanges] = useState(false);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState(parseInt(searchParams.get('tab')) || 0);
    const [open, setOpen] = useState(false);
    const router = useRouter();
    const theme = useTheme();

    const loadingSteps = [
        'Initializing...',
        'Loading user data...',
        'Fetching membership plans...',
        'Connecting to database...',
        'Retrieving session information...',
        'Finalizing setup...',
        'Almost there...'
    ];

    useEffect(() => {
        const fetchUser = async () => {
            if (userID) {
                try {
                    console.log("🔍 Fetching User Data for ID:", userID);
                    const query = {
                        property: 'userID',
                        value: userID
                    }
                    const fetchedUser = await UsersService.getUserByQuery(query);
                    console.log("✅ Fetched User Data:", fetchedUser);
                    setUser(fetchedUser);
                    setUpdatedUser(fetchedUser);
                    setLoading(false);
                } catch (error) {
                    console.error("❌ Failed to fetch user:", error);
                }
            }
        };

        fetchUser();
    }, [userID]);

    const handleTabChange = (event, newValue) => {
        console.log("🟡 Tab Changed:", newValue);
        setActiveTab(newValue);
    };

    const handleEditChange = (field, value) => {
        console.log(`✏️ Editing Field: ${field}, Value: ${value}`);
        setUpdatedUser(prev => ({ ...prev, [field]: value }));
        setHasChanges(true);
        setSnackbarMessage("⚠️ Unsaved changes detected! Please save.");
        setSnackbarSeverity('warning');
        setSnackbarOpen(true);
    };

    const handleMembershipUpdate = (updatedUserData) => {
        console.log("✅ Membership Updated:", updatedUserData);
        setUser(updatedUserData);
        setUpdatedUser(updatedUserData);
        setSnackbarMessage("Membership updated successfully!");
        setSnackbarSeverity('success');
        setSnackbarOpen(true);
    };

    const handleSaveChanges = async () => {
        try {
            if (!userID) {
                console.error("❌ Missing User ID");
                setSnackbarMessage("❌ User ID is missing.");
                setSnackbarSeverity('error');
                setSnackbarOpen(true);
                return;
            }

            setLoading(true);
            
            // If on Public Profile tab (index 2), mark profile as completed
            const dataToSave = { ...updatedUser };
            if (activeTab === 2) {
                dataToSave.profileCompleted = true;
                // Ensure isPublic defaults to true if not set, though the switch handles the UI
                if (dataToSave.isPublic === undefined) dataToSave.isPublic = true;
            }

            console.log("📦 Saving Updated User Data:", dataToSave);
            await UsersService.updateUser(userID, dataToSave);

            setSnackbarMessage("✅ User saved successfully!");
            setSnackbarSeverity('success');
            setSnackbarOpen(true);
            setHasChanges(false);
            
            // Update local state
            setUser(dataToSave);
            setUpdatedUser(dataToSave);
        } catch (error) {
            console.error("❌ Error Saving User:", error);
            setSnackbarMessage(`❌ Error saving user: ${error.message}`);
            setSnackbarSeverity('error');
            setSnackbarOpen(true);
        } finally {
            setLoading(false);
        }
    };

    const handleNewRepair = (newRepair) => {
        console.log("🛠️ New Repair Added:", newRepair);
        setRepairs((prev) => [...prev, newRepair]);
    };

    if (loading) {
        console.log("⏳ Loading User Data...");
        return <LoadingTerminal steps={loadingSteps} />;
    }

    return (
        <Box sx={{ padding: { xs: 2, md: 4 }, backgroundColor: theme.palette.background.default, color: theme.palette.text.primary }}>
            {/* Breadcrumbs */}
            <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2, color: theme.palette.text.primary }}>
                <Link underline="hover" color="inherit" onClick={() => router.push('/dashboard')} sx={{ cursor: 'pointer', color: theme.palette.text.primary }}>
                    Dashboard
                </Link>
                <Typography sx={{ color: theme.palette.primary }}>Profile</Typography>
            </Breadcrumbs>

            {/* User Header with Tabs Integrated */}
            <UserHeader
                onSave={handleSaveChanges}
                hasChanges={hasChanges}
                user={updatedUser}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
            />

            {/* Profile Completion Reward Alert */}
            {(!updatedUser?.bio || !updatedUser?.image) && (
                <Alert severity="info" sx={{ mt: 2, mx: { xs: 2, md: 0 } }}>
                    ✨ <strong>Complete your profile</strong> (Bio & Profile Picture) to earn <strong>10 Stake</strong>!
                </Alert>
            )}

            {/* Tab Content Handling */}
            {/* User Details Tab */}
            {activeTab === 0 && (
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'center', md: 'flex-start' }, gap: 4, mt: 3 }}>
                    <UserImage 
                        picture={updatedUser.image || session?.user?.image} 
                        onUpload={(url) => handleEditChange('image', url)}
                        editable={true}
                    />
                    <UserDetailsForm user={updatedUser} onEdit={handleEditChange} />
                </Box>
            )}
            {/* Membership Tab */}
            {activeTab === 1 && (
                <Box sx={{ mt: 3 }}>
                  <MembershipTab user={user} onUpdateMembership={handleMembershipUpdate} />
                </Box>
            )}
            {/* Public Profile Tab */}
            {activeTab === 2 && (
                <Box sx={{ mt: 3 }}>
                  <PublicProfileTab user={updatedUser} onEdit={handleEditChange} />
                </Box>
            )}
            {/* Settings Tab */}
            {activeTab === 3 && (
                <Box sx={{ mt: 3 }}>
                  <SettingsTab user={updatedUser} />
                </Box>
            )}
            {/* Mobile Save FAB */}
            <Zoom in={hasChanges}>
                <Fab 
                    color="primary" 
                    aria-label="save" 
                    onClick={handleSaveChanges}
                    sx={{ 
                        position: 'fixed', 
                        bottom: 24, 
                        right: 24, 
                        display: { xs: 'flex', md: 'none' } 
                    }}
                >
                    <SaveIcon />
                </Fab>
            </Zoom>

            {/* Snackbar */}
            <Snackbar
                open={snackbarOpen}
                autoHideDuration={6000}
                onClose={() => setSnackbarOpen(false)}
                message={snackbarMessage}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                ContentProps={{
                    sx: {
                        backgroundColor: snackbarSeverity === "success"
                            ? "green"
                            : snackbarSeverity === "error"
                                ? "red"
                                : "orange",
                        color: "white",
                        fontWeight: "bold"
                    }
                }}
                action={
                    hasChanges && snackbarSeverity === "warning" ? (
                        <Button color="inherit" size="small" onClick={handleSaveChanges}>
                            Save Now
                        </Button>
                    ) : (
                        <Button color="inherit" size="small" onClick={() => setSnackbarOpen(false)}>
                            Close
                        </Button>
                    )
                }
            />
        </Box>
    );
};

export default ViewUserPage;
