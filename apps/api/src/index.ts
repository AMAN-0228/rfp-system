// Import environment variables first (loads dotenv)
import { env } from './config/env';

// Rest of your application imports
import app from './app';
import { getRedisClient, closeRedisConnection } from './config/redis';
import prisma from './config/database';

// Initialize Redis connection
getRedisClient();

// Test database connection and start server
const startServer = async () => {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connected successfully');
    
    // Start server
    const server = app.listen(env.PORT, () => {
      console.log(`🚀 Server running on port ${env.PORT} and environment ${env.NODE_ENV}`);
    });
    
    return server;
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

const server = await startServer();

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('\n⚠️  Shutting down gracefully...');
  
  server.close(async () => {
    console.log('✅ HTTP server closed');
    
    // Close Redis connection
    await closeRedisConnection();
    
    // Close Prisma connection
    await prisma.$disconnect();
    console.log('✅ Database connections closed');
    
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
