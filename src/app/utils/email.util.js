// src/app/api/auth/email.util.js
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    service: 'gmail', // Change this if using a different service (e.g., SendGrid, Outlook)
    auth: {
        user: process.env.EMAIL_USER, // Your email address from environment variables
        pass: process.env.EMAIL_PASS  // Your email app password from environment variables
    }
});

/**
 * ✅ Send a verification email to the user
 * @param {string} email - The user's email address
 * @param {string} token - The verification token
 */
export async function sendVerificationEmail(email, token) {
    const verificationLink = `${process.env.NEXT_PUBLIC_URL}/auth/verify-email?token=${token}`;

    const mailOptions = {
        from: `"The Lab" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Verify Your Email Address',
        html: `
            <div style="font-family: 'Roboto Mono', monospace; background-color: #000000; color: #00ff00; padding: 20px; border-radius: 8px;">
                <h2 style="color: #00ff00;">Thanks for joining the Lab Rat Army!</h2>
                <p>Please verify your email address by clicking the link below:</p>
                <a href="${verificationLink}" target="_blank" style="color: #00ff00; text-decoration: none; border: 1px solid #00ff00; padding: 10px 20px; border-radius: 8px;">Verify Email</a>
                <p>If you did not sign up, you can safely ignore this message.</p>
            </div>
        `
    };

    // SEC-24: do not log mailOptions — it contains the recipient and the
    // verification link (token), an account-takeover vector.

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Verification email sent:', info.response);
    } catch (error) {
        console.error('Error sending verification email:', error);
        throw new Error('Failed to send verification email');
    }
}

/**
 * ✅ Send a password reset email to the user
 * @param {string} email - The user's email address
 * @param {string} token - The password reset token
 */
export async function sendPasswordResetEmail(email, token) {
    const resetLink = `${process.env.APP_URL}/reset-password?token=${token}`;

    const mailOptions = {
        from: `"The Lab" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Password Reset Request',
        html: `
            <div style="font-family: 'Roboto Mono', monospace; background-color: #000000; color: #00ff00; padding: 20px; border-radius: 8px;">
                <h2 style="color: #00ff00;">Password Reset Request</h2>
                <p>Click the link below to reset your password:</p>
                <a href="${resetLink}" target="_blank" style="color: #00ff00; text-decoration: none; border: 1px solid #00ff00; padding: 10px 20px; border-radius: 8px;">Reset Password</a>
                <p>If you did not request a password reset, please ignore this message.</p>
            </div>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Password reset email sent:', info.response);
    } catch (error) {
        console.error('Error sending password reset email:', error);
        throw new Error('Failed to send password reset email');
    }
}

/**
 * ✅ Send a new bounty notification email
 * @param {string} email - The user's email address
 * @param {string} firstName - The user's first name
 * @param {Object} bounty - The bounty details
 */
export async function sendBountyNotificationEmail(email, firstName, bounty) {
    const bountyLink = `${process.env.NEXT_PUBLIC_URL}/dashboard/activities/bounties?highlight=${bounty.bountyID}`;
    const rewardText = bounty.rewardType === 'hours' 
        ? `${bounty.rewardValue} Hours` 
        : (bounty.rewardType === 'cash' ? `$${bounty.rewardValue}` : bounty.rewardValue);

    const mailOptions = {
        from: `"The Lab" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `New Bounty Available: ${bounty.title}`,
        html: `
            <div style="font-family: 'Roboto Mono', monospace; background-color: #000000; color: #00ff00; padding: 20px; border-radius: 8px;">
                <h2 style="color: #00ff00;">New Bounty Alert! 🚨</h2>
                <p>Hey ${firstName},</p>
                <p>A new bounty has just been posted at the Lab:</p>
                
                <div style="border: 1px solid #333; padding: 15px; margin: 20px 0; border-radius: 4px;">
                    <h3 style="margin-top: 0; color: #fff;">${bounty.title}</h3>
                    <p style="color: #ccc;">${bounty.description}</p>
                    <p><strong>Reward:</strong> ${rewardText}</p>
                    ${bounty.stakeValue > 0 ? `<p><strong>Stake:</strong> +${bounty.stakeValue}</p>` : ''}
                </div>

                <a href="${bountyLink}" target="_blank" style="display: inline-block; background-color: #00ff00; color: #000000; text-decoration: none; font-weight: bold; padding: 12px 24px; border-radius: 4px;">View Bounty</a>
                
                <p style="margin-top: 20px; font-size: 12px; color: #666;">
                    You are receiving this because you are an active member of The Lab.
                </p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Bounty notification sent to ${email}`);
    } catch (error) {
        console.error(`Error sending bounty notification to ${email}:`, error);
        // Don't throw here to prevent blocking the loop
    }
}

export async function sendDeclineEmail(email, firstName) {
    const mailOptions = {
        from: `"The Lab" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Your Lab Membership Application',
        html: `
            <div style="font-family: 'Roboto Mono', monospace; background-color: #000000; color: #cccccc; padding: 20px; border-radius: 8px;">
                <h2 style="color: #39ff14;">The Lab</h2>
                <p>Hi ${firstName || 'there'},</p>
                <p>Thank you for your interest in The Lab. After reviewing your application, we aren't able to move forward at this time.</p>
                <p>We appreciate your interest in the community and hope to see you at a future event.</p>
                <p style="color: #666; font-size: 12px;">— The Lab Team</p>
            </div>
        `,
    };
    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error('Error sending decline email:', error);
        throw new Error('Failed to send decline email');
    }
}

/**
 * ✅ Send email to bounty creator when their bounty is claimed
 */
export async function sendBountyClaimedEmail(email, creatorName, bounty, claimerName) {
    const bountyLink = `${process.env.NEXT_PUBLIC_URL}/dashboard/activities/bounties?highlight=${bounty.bountyID}`;
    
    const mailOptions = {
        from: `"The Lab" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `Bounty Claimed: ${bounty.title}`,
        html: `
            <div style="font-family: 'Roboto Mono', monospace; background-color: #000000; color: #00ff00; padding: 20px; border-radius: 8px;">
                <h2 style="color: #00ff00;">Bounty Claimed! 🎯</h2>
                <p>Hey ${creatorName},</p>
                <p><strong>${claimerName}</strong> has claimed your bounty:</p>
                
                <div style="border: 1px solid #333; padding: 15px; margin: 20px 0; border-radius: 4px;">
                    <h3 style="margin-top: 0; color: #fff;">${bounty.title}</h3>
                </div>

                <a href="${bountyLink}" target="_blank" style="display: inline-block; background-color: #00ff00; color: #000000; text-decoration: none; font-weight: bold; padding: 12px 24px; border-radius: 4px;">View Details</a>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Bounty claimed notification sent to ${email}`);
    } catch (error) {
        console.error(`Error sending bounty claimed notification to ${email}:`, error);
    }
}

/**
 * ✅ Send email to bounty creator when work is submitted
 */
export async function sendBountySubmittedEmail(email, creatorName, bounty, submitterName) {
    const bountyLink = `${process.env.NEXT_PUBLIC_URL}/dashboard/activities/bounties?highlight=${bounty.bountyID}`;
    
    const mailOptions = {
        from: `"The Lab" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `Work Submitted: ${bounty.title}`,
        html: `
            <div style="font-family: 'Roboto Mono', monospace; background-color: #000000; color: #00ff00; padding: 20px; border-radius: 8px;">
                <h2 style="color: #00ff00;">Work Submitted! 📝</h2>
                <p>Hey ${creatorName},</p>
                <p><strong>${submitterName}</strong> has submitted work for your bounty:</p>
                
                <div style="border: 1px solid #333; padding: 15px; margin: 20px 0; border-radius: 4px;">
                    <h3 style="margin-top: 0; color: #fff;">${bounty.title}</h3>
                    <p>Please review the submission and verify the work.</p>
                </div>

                <a href="${bountyLink}" target="_blank" style="display: inline-block; background-color: #00ff00; color: #000000; text-decoration: none; font-weight: bold; padding: 12px 24px; border-radius: 4px;">Review Submission</a>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Bounty submitted notification sent to ${email}`);
    } catch (error) {
        console.error(`Error sending bounty submitted notification to ${email}:`, error);
    }
}

/**
 * ✅ Send email to assignee when bounty is verified
 */
export async function sendBountyVerifiedEmail(email, assigneeName, bounty) {
    const bountyLink = `${process.env.NEXT_PUBLIC_URL}/dashboard/activities/bounties?highlight=${bounty.bountyID}`;
    const rewardText = bounty.rewardType === 'hours' 
        ? `${bounty.rewardValue} Hours` 
        : (bounty.rewardType === 'cash' ? `$${bounty.rewardValue}` : bounty.rewardValue);

    const mailOptions = {
        from: `"The Lab" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `Bounty Verified: ${bounty.title}`,
        html: `
            <div style="font-family: 'Roboto Mono', monospace; background-color: #000000; color: #00ff00; padding: 20px; border-radius: 8px;">
                <h2 style="color: #00ff00;">Bounty Verified! ✅</h2>
                <p>Hey ${assigneeName},</p>
                <p>Great job! Your work on <strong>${bounty.title}</strong> has been verified.</p>
                
                <div style="border: 1px solid #333; padding: 15px; margin: 20px 0; border-radius: 4px;">
                    <p><strong>Reward Received:</strong> ${rewardText}</p>
                    ${bounty.stakeValue > 0 ? `<p><strong>Stake Earned:</strong> +${bounty.stakeValue}</p>` : ''}
                </div>

                <a href="${bountyLink}" target="_blank" style="display: inline-block; background-color: #00ff00; color: #000000; text-decoration: none; font-weight: bold; padding: 12px 24px; border-radius: 4px;">View Bounty</a>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Bounty verified notification sent to ${email}`);
    } catch (error) {
        console.error(`Error sending bounty verified notification to ${email}:`, error);
    }
}

/**
 * ✅ Send Application Received Email
 */
export async function sendApplicationReceivedEmail(email, firstName) {
    const mailOptions = {
        from: `"The Lab" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Application Received! 📝',
        html: `
            <div style="font-family: 'Roboto Mono', monospace; background-color: #000000; color: #00ff00; padding: 20px; border-radius: 8px;">
                <h2 style="color: #00ff00;">Application Received</h2>
                <p>Hey ${firstName},</p>
                <p>Thanks for applying to join The Lab! We've received your application and our team will review it shortly.</p>
                <p>You'll receive another email when your status changes or if we need more information.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Application received email sent to ${email}`);
    } catch (error) {
        console.error(`Error sending application received email to ${email}:`, error);
    }
}

/**
 * ✅ Send Status Change Email
 */
export async function sendStatusChangeEmail(email, firstName, newStatus) {
    let subject = 'Membership Status Update';
    let message = `Your membership status has been updated to: <strong>${newStatus.toUpperCase()}</strong>.`;
    let actionLink = `${process.env.NEXT_PUBLIC_URL}/dashboard`;
    let actionText = 'Go to Dashboard';

    // Customize message based on status
    switch (newStatus) {
        case 'contacted':
            subject = 'Action Required: Schedule Orientation 📅';
            message = 'Your application has been reviewed! The next step is to schedule your safety orientation.';
            actionLink = `${process.env.NEXT_PUBLIC_URL}/dashboard`;
            actionText = 'Go to Dashboard';
            break;
        case 'onboarding':
            subject = 'Orientation Complete! ✅';
            message = 'Great job completing your orientation. You are almost there! Please complete your membership payment to finalize your account.';
            actionLink = `${process.env.NEXT_PUBLIC_URL}/dashboard/plans`;
            actionText = 'View Plans';
            break;
        case 'probation':
            subject = 'Welcome to The Lab! 🎉';
            message = 'Your membership is now active (Probationary Period). You can now access the space during open hours.';
            break;
        case 'active':
            subject = 'Full Access Granted! 🔑';
            message = 'Congratulations! You have been granted full 24/7 access to The Lab.';
            break;
        case 'suspended':
            subject = 'Membership Suspended ⚠️';
            message = 'Your membership has been suspended. Please contact an admin for more information.';
            break;
        case 'rejected':
            subject = 'Application Update';
            message = 'We have reviewed your application and unfortunately cannot proceed with your membership at this time.';
            break;
    }

    const mailOptions = {
        from: `"The Lab" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: subject,
        html: `
            <div style="font-family: 'Roboto Mono', monospace; background-color: #000000; color: #00ff00; padding: 20px; border-radius: 8px;">
                <h2 style="color: #00ff00;">${subject}</h2>
                <p>Hey ${firstName},</p>
                <p>${message}</p>
                
                <a href="${actionLink}" target="_blank" style="display: inline-block; background-color: #00ff00; color: #000000; text-decoration: none; font-weight: bold; padding: 12px 24px; border-radius: 4px; margin-top: 20px;">${actionText}</a>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Status change email (${newStatus}) sent to ${email}`);
    } catch (error) {
        console.error(`Error sending status change email to ${email}:`, error);
    }
}

/**
 * ✅ Send Profile Completion Reminder Email
 */
export async function sendProfileCompletionEmail(email, firstName, userID) {
    const profileLink = `${process.env.NEXT_PUBLIC_URL}/dashboard/${userID}/profile`;
    
    const mailOptions = {
        from: `"The Lab" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Complete Your Public Profile 👤',
        html: `
            <div style="font-family: 'Roboto Mono', monospace; background-color: #000000; color: #00ff00; padding: 20px; border-radius: 8px;">
                <h2 style="color: #00ff00;">Set Up Your Profile</h2>
                <p>Hey ${firstName},</p>
                <p>Now that you are a member, it's a great time to set up your public profile!</p>
                <p>This helps other members know who you are, what skills you have, and what projects you are working on.</p>
                
                <div style="border: 1px solid #333; padding: 15px; margin: 20px 0; border-radius: 4px;">
                    <p><strong>Privacy Note:</strong> You can choose to keep your profile private if you prefer. Just go to your profile settings and toggle the visibility.</p>
                </div>

                <a href="${profileLink}" target="_blank" style="display: inline-block; background-color: #00ff00; color: #000000; text-decoration: none; font-weight: bold; padding: 12px 24px; border-radius: 4px;">Edit Profile</a>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Profile completion email sent to ${email}`);
    } catch (error) {
        console.error(`Error sending profile completion email to ${email}:`, error);
    }
}

/**
 * ✅ Send Nudge Email
 */
export async function sendNudgeEmail(email, firstName, step, message, actionLink, actionText) {
    const mailOptions = {
        from: `"The Lab" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `Reminder: ${step} 🔔`,
        html: `
            <div style="font-family: 'Roboto Mono', monospace; background-color: #000000; color: #00ff00; padding: 20px; border-radius: 8px;">
                <h2 style="color: #00ff00;">Friendly Reminder!</h2>
                <p>Hey ${firstName},</p>
                <p>${message}</p>
                
                <a href="${actionLink}" target="_blank" style="display: inline-block; background-color: #00ff00; color: #000000; text-decoration: none; font-weight: bold; padding: 12px 24px; border-radius: 4px; margin-top: 20px;">${actionText}</a>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Nudge email sent to ${email} for step: ${step}`);
    } catch (error) {
        console.error(`Error sending nudge email to ${email}:`, error);
    }
}

/**
 * ✅ Send Admin Notification Email
 */
export async function sendAdminNotificationEmail(subject, message, actionLink, actionText) {
    const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
    
    const mailOptions = {
        from: `"The Lab System" <${process.env.EMAIL_USER}>`,
        to: adminEmail,
        subject: `Admin Alert: ${subject} 🛡️`,
        html: `
            <div style="font-family: 'Roboto Mono', monospace; background-color: #000000; color: #00ff00; padding: 20px; border-radius: 8px;">
                <h2 style="color: #00ff00;">Admin Action Required</h2>
                <p>${message}</p>
                
                ${actionLink ? `
                <a href="${actionLink}" target="_blank" style="display: inline-block; background-color: #00ff00; color: #000000; text-decoration: none; font-weight: bold; padding: 12px 24px; border-radius: 4px; margin-top: 20px;">${actionText || 'View Details'}</a>
                ` : ''}
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Admin notification sent to ${adminEmail}: ${subject}`);
    } catch (error) {
        console.error(`Error sending admin notification:`, error);
    }
}

/**
 * ✅ Send Volunteer Hours Approved Email
 */
export async function sendVolunteerHoursApprovedEmail(email, firstName, hours, description) {
    const mailOptions = {
        from: `"The Lab" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Volunteer Hours Approved! ✅',
        html: `
            <div style="font-family: 'Roboto Mono', monospace; background-color: #000000; color: #00ff00; padding: 20px; border-radius: 8px;">
                <h2 style="color: #00ff00;">Hours Approved</h2>
                <p>Hey ${firstName},</p>
                <p>Your volunteer log has been approved:</p>
                
                <div style="border: 1px solid #333; padding: 15px; margin: 20px 0; border-radius: 4px;">
                    <p><strong>Hours:</strong> ${hours}</p>
                    <p><strong>Description:</strong> ${description}</p>
                </div>

                <p>Thank you for contributing to The Lab community!</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Volunteer hours approved email sent to ${email}`);
    } catch (error) {
        console.error(`Error sending volunteer hours approved email to ${email}:`, error);
    }
}

/**
 * ✅ Send a contact form submission email to the admin
 * @param {string} name - The sender's name
 * @param {string} email - The sender's email
 * @param {string} message - The message content
 */
export async function sendContactEmail(name, email, message) {
    const mailOptions = {
        from: `"The Lab Contact Form" <${process.env.EMAIL_USER}>`,
        to: process.env.EMAIL_USER, // Send to the admin
        replyTo: email, // Allow replying directly to the sender
        subject: `New Contact Form Submission from ${name}`,
        html: `
            <div style="font-family: 'Roboto Mono', monospace; background-color: #000000; color: #00ff00; padding: 20px; border-radius: 8px;">
                <h2 style="color: #00ff00;">New Contact Message</h2>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <div style="border: 1px solid #333; padding: 15px; margin: 20px 0; border-radius: 4px;">
                    <p><strong>Message:</strong></p>
                    <p style="white-space: pre-wrap;">${message}</p>
                </div>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Contact form email sent from ${email}`);
    } catch (error) {
        console.error(`Error sending contact form email:`, error);
        throw new Error('Failed to send contact email');
    }
}

/**
 * ✅ Send an invite email for admin-created clients
 * @param {string} email - The invited user's email address
 * @param {string} token - The invitation token
 * @param {string} firstName - The invited user's first name
 */

