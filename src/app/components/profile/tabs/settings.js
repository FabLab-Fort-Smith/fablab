import React, { useState } from 'react';
import { Box, Typography, Button, Divider, Grid, Paper, useTheme, Alert, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Snackbar, Switch, FormControlLabel } from '@mui/material';
import { signIn } from 'next-auth/react';
import SecurityIcon from '@mui/icons-material/Security';
import VisibilityIcon from '@mui/icons-material/Visibility';
import IntegrationInstructionsIcon from '@mui/icons-material/IntegrationInstructions';

import NotificationsIcon from '@mui/icons-material/Notifications';

const SettingsTab = ({ user }) => {
    const theme = useTheme();
    const [openPasswordDialog, setOpenPasswordDialog] = useState(false);
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [privacySettings, setPrivacySettings] = useState({
        showEmail: user.privacy?.showEmail ?? true,
        showDiscord: user.privacy?.showDiscord ?? true,
        showPhone: user.privacy?.showPhone ?? false
    });
    const [notificationSettings, setNotificationSettings] = useState({
        email: user.notificationPreferences?.email ?? false,
        discord: user.notificationPreferences?.discord ?? false
    });
    const [snackbar, setSnackbar] = useState({
        open: false,
        message: '',
        severity: 'info'
    });

    const handleConnectGoogle = () => {
        signIn('google', { callbackUrl: `/dashboard/${user.userID}/profile?tab=3` });
    };

    const handleConnectDiscord = () => {
        // Initiate Discord Sign-in to link account
        signIn('discord', { callbackUrl: `/dashboard/${user.userID}/profile?tab=3` });
    };

    const handlePrivacyChange = async (setting) => {
        const newSettings = { ...privacySettings, [setting]: !privacySettings[setting] };
        setPrivacySettings(newSettings);

        try {
            const res = await fetch(`/api/v1/users?userID=${user.userID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    privacy: newSettings
                })
            });
            
            if (res.ok) {
                setSnackbar({ open: true, message: "Privacy settings updated.", severity: 'success' });
            } else {
                setSnackbar({ open: true, message: "Failed to update privacy settings.", severity: 'error' });
                setPrivacySettings(privacySettings); // Revert
            }
        } catch (error) {
            console.error(error);
            setSnackbar({ open: true, message: "Error updating settings.", severity: 'error' });
            setPrivacySettings(privacySettings); // Revert
        }
    };

    const handleNotificationChange = async (setting) => {
        const newSettings = { ...notificationSettings, [setting]: !notificationSettings[setting] };
        setNotificationSettings(newSettings);

        try {
            const res = await fetch(`/api/v1/users?userID=${user.userID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    notificationPreferences: newSettings
                })
            });
            
            if (res.ok) {
                setSnackbar({ open: true, message: "Notification preferences updated.", severity: 'success' });
            } else {
                setSnackbar({ open: true, message: "Failed to update notification preferences.", severity: 'error' });
                setNotificationSettings(notificationSettings); // Revert
            }
        } catch (error) {
            console.error(error);
            setSnackbar({ open: true, message: "Error updating settings.", severity: 'error' });
            setNotificationSettings(notificationSettings); // Revert
        }
    };

    const handlePasswordChange = (e) => {
        setPasswordForm({ ...passwordForm, [e.target.name]: e.target.value });
    };

    const handleSubmitPasswordChange = async () => {
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            setSnackbar({ open: true, message: "New passwords do not match.", severity: 'error' });
            return;
        }

        try {
            const res = await fetch('/api/v1/users/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userID: user.userID,
                    currentPassword: passwordForm.currentPassword,
                    newPassword: passwordForm.newPassword
                })
            });

            const data = await res.json();

            if (res.ok) {
                setSnackbar({ open: true, message: "Password updated successfully!", severity: 'success' });
                setOpenPasswordDialog(false);
                setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
            } else {
                setSnackbar({ open: true, message: data.error || "Failed to update password.", severity: 'error' });
            }
        } catch (error) {
            setSnackbar({ open: true, message: "An error occurred.", severity: 'error' });
        }
    };

    return (
        <Box sx={{ padding: { xs: 2, md: 3 }, backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary }}>
            <Typography variant="h6" gutterBottom sx={{ color: theme.palette.primary.main, display: 'flex', alignItems: 'center', gap: 1 }}>
                <SecurityIcon /> Security Settings
            </Typography>
            <Paper sx={{ p: 2, mb: 4, border: `1px solid ${theme.palette.divider}`, backgroundColor: 'transparent' }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={8}>
                        <Typography variant="subtitle1" sx={{ color: theme.palette.text.primary }}>Password</Typography>
                        <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                            Change your password to keep your account secure.
                        </Typography>
                    </Grid>
                    <Grid item xs={12} sm={4} sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
                        <Button variant="outlined" color="primary" onClick={() => setOpenPasswordDialog(true)}>
                            Change Password
                        </Button>
                    </Grid>
                </Grid>
            </Paper>

            <Divider sx={{ my: 4, borderColor: theme.palette.divider }} />

            <Typography variant="h6" gutterBottom sx={{ color: theme.palette.primary.main, display: 'flex', alignItems: 'center', gap: 1 }}>
                <VisibilityIcon /> Privacy Settings
            </Typography>
            <Paper sx={{ p: 2, mb: 4, border: `1px solid ${theme.palette.divider}`, backgroundColor: 'transparent' }}>
                <Grid container spacing={2}>
                    <Grid item xs={12}>
                        <Typography variant="body2" sx={{ color: theme.palette.text.secondary, mb: 2 }}>
                            Control what contact information is visible on your public profile.
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <FormControlLabel
                                control={<Switch checked={privacySettings.showEmail} onChange={() => handlePrivacyChange('showEmail')} />}
                                label="Show Email Address"
                            />
                            <FormControlLabel
                                control={<Switch checked={privacySettings.showDiscord} onChange={() => handlePrivacyChange('showDiscord')} />}
                                label="Show Discord Handle"
                            />
                            <FormControlLabel
                                control={<Switch checked={privacySettings.showPhone} onChange={() => handlePrivacyChange('showPhone')} />}
                                label="Show Phone Number"
                            />
                        </Box>
                    </Grid>
                </Grid>
            </Paper>

            <Divider sx={{ my: 4, borderColor: theme.palette.divider }} />

            <Typography variant="h6" gutterBottom sx={{ color: theme.palette.primary.main, display: 'flex', alignItems: 'center', gap: 1 }}>
                <NotificationsIcon /> Notification Preferences
            </Typography>
            <Paper sx={{ p: 2, mb: 4, border: `1px solid ${theme.palette.divider}`, backgroundColor: 'transparent' }}>
                <Grid container spacing={2}>
                    <Grid item xs={12}>
                        <Typography variant="body2" sx={{ color: theme.palette.text.secondary, mb: 2 }}>
                            Manage how you receive notifications from The Lab.
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <FormControlLabel
                                control={<Switch checked={notificationSettings.email} onChange={() => handleNotificationChange('email')} />}
                                label="Email Notifications"
                            />
                            <FormControlLabel
                                control={<Switch checked={notificationSettings.discord} onChange={() => handleNotificationChange('discord')} />}
                                label="Discord DM Notifications"
                            />
                        </Box>
                    </Grid>
                </Grid>
            </Paper>

            <Divider sx={{ my: 4, borderColor: theme.palette.divider }} />

            <Typography variant="h6" gutterBottom sx={{ color: theme.palette.primary.main, display: 'flex', alignItems: 'center', gap: 1 }}>
                <IntegrationInstructionsIcon /> Integrations
            </Typography>
            <Paper sx={{ p: 2, border: `1px solid ${theme.palette.divider}`, backgroundColor: 'transparent' }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={8}>
                        <Typography variant="subtitle1" sx={{ color: theme.palette.text.primary }}>Discord</Typography>
                        <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                            Link your Discord account to access the FabLab bot and community features.
                        </Typography>
                        {user.discordHandle && (
                            <Alert severity="success" sx={{ mt: 1, backgroundColor: 'rgba(0, 255, 0, 0.1)', color: theme.palette.success.main }}>
                                Connected as: {user.discordHandle}
                            </Alert>
                        )}
                    </Grid>
                    <Grid item xs={12} sm={4} sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
                        {user.discordHandle ? (
                            <Button variant="outlined" color="error" disabled>
                                Disconnect
                            </Button>
                        ) : (
                            <Button variant="contained" color="primary" onClick={handleConnectDiscord}>
                                Connect Discord
                            </Button>
                        )}
                    </Grid>
                </Grid>
                <Divider sx={{ my: 2, borderColor: theme.palette.divider }} />
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={8}>
                        <Typography variant="subtitle1" sx={{ color: theme.palette.text.primary }}>Google</Typography>
                        <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                            Link your Google account for easier login.
                        </Typography>
                        {user.googleId && (
                            <Alert severity="success" sx={{ mt: 1, backgroundColor: 'rgba(0, 255, 0, 0.1)', color: theme.palette.success.main }}>
                                Connected
                            </Alert>
                        )}
                    </Grid>
                    <Grid item xs={12} sm={4} sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
                        {user.googleId ? (
                            <Button variant="outlined" color="error" disabled>
                                Disconnect
                            </Button>
                        ) : (
                            <Button variant="contained" color="primary" onClick={handleConnectGoogle}>
                                Connect Google
                            </Button>
                        )}
                    </Grid>
                </Grid>
            </Paper>

            {/* Change Password Dialog */}
            <Dialog open={openPasswordDialog} onClose={() => setOpenPasswordDialog(false)}>
                <DialogTitle sx={{ color: theme.palette.primary.main }}>Change Password</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        name="currentPassword"
                        label="Current Password"
                        type="password"
                        fullWidth
                        variant="outlined"
                        value={passwordForm.currentPassword}
                        onChange={handlePasswordChange}
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        margin="dense"
                        name="newPassword"
                        label="New Password"
                        type="password"
                        fullWidth
                        variant="outlined"
                        value={passwordForm.newPassword}
                        onChange={handlePasswordChange}
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        margin="dense"
                        name="confirmPassword"
                        label="Confirm New Password"
                        type="password"
                        fullWidth
                        variant="outlined"
                        value={passwordForm.confirmPassword}
                        onChange={handlePasswordChange}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenPasswordDialog(false)} color="inherit">Cancel</Button>
                    <Button onClick={handleSubmitPasswordChange} color="primary" variant="contained">Update Password</Button>
                </DialogActions>
            </Dialog>

            {/* Snackbar for notifications */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                message={snackbar.message}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                ContentProps={{
                    sx: {
                        backgroundColor: snackbar.severity === 'success' ? theme.palette.success.main : theme.palette.error.main,
                        color: theme.palette.background.default
                    }
                }}
            />
        </Box>
    );
};

export default SettingsTab;
