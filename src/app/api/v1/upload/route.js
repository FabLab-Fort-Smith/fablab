import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand } from "@aws-sdk/client-s3";

// Initialize S3 Client (Server-Side Only)
const s3Client = new S3Client({
    region: process.env.S3_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || 'https://s3.crittercodes.dev',
    forcePathStyle: true,
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || 'admin',
        secretAccessKey: process.env.S3_SECRET_KEY || 'Beyond66_Secure_Minio_2025',
    }
});

const ensureBucketExists = async (bucketName) => {
    try {
        await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
    } catch (error) {
        if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
            console.log(`Bucket ${bucketName} not found. Creating...`);
            await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
            console.log(`Bucket ${bucketName} created.`);
        } else {
            throw error;
        }
    }
};

export async function POST(req) {
    try {
        const formData = await req.formData();
        const file = formData.get('file');

        // Fallback to hardcoded bucket if env var is missing (temporary fix)
        const bucketName = process.env.S3_BUCKET_NAME || 'fablab-bounties';

        console.log("DEBUG: S3 Env Vars:", {
            bucket: bucketName,
            endpoint: process.env.S3_ENDPOINT || 'https://s3.crittercodes.dev',
            region: process.env.S3_REGION || 'us-east-1'
        });

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        if (!bucketName) {
            console.error("S3_BUCKET_NAME is not defined");
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }

        await ensureBucketExists(bucketName);

        const buffer = Buffer.from(await file.arrayBuffer());
        const fileKey = `${Date.now()}-${file.name.replace(/\s/g, '_')}`;

        const uploadParams = {
            Bucket: bucketName,
            Key: fileKey,
            Body: buffer,
            ContentType: file.type,
            ACL: 'public-read', 
        };

        await s3Client.send(new PutObjectCommand(uploadParams));

        // Construct public URL
        // We always want to use the domain name for the frontend, never the internal IP
        const publicEndpoint = 'https://s3.crittercodes.dev';
        const publicUrl = `${publicEndpoint}/${bucketName}/${fileKey}`;

        return NextResponse.json({ url: publicUrl });

    } catch (error) {
        console.error("Error uploading to S3:", error);
        return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
    }
}
