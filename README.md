# RFP System

A Request For Proposal (RFP) management system built with JavaScript/TypeScript in a pnpm monorepo.

## Features

- Basic Authentication
- User-side RFP creation
- Supplier registration and management
- Email RFP to suppliers
- Fetch email responses from suppliers
- AI-powered email analysis and data extraction

## Tech Stack

- **Monorepo**: pnpm workspaces
- **Primary Database**: PostgreSQL
- **Secondary Database**: Redis (rate limiting, OTP, spam blocking)
- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React + Vite

## Project Structure

```
rfp-system/
├── apps/
│   ├── api/          # Backend API (Express + TypeScript)
│   └── web/          # Frontend application (React + Vite)
└── packages/         # Shared packages
```

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- PostgreSQL
- Redis (for rate limiting, OTP verification, spam blocking)

### Installation

1. Install pnpm globally (if not already installed):
```bash
npm install -g pnpm
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Set up databases:
```bash
# Make sure PostgreSQL is running
# Update DATABASE_URL in .env with your PostgreSQL connection string

# Make sure Redis is running
# See apps/api/REDIS.md for Redis setup instructions
```

5. Run Prisma migrations:
```bash
cd apps/api
pnpm prisma migrate dev
pnpm prisma generate
```

### Development

#### Run all services locally:
```bash
# Start API
pnpm --filter @apps/api dev

# Start Web (in another terminal)
pnpm --filter @apps/web dev
```

#### Run specific package:
```bash
pnpm --filter @apps/api dev
pnpm --filter @apps/web dev
```

### Production

1. Build the API:
```bash
cd apps/api
pnpm build
```

2. Start the API:
```bash
cd apps/api
pnpm start
```

### Building

Build all packages:
```bash
pnpm build
```

Build specific package:
```bash
pnpm --filter @apps/api build
pnpm --filter @apps/web build
```

## Environment Variables

See `apps/api/.env.example` for all required environment variables:

**Server:**
- `PORT` - API server port (default: 8080)
- `NODE_ENV` - Environment (development/production)
- `FRONTEND_URL` - Frontend URL for CORS

**PostgreSQL:**
- `DATABASE_URL` - PostgreSQL connection string
- `POSTGRES_USER` - PostgreSQL username
- `POSTGRES_PASSWORD` - PostgreSQL password
- `POSTGRES_DB` - PostgreSQL database name

**Redis:**
- `REDIS_HOST` - Redis host (default: localhost)
- `REDIS_PORT` - Redis port (default: 6379)
- `REDIS_PASSWORD` - Redis password (optional)
- `REDIS_DB` - Redis database number (default: 0)

## API Endpoints

- `GET /api/health` - Health check endpoint
- More endpoints to be added...

## Database Management

### PostgreSQL
```bash
# Generate Prisma Client
cd apps/api
pnpm prisma generate

# Create migration
pnpm prisma migrate dev

# Open Prisma Studio (database GUI)
pnpm prisma studio
```

### Redis
See `apps/api/REDIS.md` for detailed Redis setup and usage guide.

Redis is used for:
- Rate limiting (100 requests per 15 minutes per IP)
- OTP verification (10-minute expiry)
- Spam blocking (auto-block after threshold)

## License

ISC
