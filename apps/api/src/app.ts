import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { DEFAULT_CORS_ORIGINS } from "./config.ts";
import { AppError } from "./lib/errors.ts";
import { registerRoutes } from "./routes/index.ts";
import type { Services } from "./services/index.ts";

export async function buildApp(
  services: Services,
  opts?: { corsOrigins?: readonly string[] },
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const corsOrigins = opts?.corsOrigins ?? DEFAULT_CORS_ORIGINS;

  await app.register(cors, { origin: [...corsOrigins] });

  // Structured errors only — never "Something went wrong".
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: err.toApiError() });
    }
    if (err instanceof ZodError) {
      return reply.code(422).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid request body.", details: err.issues },
      });
    }
    const e = err as { statusCode?: number; message?: string };
    const statusCode = e.statusCode ?? 500;
    if (statusCode >= 500 && e.message) console.error("API request failed:", e.message);
    return reply.code(statusCode).send({
      error: {
        code: "INTERNAL_ERROR",
        message: statusCode >= 500 ? "Unexpected error." : e.message || "Unexpected error.",
      },
    });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({
      error: { code: "ROUTE_NOT_FOUND", message: `No route for ${req.method} ${req.url}` },
    });
  });

  await registerRoutes(app, services);
  return app;
}
