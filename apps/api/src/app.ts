import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import type { Services } from "./services/index.ts";
import { registerRoutes } from "./routes/index.ts";
import { AppError } from "./lib/errors.ts";

export async function buildApp(services: Services): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });

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
    return reply.code(statusCode).send({
      error: { code: "INTERNAL_ERROR", message: e.message || "Unexpected error." },
    });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ error: { code: "ROUTE_NOT_FOUND", message: `No route for ${req.method} ${req.url}` } });
  });

  await registerRoutes(app, services);
  return app;
}
