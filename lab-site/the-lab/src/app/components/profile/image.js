"use client";
import React, { useState } from 'react';
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
            console.error("Failed to upload avatar:", error);
            alert("Failed to upload profile picture.");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 'clamp(150px, 30vw, 280px)', height: 'clamp(150px, 30vw, 280px)', borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--bd)', opacity: uploading ? 0.5 : 1, background: 'var(--bg-1)' }}>
                <img src={picture || '/default-avatar.png'} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            {uploading && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 11 }}>uploading...</div>
            )}
            {editable && !uploading && (
                <div style={{ position: 'absolute', bottom: 12, right: 'calc(50% - 70px)', zIndex: 10 }}>
                    <input accept="image/*" style={{ display: 'none' }} id="profile-pic-upload" type="file" onChange={handleFileChange} />
                    <label htmlFor="profile-pic-upload" title="Upload Profile Picture" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: 'var(--bg-card)', border: '1px solid var(--bd)', cursor: 'pointer', color: 'var(--text-mid)', fontSize: 14 }}>
                        ⊕
                    </label>
                </div>
            )}
        </div>
    );
};

export default UserImage;
