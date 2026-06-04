import apiFetch from '@/utils/axiosInstance';

class MembershipService {
    static getMembershipPlans = async () => {
        try {
            return await apiFetch('/memberships');
        } catch (error) {
            console.error("Error fetching membership plans:", error);
            throw error;
        }
    };

    static subscribeToPlan = async (userID, planId) => {
        try {
            return await apiFetch('/memberships', {
                method: 'POST',
                body: JSON.stringify({ userID, planId }),
            });
        } catch (error) {
            console.error("Error subscribing to membership:", error);
            throw error;
        }
    };

    static cancelMembership = async (userID) => {
        try {
            return await apiFetch('/memberships/cancel', {
                method: 'DELETE',
                body: JSON.stringify({ userID }),
            });
        } catch (error) {
            console.error("Error canceling membership:", error);
            throw error;
        }
    };

    static updateLockerStatus = async (userID, action) => {
        try {
            return await apiFetch('/memberships/locker', {
                method: 'PUT',
                body: JSON.stringify({ userID, action }),
            });
        } catch (error) {
            console.error("Error updating locker status:", error);
            throw error;
        }
    };
}

export default MembershipService;
