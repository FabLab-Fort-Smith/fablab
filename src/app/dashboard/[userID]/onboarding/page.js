"use client";
import React, { useState, useEffect } from "react";
import {
  TextField,
  Button,
  Typography,
  Container,
  Box,
  Grid,
  Paper,
  Alert,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Checkbox,
  FormGroup,
  Autocomplete,
  Chip
} from "@mui/material";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import LoadingTerminal from "@/app/components/LoadingTerminal";

const commonInterests = [
    "3D Printing", "Laser Cutting", "CNC Machining", "Woodworking", "Metalworking",
    "Electronics", "Arduino", "Raspberry Pi", "Programming", "Web Development",
    "Graphic Design", "CAD/CAM", "Sewing", "Embroidery", "Vinyl Cutting",
    "Gaming", "Reading", "Hiking", "Cooking", "Traveling", "Photography", 
    "Music", "Art", "Gardening", "DIY", "Robotics", "Cosplay", "Board Games"
];

const OnboardingPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(true);
  const [fetchedUser, setFetchedUser] = useState(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phoneNumber: "",
    discordHandle: "",
    bio: "",
    creatorType: [],
    interests: [],
    cityChange: "",
    knownMembers: "",
    questions: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      if (session?.user?.userID) {
        try {
          const res = await fetch(`/api/v1/users?userID=${session.user.userID}`);
          if (res.ok) {
            const data = await res.json();
            const userData = data.user;
            setFetchedUser(userData);
            setForm((prev) => ({
              ...prev,
              firstName: userData.firstName || "",
              lastName: userData.lastName || "",
              phoneNumber: userData.phoneNumber || "",
              discordHandle: userData.discordHandle || (userData.provider === 'discord' ? userData.username : ""),
              bio: userData.bio || "",
              creatorType: Array.isArray(userData.creatorType) ? userData.creatorType : (userData.creatorType ? [userData.creatorType] : []),
              interests: Array.isArray(userData.interests) ? userData.interests : [],
              cityChange: userData.cityChange || "",
              knownMembers: userData.knownMembers || "",
              questions: userData.questions || "",
            }));
          }
        } catch (error) {
          console.error("Failed to fetch user data", error);
        } finally {
          setLoading(false);
        }
      }
    };

    if (status === "authenticated") {
      fetchUser();
    } else if (status === "unauthenticated") {
        router.push("/auth/signin");
    }
  }, [session, status, router]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleCreatorTypeChange = (event) => {
     const { value, checked } = event.target;
     setForm((prev) => {
         const currentTypes = prev.creatorType || [];
         if (checked) {
             return { ...prev, creatorType: [...currentTypes, value] };
         } else {
             return { ...prev, creatorType: currentTypes.filter((type) => type !== value) };
         }
     });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    try {
      const updatedMembership = {
          ...fetchedUser?.membership,
          // onboardingComplete is NOT set here. It is set by Admin after in-person orientation.
          applicationDate: fetchedUser?.membership?.applicationDate || new Date().toISOString()
      };

      const res = await fetch(`/api/v1/users?userID=${params.userID}`, {
        method: "PUT",
        body: JSON.stringify({
            ...form,
            membership: updatedMembership
        }),
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => {
            router.push(`/dashboard/${params.userID}`);
        }, 2000);
      } else {
        const errorData = await res.json();
        setError(errorData.message || "Update failed.");
      }
    } catch (err) {
      setError("Something went wrong.");
    }
  };

  if (loading || status === "loading") {
      return <LoadingTerminal />;
  }

  return (
    <Container component="main" maxWidth="md">
      <Paper sx={{ padding: 4, marginTop: 4, border: '1px solid', borderColor: 'primary.main' }}>
        <Typography component="h1" variant="h4" align="center" gutterBottom sx={{ color: 'primary.main' }}>
          Onboarding Questionnaire
        </Typography>
        <Typography variant="body1" align="center" paragraph color="text.primary">
          Please complete the following information to continue your membership process.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>Information saved! Redirecting...</Alert>}

        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {!fetchedUser?.firstName && (
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="First Name"
                  name="firstName"
                  value={form.firstName}
                  onChange={handleChange}
                  required
                />
              </Grid>
            )}
            {!fetchedUser?.lastName && (
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Last Name"
                  name="lastName"
                  value={form.lastName}
                  onChange={handleChange}
                  required
                />
              </Grid>
            )}
            {!fetchedUser?.phoneNumber && (
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Phone Number"
                  name="phoneNumber"
                  value={form.phoneNumber}
                  onChange={handleChange}
                  required
                />
              </Grid>
            )}
            {!fetchedUser?.discordHandle && (
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Discord Handle"
                  name="discordHandle"
                  value={form.discordHandle}
                  onChange={handleChange}
                  required
                  helperText="Required for community access"
                />
              </Grid>
            )}
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="About You (Bio)"
                name="bio"
                multiline
                rows={4}
                value={form.bio}
                onChange={handleChange}
                required
              />
            </Grid>

            <Grid item xs={12}>
              <FormControl component="fieldset">
                <FormLabel component="legend" sx={{ color: 'primary.main', '&.Mui-focused': { color: 'primary.main' } }}>What creator type are you?</FormLabel>
                <FormGroup row>
                  {['Maker', 'Crafter', 'Artist', 'Hacker', 'Other'].map((type) => (
                    <FormControlLabel
                      key={type}
                      control={
                        <Checkbox
                          checked={form.creatorType.includes(type)}
                          onChange={handleCreatorTypeChange}
                          value={type}
                          sx={{ color: 'primary.main', '&.Mui-checked': { color: 'primary.main' } }}
                        />
                      }
                      label={type}
                    />
                  ))}
                </FormGroup>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <FormLabel component="legend" sx={{ color: 'primary.main', mb: 1, display: 'block' }}>What are your interests and skills?</FormLabel>
              <Autocomplete
                multiple
                freeSolo
                options={commonInterests}
                value={form.interests || []}
                onChange={(event, newValue) => setForm({ ...form, interests: newValue })}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip variant="outlined" label={option} {...getTagProps({ index })} />
                  ))
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    variant="outlined"
                    placeholder="Add interests..."
                    helperText="Press Enter to add custom interests"
                  />
                )}
              />
            </Grid>

            <Grid item xs={12}>
              <FormLabel component="legend" sx={{ color: 'primary.main', mb: 1, display: 'block' }}>If you could change one thing in our city, what would it be?</FormLabel>
              <TextField
                fullWidth
                name="cityChange"
                multiline
                rows={2}
                value={form.cityChange}
                onChange={handleChange}
                required
              />
            </Grid>

            <Grid item xs={12}>
              <FormLabel component="legend" sx={{ color: 'primary.main', mb: 1, display: 'block' }}>Do you know any current co-op members? If so, who?</FormLabel>
              <TextField
                fullWidth
                name="knownMembers"
                value={form.knownMembers}
                onChange={handleChange}
              />
            </Grid>

            <Grid item xs={12}>
              <FormLabel component="legend" sx={{ color: 'primary.main', mb: 1, display: 'block' }}>Do you have any questions for us?</FormLabel>
              <TextField
                fullWidth
                name="questions"
                multiline
                rows={2}
                value={form.questions}
                onChange={handleChange}
              />
            </Grid>
          </Grid>

          <Button
            type="submit"
            fullWidth
            variant="contained"
            color="primary"
            sx={{ marginTop: 4 }}
          >
            Submit Questionnaire
          </Button>
        </form>
      </Paper>
    </Container>
  );
};

export default OnboardingPage;
