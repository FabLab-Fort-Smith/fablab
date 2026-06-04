import { NextResponse } from 'next/server';
import UserModel from '../users/model';
import BountyModel from '../bounties/model';

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const timeRange = searchParams.get('timeRange') || 'all';

        let startDate = null;
        const now = new Date();

        if (timeRange === '30d') {
            startDate = new Date(now.setDate(now.getDate() - 30));
        } else if (timeRange === '90d') {
            startDate = new Date(now.setDate(now.getDate() - 90));
        } else if (timeRange === '1y') {
            startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        }

        const users = await UserModel.getAllUsers();
        const bounties = await BountyModel.getAllBounties();

        // Helper to check date range
        const isWithinRange = (date) => {
            if (!startDate || !date) return true;
            return new Date(date) >= startDate;
        };

        // --- Users Stats ---
        const totalUsers = users.length;
        const newUsers = users.filter(u => isWithinRange(u.createdAt)).length;
        const activeMembers = users.filter(u => u.membership?.status === 'active').length;
        const probationMembers = users.filter(u => u.membership?.status === 'probation').length;
        
        // --- Bounty Stats ---
        const totalBounties = bounties.length;
        const createdBounties = bounties.filter(b => isWithinRange(b.createdAt)).length;
        const openBounties = bounties.filter(b => b.status === 'open').length; // Snapshot
        
        // Completed in period (use completedAt if available, else fallback to updatedAt or createdAt if status is verified)
        const completedBounties = bounties.filter(b => 
            (b.status === 'completed' || b.status === 'verified') && 
            isWithinRange(b.completedAt || b.updatedAt)
        ).length;
        
        // --- Stake Stats ---
        const totalStake = users.reduce((acc, user) => acc + (user.stake || 0), 0);
        // Estimate distributed stake in period based on completed bounties
        const distributedStake = bounties
            .filter(b => b.status === 'verified' && isWithinRange(b.completedAt || b.updatedAt))
            .reduce((acc, b) => acc + (Number(b.stakeValue) || 0) + 3, 0); // Base 3 + additional

        // --- Volunteer Hours ---
        const totalVolunteerHours = users.reduce((acc, user) => {
            const logs = user.membership?.volunteerLog || [];
            return acc + logs.reduce((sum, log) => sum + (Number(log.hours) || 0), 0);
        }, 0);

        const periodVolunteerHours = users.reduce((acc, user) => {
            const logs = user.membership?.volunteerLog || [];
            return acc + logs
                .filter(log => isWithinRange(log.date))
                .reduce((sum, log) => sum + (Number(log.hours) || 0), 0);
        }, 0);

        return NextResponse.json({
            users: {
                total: totalUsers,
                new: newUsers,
                active: activeMembers,
                probation: probationMembers
            },
            bounties: {
                total: totalBounties,
                created: createdBounties,
                open: openBounties,
                completed: completedBounties
            },
            stake: {
                total: totalStake,
                distributed: distributedStake
            },
            hours: {
                total: totalVolunteerHours,
                logged: periodVolunteerHours
            }
        });
    } catch (error) {
        console.error("Analytics Error:", error);
        return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
    }
}
