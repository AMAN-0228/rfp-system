import dotenv from "dotenv";
dotenv.config();

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  WORKER_PORT: parseInt(process.env.WORKER_PORT || "8081", 10),
  LOG_LEVEL: process.env.LOG_LEVEL || "info",

  DATABASE_URL: process.env.DATABASE_URL || "",

  REDIS_URL: process.env.REDIS_URL || undefined,
  REDIS_HOST: process.env.REDIS_HOST || "localhost",
  REDIS_PORT: parseInt(process.env.REDIS_PORT || "6379", 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
  REDIS_DB: parseInt(process.env.REDIS_DB || "0", 10),

  EMAIL_OUTBOUND_QUEUE: process.env.EMAIL_OUTBOUND_QUEUE || "email-outbound",
  EMAIL_INBOUND_QUEUE: process.env.EMAIL_INBOUND_QUEUE || "email-inbound",

  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  MAILGUN_API_KEY: process.env.MAILGUN_API_KEY || "",
} as const;
