import React from 'react';
import { 
    Box, Typography, Table, TableBody, TableCell, TableContainer, 
    TableHead, TableRow, Paper, Chip 
} from '@mui/material';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';

export default function StakeLedger({ stakeHistory = [], currentStake = 0 }) {
    return (
        <Box sx={{ maxWidth: 935, mx: 'auto', p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                <AccountBalanceWalletIcon sx={{ fontSize: 40, color: 'primary.main' }} />
                <Box>
                    <Typography variant="h5" fontWeight="bold">
                        Stake Ledger
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Current Balance: {currentStake} Stake
                    </Typography>
                </Box>
            </Box>

            {stakeHistory.length > 0 ? (
                <TableContainer component={Paper} sx={{ bgcolor: 'background.paper' }}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Date</TableCell>
                                <TableCell>Reason</TableCell>
                                <TableCell align="right">Amount</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {stakeHistory.slice().reverse().map((tx, index) => (
                                <TableRow key={index} hover>
                                    <TableCell>
                                        {new Date(tx.timestamp).toLocaleDateString()} {new Date(tx.timestamp).toLocaleTimeString()}
                                    </TableCell>
                                    <TableCell>{tx.reason}</TableCell>
                                    <TableCell align="right">
                                        <Chip 
                                            label={tx.amount > 0 ? `+${tx.amount}` : `${tx.amount}`} 
                                            color={tx.amount >= 0 ? "success" : "error"}
                                            size="small" 
                                            variant="outlined"
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            ) : (
                <Box sx={{ py: 8, textAlign: 'center' }}>
                    <Typography variant="body1" color="text.secondary">
                        No transactions found. Start exploring the lab to earn stake!
                    </Typography>
                </Box>
            )}
        </Box>
    );
}
