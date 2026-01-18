"use client";
import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Button, Card, CardContent, Chip, 
    Dialog, DialogTitle, DialogContent, DialogActions, 
    TextField, MenuItem, Select, InputLabel, FormControl, 
    Grid, IconButton, Tooltip, Alert, Tabs, Tab, Divider
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BugReportIcon from '@mui/icons-material/BugReport';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import BuildIcon from '@mui/icons-material/Build';
import FilterListIcon from '@mui/icons-material/FilterList';
import { useSession } from 'next-auth/react';

export default function BugsPage() {
    const { data: session } = useSession();
    const [bugs, setBugs] = useState([]);
    const [openSubmit, setOpenSubmit] = useState(false);
    const [openVerify, setOpenVerify] = useState(false);
    const [selectedBug, setSelectedBug] = useState(null);
    const [stakeReward, setStakeReward] = useState(0);
    const [tabValue, setTabValue] = useState(0);
    const [filterSeverity, setFilterSeverity] = useState('all');
    
    const [newBug, setNewBug] = useState({
        title: '',
        description: '',
        stepsToReproduce: '',
        severity: 'low'
    });

    useEffect(() => {
        fetchBugs();
    }, []);

    const fetchBugs = async () => {
        try {
            // Fetch more bugs to allow effective client-side filtering
            const res = await fetch('/api/v1/bugs?limit=100');
            if (res.ok) {
                const data = await res.json();
                setBugs(data);
            }
        } catch (error) {
            console.error("Failed to fetch bugs:", error);
        }
    };

    const handleSubmitBug = async () => {
        try {
            const res = await fetch('/api/v1/bugs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newBug)
            });
            if (res.ok) {
                setOpenSubmit(false);
                setNewBug({ title: '', description: '', stepsToReproduce: '', severity: 'low' });
                fetchBugs();
            }
        } catch (error) {
            console.error("Failed to submit bug:", error);
        }
    };

    const handleUpdateStatus = async (bugID, status, reward = 0) => {
        try {
            const res = await fetch('/api/v1/bugs', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bugID, status, stakeReward: reward })
            });
            if (res.ok) {
                setOpenVerify(false);
                fetchBugs();
            }
        } catch (error) {
            console.error("Failed to update bug status:", error);
        }
    };

    const openVerifyDialog = (bug) => {
        setSelectedBug(bug);
        setStakeReward(0);
        setOpenVerify(true);
    };

    const getSeverityColor = (severity) => {
        switch (severity) {
            case 'critical': return 'error';
            case 'high': return 'warning';
            case 'medium': return 'info';
            default: return 'default';
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'verified': return 'success';
            case 'fixed': return 'primary';
            case 'rejected': return 'error';
            default: return 'default';
        }
    };

    const handleTabChange = (event, newValue) => {
        setTabValue(newValue);
    };

    const getFilteredBugs = () => {
        let filtered = bugs;
        
        // Tab Filtering
        if (tabValue === 0) { // Active
            filtered = bugs.filter(b => ['open', 'verified'].includes(b.status));
        } else if (tabValue === 1) { // Resolved
            filtered = bugs.filter(b => ['fixed', 'rejected'].includes(b.status));
        }
        
        // Severity Filtering
        if (filterSeverity !== 'all') {
            filtered = filtered.filter(b => b.severity === filterSeverity);
        }
        
        return filtered;
    };

    const displayedBugs = getFilteredBugs();

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4">Bug Tracker</Typography>
                <Button 
                    variant="contained" 
                    startIcon={<AddIcon />} 
                    onClick={() => setOpenSubmit(true)}
                >
                    Report Bug
                </Button>
            </Box>

            <Card sx={{ mb: 4 }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center', pr: 2 }}>
                    <Tabs value={tabValue} onChange={handleTabChange}>
                        <Tab label={`Active (${bugs.filter(b => ['open', 'verified'].includes(b.status)).length})`} />
                        <Tab label={`Resolved (${bugs.filter(b => ['fixed', 'rejected'].includes(b.status)).length})`} />
                        <Tab label="All History" /> 
                    </Tabs>
                    
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <FilterListIcon color="action" />
                        <FormControl variant="standard" sx={{ minWidth: 120 }}>
                            <Select
                                value={filterSeverity}
                                onChange={(e) => setFilterSeverity(e.target.value)}
                                disableUnderline
                                displayEmpty
                            >
                                <MenuItem value="all">All Severities</MenuItem>
                                <MenuItem value="critical">Critical</MenuItem>
                                <MenuItem value="high">High</MenuItem>
                                <MenuItem value="medium">Medium</MenuItem>
                                <MenuItem value="low">Low</MenuItem>
                            </Select>
                        </FormControl>
                    </Box>
                </Box>
            </Card>

            <Grid container spacing={3}>
                {displayedBugs.length === 0 && (
                    <Grid item xs={12}>
                        <Alert severity="info">No bugs found in this category.</Alert>
                    </Grid>
                )}
                {displayedBugs.map((bug) => (
                    <Grid item xs={12} md={6} lg={4} key={bug.bugID}>
                        <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                            <CardContent>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Chip 
                                        label={bug.severity.toUpperCase()} 
                                        color={getSeverityColor(bug.severity)} 
                                        size="small" 
                                    />
                                    <Chip 
                                        label={bug.status.toUpperCase()} 
                                        color={getStatusColor(bug.status)} 
                                        variant="outlined"
                                        size="small" 
                                    />
                                </Box>
                                <Typography variant="h6" gutterBottom>{bug.title}</Typography>
                                <Typography variant="body2" color="text.secondary" paragraph>
                                    {bug.description}
                                </Typography>
                                {bug.stepsToReproduce && (
                                    <Box sx={{ mt: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                                        <Typography variant="caption" fontWeight="bold">Steps to Reproduce:</Typography>
                                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{bug.stepsToReproduce}</Typography>
                                    </Box>
                                )}
                                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                        <Typography variant="caption">
                                            By: {bug.submitterUsername}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {new Date(bug.createdAt).toLocaleDateString()}
                                        </Typography>
                                    </Box>
                                    
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        {bug.stakeReward > 0 && (
                                            <Chip label={`+${bug.stakeReward} Stake`} color="warning" size="small" icon={<BugReportIcon />} />
                                        )}
                                        
                                        {session?.user?.role === 'admin' && bug.status === 'open' && (
                                            <>
                                                <Tooltip title="Reject">
                                                    <IconButton size="small" color="error" onClick={() => handleUpdateStatus(bug.bugID, 'rejected')}>
                                                        <CancelIcon />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Verify & Reward">
                                                    <IconButton size="small" color="success" onClick={() => openVerifyDialog(bug)}>
                                                        <CheckCircleIcon />
                                                    </IconButton>
                                                </Tooltip>
                                            </>
                                        )}
                                        {session?.user?.role === 'admin' && bug.status === 'verified' && (
                                            <Tooltip title="Mark Fixed">
                                                <IconButton size="small" color="primary" onClick={() => handleUpdateStatus(bug.bugID, 'fixed')}>
                                                    <BuildIcon />
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                    </Box>
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            {/* Submit Dialog */}
            <Dialog open={openSubmit} onClose={() => setOpenSubmit(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Report a Bug</DialogTitle>
                <DialogContent>
                    <TextField 
                        label="Title" 
                        fullWidth 
                        margin="normal"
                        value={newBug.title}
                        onChange={(e) => setNewBug({...newBug, title: e.target.value})}
                    />
                    <FormControl fullWidth margin="normal">
                        <InputLabel>Severity</InputLabel>
                        <Select
                            value={newBug.severity}
                            label="Severity"
                            onChange={(e) => setNewBug({...newBug, severity: e.target.value})}
                        >
                            <MenuItem value="low">Low</MenuItem>
                            <MenuItem value="medium">Medium</MenuItem>
                            <MenuItem value="high">High</MenuItem>
                            <MenuItem value="critical">Critical</MenuItem>
                        </Select>
                    </FormControl>
                    <TextField 
                        label="Description" 
                        fullWidth 
                        multiline 
                        rows={3}
                        margin="normal"
                        value={newBug.description}
                        onChange={(e) => setNewBug({...newBug, description: e.target.value})}
                    />
                    <TextField 
                        label="Steps to Reproduce" 
                        fullWidth 
                        multiline 
                        rows={3}
                        margin="normal"
                        value={newBug.stepsToReproduce}
                        onChange={(e) => setNewBug({...newBug, stepsToReproduce: e.target.value})}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenSubmit(false)}>Cancel</Button>
                    <Button onClick={handleSubmitBug} variant="contained">Submit Report</Button>
                </DialogActions>
            </Dialog>

            {/* Verify Dialog */}
            <Dialog open={openVerify} onClose={() => setOpenVerify(false)}>
                <DialogTitle>Verify Bug & Award Stake</DialogTitle>
                <DialogContent>
                    <Typography paragraph>
                        Verifying this bug will mark it as confirmed. You can optionally award stake to the reporter.
                    </Typography>
                    <TextField 
                        label="Stake Reward Amount" 
                        type="number" 
                        fullWidth
                        value={stakeReward}
                        onChange={(e) => setStakeReward(e.target.value)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenVerify(false)}>Cancel</Button>
                    <Button onClick={() => handleUpdateStatus(selectedBug.bugID, 'verified', stakeReward)} variant="contained" color="success">
                        Verify & Award
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
