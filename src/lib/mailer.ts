import nodemailer from "nodemailer";

import { env } from "./env.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_DESTINATION_EMAIL = "kohut9ra@gmail.com";

let transporter: nodemailer.Transporter | null = null;

function getMailerConfig() {
  const { fromAddress, gmailPassword, gmailUser } = env.mail;

  if (!gmailUser || !gmailPassword || !fromAddress) return null;

  return { gmailUser, gmailPassword, fromAddress };
}

function getTransporter(
  config: NonNullable<ReturnType<typeof getMailerConfig>>,
) {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: config.gmailUser, pass: config.gmailPassword },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return transporter;
}

export function getDestinationEmail() {
  const destination = env.mail.destinationEmail;

  if (destination) return destination;
  if (process.env.NODE_ENV === "production") return null;
  return DEFAULT_DESTINATION_EMAIL;
}

export async function sendTransactionalMail({
  subject,
  text,
  replyTo,
}: {
  subject: string;
  text: string;
  replyTo?: string;
}) {
  const config = getMailerConfig();
  if (!config) return { ok: false as const, reason: "missing_config" as const };

  const destinationEmail = getDestinationEmail();
  if (!destinationEmail)
    return { ok: false as const, reason: "missing_destination" as const };

  try {
    const mailer = getTransporter(config);
    await mailer.sendMail({
      from: config.fromAddress,
      to: destinationEmail,
      subject,
      text,
      replyTo: replyTo && EMAIL_PATTERN.test(replyTo) ? replyTo : undefined,
    });

    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, reason: "send_failed" as const, error };
  }
}
