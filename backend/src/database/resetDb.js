import { initDb, withTransaction } from "./db.js";
import { seedCoreData } from "./seedData.js";

const run = async () => {
  await initDb();
  await withTransaction(async (client) => {
    await seedCoreData(client);
  });
  process.stdout.write("Database reset completed\n");
};

run().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

