"use client";
import { useEffect } from "react";
import { signIn } from "next-auth/react";
import { Box, CircularProgress, Typography } from "@mui/material";

export default function DiscordAuthPage() {
    useEffect(() => {
        signIn("discord", { callbackUrl: "/dashboard" });
    }, []);

    return (
        <Box 
            display="flex" 
            flexDirection="column" 
            alignItems="center" 
            justifyContent="center" 
            minHeight="100vh"
            gap={2}
        >
            <CircularProgress />
            <Typography>Redirecting to Discord...</Typography>
        </Box>
    );
}
