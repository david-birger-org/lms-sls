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

export const env = {
  get betterAuthApiKey() {
    return readEnv("BETTER_AUTH_API_KEY");
  },
  get betterAuthApiUrl() {
    return readEnv("BETTER_AUTH_API_URL");
  },
  get betterAuthCookieDomain() {
    return readEnv("BETTER_AUTH_COOKIE_DOMAIN");
  },
  get betterAuthKvUrl() {
    return readEnv("BETTER_AUTH_KV_URL");
  },
  get betterAuthSecret() {
    return getRequiredEnv("BETTER_AUTH_SECRET");
  },
  get betterAuthTrustedOrigins() {
    return readEnv("BETTER_AUTH_TRUSTED_ORIGINS");
  },
  get betterAuthUrl() {
    return getRequiredEnv("BETTER_AUTH_URL");
  },
  get databaseUrl() {
    return getRequiredEnv("DATABASE_URL");
  },
  get internalApiKey() {
    return getRequiredEnv("INTERNAL_API_KEY");
  },
  get monobankToken() {
    return getRequiredEnv("MONOBANK_TOKEN");
  },
};
