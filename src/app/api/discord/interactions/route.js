import { NextResponse } from 'next/server';
import nacl from 'tweetnacl';

// Your public key from the Discord developer portal
const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

export async function POST(request) {
    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    const body = await request.text(); // Get raw body as string

    console.log("🔔 Discord Interaction Received:", body.substring(0, 100) + "...");

    if (!PUBLIC_KEY) {
        console.error('DISCORD_PUBLIC_KEY is not set');
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    if (!signature || !timestamp) {
        return NextResponse.json({ error: 'Missing signature headers' }, { status: 401 });
    }

    // Verify the signature
    try {
        const isVerified = nacl.sign.detached.verify(
            Buffer.from(timestamp + body),
            Buffer.from(signature, 'hex'),
            Buffer.from(PUBLIC_KEY, 'hex')
        );

        if (!isVerified) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
    } catch (err) {
        console.error('Signature verification failed:', err);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse the body
    const interaction = JSON.parse(body);

    // 1. Handle PING (Required by Discord)
    if (interaction.type === 1) {
        return NextResponse.json({ type: 1 });
    }

    // 2. Handle Slash Commands
    if (interaction.type === 2) {
        const { name } = interaction.data;

        if (name === 'ping') {
            return NextResponse.json({
                type: 4, // ChannelMessageWithSource
                data: {
                    content: 'Pong! 🏓',
                },
            });
        }

        if (name === 'tip') {
            const senderDiscordId = interaction.member ? interaction.member.user.id : interaction.user.id;
            const options = interaction.data.options;
            const receiverOption = options.find(o => o.name === 'user');
            const amountOption = options.find(o => o.name === 'amount');
            
            const receiverDiscordId = receiverOption.value;
            const amount = amountOption.value;

            try {
                // Import dynamically to avoid top-level await issues if any
                const { default: TransactionService } = await import('@/app/api/v1/transactions/service');
                const { default: UserModel } = await import('@/app/api/v1/users/model');

                // Find Sender
                const sender = await UserModel.getUserByQuery({ discordId: senderDiscordId });
                
                if (!sender) {
                     return NextResponse.json({
                        type: 4,
                        data: {
                            content: "❌ You must link your Discord account to your FabLab account to send tips.",
                            flags: 64 // Ephemeral (only user sees it)
                        }
                    });
                }

                // Process Tip
                const result = await TransactionService.processTip(sender.userID, amount, null, receiverDiscordId);

                if (result.status === 'completed') {
                    return NextResponse.json({
                        type: 4,
                        data: {
                            content: `✅ **${sender.username}** tipped **${amount} Stake** to <@${receiverDiscordId}>! 💸`
                        }
                    });
                } else {
                    const authUrl = `${process.env.NEXT_PUBLIC_URL}/auth/discord`;
                    return NextResponse.json({
                        type: 4,
                        data: {
                            content: `✅ **${sender.username}** sent **${amount} Stake** to <@${receiverDiscordId}>!\n\n⚠️ <@${receiverDiscordId}>, you haven't linked your Discord account yet! The stake is held in escrow.\n\n**Click the button below to enroll and claim your Stake!** 👇`,
                            components: [
                                {
                                    type: 1,
                                    components: [
                                        {
                                            type: 2,
                                            style: 5,
                                            label: "Enroll & Claim Stake",
                                            url: authUrl
                                        }
                                    ]
                                }
                            ]
                        }
                    });
                }

            } catch (error) {
                console.error("Tip Error:", error);
                return NextResponse.json({
                    type: 4,
                    data: {
                        content: `❌ Transaction failed: ${error.message}`,
                        flags: 64
                    }
                });
            }
        }

        if (name === 'balance') {
            const senderDiscordId = interaction.member ? interaction.member.user.id : interaction.user.id;

            try {
                const { default: UserModel } = await import('@/app/api/v1/users/model');
                const user = await UserModel.getUserByQuery({ discordId: senderDiscordId });

                if (!user) {
                    return NextResponse.json({
                        type: 4,
                        data: {
                            content: "❌ You haven't linked your Discord account to FabLab yet.\n\nPlease log in to the website and link your Discord account to view your balance and earn Stake.",
                            flags: 64 // Ephemeral
                        }
                    });
                }

                return NextResponse.json({
                    type: 4,
                    data: {
                        content: `💰 **Your Balance:** ${user.stake || 0} Stake`,
                        flags: 64 // Ephemeral (privacy)
                    }
                });

            } catch (error) {
                console.error("Balance Error:", error);
                return NextResponse.json({
                    type: 4,
                    data: {
                        content: "❌ Failed to retrieve balance.",
                        flags: 64
                    }
                });
            }
        }

        if (name === 'leaderboard') {
            try {
                const { default: UserModel } = await import('@/app/api/v1/users/model');
                const topUsers = await UserModel.getTopStakeHolders(10);

                if (!topUsers || topUsers.length === 0) {
                    return NextResponse.json({
                        type: 4,
                        data: {
                            content: "🏆 **Leaderboard is empty!** Start earning stake to be the first."
                        }
                    });
                }

                const leaderboardString = topUsers.map((u, index) => {
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
                    return `${medal} **${u.username || 'Unknown'}** - ${u.stake} Stake`;
                }).join('\n');

                return NextResponse.json({
                    type: 4,
                    data: {
                        embeds: [{
                            title: "🏆 FabLab Stake Leaderboard",
                            description: leaderboardString,
                            color: 0xFFD700 // Gold color
                        }]
                    }
                });

            } catch (error) {
                console.error("Leaderboard Error:", error);
                return NextResponse.json({
                    type: 4,
                    data: {
                        content: "❌ Failed to retrieve leaderboard.",
                        flags: 64
                    }
                });
            }
        }

        if (name === 'checkin') {
            const senderDiscordId = interaction.member ? interaction.member.user.id : interaction.user.id;
            try {
                const { default: UserModel } = await import('@/app/api/v1/users/model');
                const { default: CheckInModel } = await import('@/app/api/v1/checkin/model');
                
                const user = await UserModel.getUserByQuery({ discordId: senderDiscordId });
                if (!user) {
                    return NextResponse.json({ type: 4, data: { content: "❌ You must link your Discord account to check in.", flags: 64 } });
                }

                if (user.isCheckedIn) {
                    await CheckInModel.completeCheckIn(user.userID);
                    await UserModel.updateUser({ userID: user.userID }, { isCheckedIn: false });
                    return NextResponse.json({ type: 4, data: { content: `👋 Goodbye **${user.firstName}**! Checked out successfully.` } });
                } else {
                    await CheckInModel.createCheckIn(user.userID);
                    await UserModel.updateUser({ userID: user.userID }, { isCheckedIn: true, lastCheckIn: new Date() });
                    return NextResponse.json({ type: 4, data: { content: `📍 Welcome to the Lab, **${user.firstName}**! You are now checked in.` } });
                }
            } catch (error) {
                console.error("Checkin Error:", error);
                return NextResponse.json({ type: 4, data: { content: "❌ Check-in failed.", flags: 64 } });
            }
        }

        if (name === 'profile') {
            const senderDiscordId = interaction.member ? interaction.member.user.id : interaction.user.id;
            try {
                const { default: UserModel } = await import('@/app/api/v1/users/model');
                const user = await UserModel.getUserByQuery({ discordId: senderDiscordId });
                
                if (!user) {
                    return NextResponse.json({ type: 4, data: { content: "❌ Account not linked.", flags: 64 } });
                }

                const joinDate = new Date(user.createdAt).toLocaleDateString();
                const membershipStatus = user.membership?.status || 'None';
                const badgeCount = user.badges ? user.badges.length : 0;

                return NextResponse.json({
                    type: 4,
                    data: {
                        embeds: [{
                            title: `👤 ${user.firstName} ${user.lastName}`,
                            thumbnail: { url: user.image },
                            fields: [
                                { name: 'Username', value: user.username || 'N/A', inline: true },
                                { name: 'Membership', value: membershipStatus.toUpperCase(), inline: true },
                                { name: 'Stake', value: `${user.stake || 0}`, inline: true },
                                { name: 'Badges', value: `${badgeCount}`, inline: true },
                                { name: 'Joined', value: joinDate, inline: true },
                            ],
                            color: 0x0099ff,
                            url: `${process.env.NEXT_PUBLIC_URL}/dashboard/profile`
                        }]
                    }
                });
            } catch (error) {
                return NextResponse.json({ type: 4, data: { content: "❌ Failed to load profile.", flags: 64 } });
            }
        }

        if (name === 'badges') {
            const senderDiscordId = interaction.member ? interaction.member.user.id : interaction.user.id;
            try {
                const { default: UserModel } = await import('@/app/api/v1/users/model');
                const { default: Constants } = await import('@/lib/constants');
                
                const user = await UserModel.getUserByQuery({ discordId: senderDiscordId });
                if (!user) return NextResponse.json({ type: 4, data: { content: "❌ Account not linked.", flags: 64 } });

                const userBadges = user.badges || [];
                if (userBadges.length === 0) {
                    return NextResponse.json({ type: 4, data: { content: "You haven't earned any badges yet. Keep building! 🛠️", flags: 64 } });
                }

                const badgeList = userBadges.map(b => {
                    // Find badge details in Constants if stored as ID, or use object if stored fully
                    // Assuming stored as IDs or objects with ID
                    const badgeId = typeof b === 'string' ? b : b.id;
                    // Search through Constants.BADGES values
                    const badgeDef = Object.values(Constants.BADGES).find(def => def.id === badgeId);
                    return badgeDef ? `${badgeDef.icon} **${badgeDef.name}**` : `🏅 ${badgeId}`;
                }).join('\n');

                return NextResponse.json({
                    type: 4,
                    data: {
                        embeds: [{
                            title: `🏅 Badges: ${user.firstName}`,
                            description: badgeList,
                            color: 0xFFA500
                        }]
                    }
                });
            } catch (error) {
                return NextResponse.json({ type: 4, data: { content: "❌ Failed to load badges.", flags: 64 } });
            }
        }

        if (name === 'wifi') {
            const senderDiscordId = interaction.member ? interaction.member.user.id : interaction.user.id;
            try {
                const { default: UserModel } = await import('@/app/api/v1/users/model');
                const user = await UserModel.getUserByQuery({ discordId: senderDiscordId });

                if (!user) return NextResponse.json({ type: 4, data: { content: "❌ Account not linked.", flags: 64 } });

                const isActive = user.membership?.status === 'active' || user.membership?.status === 'probation' || user.membership?.isWaived;
                
                if (!isActive) {
                    return NextResponse.json({ type: 4, data: { content: "🔒 Wi-Fi access is reserved for active members.", flags: 64 } });
                }

                const wifiSSID = process.env.WIFI_SSID || "FabLab-core";
                const wifiPass = process.env.WIFI_PASSWORD || "FabLabFS";

                return NextResponse.json({
                    type: 4,
                    data: {
                        content: `📶 **Wi-Fi Access**\n**SSID:** \`${wifiSSID}\`\n**Password:** \`${wifiPass}\``,
                        flags: 64 // Ephemeral
                    }
                });
            } catch (error) {
                return NextResponse.json({ type: 4, data: { content: "❌ Failed to retrieve Wi-Fi info.", flags: 64 } });
            }
        }

        if (name === 'award') {
            const senderDiscordId = interaction.member ? interaction.member.user.id : interaction.user.id;
            const options = interaction.data.options;
            const receiverDiscordId = options.find(o => o.name === 'user').value;
            const amount = options.find(o => o.name === 'amount').value;
            const reason = options.find(o => o.name === 'reason').value;

            try {
                const { default: UserModel } = await import('@/app/api/v1/users/model');
                const { default: TransactionService } = await import('@/app/api/v1/transactions/service');

                // 1. Verify Admin / Staff Role
                const adminUser = await UserModel.getUserByQuery({ discordId: senderDiscordId });
                const memberRoles = interaction.member?.roles || [];
                const STAFF_ROLE_ID = "1029463455675207690";
                const hasStaffRole = memberRoles.includes(STAFF_ROLE_ID);

                if (!adminUser) {
                    return NextResponse.json({ type: 4, data: { content: "❌ Unauthorized. Please link your account first.", flags: 64 } });
                }

                // Enforce Staff Role ID specifically
                if (!hasStaffRole) {
                    return NextResponse.json({ type: 4, data: { content: "❌ Unauthorized. You need the Staff role to use this command.", flags: 64 } });
                }

                // 2. Find Receiver (Optional check here, service handles logic)
                const receiver = await UserModel.getUserByQuery({ discordId: receiverDiscordId });
                
                // 3. Award Stake
                const result = await TransactionService.awardStake(adminUser.userID, receiver ? receiver.userID : null, amount, reason, receiverDiscordId);

                if (result.status === 'completed') {
                    return NextResponse.json({
                        type: 4,
                        data: {
                            content: `🎉 **${adminUser.firstName}** awarded **${amount} Stake** to <@${receiverDiscordId}>!\n📝 **Reason:** ${reason}`
                        }
                    });
                } else {
                    const authUrl = `${process.env.NEXT_PUBLIC_URL}/auth/discord`;
                    return NextResponse.json({
                        type: 4,
                        data: {
                            content: `🎉 **${adminUser.firstName}** awarded **${amount} Stake** to <@${receiverDiscordId}>!\n📝 **Reason:** ${reason}\n\n⚠️ <@${receiverDiscordId}>, you haven't linked your Discord account yet! The stake is held in escrow.\n\n**Click the button below to enroll and claim your Stake!** 👇`,
                            components: [
                                {
                                    type: 1,
                                    components: [
                                        {
                                            type: 2,
                                            style: 5,
                                            label: "Enroll & Claim Stake",
                                            url: authUrl
                                        }
                                    ]
                                }
                            ]
                        }
                    });
                }

            } catch (error) {
                console.error("Award Error:", error);
                return NextResponse.json({ type: 4, data: { content: `❌ Failed to award stake: ${error.message}`, flags: 64 } });
            }
        }

        if (name === 'help') {
            const helpMessage = `
**🤖 FabLab Bot Commands**

**/checkin** - Check in or out of the lab
**/profile** - View your FabLab profile
**/balance** - Check your Stake balance
**/badges** - View your earned badges
**/leaderboard** - See the top Stake holders
**/tip [user] [amount]** - Send Stake to another user
**/wifi** - Get the lab's Wi-Fi credentials (Members only)
**/enroll** - Create a FabLab account (Link via Web)
**/ping** - Check if the bot is online

**Staff Commands:**
**/award [user] [amount] [reason]** - Award Stake to a user
            `;

            return NextResponse.json({
                type: 4,
                data: {
                    content: helpMessage,
                    flags: 64 // Ephemeral
                }
            });
        }

        if (name === 'enroll') {
            const authUrl = `${process.env.NEXT_PUBLIC_URL}/auth/discord`;
            return NextResponse.json({
                type: 4,
                data: {
                    content: `👋 **Welcome to the Lab!**\n\nClick the button below to securely enroll with your Discord account. This will automatically link your account and log you in.`,
                    components: [
                        {
                            type: 1, // Action Row
                            components: [
                                {
                                    type: 2, // Button
                                    style: 5, // Link Button
                                    label: "Enroll with Discord",
                                    url: authUrl
                                }
                            ]
                        }
                    ],
                    flags: 64 // Ephemeral
                }
            });
        }
    }

    return NextResponse.json({ error: 'Unknown interaction type' }, { status: 400 });
}
