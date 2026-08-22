import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import UserModel from '@/app/api/v1/users/model';
import Constants from '@/lib/constants';
import { unlockDoor, toggleLight } from '@/lib/access-control';
import { auditLog } from '@/lib/audit';
import { shadowCompare } from '@/plugins/door-access-controller/parallelRun';

export async function POST(request) {
    try {
        const session = await auth();
        const source = request.headers.get('x-forwarded-for') || null;
        if (!session) {
            auditLog('access.unlock', { actor: null, target: 'door-controller-01', outcome: 'denied', reason: 'unauthenticated', source });
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const actor = session.user.userID;

        const user = await UserModel.getUserByID(session.user.userID);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const deviceId = 'door-controller-01';

        // Check Good Standing
        const isAdmin = user.role === 'admin';
        const isWaived = user.membership?.isWaived === true;
        const isSubscriptionActive = ['ACTIVE', 'PENDING'].includes(user.membership?.subscriptionStatus) || isWaived;
        const isMembershipActive = ['active', 'probation', 'founder'].includes(user.membership?.status);

        // Waived members are effectively Co-op members
        const isCommunity = user.membership?.type === 'community' && !isWaived;

        // Calculate Previous Month Hours (retained for the not-in-good-standing audit/detail)
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

        // --- LIVE good-standing decision (unchanged rules) --------------------------------
        // Grant iff admin, OR (active subscription AND active membership); community denied.
        let liveGranted = true;
        let liveDeny = null;
        if (isCommunity && !isAdmin) {
            liveGranted = false;
            liveDeny = {
                reason: 'community_member',
                status: 403,
                body: { error: 'Access Denied: Community members do not have door access.', details: { membershipType: 'community' } },
            };
        } else if (!isAdmin && (!isSubscriptionActive || !isMembershipActive)) {
            liveGranted = false;
            liveDeny = {
                reason: 'not_in_good_standing',
                status: 403,
                auditExtra: { volunteerHours },
                body: {
                    error: 'Access Denied: Not in good standing',
                    details: { subscriptionActive: isSubscriptionActive, membershipStatus: user.membership?.status, volunteerHoursPreviousMonth: volunteerHours },
                },
            };
        }

        // --- Parallel-run / cutover (same strangler switch as internal/check-access) -------
        // Shadow-evaluate the addon policy for this session member; it logs divergences and,
        // only once `authoritative` is set, decides the gate. Never throws / never mutates live.
        const shadow = await shadowCompare({ user, doorId: deviceId, credentialType: 'app', liveGranted, source });
        const cutover = shadow.ran && shadow.authoritative;
        const granted = cutover ? shadow.granted : liveGranted;

        if (!granted) {
            if (cutover) {
                auditLog('access.unlock', { actor, target: deviceId, outcome: 'denied', reason: shadow.reason, source });
                return NextResponse.json({ error: 'Access Denied', reason: shadow.reason }, { status: 403 });
            }
            auditLog('access.unlock', { actor, target: deviceId, outcome: 'denied', reason: liveDeny.reason, ...(liveDeny.auditExtra || {}), source });
            return NextResponse.json(liveDeny.body, { status: liveDeny.status });
        }

        // Unlock Door
        try {
            // Using toggleLight as the user indicated the test page (which uses toggleLight) is the working switch.
            // In the future, this should likely be switched back to unlockDoor when the firmware supports it.
            const result = await toggleLight(deviceId);
            auditLog('access.unlock', { actor, target: deviceId, outcome: 'granted', source });
            return NextResponse.json({ success: true, result });
        } catch (unlockError) {
            console.error('Unlock failed:', unlockError.message);
            auditLog('access.unlock', { actor, target: deviceId, outcome: 'error', reason: 'controller_failure', source });
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
