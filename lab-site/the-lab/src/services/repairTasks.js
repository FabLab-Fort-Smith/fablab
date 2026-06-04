import apiFetch from '@/utils/axiosInstance';

class RepairTaskService {
    static fetchRepairTasks = async () => {
        try {
            return await apiFetch('/repairTasks');
        } catch (error) {
            console.error("Error fetching repair tasks:", error);
            throw error;
        }
    };
}

export default RepairTaskService;
