"use client";
import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    Typography, Box, Stepper, Step, StepLabel, StepContent,
    Checkbox, FormControlLabel, TextField, Select, MenuItem,
    InputLabel, FormControl, Chip, Divider, List, ListItem, ListItemText, CircularProgress,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, Paper,
    useTheme, useMediaQuery, Tabs, Tab, Card, CardContent, Stack, AppBar, Toolbar, Tooltip, Grid
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import AssignmentIcon from '@mui/icons-material/Assignment';
import HistoryIcon from '@mui/icons-material/History';
import SettingsIcon from '@mui/icons-material/Settings';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import StarIcon from '@mui/icons-material/Star';
import NudgeConfirmDialog from './NudgeConfirmDialog';
import Constants from '@/lib/constants';

function TabPanel(props) {
    const { children, value, index, ...other } = props;
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`simple-tabpanel-${index}`}
            aria-labelledby={`simple-tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box sx={{ p: { xs: 2, md: 3 } }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

export default function MemberDialog({ open, onClose, user, onUpdate }) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState(null);
    const [newLog, setNewLog] = useState({ hours: '', description: '', date: new Date().toISOString().split('T')[0] });
    const [tabValue, setTabValue] = useState(0);
    const [badges, setBadges] = useState([]);

    useEffect(() => {
        if (open) {
            fetch('/api/v1/badges')
                .then(res => res.json())
                .then(data => setBadges(data.badges || []))
                .catch(err => console.error("Failed to fetch badges", err));
        }
    }, [open]);
    
    // Nudge State
    const [nudgeDialogOpen, setNudgeDialogOpen] = useState(false);
    const [nudgeDetails, setNudgeDetails] = useState(null);
    const [nudgeLoading, setNudgeLoading] = useState(false);

    // Award Stake State
    const [awardDialogOpen, setAwardDialogOpen] = useState(false);
    const [awardAmount, setAwardAmount] = useState(10);
    const [awardReason, setAwardReason] = useState('');
    const [awardLoading, setAwardLoading] = useState(false);

    useEffect(() => {
        if (user) {
            setFormData({
                ...user,
                badges: user.badges || [],
                membership: {
                    status: 'registered',
                    volunteerLog: [],
                    accessKey: { issued: false, type: 'limited' },
                    ...user.membership
                }
            });
        }
    }, [user]);

    if (!user || !formData) return null;

    const handleMembershipChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            membership: {
                ...prev.membership,
                [field]: value
            }
        }));
    };

    const handleAddLog = () => {
        if (!newLog.hours || !newLog.description) return;
        
        const log = {
            id: crypto.randomUUID(),
            date: newLog.date,
            hours: Number(newLog.hours),
            description: newLog.description,
            verifiedBy: 'Admin', // In a real app, use session user
            status: 'approved'
        };

        setFormData(prev => ({
            ...prev,
            membership: {
                ...prev.membership,
                volunteerLog: [log, ...(prev.membership.volunteerLog || [])]
            }
        }));
        setNewLog({ hours: '', description: '', date: new Date().toISOString().split('T')[0] });
    };

    const handleVerifyEmail = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/users?userID=${user.userID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'verified' })
            });
            if (res.ok) {
                const data = await res.json();
                setFormData(prev => ({ ...prev, status: 'verified' }));
                if (onUpdate) onUpdate(data.user);
            } else {
                console.error("Failed to verify email");
            }
        } catch (error) {
            console.error("Error verifying email:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleResendVerification = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/auth/resend-verification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: user.email })
            });
            if (res.ok) {
                alert("Verification email sent!");
            } else {
                const data = await res.json();
                alert(data.error || "Failed to send email");
            }
        } catch (error) {
            console.error("Error sending verification email:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteLog = (logId) => {
        setFormData(prev => ({
            ...prev,
            membership: {
                ...prev.membership,
                volunteerLog: prev.membership.volunteerLog.filter(l => l.id !== logId)
            }
        }));
    };

    const handleNudge = async () => {
        try {
            setNudgeLoading(true);
            // 1. Preview the nudge first
            const previewResponse = await fetch('/api/v1/users/nudge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userID: user.userID, preview: true })
            });

            const previewData = await previewResponse.json();

            if (!previewResponse.ok) {
                alert(`Failed to preview nudge: ${previewData.error}`);
                return;
            }

            setNudgeDetails(previewData.details);
            setNudgeDialogOpen(true);
        } catch (error) {
            console.error("Error preparing nudge:", error);
            alert("Error preparing nudge.");
        } finally {
            setNudgeLoading(false);
        }
    };

    const handleConfirmNudge = async () => {
        try {
            setNudgeLoading(true);
            const response = await fetch('/api/v1/users/nudge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userID: user.userID, preview: false })
            });
            
            if (response.ok) {
                alert(`Nudge sent to ${user.firstName}!`);
                setNudgeDialogOpen(false);
            } else {
                const data = await response.json();
                alert(`Failed to send nudge: ${data.error}`);
            }
        } catch (error) {
            console.error("Error sending nudge:", error);
            alert("Error sending nudge.");
        } finally {
            setNudgeLoading(false);
        }
    };

    const totalHours = (formData.membership.volunteerLog || []).reduce((acc, log) => acc + log.hours, 0);
    const currentMonthHours = (formData.membership.volunteerLog || [])
        .filter(log => new Date(log.date).getMonth() === new Date().getMonth())
        .reduce((acc, log) => acc + log.hours, 0);

    const handleAccessKeyChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            membership: {
                ...prev.membership,
                accessKey: {
                    ...prev.membership.accessKey,
                    [field]: value
                }
            }
        }));
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/v1/users?userID=${user.userID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    membership: formData.membership,
                    role: formData.role,
                    boardPosition: formData.boardPosition,
                    squareID: formData.squareID,
                    badges: formData.badges
                })
            });

            if (!response.ok) throw new Error('Failed to update user');
            
            const updatedUser = await response.json();
            onUpdate(updatedUser.user);
            onClose();
        } catch (error) {
            console.error("Error updating user:", error);
            alert("Failed to update user");
        } finally {
            setLoading(false);
        }
    };

    const handleAwardStake = async () => {
        setAwardLoading(true);
        try {
            const response = await fetch('/api/v1/transactions/award', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    receiverId: user.userID,
                    amount: parseInt(awardAmount),
                    reason: awardReason
                })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to award stake');
            }

            alert(`Successfully awarded ${awardAmount} stake!`);
            setAwardDialogOpen(false);
            setAwardAmount(10);
            setAwardReason('');
            // Ideally refresh user data here, but for now we just close
        } catch (error) {
            console.error("Error awarding stake:", error);
            alert(error.message);
        } finally {
            setAwardLoading(false);
        }
    };

    const handleSyncSubscription = async () => {
        if (!formData.squareID) return;
        setLoading(true);
        try {
            const response = await fetch('/api/v1/square/subscriptions/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    squareID: formData.squareID,
                    userID: user.userID 
                })
            });
            
            if (!response.ok) throw new Error('Failed to sync subscription');
            
            const data = await response.json();
            if (data.user) {
                setFormData(prev => ({
                    ...prev,
                    ...data.user,
                    membership: {
                        ...prev.membership,
                        ...data.user.membership
                    }
                }));
                alert("Subscription synced successfully!");
            } else {
                alert("No active subscription found.");
            }
        } catch (error) {
            console.error("Error syncing subscription:", error);
            alert("Failed to sync subscription");
        } finally {
            setLoading(false);
        }
    };


    const activeStep = (() => {
        const m = formData.membership;
        if (!m.applicationDate) return 1;
        if (!m.contacted) return 2;
        if (!m.onboardingComplete) return 3;
        
        // Check subscription status (ACTIVE from Square or manually set status or waived or valid sponsorship)
        const isSponsorshipValid = m.sponsorshipExpiresAt && new Date(m.sponsorshipExpiresAt) > new Date();
        const isSubscribed = m.subscriptionStatus === 'ACTIVE' || m.isWaived || isSponsorshipValid;
        if (!isSubscribed && m.status !== 'active' && m.status !== 'probation') return 4; // Subscription
        
        // Profile Completion (Public or Private)
        if (!formData.profileCompleted && !formData.isPublic) return 5; // Public Profile
        
        if (totalHours < 4) return 6; // Volunteer Hours
        if (!m.accessKey?.issued) return 7; // Key
        if (m.status !== 'active') return 8; // Full Access
        return 9;
    })();

    const canAssignKey = (() => {
        const m = formData.membership;
        const isSponsorshipValid = m.sponsorshipExpiresAt && new Date(m.sponsorshipExpiresAt) > new Date();
        const isPaidMember = m.status === 'active' || m.status === 'probation' || m.subscriptionStatus === 'ACTIVE' || m.isWaived || isSponsorshipValid;
        const hasHours = totalHours >= 4;
        const notSuspended = m.status !== 'suspended';
        return isPaidMember && hasHours && notSuspended;
    })();

    return (
        <Dialog 
            open={open} 
            onClose={onClose} 
            maxWidth="lg" 
            fullWidth
            fullScreen={isMobile}
        >
            {isMobile ? (
                <AppBar sx={{ position: 'relative', borderBottom: '1px solid rgba(0, 0, 0, 0.12)', boxShadow: 'none' }} color="default">
                    <Toolbar>
                        <IconButton edge="start" color="inherit" onClick={onClose} aria-label="close">
                            <CloseIcon />
                        </IconButton>
                        <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
                            {user.firstName} {user.lastName}
                        </Typography>
                        <Button autoFocus color="inherit" onClick={handleSave} disabled={loading}>
                            {loading ? <CircularProgress size={24} color="inherit" /> : 'Save'}
                        </Button>
                        <Tooltip title="Award Stake">
                            <IconButton onClick={() => setAwardDialogOpen(true)} color="inherit" sx={{ ml: 1 }}>
                                <StarIcon />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Send Reminder (Nudge)">
                            <IconButton onClick={handleNudge} color="warning" sx={{ ml: 1 }}>
                                <NotificationsActiveIcon />
                            </IconButton>
                        </Tooltip>
                    </Toolbar>
                </AppBar>
            ) : (
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    Manage Member: {user.firstName} {user.lastName}
                    <Box>
                        <Tooltip title="Award Stake">
                            <IconButton onClick={() => setAwardDialogOpen(true)} color="primary" sx={{ mr: 1 }}>
                                <StarIcon />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Send Reminder (Nudge)">
                            <IconButton onClick={handleNudge} color="warning" sx={{ mr: 1 }}>
                                <NotificationsActiveIcon />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </DialogTitle>
            )}

            <DialogContent sx={{ p: 0 }}>
                <Box sx={{ p: { xs: 2, md: 3 }, pb: 0 }}>
                    <Box sx={{ display: 'flex', gap: 1, mb: 3, mt: 1, flexWrap: 'wrap' }}>
                        <Chip label={formData.role} color={formData.role === 'admin' ? 'secondary' : 'default'} size={isMobile ? "small" : "medium"} />
                        <Chip label={formData.membership.status} color="primary" variant="outlined" size={isMobile ? "small" : "medium"} />
                        <Chip label={`Total: ${totalHours}h`} variant="outlined" size={isMobile ? "small" : "medium"} />
                        <Chip label={`Month: ${currentMonthHours}h`} color={currentMonthHours >= 4 ? "success" : "warning"} variant="outlined" size={isMobile ? "small" : "medium"} />
                    </Box>
                </Box>

                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} variant={isMobile ? "fullWidth" : "standard"} sx={{ px: { xs: 0, md: 3 } }}>
                        <Tab icon={<AssignmentIcon />} iconPosition="start" label={isMobile ? "Progress" : "Progress"} />
                        <Tab icon={<HistoryIcon />} iconPosition="start" label={isMobile ? "Logs" : "Volunteer Logs"} />
                        <Tab icon={<SettingsIcon />} iconPosition="start" label={isMobile ? "Admin" : "Admin Actions"} />
                        <Tab icon={<EmojiEventsIcon />} iconPosition="start" label={isMobile ? "Badges" : "Badges"} />
                    </Tabs>
                </Box>

                <TabPanel value={tabValue} index={0}>
                    <Typography variant="h6" gutterBottom>Co-op Membership Progress</Typography>
                    <Stepper activeStep={activeStep} orientation="vertical">
                        <Step expanded>
                            <StepLabel>Account Created</StepLabel>
                            <StepContent>
                                <Typography variant="body2" color="text.secondary">
                                    Date: {new Date(formData.createdAt).toLocaleDateString()}
                                </Typography>
                            </StepContent>
                        </Step>

                        <Step expanded>
                            <StepLabel>Application Submitted</StepLabel>
                            <StepContent>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={!!formData.membership.applicationDate}
                                            onChange={(e) => handleMembershipChange('applicationDate', e.target.checked ? new Date().toISOString() : null)}
                                        />
                                    }
                                    label={formData.membership.applicationDate 
                                        ? `Submitted on ${new Date(formData.membership.applicationDate).toLocaleDateString()}`
                                        : "Mark Application as Submitted"}
                                />
                            </StepContent>
                        </Step>

                        <Step expanded>
                            <StepLabel>Initial Contact / Reviewed</StepLabel>
                            <StepContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, flexWrap: 'wrap' }}>
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={formData.membership.contacted}
                                                onChange={(e) => handleMembershipChange('contacted', e.target.checked)}
                                            />
                                        }
                                        label="Member has been contacted"
                                    />
                                    {formData.membership.reviewStatus === 'reviewed' && (
                                        <Chip label="Reviewed" color="success" size="small" />
                                    )}
                                </Box>
                                {!formData.membership.contacted && (
                                    <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                        <Button 
                                            variant="outlined" 
                                            size="small" 
                                            href={`mailto:${formData.email}`}
                                            target="_blank"
                                        >
                                            Email
                                        </Button>
                                        {formData.phoneNumber && (
                                            <Button 
                                                variant="outlined" 
                                                size="small" 
                                                href={`tel:${formData.phoneNumber}`}
                                            >
                                                Call
                                            </Button>
                                        )}
                                        {formData.discordHandle && (
                                            <Button 
                                                variant="outlined" 
                                                size="small"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(formData.discordHandle);
                                                    alert(`Copied Discord Handle: ${formData.discordHandle}`);
                                                }}
                                            >
                                                Copy Discord
                                            </Button>
                                        )}
                                    </Box>
                                )}
                            </StepContent>
                        </Step>

                        <Step expanded>
                            <StepLabel>Onboarding</StepLabel>
                            <StepContent>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={formData.membership.onboardingComplete}
                                            onChange={(e) => handleMembershipChange('onboardingComplete', e.target.checked)}
                                        />
                                    }
                                    label="Paperwork & Orientation Complete"
                                />
                            </StepContent>
                        </Step>

                        <Step expanded>
                            <StepLabel>Membership Subscription</StepLabel>
                            <StepContent>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    <Typography variant="body2" color={
                                        ['active', 'probation'].includes(formData.membership.status) || formData.membership.subscriptionStatus === 'ACTIVE' || formData.membership.isWaived || (formData.membership.sponsorshipExpiresAt && new Date(formData.membership.sponsorshipExpiresAt) > new Date())
                                        ? "success.main" : "error.main"
                                    }>
                                        {['active', 'probation'].includes(formData.membership.status) || formData.membership.subscriptionStatus === 'ACTIVE'
                                            ? "✅ Subscription Active" 
                                            : formData.membership.isWaived 
                                                ? "✅ Dues Waived (Admin)"
                                                : (formData.membership.sponsorshipExpiresAt && new Date(formData.membership.sponsorshipExpiresAt) > new Date())
                                                    ? `✅ Sponsored until ${new Date(formData.membership.sponsorshipExpiresAt).toLocaleDateString()}`
                                                    : "❌ Pending Payment / Subscription"}
                                    </Typography>
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={formData.membership.isWaived || false}
                                                onChange={(e) => handleMembershipChange('isWaived', e.target.checked)}
                                            />
                                        }
                                        label="Waive Membership Dues (Permanent)"
                                    />
                                </Box>
                            </StepContent>
                        </Step>

                        <Step expanded>
                            <StepLabel>Complete Public Profile</StepLabel>
                            <StepContent>
                                <Typography variant="body2" color={formData.profileCompleted || formData.isPublic ? "success.main" : "warning.main"}>
                                    {formData.profileCompleted || formData.isPublic
                                        ? `✅ Profile Setup Complete (${formData.isPublic ? "Public" : "Private"})` 
                                        : "⚠️ Profile Setup Incomplete"}
                                </Typography>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={formData.isPublic || false}
                                            onChange={(e) => setFormData(prev => ({ ...prev, isPublic: e.target.checked }))}
                                        />
                                    }
                                    label="Public Profile"
                                />
                            </StepContent>
                        </Step>

                        <Step expanded>
                            <StepLabel>First Month Volunteer Requirement</StepLabel>
                            <StepContent>
                                <Typography variant="body2" gutterBottom>
                                    {totalHours >= 4 ? "✅ Requirement Met" : `⚠️ ${4 - totalHours} hours remaining for probation`}
                                </Typography>
                            </StepContent>
                        </Step>

                        <Step expanded>
                            <StepLabel>Access Key Issued</StepLabel>
                            <StepContent>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                                        <FormControlLabel
                                            control={
                                                <Checkbox
                                                    checked={formData.membership.accessKey?.issued}
                                                    onChange={(e) => handleAccessKeyChange('issued', e.target.checked)}
                                                    disabled={!canAssignKey && !formData.membership.accessKey?.issued}
                                                />
                                            }
                                            label="Key Issued"
                                        />
                                        <Button 
                                            variant="outlined" 
                                            size="small" 
                                            onClick={() => {
                                                const newKey = Math.floor(100000 + Math.random() * 900000).toString();
                                                handleAccessKeyChange('code', newKey);
                                                handleAccessKeyChange('issued', true);
                                            }}
                                            disabled={!canAssignKey}
                                        >
                                            Generate Key
                                        </Button>
                                    </Box>
                                    
                                    {formData.membership.accessKey?.code && (
                                        <TextField
                                            label="Access Key Code"
                                            value={formData.membership.accessKey.code}
                                            size="small"
                                            fullWidth
                                            InputProps={{
                                                readOnly: true,
                                                endAdornment: (
                                                    <IconButton size="small" onClick={() => navigator.clipboard.writeText(formData.membership.accessKey.code)}>
                                                        <AddIcon sx={{ transform: 'rotate(45deg)' }} />
                                                    </IconButton>
                                                )
                                            }}
                                        />
                                    )}

                                    {!canAssignKey && !formData.membership.accessKey?.issued && (
                                        <Typography variant="caption" color="error">
                                            Cannot assign key: User must be active/probation, have 4+ volunteer hours, and not be suspended.
                                        </Typography>
                                    )}
                                    {formData.membership.accessKey?.issued && (
                                        <FormControl size="small" fullWidth>
                                            <InputLabel>Key Type</InputLabel>
                                            <Select
                                                value={formData.membership.accessKey?.type || 'limited'}
                                                label="Key Type"
                                                onChange={(e) => handleAccessKeyChange('type', e.target.value)}
                                            >
                                                <MenuItem value="limited">Limited (8am - 10pm)</MenuItem>
                                                <MenuItem value="24h">24 Hour Access</MenuItem>
                                            </Select>
                                        </FormControl>
                                    )}
                                </Box>
                            </StepContent>
                        </Step>
                    </Stepper>
                </TabPanel>

                <TabPanel value={tabValue} index={1}>
                    <Typography variant="h6" gutterBottom>Volunteer Logs</Typography>
                    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1, mb: 3, alignItems: { xs: 'stretch', sm: 'flex-end' } }}>
                        <TextField
                            label="Date"
                            type="date"
                            size="small"
                            value={newLog.date}
                            onChange={(e) => setNewLog({ ...newLog, date: e.target.value })}
                            InputLabelProps={{ shrink: true }}
                            fullWidth={isMobile}
                        />
                        <TextField
                            label="Hours"
                            type="number"
                            size="small"
                            sx={{ width: { xs: '100%', sm: 80 } }}
                            value={newLog.hours}
                            onChange={(e) => setNewLog({ ...newLog, hours: e.target.value })}
                        />
                        <TextField
                            label="Description"
                            size="small"
                            fullWidth
                            value={newLog.description}
                            onChange={(e) => setNewLog({ ...newLog, description: e.target.value })}
                        />
                        <Button 
                            variant="contained" 
                            onClick={handleAddLog}
                            startIcon={<AddIcon />}
                            fullWidth={isMobile}
                        >
                            Add
                        </Button>
                    </Box>

                    {isMobile ? (
                        <Stack spacing={2}>
                            {(formData.membership.volunteerLog || []).map((log) => (
                                <Card key={log.id} variant="outlined">
                                    <CardContent sx={{ pb: 1 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <Box>
                                                <Typography variant="subtitle2" fontWeight="bold">
                                                    {new Date(log.date).toLocaleDateString()}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    {log.hours} Hours
                                                </Typography>
                                            </Box>
                                            <IconButton size="small" color="error" onClick={() => handleDeleteLog(log.id)}>
                                                <DeleteIcon />
                                            </IconButton>
                                        </Box>
                                        <Typography variant="body2" sx={{ mt: 1 }}>
                                            {log.description}
                                        </Typography>
                                    </CardContent>
                                </Card>
                            ))}
                            {(!formData.membership.volunteerLog || formData.membership.volunteerLog.length === 0) && (
                                <Typography variant="body2" color="text.secondary" align="center">No logs found</Typography>
                            )}
                        </Stack>
                    ) : (
                        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
                            <Table size="small" stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Date</TableCell>
                                        <TableCell>Hours</TableCell>
                                        <TableCell>Description</TableCell>
                                        <TableCell align="right">Action</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {(formData.membership.volunteerLog || []).map((log) => (
                                        <TableRow key={log.id}>
                                            <TableCell>{new Date(log.date).toLocaleDateString()}</TableCell>
                                            <TableCell>{log.hours}</TableCell>
                                            <TableCell>{log.description}</TableCell>
                                            <TableCell align="right">
                                                <IconButton size="small" color="error" onClick={() => handleDeleteLog(log.id)}>
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {(!formData.membership.volunteerLog || formData.membership.volunteerLog.length === 0) && (
                                        <TableRow>
                                            <TableCell colSpan={4} align="center">No logs found</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </TabPanel>

                <TabPanel value={tabValue} index={2}>
                    <Typography variant="h6" gutterBottom>Admin Actions</Typography>
                    <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
                        <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
                            <FormControl fullWidth>
                                <InputLabel>Role</InputLabel>
                                <Select
                                    value={formData.role}
                                    label="Role"
                                    onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                                >
                                    <MenuItem value="user">User</MenuItem>
                                    <MenuItem value="admin">Admin</MenuItem>
                                </Select>
                            </FormControl>

                            <FormControl fullWidth>
                                <InputLabel>Membership Status</InputLabel>
                                <Select
                                    value={formData.membership.status}
                                    label="Membership Status"
                                    onChange={(e) => handleMembershipChange('status', e.target.value)}
                                >
                                    <MenuItem value="registered">Registered</MenuItem>
                                    <MenuItem value="applicant">Applicant</MenuItem>
                                    <MenuItem value="onboarding">Onboarding</MenuItem>
                                    <MenuItem value="probation">Probation</MenuItem>
                                    <MenuItem value="active">Active Member</MenuItem>
                                    <MenuItem value="suspended">Suspended</MenuItem>
                                </Select>
                            </FormControl>

                            <FormControl fullWidth>
                                <InputLabel>Membership Type</InputLabel>
                                <Select
                                    value={formData.membership.type || 'community'}
                                    label="Membership Type"
                                    onChange={(e) => handleMembershipChange('type', e.target.value)}
                                >
                                    <MenuItem value="community">Community</MenuItem>
                                    <MenuItem value="co-op">Co-op</MenuItem>
                                </Select>
                            </FormControl>
                        </Box>

                        <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                            <Typography variant="subtitle2" gutterBottom>Email Verification</Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                                <Chip 
                                    label={formData.status === 'verified' ? "Verified" : "Unverified"} 
                                    color={formData.status === 'verified' ? "success" : "warning"} 
                                    variant="outlined"
                                />
                                {formData.status !== 'verified' && (
                                    <>
                                        <Button variant="outlined" size="small" onClick={handleVerifyEmail} disabled={loading}>
                                            Manually Verify
                                        </Button>
                                        <Button variant="outlined" size="small" onClick={handleResendVerification} disabled={loading}>
                                            Resend Email
                                        </Button>
                                    </>
                                )}
                            </Box>
                        </Box>

                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                            <TextField
                                fullWidth
                                label="Square Customer ID"
                                value={formData.squareID || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, squareID: e.target.value }))}
                                helperText="Enter Square Customer ID to sync subscription"
                            />
                            <Button 
                                variant="outlined" 
                                onClick={handleSyncSubscription}
                                disabled={loading || !formData.squareID}
                                sx={{ mt: 1, height: 40, whiteSpace: 'nowrap' }}
                            >
                                Sync
                            </Button>
                        </Box>

                        {formData.role === 'admin' && (
                            <TextField
                                fullWidth
                                label="Board Position / Title"
                                value={formData.boardPosition || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, boardPosition: e.target.value }))}
                                helperText="e.g. President, Treasurer, Shop Manager"
                            />
                        )}
                    </Box>
                </TabPanel>

                <TabPanel value={tabValue} index={3}>
                    <Typography variant="h6" gutterBottom>Manage Badges</Typography>
                    <Grid container spacing={2}>
                        {badges.map((badge) => (
                            <Grid item xs={12} sm={6} key={badge.id}>
                                <Paper variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Checkbox 
                                        checked={(formData.badges || []).includes(badge.id)}
                                        onChange={(e) => {
                                            const newBadges = e.target.checked 
                                                ? [...(formData.badges || []), badge.id]
                                                : (formData.badges || []).filter(b => b !== badge.id);
                                            setFormData(prev => ({ ...prev, badges: newBadges }));
                                        }}
                                    />
                                    <Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            {badge.imageUrl ? (
                                                <img src={badge.imageUrl} alt={badge.name} style={{ width: 32, height: 32, borderRadius: '50%' }} />
                                            ) : (
                                                <Typography variant="h5">{badge.icon}</Typography>
                                            )}
                                            <Typography variant="subtitle1" fontWeight="bold">{badge.name}</Typography>
                                        </Box>
                                        <Typography variant="body2" color="text.secondary">{badge.description}</Typography>
                                    </Box>
                                </Paper>
                            </Grid>
                        ))}
                    </Grid>
                </TabPanel>
            </DialogContent>
            
            {!isMobile && (
                <DialogActions>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button 
                        onClick={handleSave} 
                        variant="contained" 
                        disabled={loading}
                        startIcon={loading ? <CircularProgress size={20} /> : null}
                    >
                        Save Changes
                    </Button>
                </DialogActions>
            )}

            <NudgeConfirmDialog 
                open={nudgeDialogOpen}
                onClose={() => setNudgeDialogOpen(false)}
                onConfirm={handleConfirmNudge}
                nudgeDetails={nudgeDetails}
                loading={nudgeLoading}
            />

            {/* Award Stake Dialog */}
            <Dialog open={awardDialogOpen} onClose={() => setAwardDialogOpen(false)}>
                <DialogTitle>Award Stake to {user.firstName}</DialogTitle>
                <DialogContent>
                    <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 300 }}>
                        <TextField
                            label="Amount"
                            type="number"
                            fullWidth
                            value={awardAmount}
                            onChange={(e) => setAwardAmount(e.target.value)}
                            InputProps={{
                                startAdornment: <StarIcon color="warning" sx={{ mr: 1 }} />
                            }}
                        />
                        <TextField
                            label="Reason / Note"
                            fullWidth
                            multiline
                            rows={2}
                            value={awardReason}
                            onChange={(e) => setAwardReason(e.target.value)}
                            placeholder="e.g. Volunteer work, Workshop host"
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAwardDialogOpen(false)}>Cancel</Button>
                    <Button 
                        onClick={handleAwardStake} 
                        variant="contained" 
                        disabled={awardLoading || !awardAmount}
                    >
                        {awardLoading ? <CircularProgress size={24} /> : "Award Stake"}
                    </Button>
                </DialogActions>
            </Dialog>
        </Dialog>
    );
}
