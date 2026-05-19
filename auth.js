import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import GoogleProvider from 'next-auth/providers/google';
import DiscordProvider from 'next-auth/providers/discord'; // Added Discord provider
import CredentialsProvider from 'next-auth/providers/credentials';
import UsersService from '@/app/api/v1/users/service'; // Import Server Service
import AuthController from '@/app/api/auth/[...nextauth]/controller'; // Import Auth Controller
import DiscordService from '@/lib/discord';
import TransactionService from '@/app/api/v1/transactions/service';

const baseURL = `${process.env.NEXT_PUBLIC_URL}`;

const providers = [
    GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        async profile(profile) {
            try {
                console.log("Google Profile:", profile);

                // Look up by email first, then fall back to googleId so a changed
                // or mismatched email never creates a duplicate account.
                let existingUser = await UsersService.getUserByQuery({ email: profile.email });
                if (!existingUser && profile.sub) {
                    existingUser = await UsersService.getUserByQuery({ googleId: profile.sub });
                    if (existingUser) console.log("Matched existing user by googleId:", existingUser.userID);
                }
                console.log("Existing User:", existingUser);

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
                    
                    console.log("New User:", newUser);
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
            console.log("Discord Profile:", profile);

            // Look up by email first, then fall back to discordId so a changed
            // or mismatched email never creates a duplicate account.
            let existingUser = await UsersService.getUserByQuery({ email: profile.email });
            if (!existingUser && profile.id) {
                existingUser = await UsersService.getUserByQuery({ discordId: profile.id });
                if (existingUser) console.log("Matched existing user by discordId:", existingUser.userID);
            }
            console.log("Existing User:", existingUser);

            if (!existingUser) {
                // ✅ Create the user if not found
                const newUser = await AuthController.register({
                    firstName: '',
                    lastName: '',
                    username: profile.username,
                    email: profile.email,
                    provider: 'discord',
                    discordHandle: profile.username,
                    discordId: profile.id,
                    status: "verified",
                    image: profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : null
                });

                console.log("New User:", newUser);

                // ✅ Claim Pending Tips
                try {
                    const claimedAmount = await TransactionService.claimPendingTips(newUser.userID, profile.id);
                    if (claimedAmount > 0) console.log(`💰 Claimed ${claimedAmount} stake for new user ${newUser.userID}`);
                } catch (err) {
                    console.error("Error claiming tips:", err);
                }

                return {
                    userID: newUser.userID,
                    name: `${newUser.firstName} ${newUser.lastName}`,
                    firstName: newUser.firstName,
                    lastName: newUser.lastName,
                    username: newUser.username,
                    email: profile.email, // Use profile.email as newUser.email is encrypted
                    role: newUser.role,
                    image: profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : null,
                    discordId: newUser.discordId
                };
            }

            // ✅ Return existing user data
            const user = existingUser;

            // ✅ Backwards Compatibility: Update user if provider or discordHandle is missing or image is missing
            if (!user.provider || !user.discordHandle || !user.discordId || !user.image) {
                console.log("Updating existing user with Discord provider info...");
                await UsersService.updateUser(
                    { userID: user.userID },
                    {
                        provider: 'discord',
                        discordHandle: profile.username,
                        discordId: profile.id,
                        image: user.image || (profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : null)
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
                name: `${user.firstName} ${user.lastName}`,
                firstName: user.firstName,
                lastName: user.lastName,
                username: user.username,
                email: user.email,
                role: user.role,
                image: profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : null,
                discordId: user.discordId
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
                console.log("Credentials:", credentials);
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
