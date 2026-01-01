import { NextResponse } from 'next/server';
import { uploadToS3 } from '@/lib/s3';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req) {
    try {
        const formData = await req.formData();
        const file = formData.get('file');

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const fileName = `uploads/${uuidv4()}-${file.name.replace(/\s+/g, '_')}`;
        
        const url = await uploadToS3(buffer, fileName, file.type);

        return NextResponse.json({ url }, { status: 200 });
    } catch (error) {
        console.error("Upload error details:", {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 500 });
    }
}
