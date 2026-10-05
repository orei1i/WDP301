import { createTransport, type SendMailOptions, type Transporter } from 'nodemailer';
import { env } from '../config/env';

/**
 * Gửi email qua SMTP (Gmail: smtp.gmail.com:465 + Mật khẩu ứng dụng). Chưa cấu hình SMTP thì KHÔNG báo lỗi
 * hệ thống — hành động chính (ký hợp đồng...) vẫn thành công, chỉ là email không được gửi.
 */
let transport: Transporter | null | undefined;

export const mailConfigured = () => !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);

function getTransport() {
  if (transport !== undefined) return transport;
  transport = mailConfigured()
    ? createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }, connectionTimeout: 8_000, socketTimeout: 12_000 })
    : null;
  return transport;
}

export const mailFrom = () => env.MAIL_FROM ?? `KhoAn <${env.SMTP_USER}>`;

export type MailResult = { sent: true } | { sent: false; reason: 'NOT_CONFIGURED' | 'FAILED'; detail?: string };

export async function sendMail(message: SendMailOptions): Promise<MailResult> {
  const t = getTransport();
  if (!t) return { sent: false, reason: 'NOT_CONFIGURED' };
  try {
    await t.sendMail({ from: mailFrom(), ...message });
    return { sent: true };
  } catch (e) {
    console.error('[mail]', e instanceof Error ? e.message : e);
    return { sent: false, reason: 'FAILED', detail: e instanceof Error ? e.message : String(e) };
  }
}
