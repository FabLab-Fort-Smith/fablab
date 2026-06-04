import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { auth } from '@/auth';

export const maxDuration = 60; // Increase timeout to 60s for slow uploads
export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// SEC-08: trust the file's *content*, not the client-supplied MIME/extension.
// Allowed image types are identified by magic bytes; the matched entry decides
// the stored ContentType and extension. SVG is intentionally excluded (it can
// carry script → stored XSS when served from a trusted origin).
const IMAGE_TYPES = [
    { mime: 'image/jpeg', ext: 'jpg', match: (b) => b.length > 2 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { mime: 'image/png',  ext: 'png', match: (b) => b.length > 7 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
    { mime: 'image/gif',  ext: 'gif', match: (b) => b.length > 5 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
    { mime: 'image/webp', ext: 'webp', match: (b) => b.length > 11 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
];

export function detectImageType(buffer) {
    return IMAGE_TYPES.find((t) => t.match(buffer)) || null;
}

// Lazily build the S3 client so a missing config doesn't break module import
// (cf. the MongoClient import-time lesson). No hardcoded endpoint/bucket
// fallbacks (SEC-21) — config comes from the environment or the request fails.
let _s3Client;
function getS3Client() {
    if (!_s3Client) {
        _s3Client = new S3Client({
            region: process.env.S3_REGION || 'us-east-1',
            endpoint: process.env.S3_ENDPOINT,
            forcePathStyle: true,
            credentials: {
                accessKeyId: process.env.S3_ACCESS_KEY,
                secretAccessKey: process.env.S3_SECRET_KEY,
            },
        });
    }
    return _s3Client;
}

export async function POST(req) {
    try {
        // SEC-08: uploads require an authenticated session (was anonymous).
        const session = await auth();
        if (!session?.user?.userID) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const bucketName = process.env.S3_BUCKET_NAME;
        const endpoint = process.env.S3_ENDPOINT;
        if (!bucketName || !endpoint) {
            console.error("S3 storage is not configured (S3_BUCKET_NAME / S3_ENDPOINT).");
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }

        const formData = await req.formData();
        const file = formData.get('file');

        if (!file || typeof file.arrayBuffer !== 'function') {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        if (typeof file.size === 'number' && file.size > MAX_BYTES) {
            return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        if (buffer.byteLength > MAX_BYTES) {
            return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });
        }

        // Validate by content, not by the client-declared type.
        const kind = detectImageType(buffer);
        if (!kind) {
            return NextResponse.json({ error: "Unsupported file type (images only)" }, { status: 415 });
        }

        // Server-generated key — never trust the client filename (path/special chars).
        const fileKey = `uploads/${randomUUID()}.${kind.ext}`;

        await getS3Client().send(new PutObjectCommand({
            Bucket: bucketName,
            Key: fileKey,
            Body: buffer,
            ContentType: kind.mime,
        }));

        const publicUrl = `${endpoint.replace(/\/+$/, '')}/${bucketName}/${fileKey}`;
        return NextResponse.json({ url: publicUrl });

    } catch (error) {
        console.error("Error uploading to S3:", error?.message);
        return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
    }
}
