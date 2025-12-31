import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import UserModel from '@/app/api/v1/users/model';
import Constants from '@/lib/constants';
import { unlockDoor, toggleLight } from '@/lib/access-control';

export async function POST(request) {
    try {
        const session = await auth();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await UserModel.getUserByID(session.user.userID);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Check Good Standing
        const isAdmin = user.role === 'admin';
        const isWaived = user.membership?.isWaived === true;
        const isSubscriptionActive = user.membership?.subscriptionStatus === 'ACTIVE' || isWaived;
        const isMembershipActive = ['active', 'probation', 'founder'].includes(user.membership?.status); 
        const isCommunity = user.membership?.type === 'community';

        if (isCommunity && !isAdmin) {
             return NextResponse.json({ 
                error: 'Access Denied: Community members do not have door access.',
                details: { membershipType: 'community' }
            }, { status: 403 });
        }
        
        // Calculate Previous Month Hours
        const now = new Date();
        const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const previousMonth = previousMonthDate.getMonth();
        const previousYear = previousMonthDate.getFullYear();

        const volunteerLogs = user.membership?.volunteerLog || [];
        const volunteerHours = volunteerLogs.reduce((total, log) => {
            if (!log.date) return total;
            const logDate = new Date(log.date);
            if (logDate.getMonth() === previousMonth && logDate.getFullYear() === previousYear) {
                return total + (parseFloat(log.hours) || 0);
            }
            return total;
        }, 0);

        const hasVolunteerHours = volunteerHours >= Constants.REQUIRED_VOLUNTEER_HOURS;

        // Check if user is exempt (e.g. Admin or Founder badge)
        // For now, we enforce rules as requested.
        // Note: If user is new (joined this month), they won't have previous month hours.
        // We might want to allow them if they are in 'probation' status?
        // But user said "only members in good standing... need to have completed volunteer hours".
        // I will enforce it strictly.

        if (!isAdmin && (!isSubscriptionActive || !isMembershipActive || !hasVolunteerHours)) {
             console.log(`Access Denied for ${user.username}:`, {
                isAdmin,
                isSubscriptionActive,
                isMembershipActive,
                hasVolunteerHours,
                volunteerHours,
                required: Constants.REQUIRED_VOLUNTEER_HOURS
             });
             
             return NextResponse.json({ 
                error: 'Access Denied: Not in good standing',
                details: {
                    subscriptionActive: isSubscriptionActive,
                    membershipStatus: user.membership?.status,
                    volunteerHoursPreviousMonth: volunteerHours,
                    requiredHours: Constants.REQUIRED_VOLUNTEER_HOURS
                }
            }, { status: 403 });
        }

        // Unlock Door
        const deviceId = 'door-controller-01'; 
        
        try {
            // Using toggleLight as the user indicated the test page (which uses toggleLight) is the working switch.
            // In the future, this should likely be switched back to unlockDoor when the firmware supports it.
            const result = await toggleLight(deviceId);
            return NextResponse.json({ success: true, result });
        } catch (unlockError) {
            console.error('Unlock failed:', unlockError.message);
            return NextResponse.json({ 
                error: unlockError.message || 'Failed to unlock door',
                details: unlockError.response?.data 
            }, { status: 502 }); // 502 Bad Gateway indicates upstream (controller) issue
        }

    } catch (error) {
        console.error('Unlock route error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
