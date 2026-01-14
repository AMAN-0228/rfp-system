import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import cookieParser from 'cookie-parser';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './routes/authRoutes'
import noAuthUserRoutes from './routes/no-authUser'
import { authenticate } from './middleware/auth';
import { refreshToken } from './controllers/userAuth';
import { asyncHandler } from './middleware/asyncHandler';
import supplierRoutes from './routes/supplierRoutes';

const app = express();

app.use(helmet());
app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/no-auth/user', noAuthUserRoutes);
app.post('/api/auth/refresh', asyncHandler(refreshToken));

app.use(authenticate);

app.use('/api/auth', authRoutes);
app.use('/api/supplier', supplierRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
