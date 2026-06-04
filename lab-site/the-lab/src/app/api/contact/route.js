import { NextResponse } from 'next/server';
import { sendContactEmail } from '@/app/utils/email.util';
import ContactSubmissionModel from '@/app/api/v1/contact-submissions/model';

export async function POST(request) {
  try {
    const { name, email, message } = await request.json();

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Save to database
    await ContactSubmissionModel.createSubmission({ name, email, message });

    // Send email
    await sendContactEmail(name, email, message);

    return NextResponse.json(
      { message: 'Message sent successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Contact API Error:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
