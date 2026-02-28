process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:uHLwUsyuJllkuXNIkxCtuAhWSTvkKWhz@postgres.railway.internal:5432/railway";

import app from "./app";
import { prisma } from "./identifyService";

const PORT = process.env.PORT || 3000;

async function main() {
  try {
    // Test DB connection
    await prisma.$connect();
    console.log("✅ Database connected");

    app.listen(PORT, () => {
      console.log(`🚀 Bitespeed Identity Service running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

main();
