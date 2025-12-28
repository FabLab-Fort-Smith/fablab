import React from 'react';
import { Container, Typography, Box, Paper, Divider } from '@mui/material';

export default function CodeOfConductPage() {
    return (
        <Container maxWidth="md" sx={{ py: 8 }}>
            <Paper sx={{ p: 4 }}>
                <Typography variant="h3" component="h1" gutterBottom color="primary">
                    Fab Lab Code of Conduct
                </Typography>
                
                <Typography variant="body1" paragraph>
                    <strong>Introduction:</strong> As a community of hackers, makers, inventors, and artists, we are committed to
                    fostering an environment of creativity, innovation, and respect. This Code of Conduct outlines the
                    standards for behavior within our community and facilities.
                </Typography>

                <Box sx={{ my: 3 }}>
                    <Typography variant="h5" gutterBottom>1. Respect and Inclusivity</Typography>
                    <ul>
                        <li><Typography>Treat every person with respect, dignity, and kindness.</Typography></li>
                        <li><Typography>Discrimination based on age, nationality, race, (dis)ability, gender (identity or expression), sexuality, religion, or similar personal characteristic will NOT be tolerated. All are welcome.</Typography></li>
                    </ul>
                </Box>

                <Divider />

                <Box sx={{ my: 3 }}>
                    <Typography variant="h5" gutterBottom>2. Safety and Responsibility</Typography>
                    <ul>
                        <li><Typography>Always prioritize safety; use equipment according to the provided instructions and training.</Typography></li>
                        <li><Typography>Report any unsafe conditions, accidents, or hazards to the staff immediately.</Typography></li>
                    </ul>
                </Box>

                <Divider />

                <Box sx={{ my: 3 }}>
                    <Typography variant="h5" gutterBottom>3. Collaboration and Sharing</Typography>
                    <ul>
                        <li><Typography>Share tools, equipment, and knowledge generously with fellow members.</Typography></li>
                        <li><Typography>Replenish supplies used. (monetarily or physically)</Typography></li>
                        <li><Typography>Respect the intellectual property and creative rights of others. Ask for permission before using or sharing someone else’s work.</Typography></li>
                    </ul>
                </Box>

                <Divider />

                <Box sx={{ my: 3 }}>
                    <Typography variant="h5" gutterBottom>5. Cleanliness and Organization</Typography>
                    <ul>
                        <li><Typography>Maintain cleanliness and order in the workspace. Return tools and materials to their rightful places after use.</Typography></li>
                        <li><Typography>Dispose of waste properly and recycle whenever possible.</Typography></li>
                    </ul>
                </Box>

                <Divider />

                <Box sx={{ my: 3 }}>
                    <Typography variant="h5" gutterBottom>6. Conflict Resolution</Typography>
                    <ul>
                        <li><Typography>Address conflicts constructively and seek amicable resolutions.</Typography></li>
                        <li><Typography>Involve a board member if conflicts escalate or if mediation is needed.</Typography></li>
                    </ul>
                </Box>

                <Divider />

                <Box sx={{ my: 3 }}>
                    <Typography variant="h5" gutterBottom>7. Compliance with Rules</Typography>
                    <ul>
                        <li><Typography>Adhere to all lab rules, including those specific to tool usage, opening hours, and guest policies.</Typography></li>
                        <li><Typography>All activities are limited to the downstairs Lab area unless prior approval has been granted. Upstairs is off limits.</Typography></li>
                    </ul>
                </Box>

                <Box sx={{ mt: 4, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                    <Typography variant="h6" gutterBottom>Conclusion</Typography>
                    <Typography>
                        Fab Lab Fort Smith is a space for creativity and growth. By adhering to this Code of Conduct, we build a stronger, more collaborative community. Let’s innovate and inspire together!
                    </Typography>
                </Box>
            </Paper>
        </Container>
    );
}
