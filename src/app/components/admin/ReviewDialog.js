import React from 'react';
import { 
    Dialog, DialogTitle, DialogContent, DialogActions, Button, 
    Typography, Box, Grid, Chip, Divider, Stack
} from '@mui/material';

export default function ReviewDialog({ open, onClose, user, onReview }) {
    if (!user) return null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                Review Application: {user.firstName} {user.lastName}
                <Typography variant="subtitle2" color="text.secondary">
                    @{user.username} • {user.email}
                </Typography>
                {user.discordHandle && (
                    <Typography variant="subtitle2" color="primary">
                        Discord: {user.discordHandle}
                    </Typography>
                )}
            </DialogTitle>
            <DialogContent dividers>
                <Grid container spacing={3}>
                    <Grid item xs={12}>
                        <Typography variant="h6" gutterBottom>Personal Info</Typography>
                        
                        <Box sx={{ mb: 2 }}>
                            <Typography variant="subtitle2" color="text.secondary">Bio</Typography>
                            <Typography paragraph>{user.bio || "N/A"}</Typography>
                        </Box>
                        
                        <Box sx={{ mb: 2 }}>
                            <Typography variant="subtitle2" color="text.secondary">Interests</Typography>
                            <Typography paragraph>{(user.interests && user.interests.length > 0) ? user.interests.join(', ') : "N/A"}</Typography>
                        </Box>

                        <Box sx={{ mb: 2 }}>
                            <Typography variant="subtitle2" color="text.secondary">Creator Type</Typography>
                            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                {Array.isArray(user.creatorType) && user.creatorType.length > 0 ? (
                                    user.creatorType.map((type) => (
                                        <Chip key={type} label={type} size="small" color="primary" variant="outlined" />
                                    ))
                                ) : (
                                    <Typography variant="body2">N/A</Typography>
                                )}
                            </Stack>
                        </Box>
                    </Grid>

                    <Grid item xs={12}>
                        <Divider />
                    </Grid>

                    <Grid item xs={12}>
                        <Typography variant="h6" gutterBottom>Questionnaire</Typography>
                        
                        <Box sx={{ mb: 2 }}>
                            <Typography variant="subtitle2" color="primary">What would you change about the city?</Typography>
                            <Typography>{user.cityChange || "N/A"}</Typography>
                        </Box>

                        <Box sx={{ mb: 2 }}>
                            <Typography variant="subtitle2" color="primary">Known Members</Typography>
                            <Typography>{user.knownMembers || "None listed"}</Typography>
                        </Box>

                        <Box sx={{ mb: 2 }}>
                            <Typography variant="subtitle2" color="primary">Questions for us</Typography>
                            <Typography>{typeof user.questions === 'string' ? user.questions : "N/A"}</Typography>
                        </Box>
                    </Grid>
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
                <Button 
                    variant="contained" 
                    color={user.membership?.reviewStatus === 'reviewed' ? "warning" : "success"}
                    onClick={() => onReview(user)}
                >
                    {user.membership?.reviewStatus === 'reviewed' ? "Mark Needs Review" : "Mark Reviewed"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
