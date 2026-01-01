"use client";
import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Chip, IconButton, Tooltip, 
    Card, CardContent, Grid, Avatar, useTheme, useMediaQuery, 
    Container, TextField, InputAdornment, Stack, Button 
} from '@mui/material';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function CheckInLogPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const theme = useTheme();
    
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/auth/signin');
        } else if (status === 'authenticated') {
            if (session.user.role !== 'admin') {
                router.push('/dashboard');
            } else {
                fetchLogs();
            }
        }
    }, [status, session, router]);

    const fetchLogs = async () => {
        try {
            const response = await fetch('/api/v1/checkin?mode=log&limit=100');
            if (response.ok) {
                const data = await response.json();
                setLogs(data.logs || []);
            }
        } catch (error) {
            console.error("Failed to fetch logs", error);
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        { field: 'userName', headerName: 'User', flex: 1 },
        { 
            field: 'checkInTime', 
            headerName: 'Check In', 
            flex: 1,
            valueFormatter: (value) => value ? new Date(value).toLocaleString() : '-'
        },
        { 
            field: 'checkOutTime', 
            headerName: 'Check Out', 
            flex: 1,
            valueFormatter: (value) => value ? new Date(value).toLocaleString() : '-'
        },
        { 
            field: 'durationMinutes', 
            headerName: 'Duration (min)', 
            width: 150,
            valueFormatter: (value) => value || '-'
        },
        {
            field: 'status',
            headerName: 'Status',
            width: 120,
            renderCell: (params) => (
                <Chip 
                    label={params.value} 
                    color={params.value === 'active' ? 'success' : 'default'} 
                    size="small" 
                />
            )
        }
    ];

    const MobileLogCard = ({ log }) => (
        <Card variant="outlined" sx={{ mb: 2, bgcolor: 'background.paper', borderColor: 'divider' }}>
            <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                        {log.userName}
                    </Typography>
                    <Chip 
                        label={log.status} 
                        color={log.status === 'active' ? 'success' : 'default'} 
                        size="small" 
                        variant="outlined"
                    />
                </Stack>
                
                <Grid container spacing={2}>
                    <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary" display="block">
                            Check In
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <AccessTimeIcon sx={{ fontSize: 16, color: 'success.main' }} />
                            <Typography variant="body2">
                                {new Date(log.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                            {new Date(log.checkInTime).toLocaleDateString()}
                        </Typography>
                    </Grid>
                    
                    <Grid item xs={6}>
                        <Typography variant="caption" color="text.secondary" display="block">
                            Check Out
                        </Typography>
                        {log.checkOutTime ? (
                            <>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <AccessTimeIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                                    <Typography variant="body2">
                                        {new Date(log.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </Typography>
                                </Box>
                                <Typography variant="caption" color="text.secondary">
                                    {new Date(log.checkOutTime).toLocaleDateString()}
                                </Typography>
                            </>
                        ) : (
                            <Typography variant="body2" color="text.secondary">-</Typography>
                        )}
                    </Grid>

                    {log.durationMinutes && (
                        <Grid item xs={12}>
                            <Box sx={{ 
                                p: 1, 
                                bgcolor: 'action.hover', 
                                borderRadius: 1, 
                                display: 'flex', 
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <Typography variant="body2" color="text.secondary">Duration</Typography>
                                <Typography variant="body2" fontWeight="bold">
                                    {Math.floor(log.durationMinutes / 60)}h {log.durationMinutes % 60}m
                                </Typography>
                            </Box>
                        </Grid>
                    )}
                </Grid>
            </CardContent>
        </Card>
    );

    return (
        <Container maxWidth="xl" sx={{ mt: 2, mb: 4, px: { xs: 2, md: 3 } }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3 }}>
                <IconButton onClick={() => router.back()} edge="start">
                    <ArrowBackIcon />
                </IconButton>
                <Typography variant="h5" component="h1" sx={{ fontWeight: 'bold', color: theme.palette.primary.main }}>
                    Check-In Log
                </Typography>
            </Stack>

            {isMobile ? (
                <Box>
                    {logs.map((log) => (
                        <MobileLogCard key={log.checkInID} log={log} />
                    ))}
                    {logs.length === 0 && !loading && (
                        <Typography variant="body1" color="text.secondary" align="center" sx={{ py: 4 }}>
                            No check-in logs found.
                        </Typography>
                    )}
                </Box>
            ) : (
                <Paper sx={{ height: 600, width: '100%', p: 2 }}>
                    <DataGrid
                        rows={logs}
                        columns={columns}
                        getRowId={(row) => row.checkInID}
                        loading={loading}
                        components={{ Toolbar: GridToolbar }}
                        initialState={{
                            sorting: {
                                sortModel: [{ field: 'checkInTime', sort: 'desc' }],
                            },
                        }}
                    />
                </Paper>
            )}
        </Container>
    );
}
