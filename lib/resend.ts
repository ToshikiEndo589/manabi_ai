import { Resend } from 'resend'

// Note: RESEND_API_KEY is optional if using Gmail SMTP for auth emails
// This will only error at runtime if someone tries to send an email without the key
export const resend = new Resend(process.env.RESEND_API_KEY || 'placeholder')
