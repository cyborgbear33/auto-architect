/** API configuration, read from the environment with safe local-first defaults. */
export interface ApiConfig {
  port: number;
  host: string;
  /** "memory" is the only driver today — Postgres is future work (see docs/AI_HANDOFF.md). */
  storageDriver: "memory";
  seedOnStart: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    port: Number(env.PORT ?? 4100),
    host: env.HOST ?? "0.0.0.0",
    storageDriver: "memory",
    seedOnStart: (env.SEED_ON_START ?? "true") !== "false",
  };
}
