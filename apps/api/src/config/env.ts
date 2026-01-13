import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Environment configuration with defaults
export const env = {
  // Server
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '8080', 10),

  // Authentication
  SALT_ROUNDS: parseInt(process.env.SALT_ROUNDS || '10', 10),
  JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key', // Legacy - use separate secrets
  JWT_ACCESS_TOKEN_EXPIRATION: process.env.JWT_ACCESS_TOKEN_EXPIRATION || '15m',
  JWT_REFRESH_TOKEN_EXPIRATION: process.env.JWT_REFRESH_TOKEN_EXPIRATION || '7d',
  JWT_ACCESS_TOKEN_SECRET: process.env.JWT_ACCESS_TOKEN_SECRET || process.env.JWT_SECRET || 'your-access-token-secret-key',
  JWT_REFRESH_TOKEN_SECRET: process.env.JWT_REFRESH_TOKEN_SECRET || process.env.JWT_SECRET || 'your-refresh-token-secret-key',
  // Database
  // PostgreSQL variables (required to construct DATABASE_URL)
  POSTGRES_USER: process.env.POSTGRES_USER!,
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD!,
  POSTGRES_DB: process.env.POSTGRES_DB!,
  POSTGRES_HOST: process.env.POSTGRES_HOST || 'localhost',
  POSTGRES_PORT: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  
  // DATABASE_URL is constructed from POSTGRES_* variables
  DATABASE_URL: process.env.DATABASE_URL || 
    (process.env.POSTGRES_USER && process.env.POSTGRES_PASSWORD && process.env.POSTGRES_DB
      ? `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB}?schema=public`
      : ''),

  // CORS
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Redis
  // Option 1: Connection string (for cloud Redis - takes precedence)
  REDIS_URL: process.env.REDIS_URL || undefined,
  // Option 2: Individual config (for local Redis)
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
  REDIS_DB: parseInt(process.env.REDIS_DB || '0', 10),


  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
  RESEND_FROM_NAME: process.env.RESEND_FROM_NAME || 'RFP System',
  EMAIL_ENABLED: process.env.EMAIL_ENABLED !== 'false',
  RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET || undefined,

} as const;

// Validate required environment variables
if (!process.env.POSTGRES_USER) {
  throw new Error('Missing required environment variable: POSTGRES_USER');
}
if (!process.env.POSTGRES_PASSWORD) {
  throw new Error('Missing required environment variable: POSTGRES_PASSWORD');
}
if (!process.env.POSTGRES_DB) {
  throw new Error('Missing required environment variable: POSTGRES_DB');
}

export default env;
