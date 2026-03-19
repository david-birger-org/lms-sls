function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function getRequiredEnv(name: string) {
  const value = readEnv(name);

  if (!value) {
    throw new Error(`${name} is missing in environment variables.`);
  }

  return value;
}

function getRequiredEnvGroup(names: string[]) {
  for (const name of names) {
    const value = readEnv(name);

    if (value) {
      return value;
    }
  }

  throw new Error(`${names.join(" or ")} is missing in environment variables.`);
}

function getOptionalCsvEnv(name: string) {
  const value = readEnv(name);

  if (!value) {
    return undefined;
  }

  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return items.length > 0 ? items : undefined;
}

export const env = {
  get clerkAuthorizedParties() {
    return getOptionalCsvEnv("CLERK_AUTHORIZED_PARTIES");
  },
  get clerkPublishableKey() {
    return getRequiredEnv("CLERK_PUBLISHABLE_KEY");
  },
  get clerkSecretKey() {
    return getRequiredEnv("CLERK_SECRET_KEY");
  },
  get clerkWebhookSecret() {
    return getRequiredEnvGroup([
      "CLERK_WEBHOOK_SECRET",
      "CLERK_WEBHOOK_SIGNING_SECRET",
    ]);
  },
  get databaseUrl() {
    return getRequiredEnv("DATABASE_URL");
  },
  get monobankToken() {
    return getRequiredEnv("MONOBANK_TOKEN");
  },
};
