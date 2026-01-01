"use client";
import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Chip, IconButton, Tooltip, LinearProgress, Button,
    Container, Card, CardContent, Stack, Avatar, useTheme, useMediaQuery,
    TextField, InputAdornment, Grid
} from '@mui/material';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import EditIcon from '@mui/icons-material/Edit';
import EmailIcon from '@mui/icons-material/Email';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import MemberDialog from '../../../components/admin/MemberDialog';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function VolunteersPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/auth/signin');
        } else if (status === 'authenticated') {
            if (session.user.role !== 'admin') {
                router.push('/dashboard');
            } else {
                fetchUsers();
            }
        }
    }, [status, session, router]);

    const fetchUsers = async () => {
        try {
            const response = await fetch('/api/v1/users');
            if (response.ok) {
                const data = await response.json();
                setUsers(data.users || []);
            }
        } catch (error) {
            console.error("Failed to fetch users", error);
        } finally {
            setLoading(false);
        }
    };

    const handleEditClick = (user) => {
        setSelectedUser(user);
        setDialogOpen(true);
    };

    const handleUserUpdate = (updatedUser) => {
        setUsers(prev => prev.map(u => u.userID === updatedUser.userID ? updatedUser : u));
    };

    const handleLogAction = async (user, logId, action) => {
        try {
            const updatedLogs = user.membership.volunteerLog.map(log => {
                if (log.id === logId) {
                    return {
                        ...log,
                        status: action === 'approve' ? 'approved' : 'rejected',
                        verifiedBy: session.user.firstName
                    };
                }
                return log;
            });

            const response = await fetch(`/api/v1/users?userID=${user.userID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    membership: {
                        ...user.membership,
                        volunteerLog: updatedLogs
                    }
                })
            });

            if (response.ok) {
                const data = await response.json();
                handleUserUpdate(data.user);
            }
        } catch (error) {
            console.error("Failed to update log status", error);
        }
    };

    const getMonthlyHours = (user) => {
        const logs = user.membership?.volunteerLog || [];
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        return logs
            .filter(log => {
                const d = new Date(log.date);
                // Only count approved logs
                const isApproved = !log.status || log.status === 'approved';
                return isApproved && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
            })
            .reduce((acc, log) => acc + (log.hours || 0), 0);
    };

    // Extract pending logs
    const pendingLogs = users.flatMap(user => 
        (user.membership?.volunteerLog || [])
            .filter(log => log.status === 'pending')
            .map(log => ({ ...log, user }))
    );

    const filteredUsers = users.filter(user => 
        user.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const columns = [
        { 
            field: 'fullName', 
            headerName: 'Member', 
            flex: 1,
            valueGetter: (value, row) => `${row.firstName} ${row.lastName}`
        },
        {
            field: 'membershipStatus',
            headerName: 'Status',
            width: 120,
            valueGetter: (value, row) => row.membership?.status || 'N/A',
            renderCell: (params) => {
                const status = params.value;
                let color = 'default';
                if (status === 'active') color = 'success';
                if (status === 'probation') color = 'warning';
                if (status === 'suspended') color = 'error';
                return <Chip label={status} color={color} size="small" variant="outlined" />;
            }
        },
        {
            field: 'monthlyHours',
            headerName: 'Current Month',
            width: 130,
            valueGetter: (value, row) => getMonthlyHours(row),
            renderCell: (params) => {
                const hours = params.value;
                const target = 4;
                const progress = Math.min((hours / target) * 100, 100);
                const isComplete = hours >= target;
                
                return (
                    <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ flex: 1 }}>
                            <LinearProgress 
                                variant="determinate" 
                                value={progress} 
                                color={isComplete ? "success" : "warning"}
                                sx={{ height: 8, borderRadius: 4 }}
                            />
                        </Box>
                        <Typography variant="caption" sx={{ minWidth: 35 }}>{hours}/{target}</Typography>
                    </Box>
                );
            }
        },
        {
            field: 'hoursNeeded',
            headerName: 'Needed',
            width: 100,
            valueGetter: (value, row) => {
                const hours = getMonthlyHours(row);
                return Math.max(0, 4 - hours);
            },
            renderCell: (params) => {
                return params.value > 0 ? (
                    <Typography color="error.main" fontWeight="bold">{params.value} hrs</Typography>
                ) : (
                    <CheckCircleIcon color="success" fontSize="small" />
                );
            }
        },
        {
            field: 'lastVolunteerDate',
            headerName: 'Last Active',
            width: 150,
            valueGetter: (value, row) => {
                const logs = row.membership?.volunteerLog || [];
                if (logs.length === 0) return null;
                // Sort by date desc
                const sorted = [...logs].sort((a, b) => new Date(b.date) - new Date(a.date));
                return sorted[0].date;
            },
            renderCell: (params) => {
                if (!params.value) return <Typography variant="caption" color="text.secondary">Never</Typography>;
                return new Date(params.value).toLocaleDateString();
            }
        },
        {
            field: 'actions',
            headerName: 'Actions',
            width: 150,
            sortable: false,
            renderCell: (params) => (
                <Box>
                    <Tooltip title="Contact Member">
                        <IconButton 
                            size="small" 
                            href={`mailto:${params.row.email}`}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <EmailIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Manage Member">
                        <IconButton size="small" onClick={() => handleEditClick(params.row)}>
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Box>
            )
        }
    ];

    return (
        <Container maxWidth="xl" sx={{ py: { xs: 2, md: 4 }, px: { xs: 2, md: 3 } }}>
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.75rem', md: '2.125rem' } }}>
                    Volunteer Compliance
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Track monthly volunteer hours and manage member status. Requirement: 4 hours/month.
                </Typography>
            </Box>

            {pendingLogs.length > 0 && (
                <Paper sx={{ mb: 4, p: 2, border: '1px solid #ed6c02', bgcolor: '#fff4e5' }}>
                    <Typography variant="h6" color="warning.main" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <WarningIcon /> Pending Approvals ({pendingLogs.length})
                    </Typography>
                    <Stack spacing={1}>
                        {pendingLogs.map((item) => (
                            <Paper key={item.id} elevation={0} sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
                                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2 }}>
                                    <Box>
                                        <Typography variant="subtitle2" fontWeight="bold">{item.user.firstName} {item.user.lastName}</Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {item.hours} hrs on {new Date(item.date).toLocaleDateString()} - "{item.description}"
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', gap: 1, width: { xs: '100%', sm: 'auto' } }}>
                                        <Button 
                                            size="small" 
                                            variant="contained" 
                                            color="success" 
                                            startIcon={<CheckIcon />}
                                            onClick={() => handleLogAction(item.user, item.id, 'approve')}
                                            fullWidth={isMobile}
                                        >
                                            Approve
                                        </Button>
                                        <Button 
                                            size="small" 
                                            variant="outlined" 
                                            color="error" 
                                            startIcon={<CloseIcon />}
                                            onClick={() => handleLogAction(item.user, item.id, 'reject')}
                                            fullWidth={isMobile}
                                        >
                                            Reject
                                        </Button>
                                    </Box>
                                </Box>
                            </Paper>
                        ))}
                    </Stack>
                </Paper>
            )}

            {isMobile ? (
                <Box>
                    <TextField
                        fullWidth
                        placeholder="Search volunteers..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        sx={{ mb: 3, bgcolor: 'background.paper' }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon color="action" />
                                </InputAdornment>
                            ),
                        }}
                    />
                    <Stack spacing={2}>
                        {filteredUsers.map((user) => {
                            const monthlyHours = getMonthlyHours(user);
                            const hoursNeeded = Math.max(0, 4 - monthlyHours);
                            const progress = Math.min((monthlyHours / 4) * 100, 100);
                            const isComplete = monthlyHours >= 4;
                            const status = user.membership?.status || 'N/A';
                            
                            // Get last active date
                            const logs = user.membership?.volunteerLog || [];
                            const sortedLogs = [...logs].sort((a, b) => new Date(b.date) - new Date(a.date));
                            const lastActive = sortedLogs.length > 0 ? new Date(sortedLogs[0].date).toLocaleDateString() : 'Never';

                            return (
                                <Card key={user.userID} elevation={2}>
                                    <CardContent>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                                            <Box sx={{ display: 'flex', gap: 2 }}>
                                                <Avatar sx={{ bgcolor: theme.palette.primary.main }}>
                                                    {user.firstName?.[0]}{user.lastName?.[0]}
                                                </Avatar>
                                                <Box>
                                                    <Typography variant="subtitle1" fontWeight="bold">
                                                        {user.firstName} {user.lastName}
                                                    </Typography>
                                                    <Chip 
                                                        label={status} 
                                                        size="small" 
                                                        color={status === 'active' ? 'success' : status === 'probation' ? 'warning' : 'error'}
                                                        variant="outlined"
                                                        sx={{ height: 20, fontSize: '0.7rem' }}
                                                    />
                                                </Box>
                                            </Box>
                                            <Box>
                                                <IconButton size="small" href={`mailto:${user.email}`}>
                                                    <EmailIcon fontSize="small" />
                                                </IconButton>
                                                <IconButton size="small" onClick={() => handleEditClick(user)}>
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                            </Box>
                                        </Box>

                                        <Box sx={{ mb: 2 }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                                <Typography variant="caption" color="text.secondary">Monthly Progress</Typography>
                                                <Typography variant="caption" fontWeight="bold">
                                                    {monthlyHours}/4 hrs
                                                </Typography>
                                            </Box>
                                            <LinearProgress 
                                                variant="determinate" 
                                                value={progress} 
                                                color={isComplete ? "success" : "warning"}
                                                sx={{ height: 8, borderRadius: 4 }}
                                            />
                                            {hoursNeeded > 0 ? (
                                                <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
                                                    {hoursNeeded} hours still needed
                                                </Typography>
                                            ) : (
                                                <Typography variant="caption" color="success.main" sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    <CheckCircleIcon fontSize="inherit" /> Monthly goal met
                                                </Typography>
                                            )}
                                        </Box>

                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', pt: 1, borderTop: 1, borderColor: 'divider' }}>
                                            <CalendarTodayIcon fontSize="small" />
                                            <Typography variant="body2">
                                                Last Active: {lastActive}
                                            </Typography>
                                        </Box>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </Stack>
                </Box>
            ) : (
                <Paper sx={{ height: 600, width: '100%' }}>
                    <DataGrid
                        rows={users}
                        columns={columns}
                        getRowId={(row) => row.userID}
                        loading={loading}
                        slots={{ toolbar: GridToolbar }}
                        slotProps={{
                            toolbar: {
                                showQuickFilter: true,
                            },
                        }}
                        initialState={{
                            sorting: {
                                sortModel: [{ field: 'hoursNeeded', sort: 'desc' }],
                            },
                            filter: {
                                filterModel: {
                                    items: [
                                        { field: 'membershipStatus', operator: 'isAnyOf', value: ['active', 'probation'] }
                                    ]
                                }
                            }
                        }}
                    />
                </Paper>
            )}

            <MemberDialog 
                open={dialogOpen} 
                onClose={() => setDialogOpen(false)} 
                user={selectedUser}
                onUpdate={handleUserUpdate}
            />
        </Container>
    );
}
