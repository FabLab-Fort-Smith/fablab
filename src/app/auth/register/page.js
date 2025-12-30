"use client";
import { signIn } from "next-auth/react";
import React, { useState, useRef } from "react";
import { useSearchParams } from 'next/navigation';
import ReCAPTCHA from "react-google-recaptcha";
import {
  TextField,
  Button,
  Typography,
  Container,
  Box,
  Grid,
  Paper,
  Alert,
  Divider,
  List,
  ListItem,
} from "@mui/material";

const RegisterPage = () => {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
    phoneNumber: "",
  });
  const [error, setError] = useState("");
  const recaptchaRef = useRef(null);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const captchaToken = recaptchaRef.current?.getValue();
    if (!captchaToken) {
      setError("Please complete the captcha.");
      return;
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ ...form, captchaToken }),
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        // Redirect to verify-email page after registration
        window.location.href = `/auth/verify-email?registered=true&email=${encodeURIComponent(form.email)}`;
      } else {
        const errorData = await res.json();
        setError(errorData.message || "Registration failed.");
        recaptchaRef.current?.reset();
      }
    } catch (err) {
      setError("Something went wrong.");
      recaptchaRef.current?.reset();
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleOAuthSignIn = (provider) => {
    signIn(provider, { callbackUrl });
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        py: 4,
      }}
    >
      <Container component="main" maxWidth="lg">
        <Grid container spacing={4} alignItems="center">
          {/* Left Side: Information */}
          <Grid item xs={12} md={6}>
            <Box sx={{ color: "text.primary" }}>
              <Typography component="h1" variant="h4" gutterBottom sx={{ color: 'primary.main' }}>
                The Lab: Co-op Membership Application
              </Typography>
              <Typography variant="body1" paragraph color="text.primary">
                Please complete the following questions and a co-op member will reach out to you.
              </Typography>

              <Typography variant="h6" gutterBottom sx={{ mt: 4, color: 'primary.main' }}>
                Membership Process Overview:
              </Typography>
              <Alert severity="info" sx={{ mb: 2, border: '1px solid #4caf50', color: '#2e7d32' }}>
                  ✨ <strong>Earn Rewards:</strong> Get <strong>10 Stake</strong> just for registering!
              </Alert>
              <List>
                <ListItem disablePadding sx={{ mb: 2, display: 'block' }}>
                  <Typography variant="subtitle1" fontWeight="bold" sx={{ color: 'primary.main' }}>Submit Application</Typography>
                  <Typography variant="body2" color="text.primary">Complete the co-op membership application (this form).</Typography>
                </ListItem>
                <ListItem disablePadding sx={{ mb: 2, display: 'block' }}>
                  <Typography variant="subtitle1" fontWeight="bold" sx={{ color: 'primary.main' }}>Initial Contact</Typography>
                  <Typography variant="body2" color="text.primary">A co-op member will reach out to you within one week.</Typography>
                </ListItem>
                <ListItem disablePadding sx={{ mb: 2, display: 'block' }}>
                  <Typography variant="subtitle1" fontWeight="bold" sx={{ color: 'primary.main' }}>Onboarding</Typography>
                  <Typography variant="body2" color="text.primary">Meet to complete onboarding paperwork and officially start your membership onboarding.</Typography>
                </ListItem>
                <ListItem disablePadding sx={{ mb: 2, display: 'block' }}>
                  <Typography variant="subtitle1" fontWeight="bold" sx={{ color: 'primary.main' }}>First Month Volunteer Requirement</Typography>
                  <Typography variant="body2" color="text.primary">Contribute 4 volunteer hours within your first month.</Typography>
                </ListItem>
                <ListItem disablePadding sx={{ mb: 2, display: 'block' }}>
                  <Typography variant="subtitle1" fontWeight="bold" sx={{ color: 'primary.main' }}>Access Key Issued</Typography>
                  <Typography variant="body2" color="text.primary">After onboarding and first month volunteer requirement, you’ll receive an access key valid from 8:00 AM – 10:00 PM.</Typography>
                </ListItem>
                <ListItem disablePadding sx={{ mb: 2, display: 'block' }}>
                  <Typography variant="subtitle1" fontWeight="bold" sx={{ color: 'primary.main' }}>Full Access Granted</Typography>
                  <Typography variant="body2" color="text.primary">After 3 months in good standing, you’ll be issued a 24-hour access key.</Typography>
                </ListItem>
              </List>
            </Box>
          </Grid>

          {/* Right Side: Form */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ padding: 3, border: '1px solid', borderColor: 'primary.main' }}>
              <Typography component="h2" variant="h5" align="center" gutterBottom sx={{ color: 'primary.main' }}>
                Sign Up
              </Typography>

              {error && (
                <Alert severity="error" sx={{ marginBottom: 2 }}>
                  {error}
                </Alert>
              )}

              <form onSubmit={handleSubmit}>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="First Name"
                      name="firstName"
                      variant="outlined"
                      value={form.firstName}
                      onChange={handleChange}
                      required
                    />
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Last Name"
                      name="lastName"
                      variant="outlined"
                      value={form.lastName}
                      onChange={handleChange}
                      required
                    />
                  </Grid>

                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Username"
                      name="username"
                      variant="outlined"
                      value={form.username}
                      onChange={handleChange}
                      required
                    />
                  </Grid>

                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Email Address"
                      name="email"
                      type="email"
                      variant="outlined"
                      value={form.email}
                      onChange={handleChange}
                      required
                    />
                  </Grid>

                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Phone Number"
                      name="phoneNumber"
                      type="tel"
                      variant="outlined"
                      value={form.phoneNumber}
                      onChange={handleChange}
                      required
                    />
                  </Grid>

                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Password"
                      name="password"
                      type="password"
                      variant="outlined"
                      value={form.password}
                      onChange={handleChange}
                      required
                    />
                  </Grid>

                  <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                    <ReCAPTCHA
                      ref={recaptchaRef}
                      sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"}
                    />
                  </Grid>
                </Grid>

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  color="primary"
                  sx={{ marginTop: 3, marginBottom: 2 }}
                >
                  Submit Application
                </Button>
              </form>

              <Divider sx={{ my: 3, borderColor: 'primary.main' }}>
                <Typography variant="body2" color="text.secondary">
                  OR
                </Typography>
              </Divider>

              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={() => handleOAuthSignIn("google")}
                  sx={{ color: 'primary.main', borderColor: 'primary.main' }}
                >
                  Sign up with Google
                </Button>
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={() => handleOAuthSignIn("discord")}
                  sx={{ color: 'primary.main', borderColor: 'primary.main' }}
                >
                  Sign up with Discord
                </Button>
              </Box>

              <Box mt={2}>
                <Typography variant="body2" align="center" color="text.primary">
                  Already have an account?{" "}
                  <Button
                    variant="text"
                    onClick={() => window.location.href = "/auth/signin"}
                    sx={{ color: 'primary.main' }}
                  >
                    Sign in here
                  </Button>
                </Typography>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
};

export default RegisterPage;
