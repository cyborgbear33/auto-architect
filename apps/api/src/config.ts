/** API configuration, read from the environment with safe local-first defaults. */
export const DEFAULT_CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"] as const;

export interface ApiConfig {
  port: number;
  host: string;
  /** Empty means no browser origin is reflected. */
  corsOrigins: string[];
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
  const corsRaw = env.CORS_ORIGINS?.trim();
  const corsOrigins = corsRaw
    ? corsRaw
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    : [...DEFAULT_CORS_ORIGINS];
  return {
    port: Number(env.PORT ?? 4100),
    host: env.HOST ?? "127.0.0.1",
    corsOrigins,
    storageDriver: resolvedDriver,
    databaseUrl: env.DATABASE_URL,
    seedOnStart: (env.SEED_ON_START ?? "true") !== "false",
  };
}
