// src/app/api/auth/auth.service.js

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../../v1/users/class';
import UserModel from './model';
import Constants from '@/lib/constants';
import { sendVerificationEmail, sendInviteEmail } from '@/app/utils/email.util.js';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRATION = '7d'; // Token expiration for JWT tokens
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 32 bytes, required via env — no fallback (SEC-23; full GCM redesign tracked under E5)
const IV_LENGTH = 16; // 16 bytes for AES

export default class AuthService {

    // New deterministic encryption for emails
    static encryptEmail(email) {
        if (!email) return '';
        const key = Buffer.from(ENCRYPTION_KEY);
        const iv = Buffer.alloc(IV_LENGTH, 0); // deterministic IV
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        return cipher.update(email, 'utf8', 'hex') + cipher.final('hex');
    }

    // New deterministic decryption for emails
    static decryptEmail(encryptedEmail) {
        if (!encryptedEmail) return '';
        try {
            const key = Buffer.from(ENCRYPTION_KEY);
            const iv = Buffer.alloc(IV_LENGTH, 0);
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
            return decipher.update(encryptedEmail, 'hex', 'utf8') + decipher.final('utf8');
        } catch (error) {
            // If decryption fails, assume it's already decrypted or invalid, return as is
            return encryptedEmail;
        }
    }

    // New deterministic encryption for phone numbers
    static encryptPhone(phoneNumber) {
        if (!phoneNumber) return '';
        const key = Buffer.from(ENCRYPTION_KEY);
        const iv = Buffer.alloc(IV_LENGTH, 0);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        return cipher.update(phoneNumber, 'utf8', 'hex') + cipher.final('hex');
    }

    // New deterministic decryption for phone numbers
    static decryptPhone(encryptedPhone) {
        if (!encryptedPhone) return '';
        try {
            const key = Buffer.from(ENCRYPTION_KEY);
            const iv = Buffer.alloc(IV_LENGTH, 0);
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
            return decipher.update(encryptedPhone, 'hex', 'utf8') + decipher.final('utf8');
        } catch (error) {
            // If decryption fails, assume it's already decrypted or invalid, return as is
            return encryptedPhone;
        }
    }

    /**
     * ✅ Register a new user with email and password
     * - Called during manual sign-up
     */
    static async register(userData) {
        const { firstName, lastName, username, email, password, phoneNumber, status, provider, discordHandle, discordId, googleId, image } = userData; // added username
        const plainEmail = email;
        const encryptedEmail = this.encryptEmail(email);
        const encryptedPhone = phoneNumber ? this.encryptPhone(phoneNumber) : '';
        // SEC-24: never log userData / user records / hashes / tokens / decrypted PII.
        const existingUser = await UserModel.findByEmail(encryptedEmail);
        if (existingUser) {
            throw new Error("User already exists with this email.");
        };
        const hashedPassword = password ? await bcrypt.hash(password, 10) : 'no password';
        
        // Ensure username is lowercased if it exists, though check should handle it
        // We allow display casing in storage if desired, but check is case-insensitive.
        // If strict uniqueness is desired, we rely on the findByUsername check above 
        // which I will add now.

        if (username) {
            const existingUsername = await UserModel.findByUsername(username);
            if (existingUsername) {
                throw new Error("Username is already taken.");
            }
        }
        
        const newUser = new User(
            firstName,
            lastName,
            username, // new argument
            encryptedEmail, // store encrypted email
            hashedPassword,
            phoneNumber ? encryptedPhone : '', // store encrypted phone number
            'user', // default role
            status,
            provider,
            discordHandle,
            discordId || '', // discordId
            googleId || '', // googleId
            '', // bio
            [], // skills
            Constants.ONBOARDING_REWARDS.REGISTER, // stake
            image || '' // image
        );
        const results = await UserModel.create(newUser);

        // ✅ Send the verification email using the email utility.
        // SEC-24: do not log the recipient email or the verification token
        // (token in logs is a direct account-takeover vector).
        if (newUser.status === 'unverified') {
            await sendVerificationEmail(plainEmail, newUser.verificationToken);
        };
        return results;
    }

    /**
     * ✅ Login a user with email/username and password
     * - Called in CredentialsProvider flow of NextAuth
     */
    static async login(identifier, password) {
        let user;
        if (identifier.includes('@')) {
            const encryptedEmail = this.encryptEmail(identifier);
            user = await UserModel.findByEmail(encryptedEmail);
        } else {
            user = await UserModel.findByUsername(identifier);
        }
        if (!user) {
            throw new Error("User not found.");
        }
        if (user.status !== 'verified') {
            throw new Error("Please verify your email before logging in.");
        }

        // Check if the password is valid
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            console.error("Password comparison failed!");
            throw new Error("Invalid password.");
        }

        // ✅ Generate JWT Token for the authenticated user
        const token = jwt.sign({ userID: user.userID, role: user.role }, JWT_SECRET, {
            expiresIn: JWT_EXPIRATION
        });

        console.log("Password matched. Token generated.");

        // ✅ Return the full user data along with the token
        return {
            token,
            userID: user.userID,
            firstName: user.firstName,
            lastName: user.lastName,
            email: this.decryptEmail(user.email), // return decrypted email
            role: user.role,
            image: user.image,
            discordId: user.discordId,
            username: user.username
        };
    }

    /**
     * ✅ Google Authentication Logic
     * - Called when logging in through GoogleProvider in NextAuth
     */
    static async googleAuth({ email, name, image }) {
        const encryptedEmail = this.encryptEmail(email);
        let user = await UserModel.findByEmail(encryptedEmail);

        if (!user) {
            const [firstName, lastName] = name.split(' ');

            user = await UserModel.create({
                firstName,
                lastName,
                email: encryptedEmail, // store encrypted email
                image,
                role: 'client',
                status: 'verified'
            });
        }

        // ✅ Return the user object for NextAuth JWT management
        const token = jwt.sign({ userID: user.userID, role: user.role }, JWT_SECRET, {
            expiresIn: JWT_EXPIRATION
        });

        return { user, token };
    }

    /**
     * ✅ Verify user's email using token
     */
    static async verifyEmail(token) {
        const user = await UserModel.findByVerificationToken(token);
        if (!user) {
            throw new Error("Invalid or expired verification token.");
        }

        user.status = 'verified';
        user.verificationToken = null;
        user.stake = (user.stake || 0) + Constants.ONBOARDING_REWARDS.VERIFY_EMAIL;
        
        user.$push = {
            stakeHistory: {
                amount: Constants.ONBOARDING_REWARDS.VERIFY_EMAIL,
                reason: "Email Verification Reward",
                timestamp: new Date()
            }
        };

        await UserModel.updateById(user.userID, user);

        return { message: "Email successfully verified." };
    }

    /**
     * ✅ Resend the verification email for unverified users
     */
    static async resendVerification(email) {
        const encryptedEmail = this.encryptEmail(email);
        const user = await UserModel.findByEmail(encryptedEmail);
        if (!user) {
            throw new Error("User not found.");
        }
        if (user.status === 'verified') {
            throw new Error("User is already verified.");
        }
        // Use user's generateVerificationToken method if available; else generate JWT token matching User class
        user.verificationToken = user.generateVerificationToken
            ? user.generateVerificationToken()
            : jwt.sign(
                { email: this.decryptEmail(user.email), userID: user.userID },
                process.env.JWT_SECRET,
                { expiresIn: '15m' }
              );
        await user.save();
        await sendVerificationEmail(email, user.verificationToken);
    }

    /**
     * ✅ Logout - Stateless JWT-based logout
     */
    static async logout() {
        return { message: "You have been logged out." };
    }
}
