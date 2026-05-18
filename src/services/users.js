import apiFetch from '@/utils/axiosInstance';

class UsersService {
    static getAllUsers = async () => {
        try {
            return await apiFetch('/users');
        } catch (error) {
            console.error("Error fetching users:", error);
            throw error;
        }
    };

    static getUserByQuery = async (query) => {
        try {
            const data = await apiFetch(`/users?${query.property}=${query.value}`);
            return data.user;
        } catch (error) {
            console.error("Error fetching user by query:", error);
            throw error;
        }
    };

    static createUser = async (userData) => {
        try {
            return await apiFetch('/users', {
                method: 'POST',
                body: JSON.stringify(userData),
            });
        } catch (error) {
            console.error("Error creating user:", error);
            throw error;
        }
    };

    static updateUser = async (query, updateData) => {
        try {
            return await apiFetch(`/users?query=${query}`, {
                method: 'PUT',
                body: JSON.stringify(updateData),
            });
        } catch (error) {
            console.error("Error updating user:", error);
            throw error;
        }
    };

    static deleteUser = async (query) => {
        try {
            return await apiFetch(`/users?query=${query}`, { method: 'DELETE' });
        } catch (error) {
            console.error("Error deleting user:", error);
            throw error;
        }
    };
}

export default UsersService;
