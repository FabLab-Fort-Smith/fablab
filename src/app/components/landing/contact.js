"use client";

import { Box, Typography, TextField, Button, useTheme, Alert, Snackbar } from "@mui/material";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

const ContactSection = () => {
  const shouldReduceMotion = useReducedMotion();
  const theme = useTheme();
  const [status, setStatus] = useState('idle'); // idle, submitting, success, error
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('submitting');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setStatus('success');
        setFormData({ name: '', email: '', message: '' });
      } else {
        setStatus('error');
      }
    } catch (error) {
      console.error("Contact form error:", error);
      setStatus('error');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.8, ease: "easeOut" }}
    >
      <Box
        sx={{
          padding: { xs: "2rem 1rem", sm: "4rem 1rem" },
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          backgroundColor: theme.palette.background.default,
          color: theme.palette.text.primary,
        }}
      >
        {/* Heading */}
        <Typography
          variant="h4"
          component="h2"
          gutterBottom
          sx={{
            fontWeight: "bold",
            letterSpacing: "0.1em",
            marginBottom: "1.5rem",
            color: theme.palette.primary.main,
            fontSize: { xs: "1.5rem", sm: "2rem" },
          }}
        >
          We’d Love to Hear From You
        </Typography>

        {/* Contact Information */}
        <Typography
          variant="body1"
          gutterBottom
          sx={{
            maxWidth: "600px",
            lineHeight: "1.6",
            marginBottom: "2rem",
            color: theme.palette.text.primary,
            fontSize: { xs: "1rem", sm: "1.25rem" },
          }}
        >
          Address: 805 N Greenwood Ave., Fort Smith, AR, 72901
          <br />
          Email: info@fablabfortsmith.com
          <br />
        </Typography>

        {/* Contact Form */}
        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: "1.5rem",
            width: "100%",
            maxWidth: "500px",
            textAlign: "left",
          }}
        >
          <TextField
            label="Name"
            variant="outlined"
            fullWidth
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            sx={{
              backgroundColor: theme.palette.background.paper,
              "& .MuiInputBase-root": {
                color: theme.palette.text.primary,
              },
              "& .MuiInputLabel-root": {
                color: theme.palette.text.primary,
              },
              "& .MuiOutlinedInput-root": {
                "& fieldset": {
                  borderColor: theme.palette.primary.main,
                },
                "&:hover fieldset": {
                  borderColor: theme.palette.primary.main,
                },
                "&.Mui-focused fieldset": {
                  borderColor: theme.palette.primary.main,
                },
              },
            }}
          />
          <TextField
            label="Email"
            variant="outlined"
            type="email"
            fullWidth
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            sx={{
              backgroundColor: theme.palette.background.paper,
              "& .MuiInputBase-root": {
                color: theme.palette.text.primary,
              },
              "& .MuiInputLabel-root": {
                color: theme.palette.text.primary,
              },
              "& .MuiOutlinedInput-root": {
                "& fieldset": {
                  borderColor: theme.palette.primary.main,
                },
                "&:hover fieldset": {
                  borderColor: theme.palette.primary.main,
                },
                "&.Mui-focused fieldset": {
                  borderColor: theme.palette.primary.main,
                },
              },
            }}
          />
          <TextField
            label="Message"
            variant="outlined"
            multiline
            rows={4}
            fullWidth
            required
            value={formData.message}
            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
            sx={{
              backgroundColor: theme.palette.background.paper,
              "& .MuiInputBase-root": {
                color: theme.palette.text.primary,
              },
              "& .MuiInputLabel-root": {
                color: theme.palette.text.primary,
              },
              "& .MuiOutlinedInput-root": {
                "& fieldset": {
                  borderColor: theme.palette.primary.main,
                },
                "&:hover fieldset": {
                  borderColor: theme.palette.primary.main,
                },
                "&.Mui-focused fieldset": {
                  borderColor: theme.palette.primary.main,
                },
              },
            }}
          />
          <motion.div
            whileHover={{
              scale: shouldReduceMotion ? 1 : 1.1,
              transition: { duration: 0.3 },
            }}
            whileTap={{ scale: 0.95 }}
          >
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={status === 'submitting'}
              sx={{
                width: "100%",
                padding: { xs: "0.5rem 1rem", sm: "0.75rem 1.5rem" },
                fontWeight: "bold",
                textTransform: "uppercase",
                backgroundColor: theme.palette.primary.main,
                color: theme.palette.background.default,
                "&:hover": {
                  backgroundColor: theme.palette.primary.main,
                  color: theme.palette.background.default,
                },
              }}
            >
              {status === 'submitting' ? 'Sending...' : 'Submit'}
            </Button>
          </motion.div>
        </Box>
      </Box>
      
      <Snackbar open={status === 'success'} autoHideDuration={6000} onClose={() => setStatus('idle')}>
        <Alert onClose={() => setStatus('idle')} severity="success" sx={{ width: '100%' }}>
          Message sent successfully! We'll get back to you soon.
        </Alert>
      </Snackbar>
      
      <Snackbar open={status === 'error'} autoHideDuration={6000} onClose={() => setStatus('idle')}>
        <Alert onClose={() => setStatus('idle')} severity="error" sx={{ width: '100%' }}>
          Failed to send message. Please try again or email us directly.
        </Alert>
      </Snackbar>
    </motion.div>
  );
};

export default ContactSection;
