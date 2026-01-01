import React from 'react';
import { Box, Typography, Paper, useTheme } from '@mui/material';
import { keyframes } from '@emotion/react';

const glow = keyframes`
  0% { text-shadow: 0 0 5px #00ff00, 0 0 10px #00ff00, 0 0 20px #00ff00; }
  50% { text-shadow: 0 0 10px #00ff00, 0 0 20px #00ff00, 0 0 40px #00ff00; }
  100% { text-shadow: 0 0 5px #00ff00, 0 0 10px #00ff00, 0 0 20px #00ff00; }
`;

const JackpotDisplay = ({ amount }) => {
    const theme = useTheme();

    return (
        <Paper
            elevation={3}
            sx={{
                p: 3,
                textAlign: 'center',
                background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)',
                border: '2px solid #00ff00',
                boxShadow: '0 0 15px rgba(0, 255, 0, 0.3)',
                mb: 4
            }}
        >
            <Typography variant="h6" sx={{ color: '#00ff00', fontFamily: 'Roboto Mono, monospace', mb: 1 }}>
                WEEKLY JACKPOT
            </Typography>
            <Typography
                variant="h2"
                sx={{
                    color: '#fff',
                    fontFamily: 'Roboto Mono, monospace',
                    fontWeight: 'bold',
                    animation: `${glow} 2s infinite ease-in-out`
                }}
            >
                {amount.toFixed(2)} STAKE
            </Typography>
            <Typography variant="caption" sx={{ color: '#888', mt: 1, display: 'block' }}>
                Resets Sunday Midnight
            </Typography>
        </Paper>
    );
};

export default JackpotDisplay;
