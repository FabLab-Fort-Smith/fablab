// src/app/api/auth/auth.controller.js

import AuthService from "./service";

export default class AuthController {

    /**
     * ✅ Register a new user with email and password
     * Used in a custom endpoint for manual signup flow, not NextAuth directly
     */
    static async register(data) {
        console.log('sending to auth service');
        return await AuthService.register(data);
    }

    /**
     * ✅ Login a user with email and password for NextAuth CredentialsProvider
     */
    static async handleEmailLogin(email, password) {
        try {
            const token = await AuthService.login(email, password);
            return { email, token }; // Return a user object with a token for NextAuth
        } catch (error) {
            console.error("Login Error:", error.message);
            throw new Error("Invalid credentials.");
        }
    }

    /**
     * ✅ Handle Google OAuth signup/login for NextAuth GoogleProvider
     */
    static async handleGoogleLogin(user) {
        try {
            const { name, email, image } = user;
            const userData = await AuthService.googleAuth({ email, name, image });
            return userData;
        } catch (error) {
            console.error("Google Auth Error:", error.message);
            throw new Error("Google authentication failed.");
        }
    }

    /**
     * ✅ Verify user's email (not NextAuth directly)
     */
    static async verifyEmail(token) {
        try {
            await AuthService.verifyEmail(token);
            return { message: "Email verified successfully." };
        } catch (error) {
            throw new Error(error.message);
        }
    }

    /**
     * ✅ Resend the verification email (not NextAuth directly)
     */
    static async resendVerification(email) {
        try {
            await AuthService.resendVerification(email);
            return { message: "Verification email sent successfully." };
        } catch (error) {
            throw new Error(error.message);
        }
    }

    /**
     * ✅ Logout logic is token-based with NextAuth (no controller needed)
     */
    static async logout() {
        return { message: "Logged out successfully." }; // JWT logout handled on frontend
    }
}
