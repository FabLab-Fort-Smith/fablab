"use client";

import { Box, Typography, Link as MuiLink } from "@mui/material";
import Link from "next/link";

const Footer = () => (
  <Box
    sx={{
      textAlign: "center",
      padding: "2rem 1rem",
      backgroundColor: "#222",
      color: "#fff",
    }}
  >
    <Typography variant="body2" gutterBottom>
      © 2024 Fab Lab Fort Smith. All rights reserved.
    </Typography>
    <Box sx={{ mt: 1 }}>
        <MuiLink component={Link} href="/code-of-conduct" color="inherit" underline="hover" sx={{ mx: 1 }}>
            Code of Conduct
        </MuiLink>
        |
        <MuiLink component={Link} href="/board-members" color="inherit" underline="hover" sx={{ mx: 1 }}>
            Board Members
        </MuiLink>
        |
        <MuiLink component={Link} href="/about" color="inherit" underline="hover" sx={{ mx: 1 }}>
            About Us
        </MuiLink>
    </Box>
  </Box>
);

export default Footer;
