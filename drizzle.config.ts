import { defineConfig } from "drizzle-kit";

try { process.loadEnvFile(); } catch {} // .env is optional

export default defineConfig({ schema: "./db/schema.ts", dialect: "postgresql", dbCredentials: { url: process.env.DATABASE_URL! } });
