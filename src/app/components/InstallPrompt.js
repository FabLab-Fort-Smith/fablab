"use client";
import React, { useState, useEffect } from 'react';
import { 
    Dialog, DialogTitle, DialogContent, DialogActions, 
    Button, Typography, Box, IconButton 
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import GetAppIcon from '@mui/icons-material/GetApp';
import IosShareIcon from '@mui/icons-material/IosShare';

export default function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [open, setOpen] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);

    useEffect(() => {
        // Check if already in standalone mode
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
            setIsStandalone(true);
        }

        // Check if iOS
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        setIsIOS(ios);

        // Listen for beforeinstallprompt
        const handleBeforeInstallPrompt = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
            // Check if user has dismissed it recently? For now, just show it.
            // Maybe wait a bit or check local storage to not annoy user.
            const hasDismissed = localStorage.getItem('installPromptDismissed');
            if (!hasDismissed) {
                setOpen(true);
            }
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    // For iOS, we might want to show it once if not standalone
    useEffect(() => {
        if (isIOS && !isStandalone) {
             const hasDismissed = localStorage.getItem('installPromptDismissed');
             if (!hasDismissed) {
                 setOpen(true);
             }
        }
    }, [isIOS, isStandalone]);

    const handleInstall = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                setDeferredPrompt(null);
            }
            setOpen(false);
        }
    };

    const handleClose = () => {
        setOpen(false);
        localStorage.setItem('installPromptDismissed', 'true');
    };

    if (isStandalone) return null;

    return (
        <Dialog 
            open={open} 
            onClose={handleClose}
            maxWidth="xs"
            fullWidth
            PaperProps={{
                sx: { borderRadius: 2, p: 1 }
            }}
        >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, pt: 1 }}>
                <Typography variant="h6" fontWeight="bold">
                    Install The Lab App
                </Typography>
                <IconButton onClick={handleClose} size="small">
                    <CloseIcon />
                </IconButton>
            </Box>
            
            <DialogContent>
                <Box sx={{ textAlign: 'center', py: 2 }}>
                    <img src="/logos/icon.png" alt="App Icon" style={{ width: 64, height: 64, borderRadius: 12, marginBottom: 16 }} />
                    <Typography variant="body1" gutterBottom>
                        Install our app for a better experience, easier access, and push notifications!
                    </Typography>
                    
                    {isIOS && (
                        <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1, textAlign: 'left' }}>
                            <Typography variant="body2" fontWeight="bold" gutterBottom>
                                To install on iOS:
                            </Typography>
                            <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                1. Tap the Share button <IosShareIcon fontSize="small" />
                            </Typography>
                            <Typography variant="body2">
                                2. Scroll down and tap "Add to Home Screen"
                            </Typography>
                        </Box>
                    )}
                </Box>
            </DialogContent>
            
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={handleClose} color="inherit">
                    Maybe Later
                </Button>
                {!isIOS && (
                    <Button 
                        onClick={handleInstall} 
                        variant="contained" 
                        startIcon={<GetAppIcon />}
                        autoFocus
                    >
                        Install
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}
