"use client";
import React, { useState, useEffect } from 'react';
import { 
    Container, Typography, Box, TextField, Button, Paper, 
    Stepper, Step, StepLabel, StepContent, Alert, Autocomplete, Chip 
} from '@mui/material';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

const steps = [
    {
        label: 'Personal Information',
        description: 'Tell us a bit about yourself.',
        fields: ['firstName', 'lastName', 'bio', 'interests']
    },
    {
        label: 'Membership Questions',
        description: 'Why do you want to join the FabLab?',
        fields: ['reason', 'projects']
    },
    {
        label: 'Emergency Contact',
        description: 'Who should we call in case of an emergency?',
        fields: ['emergencyContactName', 'emergencyContactPhone']
    }
];

const commonInterests = [
    "3D Printing", "Laser Cutting", "CNC Machining", "Woodworking", "Metalworking",
    "Electronics", "Arduino", "Raspberry Pi", "Programming", "Web Development",
    "Graphic Design", "CAD/CAM", "Sewing", "Embroidery", "Vinyl Cutting",
    "Gaming", "Reading", "Hiking", "Cooking", "Traveling", "Photography", 
    "Music", "Art", "Gardening", "DIY", "Robotics", "Cosplay", "Board Games"
];

export default function OnboardingPage() {
    const { data: session, update } = useSession();
    const router = useRouter();
    const [activeStep, setActiveStep] = useState(0);
    const [formData, setFormData] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (session?.user) {
            setFormData(prev => ({
                ...prev,
                firstName: session.user.firstName || '',
                lastName: session.user.lastName || '',
                bio: session.user.bio || ''
            }));
        }
    }, [session]);

    const handleNext = () => {
        setActiveStep((prev) => prev + 1);
    };

    const handleBack = () => {
        setActiveStep((prev) => prev - 1);
    };

    const handleChange = (field) => (event) => {
        setFormData({ ...formData, [field]: event.target.value });
    };

    const handleSubmit = async () => {
        setLoading(true);
        setError('');

        try {
            // 1. Save the application data
            // We'll store the questions in the 'questions' field and update applicationDate
            const response = await fetch(`/api/v1/users?userID=${session.user.userID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firstName: formData.firstName,
                    lastName: formData.lastName,
                    questions: {
                        reason: formData.reason,
                        interests: formData.interests,
                        projects: formData.projects,
                        emergencyContactName: formData.emergencyContactName,
                        emergencyContactPhone: formData.emergencyContactPhone
                    },
                    bio: formData.bio,
                    interests: formData.interests,
                    isPublic: true, // Automatically set profile to public
                    profileCompleted: true, // Mark profile as completed
                    membership: {
                        applicationDate: new Date().toISOString()
                    }
                })
            });

            if (!response.ok) throw new Error('Failed to submit application');

            // 2. Update session to reflect changes
            await update();

            // 3. Redirect to dashboard
            router.push('/dashboard');

        } catch (err) {
            console.error(err);
            setError('Failed to submit application. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Paper sx={{ p: 4 }}>
                <Typography variant="h4" gutterBottom>Membership Application</Typography>
                <Typography variant="body1" color="text.secondary" paragraph>
                    Please complete the following steps to apply for membership.
                </Typography>
                <Alert severity="info" sx={{ mb: 3, border: '1px solid #2196f3' }}>
                    ✨ <strong>Reward:</strong> Earn <strong>10 Stake</strong> upon completion!
                </Alert>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                <Stepper activeStep={activeStep} orientation="vertical">
                    {steps.map((step, index) => (
                        <Step key={step.label}>
                            <StepLabel>{step.label}</StepLabel>
                            <StepContent>
                                <Typography>{step.description}</Typography>
                                <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {step.fields.map((field) => {
                                        if (field === 'interests') {
                                            return (
                                                <Autocomplete
                                                    key={field}
                                                    multiple
                                                    freeSolo
                                                    options={commonInterests}
                                                    value={formData[field] || []}
                                                    onChange={(event, newValue) => setFormData({ ...formData, [field]: newValue })}
                                                    renderTags={(value, getTagProps) =>
                                                        value.map((option, index) => (
                                                            <Chip variant="outlined" label={option} {...getTagProps({ index })} />
                                                        ))
                                                    }
                                                    renderInput={(params) => (
                                                        <TextField 
                                                            {...params} 
                                                            variant="outlined" 
                                                            label="Interests & Skills"
                                                            placeholder="Add interests..."
                                                            helperText="Press Enter to add custom interests"
                                                        />
                                                    )}
                                                />
                                            );
                                        }
                                        return (
                                            <TextField
                                                key={field}
                                                label={field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                                                fullWidth
                                                variant="outlined"
                                                value={formData[field] || ''}
                                                onChange={handleChange(field)}
                                                required
                                            />
                                        );
                                    })}
                                </Box>
                                <Box sx={{ mb: 2, mt: 3 }}>
                                    <Button
                                        variant="contained"
                                        onClick={index === steps.length - 1 ? handleSubmit : handleNext}
                                        disabled={loading}
                                        sx={{ mt: 1, mr: 1 }}
                                    >
                                        {index === steps.length - 1 ? (loading ? 'Submitting...' : 'Submit Application') : 'Continue'}
                                    </Button>
                                    <Button
                                        disabled={index === 0 || loading}
                                        onClick={handleBack}
                                        sx={{ mt: 1, mr: 1 }}
                                    >
                                        Back
                                    </Button>
                                </Box>
                            </StepContent>
                        </Step>
                    ))}
                </Stepper>
            </Paper>
        </Container>
    );
}
