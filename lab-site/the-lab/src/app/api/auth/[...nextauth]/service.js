// src/app/api/auth/auth.service.js

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../../v1/users/class';
import UserModel from './model';
import Constants from '@/lib/constants';
import { sendVerificationEmail, sendInviteEmail, sendPasswordResetEmail } from '@/app/utils/email.util.js';
import { timingSafeEqualStr } from '@/lib/secureCompare';
import { CORE_EVENTS } from '@/lib/plugins/hooks';
import { emitEvent } from '@/lib/plugins/registry';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRATION = '7d'; // Token expiration for JWT tokens
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 32 bytes, required via env — no fallback (SEC-23; full GCM redesign tracked under E5)
const IV_LENGTH = 16; // 16 bytes for AES

// Password-reset policy (#73). Time-boxed, single-use, hashed-at-rest tokens.
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes
const PASSWORD_MIN_LENGTH = 8;   // matches the register form hint
const PASSWORD_MAX_LENGTH = 128; // bound input (DoS); bcrypt only reads the first 72 bytes
// NOTE: accounts created via OAuth store the sentinel password 'no password'
// (see register()). The reset flow deliberately has NO old-password gate, so it
// works for those accounts — this is the prerequisite for retiring Google OAuth.

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
        // Notify the plugin platform (best-effort; never blocks registration).
        await emitEvent(CORE_EVENTS.MEMBER_REGISTERED, { userID: newUser.userID }).catch(() => {});
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
     * ✅ Generate a high-entropy, single-use, time-boxed password-reset token (#73).
     * Returns the RAW token (goes only in the emailed link) and its SHA-256 HASH
     * (the only form persisted). Raw = 32 CSPRNG bytes (256-bit) hex-encoded.
     * @returns {{ rawToken: string, tokenHash: string, expires: Date }}
     */
    static generatePasswordResetToken() {
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = this.hashResetToken(rawToken);
        const expires = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
        return { rawToken, tokenHash, expires };
    }

    /**
     * ✅ SHA-256 hex of a raw reset token. Used to store and to look up by hash
     * so the plaintext token never touches the database.
     * @param {string} rawToken
     * @returns {string}
     */
    static hashResetToken(rawToken) {
        return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
    }

    /**
     * ✅ Request a password reset (#73).
     * ALWAYS resolves without revealing whether the account exists — the caller
     * returns a generic success either way (no account enumeration). Emails are
     * encrypted at rest with a deterministic cipher, so we encrypt the address
     * and match the ciphertext (a raw {email} query never matches). When a user
     * is found we store a hashed token and email the raw reset link.
     *
     * NEVER logs the email, the token, or the reset link (account-takeover vector).
     * @param {string} email - plaintext email as submitted
     * @returns {Promise<void>}
     */
    static async requestPasswordReset(email) {
        if (!email || typeof email !== 'string') return;
        const plainEmail = email;
        const encryptedEmail = this.encryptEmail(email);
        const user = await UserModel.findByEmail(encryptedEmail);
        if (!user) return; // silent no-op — caller still returns generic success

        const { rawToken, tokenHash, expires } = this.generatePasswordResetToken();
        await UserModel.setPasswordResetToken(user.userID, tokenHash, expires);

        // FIRE-AND-FORGET the email — do NOT await it. Awaiting the SMTP round
        // trip only when the account exists leaks account existence via response
        // timing (enumeration, CWE-208) and would let an attacker sidestep the
        // per-IP limit by measuring latency. Returning immediately keeps the
        // found/not-found paths ~indistinguishable (the residual delta from the
        // token write above is minor). The token/link is never logged (SEC-24);
        // a mail failure is caught so it can't surface or reject unhandled.
        sendPasswordResetEmail(plainEmail, rawToken).catch((err) => {
            console.error('Failed to send password reset email:', err?.message || 'send error');
        });
    }

    /**
     * ✅ Complete a password reset (#73).
     * Validates the raw token against the stored hash in CONSTANT TIME, checks it
     * is unexpired and unused, enforces the password policy, sets the new bcrypt
     * hash, and consumes the token (single-use). Works for OAuth-only accounts
     * (password === 'no password') — there is no old-password gate.
     *
     * All failure modes (missing/invalid/expired/used token) collapse to one
     * generic error so nothing is leaked; a bad password is its own generic error.
     * @param {string} rawToken - the raw token from the reset link
     * @param {string} newPassword - the plaintext new password
     * @returns {Promise<{message: string}>}
     * @throws {Error} 'Invalid or expired reset token.' | 'Password does not meet requirements.'
     */
    static async resetPassword(rawToken, newPassword) {
        // Validate the password shape first (cheap; leaks nothing about the token).
        if (
            typeof newPassword !== 'string' ||
            newPassword.length < PASSWORD_MIN_LENGTH ||
            newPassword.length > PASSWORD_MAX_LENGTH
        ) {
            throw new Error('Password does not meet requirements.');
        }
        if (typeof rawToken !== 'string' || rawToken.length === 0) {
            throw new Error('Invalid or expired reset token.');
        }

        const tokenHash = this.hashResetToken(rawToken);
        const user = await UserModel.findByPasswordResetTokenHash(tokenHash);

        // Constant-time compare of the recomputed hash vs the stored one (defence
        // in depth on top of the exact-match lookup), plus existence + expiry.
        const storedHash = user?.passwordResetTokenHash || '';
        const tokenMatches = !!user && timingSafeEqualStr(tokenHash, storedHash);
        const notExpired =
            !!user &&
            !!user.passwordResetExpires &&
            new Date(user.passwordResetExpires).getTime() >= Date.now();

        if (!tokenMatches || !notExpired) {
            throw new Error('Invalid or expired reset token.');
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        // Consume ATOMICALLY: the update matches on { userID, tokenHash }, so two
        // concurrent submits can't both succeed (TOCTOU, CWE-367). The loser sees
        // the token already cleared -> modifiedCount 0 -> generic invalid error.
        const consumed = await UserModel.completePasswordReset(user.userID, tokenHash, hashedPassword);
        if (!consumed) {
            throw new Error('Invalid or expired reset token.');
        }
        return { message: 'Password has been reset.' };
    }

    /**
     * ✅ Logout - Stateless JWT-based logout
     */
    static async logout() {
        return { message: "You have been logged out." };
    }
}
