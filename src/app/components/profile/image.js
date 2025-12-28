import React, { useState } from 'react';
import { Box, Avatar, IconButton, CircularProgress, Tooltip } from '@mui/material';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import { uploadFileToS3 } from '@/utils/s3.util';

const UserImage = ({ picture, onUpload, editable = false }) => {
    const [uploading, setUploading] = useState(false);

    const handleFileChange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setUploading(true);
        try {
            const url = await uploadFileToS3(file);
            if (onUpload) onUpload(url);
        } catch (error) {
            console.error("Failed to upload profile picture:", error);
            alert("Failed to upload profile picture.");
        } finally {
            setUploading(false);
        }
    };

    return (
        <Box sx={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
            <Avatar
                src={picture || '/default-avatar.png'}
                sx={{ 
                    width: { xs: 200, sm: 250, md: 350 }, 
                    height: { xs: 200, sm: 250, md: 350 },
                    opacity: uploading ? 0.5 : 1
                }}
            />
            {uploading && (
                <CircularProgress 
                    sx={{ 
                        position: 'absolute', 
                        top: '50%', 
                        left: '50%', 
                        marginTop: '-20px', 
                        marginLeft: '-20px' 
                    }} 
                />
            )}
            {editable && !uploading && (
                <Box sx={{ position: 'absolute', bottom: 20, right: 20, zIndex: 10 }}>
                    <input
                        accept="image/*"
                        style={{ display: 'none' }}
                        id="icon-button-file"
                        type="file"
                        onChange={handleFileChange}
                    />
                    <label htmlFor="icon-button-file">
                        <Tooltip title="Upload Profile Picture">
                            <IconButton 
                                color="primary" 
                                aria-label="upload picture" 
                                component="span" 
                                sx={{ 
                                    bgcolor: 'background.paper', 
                                    boxShadow: 3,
                                    '&:hover': { bgcolor: 'grey.200' } 
                                }}
                            >
                                <PhotoCameraIcon />
                            </IconButton>
                        </Tooltip>
                    </label>
                </Box>
            )}
        </Box>
    );
};

export default UserImage;
