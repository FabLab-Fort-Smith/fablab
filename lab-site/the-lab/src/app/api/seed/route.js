import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import PortfolioModel from '../v1/portfolio/model';
import BountyModel from '../v1/bounties/model';
import UserModel from '../v1/users/model';
import { guardOperationalEndpoint } from '@/lib/adminGuard';

export async function GET(req) {
    try {
        // SEC-18: demo-data seeding — admin-only and never reachable in production.
        const blocked = await guardOperationalEndpoint({ productionDisabled: true });
        if (blocked) return blocked;

        // 1. Get all users to assign as creators
        const users = await UserModel.getAllUsers();
        if (users.length === 0) {
            return NextResponse.json({ error: "No users found. Please create users first." }, { status: 400 });
        }

        const getRandomUser = () => users[Math.floor(Math.random() * users.length)];

        // 2. Seed Showcase (Portfolio)
        const showcaseItems = [
            {
                title: "3D Printed Prosthetic Hand",
                description: "Designed and printed a functional prosthetic hand for a local charity. Used PLA+ for durability.",
                imageUrls: ["https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=800&q=80"],
            },
            {
                title: "Laser Cut Jewelry Box",
                description: "Intricate mandala pattern laser cut into birch plywood. Finished with walnut stain.",
                imageUrls: ["https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=800&q=80"],
            },
            {
                title: "Arduino Weather Station",
                description: "IoT weather station measuring temp, humidity, and pressure. Sends data to a local server.",
                imageUrls: ["https://images.unsplash.com/photo-1555664424-778a69022365?auto=format&fit=crop&w=800&q=80"],
            },
            {
                title: "CNC Carved Sign",
                description: "Custom shop sign carved from solid oak. Gold leaf lettering.",
                imageUrls: ["https://images.unsplash.com/photo-1504198458649-3128b932f49e?auto=format&fit=crop&w=800&q=80"],
            },
            {
                title: "Cosplay Armor Set",
                description: "Full suit of armor made from EVA foam. Painted with metallic acrylics.",
                imageUrls: ["https://images.unsplash.com/photo-1535581652167-3d6b98c36cd0?auto=format&fit=crop&w=800&q=80"],
            }
        ];

        for (const item of showcaseItems) {
            const user = getRandomUser();
            await PortfolioModel.createItem({
                id: uuidv4(),
                userID: user.userID,
                userName: `${user.firstName} ${user.lastName}`,
                discordId: user.discordId,
                title: item.title,
                description: item.description,
                imageUrls: item.imageUrls,
                likes: [],
                comments: [],
                createdAt: new Date()
            });
        }

        // 3. Seed Bounties
        const bountyItems = [
            {
                title: "Fix the 3D Printer (Prusa #2)",
                description: "The nozzle is clogged and needs a cold pull or replacement.",
                rewardType: "hours",
                rewardValue: "2",
                stakeValue: 5,
                isInfinite: false
            },
            {
                title: "Teach a Laser Cutting Workshop",
                description: "Looking for someone to lead the beginner laser cutting class next Saturday.",
                rewardType: "cash",
                rewardValue: "$50",
                stakeValue: 10,
                isInfinite: false
            },
            {
                title: "Clean the Woodshop",
                description: "Sweep up sawdust and organize the scrap bin.",
                rewardType: "hours",
                rewardValue: "1",
                stakeValue: 3,
                isInfinite: true,
                recurrence: "weekly"
            },
            {
                title: "Develop a Member Check-in App",
                description: "Create a simple tablet app for members to check in when they arrive.",
                rewardType: "cash",
                rewardValue: "$200",
                stakeValue: 50,
                isInfinite: false
            },
            {
                title: "Sort Electronics Components",
                description: "Organize the resistor and capacitor drawers in the electronics lab.",
                rewardType: "hours",
                rewardValue: "3",
                stakeValue: 5,
                isInfinite: false
            }
        ];

        for (const item of bountyItems) {
            const user = getRandomUser();
            await BountyModel.createBounty({
                bountyID: uuidv4(),
                title: item.title,
                description: item.description,
                creatorID: user.userID,
                rewardType: item.rewardType,
                rewardValue: item.rewardValue,
                stakeValue: item.stakeValue,
                status: 'open',
                isInfinite: item.isInfinite,
                recurrence: item.recurrence || 'none',
                createdAt: new Date(),
                likes: [],
                comments: []
            });
        }

        return NextResponse.json({ message: "Database seeded successfully!" });
    } catch (error) {
        console.error("Seeding error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
