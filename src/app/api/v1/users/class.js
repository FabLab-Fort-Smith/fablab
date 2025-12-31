// src/app/api/users/user.class.js
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
const JWT_EXPIRATION = '15m'; // 15 minutes token expiration

export default class User {
    constructor( 
        firstName, 
        lastName, 
        username, 
        email, 
        password, 
        phoneNumber,
        role,
        status,
        provider,
        discordHandle,
        discordId,
        googleId,
        bio,
        skills,
        stake,
        image,
        boardPosition
    ) {
        this.userID = `user-${uuidv4().slice(0, 8)}`;
        this.firstName = firstName;
        this.lastName = lastName;
        this.username = username; 
        this.email = email;
        this.phoneNumber = phoneNumber;
        this.address = {};
        this.image = image || '';
        this.role = role || 'user';
        this.boardPosition = boardPosition || ''; // ✅ Board Position or Job Title
        this.status = status ? status : 'unverified';
        this.password = password;
        this.provider = provider || 'local';
        this.discordHandle = discordHandle || '';
        this.discordId = discordId || '';
        this.googleId = googleId || '';
        this.createdAt = new Date();
        this.updatedAt = new Date();
        this.verificationToken = this.generateVerificationToken();
        this.stake = stake || 0; // ✅ Community Involvement Score
        this.badges = []; // ✅ Earned Badges
        
        // ✅ Privacy Settings
        this.privacy = {
            showEmail: true,
            showDiscord: true,
            showPhone: false
        };

        // ✅ Public Profile Fields
        this.bio = bio || '';
        this.socials = {
            github: '',
            linkedin: '',
            twitter: '',
            website: '',
            instagram: ''
        };
        this.interests = skills || []; // Merging skills/hobbies into interests
        this.isPublic = true;

        // ✅ Membership Tracking
        this.membership = {
            type: 'community', // 'community', 'co-op'
            status: 'registered', // registered, applicant, contacted, onboarding, probation, active, suspended
            applicationDate: null,
            contacted: false,
            contactDate: null,
            onboardingComplete: false,
            onboardingDate: null,
            volunteerLog: [], // Array of { id, date, hours, description, verifiedBy }
            accessKey: {
                issued: false,
                type: null, // 'limited', '24h'
                issuedDate: null
            },
            notes: [] // Array of { date, adminId, text }
        };
    }

    /**
     * ✅ Generates a JWT token for email verification
     * Token expires in 15 minutes.
     */
    generateVerificationToken() {
        return jwt.sign(
            { email: this.email, userID: this.userID },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRATION }
        );
    }

    /**
     * ✅ Verify the provided JWT token (used when verifying the user)
     * @param {string} token - JWT token to verify
     * @returns {boolean|object} - Returns decoded token or false if invalid
     */
    static verifyToken(token) {
        try {
            return jwt.verify(token, JWT_SECRET);
        } catch (error) {
            console.error("Invalid or expired token:", error);
            return false;
        }
    }
}
