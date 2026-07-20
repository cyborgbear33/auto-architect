/** API configuration, read from the environment with safe local-first defaults. */
export interface ApiConfig {
  port: number;
  host: string;
  /**
   * "memory"   -> force in-memory adapter
   * "postgres" -> force Drizzle/Postgres adapter (requires DATABASE_URL)
   * "auto"     -> postgres when DATABASE_URL is set, otherwise memory
   */
  storageDriver: "memory" | "postgres";
  databaseUrl: string | undefined;
  seedOnStart: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const requestedDriver = (env.STORAGE_DRIVER ?? "memory").toLowerCase();
  const resolvedDriver =
    requestedDriver === "postgres"
      ? "postgres"
      : requestedDriver === "auto"
        ? env.DATABASE_URL
          ? "postgres"
          : "memory"
        : "memory";
  return {
    port: Number(env.PORT ?? 4100),
    host: env.HOST ?? "0.0.0.0",
    storageDriver: resolvedDriver,
    databaseUrl: env.DATABASE_URL,
    seedOnStart: (env.SEED_ON_START ?? "true") !== "false",
  };
}
