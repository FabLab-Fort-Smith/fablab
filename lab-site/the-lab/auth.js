import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import GoogleProvider from 'next-auth/providers/google';
import DiscordProvider from 'next-auth/providers/discord'; // Added Discord provider
import CredentialsProvider from 'next-auth/providers/credentials';
import UsersService from '@/app/api/v1/users/service'; // Import Server Service
import AuthController from '@/app/api/auth/[...nextauth]/controller'; // Import Auth Controller
import AuthService from '@/app/api/auth/[...nextauth]/service'; // Email encryption helpers
import DiscordService from '@/lib/discord';
import TransactionService from '@/app/api/v1/transactions/service';

const baseURL = `${process.env.NEXT_PUBLIC_URL}`;

const providers = [
    GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        async profile(profile) {
            try {

                // Look up by email first, then fall back to googleId so a changed
                // or mismatched email never creates a duplicate account.
                let existingUser = await UsersService.getUserByQuery({ email: profile.email });
                if (!existingUser && profile.sub) {
                    existingUser = await UsersService.getUserByQuery({ googleId: profile.sub });
                    if (existingUser) console.log("Matched existing user by googleId:", existingUser.userID);
                }

                if (!existingUser) {
                    // ✅ Create the user if not found
                    const newUser = await AuthController.register({
                        firstName: profile.given_name,
                        lastName: profile.family_name,
                        username: '',
                        email: profile.email,
                        provider: 'google',
                        googleId: profile.sub,
                        status: "verified",
                        image: profile.picture
                    });
                    
                    return {
                        userID: newUser.userID,
                        name: `${newUser.firstName} ${newUser.lastName}`,
                        firstName: newUser.firstName,
                        lastName: newUser.lastName,
                        username: newUser.username,
                        email: profile.email, // Use profile.email as newUser.email is encrypted
                        role: newUser.role,
                        image: profile.picture,
                        discordId: newUser.discordId
                    };
                }

                // ✅ Return existing user data
                const user = existingUser;

                // ✅ Backwards Compatibility: Update user if provider is missing or image is missing
                if (!user.provider || !user.googleId || !user.image) {
                    console.log("Updating existing user with Google provider info...");
                    await UsersService.updateUser(
                        { userID: user.userID },
                        {
                            provider: 'google',
                            googleId: profile.sub,
                            image: user.image || profile.picture
                        }
                    );
                }

                return {
                    userID: user.userID,
                    name: `${user.firstName} ${user.lastName}`,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    image: profile.picture,
                    discordId: user.discordId
                };

            } catch (error) {
                console.error("Google Auth Error:", error);
                throw new Error("Failed to authenticate with Google.");
            }
        }
    }),
    DiscordProvider({
        clientId: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
        authorization: { params: { scope: 'identify email guilds.join' } },
        async profile(profile) {

            const avatarUrl = profile.avatar
                ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
                : null;

            // ── Link intent check ──────────────────────────────────────────────
            // When a logged-in user clicks "Connect Discord" in settings we set a
            // short-lived HttpOnly cookie with their signed userID before calling
            // signIn(). Read it here to return the EXISTING user instead of
            // creating a ghost account.
            try {
                const { cookies } = await import("next/headers");
                const cookieStore = await cookies();
                const linkCookie = cookieStore.get("discord_link_for");
                if (linkCookie?.value) {
                    const jwtLib = await import("jsonwebtoken");
                    const payload = jwtLib.default.verify(linkCookie.value, process.env.JWT_SECRET);
                    const targetUser = await UsersService.getUserByQuery({ userID: payload.userID });
                    if (targetUser) {
                        console.log(`🔗 Link intent: attaching Discord ${profile.id} to ${targetUser.userID}`);
                        await UsersService.updateUser(targetUser.userID, {
                            discordId: profile.id,
                            discordHandle: profile.username,
                            image: targetUser.image || avatarUrl,
                        });
                        // Clear the cookie
                        cookieStore.delete("discord_link_for");
                        // Return the existing user — NextAuth logs in as them, no ghost created
                        return {
                            userID: targetUser.userID,
                            name: `${targetUser.firstName} ${targetUser.lastName}`.trim(),
                            firstName: targetUser.firstName,
                            lastName: targetUser.lastName,
                            username: targetUser.username,
                            email: AuthService.decryptEmail(targetUser.email),
                            role: targetUser.role,
                            image: avatarUrl || targetUser.image,
                            discordId: profile.id,
                        };
                    }
                }
            } catch (e) {
                // No link intent or invalid cookie — fall through to normal sign-in
                if (e.name !== "JsonWebTokenError" && e.name !== "TokenExpiredError") {
                    console.error("Link intent check failed:", e.message);
                }
            }
            // ── End link intent check ──────────────────────────────────────────

            // Emails are stored encrypted in the DB — encrypt before lookup so we
            // actually match existing accounts (plaintext regex never matches hex).
            const encryptedEmail = profile.email ? AuthService.encryptEmail(profile.email) : null;

            // 1. Look up by encrypted email first, then by discordId.
            let existingUser = encryptedEmail
                ? await UsersService.getUserByQuery({ email: encryptedEmail })
                : null;
            if (!existingUser && profile.id) {
                existingUser = await UsersService.getUserByQuery({ discordId: profile.id });
                if (existingUser) console.log("Matched existing user by discordId:", existingUser.userID);
            }

            if (!existingUser) {
                // Parse a reasonable name from Discord's global_name (display name).
                const displayName = profile.global_name || profile.username || '';
                const nameParts = displayName.split(' ');
                const firstName = nameParts[0] || '';
                const lastName = nameParts.slice(1).join(' ') || '';

                // Username must be unique — fall back to username+id-suffix on conflict.
                let username = profile.username || '';
                let newUser;

                try {
                    newUser = await AuthController.register({
                        firstName,
                        lastName,
                        username,
                        email: profile.email,
                        provider: 'discord',
                        discordHandle: profile.username,
                        discordId: profile.id,
                        status: "verified",
                        image: avatarUrl
                    });
                } catch (regErr) {
                    if (regErr.message === "Username is already taken.") {
                        // Append last 4 chars of Discord ID to make it unique and retry.
                        username = `${username}_${profile.id.slice(-4)}`;
                        newUser = await AuthController.register({
                            firstName,
                            lastName,
                            username,
                            email: profile.email,
                            provider: 'discord',
                            discordHandle: profile.username,
                            discordId: profile.id,
                            status: "verified",
                            image: avatarUrl
                        });
                    } else if (regErr.message === "User already exists with this email.") {
                        // Email already in DB (registered via a different provider).
                        // Find that account and link the Discord identity to it.
                        existingUser = encryptedEmail
                            ? await UsersService.getUserByQuery({ email: encryptedEmail })
                            : null;
                        if (!existingUser) throw regErr; // Shouldn't happen, but surface the error if so.
                        console.log("Linking Discord to existing account:", existingUser.userID);
                        await UsersService.updateUser(existingUser.userID, {
                            discordId: profile.id,
                            discordHandle: profile.username,
                            image: existingUser.image || avatarUrl,
                        });
                        // Fall through to the "return existing user" block below.
                    } else {
                        throw regErr;
                    }
                }

                // If we successfully created a new user, return them.
                if (newUser) {
                    try {
                        const claimedAmount = await TransactionService.claimPendingTips(newUser.userID, profile.id);
                        if (claimedAmount > 0) console.log(`💰 Claimed ${claimedAmount} stake for new user ${newUser.userID}`);
                    } catch (err) {
                        console.error("Error claiming tips:", err);
                    }
                    return {
                        userID: newUser.userID,
                        name: `${newUser.firstName} ${newUser.lastName}`.trim(),
                        firstName: newUser.firstName,
                        lastName: newUser.lastName,
                        username: newUser.username,
                        email: profile.email, // Use profile.email — newUser.email is encrypted
                        role: newUser.role,
                        image: avatarUrl,
                        discordId: newUser.discordId
                    };
                }
                // existingUser was set during the email-conflict recovery above — fall through.
            }

            // ✅ Return existing user data
            const user = existingUser;

            // Always keep discordId / discordHandle current on the record.
            if (!user.discordId || user.discordId !== profile.id || !user.discordHandle) {
                console.log("Updating existing user with Discord provider info...");
                await UsersService.updateUser(
                    { userID: user.userID },
                    {
                        discordHandle: profile.username,
                        discordId: profile.id,
                        image: user.image || avatarUrl,
                    }
                );
            }

            // ✅ Claim Pending Tips
            try {
                const claimedAmount = await TransactionService.claimPendingTips(user.userID, profile.id);
                if (claimedAmount > 0) console.log(`💰 Claimed ${claimedAmount} stake for user ${user.userID}`);
            } catch (err) {
                console.error("Error claiming tips:", err);
            }

            return {
                userID: user.userID,
                name: `${user.firstName} ${user.lastName}`.trim(),
                firstName: user.firstName,
                lastName: user.lastName,
                username: user.username,
                email: user.email,
                role: user.role,
                image: avatarUrl || user.image,
                discordId: profile.id // always return the live Discord ID
            };
        }
    }),
    CredentialsProvider({
        credentials: {
            identifier: { label: 'Email or Username', type: 'text' },
            password: { label: 'Password', type: 'password' }
        },
        async authorize(credentials) {
            try {
                const response = await fetch(`${baseURL}/api/auth/signin`, {
                    method: "POST",
                    body: JSON.stringify({
                        identifier: credentials.identifier,
                        password: credentials.password
                    }),
                    headers: { "Content-Type": "application/json" }
                });

                if (!response.ok) {
                    console.error("Login failed. Invalid credentials.");
                    return null;
                }

                const user = await response.json();
                if (user) {
                    return {
                        userID: user.userID,
                        name: `${user.firstName} ${user.lastName}`,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        username: user.username,
                        email: user.email,
                        role: user.role,
                        token: user.token,
                        image: user.image,
                        discordId: user.discordId
                    };
                }
            } catch (error) {
                console.error("Login error:", error);
                return null;
            }
        }
    })
];

export const providerMap = providers.map((provider) => {
    if (typeof provider === 'function') {
        const providerData = provider();
        return { id: providerData.id, name: providerData.name };
    }
    return { id: provider.id, name: provider.name };
});

export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    providers,
    callbacks: {
        async signIn({ user, account, profile }) {
            if (account?.provider === 'discord' && account.access_token) {
                try {
                    console.log("🔗 Attempting to add user to Discord Guild...");
                    await DiscordService.addMemberToGuild(profile.id, account.access_token);
                } catch (error) {
                    console.error("❌ Failed to add user to Discord guild:", error);
                }
            }
            return true;
        },
        async jwt({ token, user, trigger }) {
            if (user) {
                // Check for Merge Scenario
                if (token.userID && token.userID !== user.userID) {
                    console.log(`⚠️ Merge Detected: Merging ${user.userID} into ${token.userID}`);

                    // If the incoming user has Discord credentials (OAuth link flow), write them
                    // to the existing account immediately — before the merge — so the link is
                    // saved even if the full merge throws (e.g. reference-update failures).
                    if (user.discordId) {
                        try {
                            await UsersService.updateUser(token.userID, {
                                discordId: user.discordId,
                                discordHandle: user.username || '',
                            });
                            token.discordId = user.discordId;
                            console.log(`🔗 Discord credentials linked to ${token.userID} pre-merge`);
                        } catch (linkErr) {
                            console.error("❌ Pre-merge Discord link failed:", linkErr);
                        }
                    }

                    try {
                        // Merge the new user (user.userID) into the existing session user (token.userID)
                        const mergedUser = await UsersService.mergeUsers(token.userID, user.userID);

                        // Update token with merged user data
                        token.userID = mergedUser.userID;
                        token.name = `${mergedUser.firstName} ${mergedUser.lastName}`;
                        token.firstName = mergedUser.firstName;
                        token.lastName = mergedUser.lastName;
                        token.username = mergedUser.username;
                        token.role = mergedUser.role;
                        token.image = mergedUser.image || token.image;
                        token.discordId = mergedUser.discordId;

                        console.log("✅ Merge Successful");
                    } catch (error) {
                        console.error("❌ Merge Failed:", error);
                    }
                } else {
                    // Standard Sign In
                    token.userID = user.userID;
                    token.name = user.name;
                    token.firstName = user.firstName;
                    token.lastName = user.lastName;
                    token.username = user.username;
                    token.role = user.role;
                    token.image = user.image;
                    token.discordId = user.discordId;
                }
                // Record last login timestamp
                try {
                    await UsersService.updateUser({ userID: token.userID }, { lastLogin: new Date() });
                } catch (e) {
                    console.error("Failed to update lastLogin:", e);
                }

                // Enforce grace period expiry on login
                try {
                    const freshUser = await UsersService.getUserByQuery({ userID: token.userID });
                    const m = freshUser?.membership;
                    if (m?.gracePeriodStartedAt && !m?.isWaived) {
                        const GRACE_DAYS = 7;
                        const expires = new Date(m.gracePeriodStartedAt);
                        expires.setDate(expires.getDate() + GRACE_DAYS);
                        if (new Date() > expires) {
                            console.log(`🔒 Grace period expired for ${token.userID} — revoking access`);
                            await UsersService.updateUser({ userID: token.userID }, {
                                "membership.status": "suspended",
                                "membership.accessKey.issued": false,
                                "membership.accessKey.revokedReason": "Grace period expired — payment not received",
                            });
                        }
                    }
                } catch (e) {
                    console.error("Grace period check failed:", e);
                }
            }
            return token;
        },
        async session({ session, token }) {
            if (token) {
                session.user.userID = token.userID;
                session.user.name = token.name;
                session.user.firstName = token.firstName;
                session.user.lastName = token.lastName;
                session.user.username = token.username; // save username in session
                session.user.role = token.role;
                session.user.image = token.image;
                session.user.discordId = token.discordId;
            }
            return session;
        }
    }
});
