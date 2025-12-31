"use client";

import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Avatar,
  useTheme,
  Stepper,
  Step,
  StepLabel,
  Alert,
  IconButton,
  Paper,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from "@mui/material";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { 
    Person as PersonIcon, 
    CardMembership as MembershipIcon, 
    Assignment as BountyIcon, 
    People as DirectoryIcon, 
    Help as HelpIcon, 
    Timer as VolunteerIcon,
    ArrowForwardIos as ArrowIcon,
    BugReport as BugIcon,
    EmojiEvents as BadgeIcon,
    Collections as ShowcaseIcon,
    LocationOn as CheckInIcon,
    Lightbulb as IdeaIcon
} from "@mui/icons-material";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import LoadingTerminal from "@/app/components/LoadingTerminal";
import WaysToEarnStake from "@/app/components/dashboard/WaysToEarnStake";
import { UnlockButton, UnlockAndCheckInButton, CheckInButton } from "@/app/components/dashboard/LabControls";

const DashboardPage = ({ params }) => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const theme = useTheme();
  const [userData, setUserData] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [checkInLoading, setCheckInLoading] = useState(false);

  const loading = status === 'loading';

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
      if (session?.user?.userID) {
        try {
          const res = await fetch(`/api/v1/users?userID=${session.user.userID}`, { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            setUserData(data.user);
          }
        } catch (error) {
          console.error("Failed to fetch user data", error);
        } finally {
          setLoadingUser(false);
        }
      }
    };

    if (session) {
      fetchUser();
    }
  }, [session]);

  useEffect(() => {
    const fetchCheckInStatus = async () => {
      if (session?.user?.userID) {
        try {
          const res = await fetch(`/api/v1/users?userID=${session.user.userID}`);
          if (res.ok) {
            const data = await res.json();
            setIsCheckedIn(data.user.isCheckedIn || false);
          }
        } catch (error) {
          console.error("Failed to fetch check-in status", error);
        }
      }
    };
    
    if (session) {
      fetchCheckInStatus();
    }
  }, [session]);

  const handleCheckInToggle = async () => {
    setCheckInLoading(true);
    try {
      const res = await fetch('/api/v1/checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userID: session.user.userID,
          action: isCheckedIn ? 'checkout' : 'checkin'
        }),
      });

      if (res.ok) {
        setIsCheckedIn(!isCheckedIn);
      }
    } catch (error) {
      console.error("Failed to toggle check-in", error);
    } finally {
      setCheckInLoading(false);
    }
  };

  if (loading || loadingUser) {
    return <LoadingTerminal steps={loadingSteps} />;
  }

  const handleNavigate = (path) => {
    router.push(path);
  };

  const displayName = session?.user?.username || session?.user?.name || "User";

  // Determine active step
  let activeStep = 0;
  let showProgress = false;

  if (userData) {
      showProgress = true;
      const m = userData.membership || {};
      // Calculate total hours from volunteer log
      const totalHours = (m.volunteerLog || []).reduce((acc, log) => acc + Number(log.hours), 0);
      
      // Check if membership is active (waived or valid subscription)
      const isMember = m.isWaived || (m.sponsorshipExpiresAt && new Date(m.sponsorshipExpiresAt) > new Date());

      if (!m.applicationDate) activeStep = 1;
      else if (!m.contacted) activeStep = 2;
      else if (!m.onboardingComplete) activeStep = 3;
      else if (m.status === 'onboarding' && !isMember) activeStep = 4; // Membership Subscription
      else if ((m.status === 'probation' || (m.status === 'onboarding' && isMember)) && (!userData.profileCompleted || !userData.isPublic)) activeStep = 5; // Complete Public Profile
      else if (totalHours < 4) activeStep = 6; // Volunteer Requirement
      else if (!m.accessKey?.issued) activeStep = 7; // Access Key
      else if (m.status !== 'active' && m.status !== 'probation') activeStep = 8; // Full Access
      else showProgress = false; // All steps complete
  }

  const steps = [
    'Account Created',
    'Submit Application',
    'Initial Contact',
    'Onboarding',
    'Membership Subscription',
    'Complete Public Profile',
    'First Month Volunteer Requirement',
    'Access Key Issued',
    'Full Access Granted'
  ];

  const menuItems = [
      { 
          title: 'Profile', 
          icon: <PersonIcon fontSize="large" />, 
          path: `/dashboard/${session.user.userID}/profile`,
          desc: 'Manage personal details'
      },
      { 
          title: 'Membership', 
          icon: <MembershipIcon fontSize="large" />, 
          path: `/dashboard/${session.user.userID}/profile?tab=1`,
          desc: 'Plans & Billing'
      },
      { 
          title: 'Bounties', 
          icon: <BountyIcon fontSize="large" />, 
          path: `/dashboard/bounties`,
          desc: 'Earn credits'
      },
      { 
          title: 'Directory', 
          icon: <DirectoryIcon fontSize="large" />, 
          path: `/dashboard/directory`,
          desc: 'Find members'
      },
      { 
          title: 'Volunteer', 
          icon: <VolunteerIcon fontSize="large" />, 
          path: `/dashboard/${session.user.userID}/volunteer`,
          desc: 'Log hours'
      },
      { 
          title: 'Showcase', 
          icon: <ShowcaseIcon fontSize="large" />, 
          path: `/dashboard/showcase`,
          desc: 'Member projects'
      },
      { 
          title: 'Badges', 
          icon: <BadgeIcon fontSize="large" />, 
          path: `/dashboard/badges`,
          desc: 'View achievements'
      },
      { 
          title: 'Bug Tracker', 
          icon: <BugIcon fontSize="large" />, 
          path: `/dashboard/bugs`,
          desc: 'Report issues'
      },
      { 
          title: 'Support', 
          icon: <HelpIcon fontSize="large" />, 
          action: () => window.open("/api/v1/discord/invite", "_blank"),
          desc: 'Get help'
      },
      ...(session?.user?.role === 'admin' ? [{
          title: 'Bounty Ideas',
          icon: <IdeaIcon fontSize="large" />,
          path: '/dashboard/admin/bounty-ideas',
          desc: 'Manage ideas'
      }] : [])
  ];

  return (
    <Box
      sx={{
        padding: { xs: 2, md: 4 },
        display: "flex",
        flexDirection: "column",
        gap: { xs: 2, md: 3 },
        backgroundColor: theme.palette.background.default,
        color: theme.palette.text.primary,
        minHeight: "100vh",
      }}
    >
      {/* Header Section */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          marginBottom: { xs: 1, md: 2 },
        }}
      >
        <Typography 
            variant="h4" 
            component="h1" 
            sx={{ 
                fontSize: { xs: '1.5rem', md: '2.125rem' },
                wordBreak: 'break-word'
            }}
        >
          Welcome, {displayName}!
        </Typography>
      </Box>

      {/* Quick Actions */}
      <Card 
        variant="outlined" 
        sx={{ 
          mb: 1, 
          p: 2, 
          background: isCheckedIn 
            ? `linear-gradient(45deg, ${theme.palette.success.dark}, ${theme.palette.success.main})`
            : `linear-gradient(45deg, ${theme.palette.grey[800]}, ${theme.palette.grey[900]})`,
          color: 'white',
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', md: 'center' },
          gap: 2
        }}
      >
        <Box>
          <Typography variant="h6">
            {isCheckedIn ? "You are checked in!" : "You are currently away"}
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.8 }}>
            {isCheckedIn ? "Don't forget to check out when you leave." : "Ready to make something awesome?"}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, width: { xs: '100%', md: 'auto' } }}>
            {isCheckedIn ? (
                <Button 
                    variant="contained" 
                    color="error"
                    onClick={handleCheckInToggle}
                    disabled={checkInLoading}
                    startIcon={checkInLoading ? <CircularProgress size={20} color="inherit" /> : <CheckInIcon />}
                    sx={{ 
                        backgroundColor: 'white',
                        color: theme.palette.error.main,
                        '&:hover': { backgroundColor: '#f5f5f5' },
                        whiteSpace: 'nowrap',
                        flex: 1,
                        py: 1.5
                    }}
                >
                    Check Out
                </Button>
            ) : (
                userData?.membership?.type === 'community' ? (
                    <CheckInButton 
                        onCheckIn={handleCheckInToggle} 
                        checkInLoading={checkInLoading} 
                        sx={{ flex: 1, py: 1.5 }}
                    />
                ) : (
                    <>
                        <UnlockAndCheckInButton 
                            onCheckIn={handleCheckInToggle} 
                            checkInLoading={checkInLoading} 
                            sx={{ flex: 1, py: 1.5 }}
                        />
                        <UnlockButton sx={{ flex: 1, py: 1.5 }} />
                    </>
                )
            )}
        </Box>
      </Card>

      {/* Membership Progress */}
      {showProgress && (
      <Card variant="outlined" sx={{ mb: 3, p: 0, backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.primary.main}` }}>
          <Accordion defaultExpanded={false} sx={{ boxShadow: 'none', backgroundColor: 'transparent' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon color="primary" />}>
                <Typography variant="h6" color="primary">Co-op Membership Progress</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: { xs: 1, md: 2 }, pt: 0 }}>
                <Stepper 
                    activeStep={activeStep} 
            alternativeLabel={false} 
            orientation="vertical"
            sx={{
              display: { xs: 'flex', md: 'none' },
              '& .MuiStepLabel-label': { color: 'text.secondary' },
              '& .MuiStepLabel-label.Mui-active': { color: 'primary.main' },
              '& .MuiStepLabel-label.Mui-completed': { color: 'primary.main' },
              '& .MuiStepIcon-root': { color: 'gray' },
              '& .MuiStepIcon-root.Mui-active': { color: 'primary.main' },
              '& .MuiStepIcon-root.Mui-completed': { color: 'primary.main' },
          }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
          <Stepper 
            activeStep={activeStep} 
            alternativeLabel 
            sx={{
              display: { xs: 'none', md: 'flex' },
              '& .MuiStepLabel-label': { color: 'text.secondary' },
              '& .MuiStepLabel-label.Mui-active': { color: 'primary.main' },
              '& .MuiStepLabel-label.Mui-completed': { color: 'primary.main' },
              '& .MuiStepIcon-root': { color: 'gray' },
              '& .MuiStepIcon-root.Mui-active': { color: 'primary.main' },
              '& .MuiStepIcon-root.Mui-completed': { color: 'primary.main' },
          }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
          
          {!userData?.onboardingComplete && activeStep === 1 && (
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                  <Alert severity="info" variant="outlined" sx={{ color: 'primary.main', borderColor: 'primary.main' }} action={
                      <Button color="inherit" size="small" onClick={() => handleNavigate(`/dashboard/${session.user.userID}/onboarding`)}>
                          Start Application
                      </Button>
                  }>
                      Please submit your membership application to get started.
                  </Alert>
              </Box>
          )}

          {activeStep === 2 && (
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                  <Alert severity="info" variant="outlined">
                      Application submitted! We will contact you shortly.
                  </Alert>
              </Box>
          )}

          {activeStep === 3 && (
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                  <Alert severity="info" variant="outlined">
                      Please visit the FabLab for your orientation and paperwork.
                  </Alert>
              </Box>
          )}

          {activeStep === 4 && (
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                  <Alert severity="info" variant="outlined" action={
                      <Button color="inherit" size="small" onClick={() => handleNavigate(`/dashboard/${session.user.userID}/profile?tab=1`)}>
                          View Plans
                      </Button>
                  }>
                      Please select a membership plan to continue.
                  </Alert>
              </Box>
          )}
          
          {activeStep === 5 && (
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                  <Alert severity="success" variant="outlined" action={
                      <Button color="inherit" size="small" onClick={() => handleNavigate(`/dashboard/${session.user.userID}/profile?tab=2`)}>
                          Setup Profile
                      </Button>
                  }>
                      Membership active! Please complete your public profile to connect with the community.
                  </Alert>
              </Box>
          )}
          
          {activeStep === 6 && (
               <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                  <Alert severity="warning" variant="outlined" action={
                      <Button color="inherit" size="small" onClick={() => handleNavigate(`/dashboard/${session.user.userID}/volunteer`)}>
                          Log Hours
                      </Button>
                  }>
                      You have volunteer hours remaining for your first month requirement.
                  </Alert>
              </Box>
          )}
            </AccordionDetails>
          </Accordion>
      </Card>
      )}

      {/* Ways to Earn Stake */}
      {userData && <WaysToEarnStake user={userData} />}

      {/* Dashboard Options Grid */}
      <Grid container spacing={2}>
        {menuItems.map((item) => (
            <Grid item xs={6} md={4} lg={3} key={item.title}>
                <Paper
                    elevation={0}
                    onClick={() => item.action ? item.action() : handleNavigate(item.path)}
                    sx={{
                        p: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        cursor: 'pointer',
                        border: `1px solid ${theme.palette.divider}`,
                        backgroundColor: theme.palette.background.paper,
                        transition: 'all 0.2s ease-in-out',
                        height: '100%',
                        minHeight: 160,
                        '&:hover': {
                            transform: 'translateY(-4px)',
                            boxShadow: `0 4px 20px ${item.color}40`,
                            borderColor: item.color,
                        }
                    }}
                >
                    <Box sx={{ 
                        color: item.color, 
                        mb: 1.5,
                        p: 1.5,
                        borderRadius: '50%',
                        backgroundColor: `${item.color}15`
                    }}>
                        {item.icon}
                    </Box>
                    <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 'bold', mb: 0.5 }}>
                        {item.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
                        {item.description || item.desc}
                    </Typography>
                </Paper>
            </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default DashboardPage;
