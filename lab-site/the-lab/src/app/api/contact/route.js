import { NextResponse } from 'next/server';
import { sendContactEmail } from '@/app/utils/email.util';
import ContactSubmissionModel from '@/app/api/v1/contact-submissions/model';
import { CORE_EVENTS } from '@/lib/plugins/hooks';
import { emitEvent } from '@/lib/plugins/registry';

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
    const saved = await ContactSubmissionModel.createSubmission({ name, email, message });

    // Notify enabled plugins (best-effort, ID-only; no name/email/message in the
    // payload; a slow/throwing handler never breaks the contact flow).
    await emitEvent(CORE_EVENTS.CONTACT_SUBMITTED, {
      submissionID: saved?._id ? String(saved._id) : null,
    }).catch(() => {});

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
