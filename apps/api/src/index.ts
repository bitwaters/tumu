import { loadConfig } from "./config.js";
import { createStore } from "./data.js";
import { createHttpServer } from "./http.js";
import { buildRouter } from "./routes.js";

const config = loadConfig();
const store = createStore();
const router = buildRouter(store, config);
const server = createHttpServer(router, store, config);

server.listen(config.port, config.host, () => {
  console.log(`site-management api listening on http://${config.host}:${config.port}`);
});
