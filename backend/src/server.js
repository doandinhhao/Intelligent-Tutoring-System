import { env } from "./configs/env.js";
import { initDb } from "./database/db.js";
import app from "./app.js";

const startServer = async () => {
  await initDb();
  app.listen(env.port, () => {
    process.stdout.write(`Backend started on http://localhost:${env.port}\n`);
  });
};

startServer().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

