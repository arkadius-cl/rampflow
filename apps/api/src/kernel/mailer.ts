import nodemailer from 'nodemailer';
import { env } from './env.ts';

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** The SMTP seam. Tests pass a failing mailer to drive retries. */
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export function smtpMailer(
  options: { host: string; port: number; from: string } = {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    from: env.MAIL_FROM,
  },
): Mailer {
  const transport = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.port === 465,
  });
  return {
    async send(mail) {
      await transport.sendMail({ from: options.from, ...mail });
    },
  };
}
