"use client";
import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@toolpad/core/DashboardLayout';
import { PageContainer } from '@toolpad/core/PageContainer';
import { useTheme, Box, CircularProgress } from '@mui/material';
import NotificationBell from './components/NotificationBell';
import MobileBottomNav from './components/MobileBottomNav';

export default function Layout({ children }) {
  const theme = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <DashboardLayout slots={{ toolbarActions: NotificationBell }}>
      <Box
        sx={{
          backgroundColor: theme.palette.background.default,
          color: theme.palette.text.primary,
          minHeight: "100vh",
          height: "100%",
          padding: { xs: "1rem", md: "2rem" },
          paddingBottom: { xs: "120px", md: "2rem" },
          display: "flex",
          flexDirection: "column",
        }}
      >
        <PageContainer sx={{ flex: 1 }}>{children}</PageContainer>
        <MobileBottomNav />
      </Box>
    </DashboardLayout>
  );
}
