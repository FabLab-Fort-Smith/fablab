import { NextResponse } from 'next/server';
import ContactSubmissionModel from './model';

export async function GET() {
    try {
        const submissions = await ContactSubmissionModel.getAllSubmissions();
        return NextResponse.json(submissions);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch submissions' }, { status: 500 });
    }
}

export async function PATCH(request) {
    try {
        const { id, status } = await request.json();
        const result = await ContactSubmissionModel.updateStatus(id, status);
        return NextResponse.json(result);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
    }
}
