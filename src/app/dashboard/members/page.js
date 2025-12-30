"use client";
import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Chip, IconButton, Tooltip, 
    Card, CardContent, Grid, Avatar, useTheme, useMediaQuery, 
    Container, TextField, InputAdornment, Stack, Button, Pagination 
} from '@mui/material';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';
import PersonIcon from '@mui/icons-material/Person';
import EmailIcon from '@mui/icons-material/Email';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import MemberDialog from '../../components/admin/MemberDialog';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function MembersPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [paginationModel, setPaginationModel] = useState({
        page: 0,
        pageSize: 10,
    });
    const [rowCount, setRowCount] = useState(0);

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/auth/signin');
        } else if (status === 'authenticated') {
            if (session.user.role !== 'admin') {
                router.push('/dashboard'); // Redirect non-admins
            } else {
                fetchUsers(paginationModel.page + 1, paginationModel.pageSize);
            }
        }
    }, [status, session, router, paginationModel]);

    const fetchUsers = async (page = 1, limit = 10) => {
        setLoading(true);
        try {
            const response = await fetch(`/api/v1/users?page=${page}&limit=${limit}`);
            if (response.ok) {
                const data = await response.json();
                setUsers(data.users || []);
                setRowCount(data.total || 0);
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

    const getStatusColor = (status) => {
        if (status === 'active') return 'success';
        if (status === 'probation') return 'warning';
        if (status === 'suspended') return 'error';
        return 'default';
    };

    const filteredUsers = users.filter(user => 
        user.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const columns = [
        { field: 'firstName', headerName: 'First Name', flex: 1 },
        { field: 'lastName', headerName: 'Last Name', flex: 1 },
        { field: 'email', headerName: 'Email', flex: 1.5 },
        { 
            field: 'role', 
            headerName: 'Role', 
            width: 100,
            renderCell: (params) => (
                <Chip 
                    label={params.value} 
                    color={params.value === 'admin' ? 'secondary' : 'default'} 
                    size="small" 
                />
            )
        },
        {
            field: 'membershipStatus',
            headerName: 'Status',
            width: 120,
            valueGetter: (value, row) => row.membership?.status || 'N/A',
            renderCell: (params) => (
                <Chip 
                    label={params.value} 
                    color={getStatusColor(params.value)} 
                    size="small" 
                    variant="outlined" 
                />
            )
        },
        {
            field: 'volunteerHours',
            headerName: 'Hours (Total)',
            width: 120,
            valueGetter: (value, row) => {
                const logs = row.membership?.volunteerLog || [];
                return logs.reduce((acc, log) => acc + (log.hours || 0), 0);
            },
        },
        {
            field: 'currentMonthHours',
            headerName: 'Hours (Month)',
            width: 120,
            valueGetter: (value, row) => {
                const logs = row.membership?.volunteerLog || [];
                const currentMonth = new Date().getMonth();
                return logs
                    .filter(log => new Date(log.date).getMonth() === currentMonth)
                    .reduce((acc, log) => acc + (log.hours || 0), 0);
            },
        },
        {
            field: 'actions',
            headerName: 'Actions',
            width: 100,
            sortable: false,
            renderCell: (params) => (
                <Tooltip title="Manage Member">
                    <IconButton onClick={() => handleEditClick(params.row)} color="primary">
                        <EditIcon />
                    </IconButton>
                </Tooltip>
            )
        }
    ];

    if (status === 'loading' || loading) {
        return <Typography>Loading...</Typography>;
    }

    if (session?.user?.role !== 'admin') {
        return <Typography color="error">Access Denied</Typography>;
    }

    return (
        <Container maxWidth="xl" sx={{ py: { xs: 2, md: 4 }, px: { xs: 2, md: 3 } }}>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.75rem', md: '2.125rem' } }}>
                        Member Management
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Manage community members and roles
                    </Typography>
                </Box>
                <Button 
                    variant="outlined" 
                    startIcon={<AccessTimeIcon />}
                    onClick={() => router.push('/dashboard/checkin-log')}
                    sx={{ display: { xs: 'none', sm: 'flex' } }}
                >
                    Check-In Log
                </Button>
            </Box>

            {isMobile ? (
                <Box>
                    <TextField
                        fullWidth
                        placeholder="Search members..."
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
                            const totalHours = (user.membership?.volunteerLog || []).reduce((acc, log) => acc + (log.hours || 0), 0);
                            const status = user.membership?.status || 'N/A';
                            
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
                                                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                                        <Chip 
                                                            label={user.role} 
                                                            size="small" 
                                                            color={user.role === 'admin' ? 'secondary' : 'default'}
                                                            sx={{ height: 20, fontSize: '0.7rem' }}
                                                        />
                                                        <Chip 
                                                            label={status} 
                                                            size="small" 
                                                            color={getStatusColor(status)}
                                                            variant="outlined"
                                                            sx={{ height: 20, fontSize: '0.7rem' }}
                                                        />
                                                    </Box>
                                                </Box>
                                            </Box>
                                            <IconButton onClick={() => handleEditClick(user)} size="small">
                                                <EditIcon />
                                            </IconButton>
                                        </Box>

                                        <Stack spacing={1}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                                                <EmailIcon fontSize="small" />
                                                <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                                                    {user.email}
                                                </Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                                                <AccessTimeIcon fontSize="small" />
                                                <Typography variant="body2">
                                                    {totalHours} Total Hours
                                                </Typography>
                                            </Box>
                                        </Stack>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </Stack>
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                        <Pagination 
                            count={Math.ceil(rowCount / paginationModel.pageSize)} 
                            page={paginationModel.page + 1} 
                            onChange={(e, value) => setPaginationModel(prev => ({ ...prev, page: value - 1 }))} 
                            color="primary" 
                        />
                    </Box>
                </Box>
            ) : (
                <Paper sx={{ height: 'calc(100vh - 200px)', width: '100%' }}>
                    <DataGrid
                        rows={users}
                        columns={columns}
                        getRowId={(row) => row.userID}
                        slots={{ toolbar: GridToolbar }}
                        slotProps={{
                            toolbar: {
                                showQuickFilter: true,
                            },
                        }}
                        disableRowSelectionOnClick
                        paginationMode="server"
                        rowCount={rowCount}
                        paginationModel={paginationModel}
                        onPaginationModelChange={setPaginationModel}
                        loading={loading}
                        pageSizeOptions={[10, 25, 50, 100]}
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
