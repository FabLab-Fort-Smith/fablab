"use client";

import { Box, Typography, Button, useTheme } from "@mui/material";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";

const HeroSection = () => {
  const theme = useTheme();
  const [text, setText] = useState("");
  const fullText = "Unleash Your Creativity";
  const typingSpeed = 100; // Adjust typing speed here

  useEffect(() => {
    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex <= fullText.length) {
        setText(fullText.slice(0, currentIndex));
        currentIndex++;
      } else {
        clearInterval(interval);
      }
    }, typingSpeed);

    return () => clearInterval(interval);
  }, []);

  return (
    <Box
      sx={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: { xs: "2rem 1rem", sm: "4rem 1rem" },
        background: `linear-gradient(135deg, ${theme.palette.background.default} 50%, ${theme.palette.background.paper} 100%)`,
        color: theme.palette.text.primary,
        minHeight: "90vh",
        textAlign: "center",
        fontFamily: "monospace", // Use monospace font for terminal-like appearance
      }}
    >
      {/* Overlay */}
      <Box
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          height: "100%", // Ensure overlay height matches hero section height
          zIndex: 1,
        }}
      />

      {/* Content */}
      <Box
        sx={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          textAlign: "center",
          alignItems: "center",
        }}
      >
        {/* Animated Headline */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <Typography
            variant="h2"
            component="h1"
            gutterBottom
            sx={{
              fontWeight: "bold",
              letterSpacing: "0.1em",
              fontSize: { xs: "2rem", sm: "3rem" },
              textShadow: "2px 2px 4px rgba(0, 0, 0, 0.5)", // Add text shadow
              display: "inline-block",
            }}
          >
            {text}
            <Box
              component="span"
              sx={{
                display: "inline-block",
                width: "1ch",
                backgroundColor: "white",
                animation: "blink 1s step-end infinite",
                "@keyframes blink": {
                  "0%, 100%": { opacity: 1 },
                  "50%": { opacity: 0 },
                },
              }}
            >
              &nbsp;
            </Box>
          </Typography>
        </motion.div>

        {/* Animated Subheadline */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          <Typography
            variant="h5"
            gutterBottom
            sx={{
              maxWidth: "600px",
              fontSize: { xs: "1rem", sm: "1.25rem" },
              marginBottom: "2rem",
              textShadow: "2px 2px 4px rgba(0, 0, 0, 0.5)", // Add text shadow
            }}
          >
            Fort Smith's Premier Hackerspace. Join a community of creators, builders, and innovators in the River Valley.
          </Typography>
        </motion.div>

        {/* Animated Button with Link */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <Link href="auth/register" passHref>
            <Button
              variant="contained"
              size="large"
              sx={{
                padding: { xs: "0.5rem 1rem", sm: "0.75rem 2rem" },
                fontSize: "1rem",
                textTransform: "uppercase",
                boxShadow: `0px 4px 10px ${theme.palette.primary.dark}`,
                transition: "all 0.3s ease",
                "&:hover": {
                  transform: "scale(1.05)",
                  boxShadow: `0px 6px 14px ${theme.palette.primary.dark}`,
                },
              }}
            >
              Join The Community
            </Button>
          </Link>
        </motion.div>

        {/* Link for existing members to log in */}
        <Box mt={2}>
          <Link href="auth/signin" passHref>
            <Button variant="text" sx={{ color: theme.palette.primary.main }}>
              Already a member? Login
            </Button>
          </Link>
        </Box>
      </Box>
    </Box>
  );
};

export default HeroSection;
