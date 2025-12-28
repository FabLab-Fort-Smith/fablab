import React, { useState, useEffect } from 'react';
import { Box, TextField, Grid, Switch, FormControlLabel, Typography, useTheme, Paper, FormControl, FormLabel, FormGroup, Checkbox, Chip, Autocomplete, Tooltip, Link, Avatar } from '@mui/material';
import GitHubIcon from '@mui/icons-material/GitHub';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import TwitterIcon from '@mui/icons-material/Twitter';
import LanguageIcon from '@mui/icons-material/Language';
import InstagramIcon from '@mui/icons-material/Instagram';
import Constants from '@/lib/constants';

const PublicProfileTab = ({ user, onEdit }) => {
    const theme = useTheme();
    const [skillInput, setSkillInput] = useState('');
    const [dbBadges, setDbBadges] = useState([]);

    useEffect(() => {
        const fetchBadges = async () => {
            try {
                const res = await fetch('/api/v1/badges');
                if (res.ok) {
                    const data = await res.json();
                    setDbBadges(data.badges || []);
                }
            } catch (err) {
                console.error("Failed to fetch badges", err);
            }
        };
        fetchBadges();
    }, []);

    // Helper to get badge details
    const getBadgeDetails = (badgeId) => {
        // Check DB first
        const dbBadge = dbBadges.find(b => b.id === badgeId);
        if (dbBadge) return dbBadge;

        // Fallback to Constants
        const badgeKey = Object.keys(Constants.BADGES).find(key => Constants.BADGES[key].id === badgeId);
        return badgeKey ? Constants.BADGES[badgeKey] : null;
    };

    const handleCreatorTypeChange = (event) => {
        const { value, checked } = event.target;
        const currentTypes = Array.isArray(user.creatorType) ? user.creatorType : (user.creatorType ? [user.creatorType] : []);
        
        let newTypes;
        if (checked) {
            newTypes = [...currentTypes, value];
        } else {
            newTypes = currentTypes.filter((type) => type !== value);
        }
        onEdit("creatorType", newTypes);
    };

    const handleSocialChange = (platform, value) => {
        const currentSocials = user.socials || {};
        onEdit("socials", { ...currentSocials, [platform]: value });
    };

    const handleInterestsChange = (event, newValue) => {
        onEdit("interests", newValue);
    };

    const commonInterests = [
        "3D Printing", "Laser Cutting", "CNC Machining", "Woodworking", "Metalworking",
        "Electronics", "Arduino", "Raspberry Pi", "Programming", "Web Development",
        "Graphic Design", "CAD/CAM", "Sewing", "Embroidery", "Vinyl Cutting",
        "Gaming", "Reading", "Hiking", "Cooking", "Traveling", "Photography", 
        "Music", "Art", "Gardening", "DIY", "Robotics", "Cosplay", "Board Games"
    ];

    return (
        <Box sx={{ padding: { xs: 2, md: 3 }, backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary }}>
            <Typography variant="h6" gutterBottom sx={{ color: theme.palette.primary.main }}>
                Public Profile Settings
            </Typography>
            <Typography variant="body2" paragraph sx={{ color: theme.palette.text.secondary }}>
                Manage what information is visible to other members.
            </Typography>

            <FormControlLabel
                control={
                    <Switch
                        checked={user.isPublic !== false} // Default to true if undefined
                        onChange={(e) => onEdit("isPublic", e.target.checked)}
                        sx={{
                            '& .MuiSwitch-switchBase.Mui-checked': {
                                color: theme.palette.primary.main,
                            },
                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                backgroundColor: theme.palette.primary.main,
                            },
                        }}
                    />
                }
                label={user.isPublic !== false ? "Profile is Public" : "Profile is Private"}
                sx={{ mb: 1, color: theme.palette.text.primary }}
            />
            <Typography variant="caption" display="block" sx={{ mb: 3, color: theme.palette.text.secondary }}>
                Profiles are public by default. You can toggle this off to keep your profile private.
            </Typography>

            {user.isPublic !== false && user.username && (
                <Box sx={{ mb: 3, p: 2, bgcolor: 'rgba(0,255,0,0.05)', borderRadius: 1, border: '1px solid rgba(0,255,0,0.2)' }}>
                    <Typography variant="subtitle2" gutterBottom>
                        Your Public Profile Link:
                    </Typography>
                    <Link href={`/u/${user.username}`} target="_blank" rel="noopener noreferrer" sx={{ wordBreak: 'break-all', fontWeight: 'bold' }}>
                        {typeof window !== 'undefined' ? `${window.location.origin}/u/${user.username}` : `/u/${user.username}`}
                    </Link>
                </Box>
            )}

            {/* Badges Section */}
            <Paper sx={{ p: 2, mb: 3, bgcolor: 'rgba(0,0,0,0.02)' }}>
                <Typography variant="subtitle1" gutterBottom>Earned Badges</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {user.badges && user.badges.length > 0 ? (
                        user.badges.map((badgeId) => {
                            const badge = getBadgeDetails(badgeId);
                            if (!badge) return null;
                            return (
                                <Tooltip key={badgeId} title={badge.description}>
                                    <Chip 
                                        avatar={badge.imageUrl ? <Avatar src={badge.imageUrl} alt={badge.name} /> : null}
                                        label={badge.imageUrl ? badge.name : `${badge.icon || ''} ${badge.name}`} 
                                        variant="outlined" 
                                        color="primary"
                                        sx={{ fontWeight: 'bold' }}
                                    />
                                </Tooltip>
                            );
                        })
                    ) : (
                        <Typography variant="body2" color="text.secondary">
                            No badges earned yet. Complete bounties and volunteer hours to earn them!
                        </Typography>
                    )}
                </Box>
            </Paper>

            <Grid container spacing={3}>
                <Grid item xs={12}>
                    <TextField
                        fullWidth
                        label="Bio"
                        multiline
                        rows={4}
                        value={user.bio || ''}
                        onChange={(e) => onEdit("bio", e.target.value)}
                        helperText="Tell the community about yourself."
                    />
                </Grid>

                <Grid item xs={12}>
                    <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>Interests & Skills</Typography>
                    <Autocomplete
                        multiple
                        freeSolo
                        options={commonInterests}
                        value={Array.isArray(user.interests) ? user.interests : []}
                        onChange={handleInterestsChange}
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
                </Grid>

                <Grid item xs={12}>
                    <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>Social Links</Typography>
                    <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                            <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
                                <GitHubIcon sx={{ color: 'text.secondary', mr: 1, my: 0.5 }} />
                                <TextField
                                    fullWidth
                                    label="GitHub URL"
                                    variant="standard"
                                    value={user.socials?.github || ''}
                                    onChange={(e) => handleSocialChange('github', e.target.value)}
                                />
                            </Box>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
                                <LinkedInIcon sx={{ color: 'text.secondary', mr: 1, my: 0.5 }} />
                                <TextField
                                    fullWidth
                                    label="LinkedIn URL"
                                    variant="standard"
                                    value={user.socials?.linkedin || ''}
                                    onChange={(e) => handleSocialChange('linkedin', e.target.value)}
                                />
                            </Box>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
                                <TwitterIcon sx={{ color: 'text.secondary', mr: 1, my: 0.5 }} />
                                <TextField
                                    fullWidth
                                    label="Twitter/X URL"
                                    variant="standard"
                                    value={user.socials?.twitter || ''}
                                    onChange={(e) => handleSocialChange('twitter', e.target.value)}
                                />
                            </Box>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
                                <InstagramIcon sx={{ color: 'text.secondary', mr: 1, my: 0.5 }} />
                                <TextField
                                    fullWidth
                                    label="Instagram URL"
                                    variant="standard"
                                    value={user.socials?.instagram || ''}
                                    onChange={(e) => handleSocialChange('instagram', e.target.value)}
                                />
                            </Box>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
                                <LanguageIcon sx={{ color: 'text.secondary', mr: 1, my: 0.5 }} />
                                <TextField
                                    fullWidth
                                    label="Personal Website"
                                    variant="standard"
                                    value={user.socials?.website || ''}
                                    onChange={(e) => handleSocialChange('website', e.target.value)}
                                />
                            </Box>
                        </Grid>
                    </Grid>
                </Grid>

                <Grid item xs={12}>
                    <FormControl component="fieldset" sx={{ mt: 2 }}>
                        <FormLabel component="legend">Creator Type</FormLabel>
                        <FormGroup row>
                            {['Maker', 'Crafter', 'Artist', 'Hacker', 'Other'].map((type) => (
                                <FormControlLabel
                                    key={type}
                                    control={
                                        <Checkbox
                                            checked={(user.creatorType || []).includes(type)}
                                            onChange={handleCreatorTypeChange}
                                            value={type}
                                        />
                                    }
                                    label={type}
                                />
                            ))}
                        </FormGroup>
                    </FormControl>
                </Grid>
            </Grid>
        </Box>
    );
};

export default PublicProfileTab;
