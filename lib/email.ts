import { createTransport } from "nodemailer";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type SmtpSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

export function readSmtpSettings(env: NodeJS.ProcessEnv = process.env): SmtpSettings | null {
  const host = env.SMTP_HOST?.trim();
  if (!host) return null;
  const port = Number(env.SMTP_PORT || 587);
  const secure = env.SMTP_SECURE === "true" || port === 465;
  const user = env.SMTP_USER?.trim() ?? "";
  const pass = env.SMTP_PASS ?? "";
  const from = env.SMTP_FROM?.trim() || user || "xiami@localhost";
  return { host, port, secure, user, pass, from };
}

export async function deliverEmail(
  message: EmailMessage,
  env: NodeJS.ProcessEnv = process.env,
  logger: (line: string) => void = console.log,
): Promise<{ mode: "log" | "smtp" }> {
  const settings = readSmtpSettings(env);
  const banner = [
    "======== 瞎謎 email ========",
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    message.text,
    "============================",
  ].join("\n");

  if (!settings) {
    logger(`未設定 SMTP，改為寫入日誌。\n${banner}`);
    return { mode: "log" };
  }

  const transport = createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: settings.user ? { user: settings.user, pass: settings.pass } : undefined,
  });
  await transport.sendMail({
    from: settings.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  return { mode: "smtp" };
}
