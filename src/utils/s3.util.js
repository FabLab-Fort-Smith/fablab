/**
 * Upload a file to S3 via the server-side API
 * @param {File} file - The file to upload.
 * @returns {Promise<string>} - The public URL of the uploaded file.
 */
export const uploadFileToS3 = async (file) => {
    try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/v1/upload', {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            let errorMsg = 'Upload failed';
            try {
                const errorData = await res.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) {
                // If response is not JSON (e.g., 504 Gateway Timeout HTML), read text
                const text = await res.text();
                console.error("Non-JSON Error Response:", text.substring(0, 200)); // Log first 200 chars
                if (res.status === 504) errorMsg = "Server Timeout (504): Upload took too long.";
                else errorMsg = `Server Error (${res.status})`;
            }
            throw new Error(errorMsg);
        }

        const data = await res.json();
        return data.url;
    } catch (error) {
        console.error("Error uploading to S3:", error);
        throw error;
    }
};
