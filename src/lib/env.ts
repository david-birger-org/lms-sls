function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function readOptionalEnv(name: string) {
  return readEnv(name);
}

function getRequiredEnv(name: string) {
  const value = readEnv(name);

  if (!value) {
    throw new Error(`${name} is missing in environment variables.`);
  }

  return value;
}

export const env = {
  get databaseUrl() {
    return getRequiredEnv("DATABASE_URL");
  },
  get internalApiKey() {
    return getRequiredEnv("INTERNAL_API_KEY");
  },
  get monobankToken() {
    return getRequiredEnv("MONOBANK_TOKEN");
  },
  get mail() {
    const gmailUser = readOptionalEnv("GMAIL_USER");
    const gmailPassword =
      readOptionalEnv("GMAIL_PASSWORD") ??
      readOptionalEnv("GMAIL_APP_PASSWORD");
    const fromAddress = readOptionalEnv("SMTP_FROM") ?? gmailUser;

    return {
      destinationEmail: readOptionalEnv("MAIL_SEND_TO"),
      fromAddress,
      gmailPassword,
      gmailUser,
    };
  },
};
