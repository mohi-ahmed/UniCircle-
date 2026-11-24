import nodemailer, { type Transporter } from 'nodemailer';
import { getEnvironment } from '../config/env.js';

let transporter: Transporter | undefined;

function getTransporter(): Transporter | undefined {
  const env = getEnvironment();
  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASS || !env.EMAIL_FROM) return undefined;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return transporter;
}

export async function sendAccountEmail(kind: 'verification' | 'password_reset', recipient: string, token: string): Promise<boolean> {
  const transport = getTransporter();
  const env = getEnvironment();
  if (!transport || !env.EMAIL_FROM) return false;
  const route = kind === 'verification' ? '/verify-email' : '/reset-password';
  const subject = kind === 'verification' ? 'Verify your UniCircle email' : 'Reset your UniCircle password';
  const url = new URL(route, env.APP_BASE_URL);
  url.searchParams.set('token', token);
  try {
    await transport.sendMail({
      from: env.EMAIL_FROM,
      to: recipient,
      subject,
      text: `${subject}: ${url.toString()}\n\nIf you did not request this, ignore this email.`,
    });
    return true;
  } catch {
    return false;
  }
}
