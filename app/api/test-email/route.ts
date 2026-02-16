import { resend } from '@/lib/resend'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    try {
        const { to, subject, html } = await request.json()

        if (!to || !subject || !html) {
            return NextResponse.json(
                { error: 'Missing required fields: to, subject, html' },
                { status: 400 }
            )
        }

        const { data, error } = await resend.emails.send({
            from: 'onboarding@resend.dev', // Change this to your verified domain
            to,
            subject,
            html,
        })

        if (error) {
            return NextResponse.json({ error }, { status: 400 })
        }

        return NextResponse.json({ success: true, data })
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || 'Failed to send email' },
            { status: 500 }
        )
    }
}

// Simple GET endpoint for quick testing
export async function GET() {
    try {
        const { data, error } = await resend.emails.send({
            from: 'onboarding@resend.dev', // Change this to your verified domain
            to: 'delivered@resend.dev', // Resend's test email
            subject: 'Test Email from AI-YOBIKOU',
            html: '<p>This is a test email to verify Resend integration.</p>',
        })

        if (error) {
            return NextResponse.json({ error }, { status: 400 })
        }

        return NextResponse.json({ success: true, data })
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || 'Failed to send email' },
            { status: 500 }
        )
    }
}
