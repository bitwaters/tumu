import type { ApiConfig } from "../config.js";
import { createStore } from "../data.js";
import { createHttpServer } from "../http.js";
import { buildRouter } from "../routes.js";

export function createLegacyMemoryRuntime(config: ApiConfig) {
  const store = createStore();
  const router = buildRouter(store, config);
  const server = createHttpServer(router, config);

  return {
    router,
    server,
    store,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}
