import { createLogosBridge } from "@auto/logos-bridge";
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createServices } from "./services/index.ts";
import { createStore } from "./store/index.ts";
import { seed } from "./store/seed.ts";

async function main(): Promise<void> {
  const config = loadConfig();
  const store = createStore(config);
  await store.init();

  if (config.seedOnStart) {
    await seed(store);
  }

  const bridge = createLogosBridge();
  const services = createServices(store, bridge);
  const app = await buildApp(services);

  await app.listen({ port: config.port, host: config.host });
  console.log(
    `🔧 auto-architect API listening on http://localhost:${config.port}  (storage: ${config.storageDriver})`,
  );

  const shutdown = async () => {
    await app.close();
    await bridge.close?.();
    await store.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Failed to start API:", err);
  process.exit(1);
});
