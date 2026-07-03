import { loadConfig } from "./config.js";
import { createApiRuntime } from "./runtime/apiRuntime.js";

const config = loadConfig();
const runtime = await createApiRuntime(config);

runtime.server.listen(config.port, config.host, () => {
  console.log(`site-management api listening on http://${config.host}:${config.port} (${config.runtimeMode})`);
});
