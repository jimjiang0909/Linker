import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { startAllCronJobs } from './cron/index.js';
import { initWebSocket } from './websocket/index.js';
import { setupSwagger } from './lib/swagger.js';

// ========== Environment Variable Validation ==========

const REQUIRED_ENV_VARS = ['JWT_SECRET', 'DATABASE_URL'];
const RECOMMENDED_ENV_VARS = ['CF_AIG_TOKEN'];

function validateEnvironment() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
    console.error('Please check your .env file or environment configuration.');
    process.exit(1);
  }

  const missingRecommended = RECOMMENDED_ENV_VARS.filter((key) => !process.env[key]);
  if (missingRecommended.length > 0) {
    console.warn(`[WARN] Missing recommended environment variables: ${missingRecommended.join(', ')}`);
    console.warn('Some features may not work correctly.');
  }
}

if (process.env.NODE_ENV !== 'test') {
  validateEnvironment();
}

// ========== App Setup ==========

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

// ========== Security Middleware ==========

// Helmet: set security HTTP headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin access to uploads
  })
);

// CORS configuration
app.use(
  cors({
    origin: process.env.WS_CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Global rate limit: 500 requests per minute per IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many requests. Please try again later.',
    details: {},
  },
});
app.use(globalLimiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 200, // 200 requests per 10 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many authentication attempts. Please try again later.',
    details: {},
  },
});

// ========== Base Middleware ==========

// Request logging (enabled in non-test environments)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Request body parsing with explicit size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Static file serving for uploaded photos
app.use('/uploads', express.static(path.resolve(UPLOAD_DIR)));

// ========== Routes ==========

// Health check endpoint (exempt from rate limiting)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Documentation (Swagger UI)
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_API_DOCS === 'true') {
  setupSwagger(app);
}

// Apply stricter rate limit to auth routes
app.use('/api/auth', authLimiter);

// API routes
app.use('/api', routes);

// ========== Error Handling ==========

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// ========== Start Server ==========

if (process.env.NODE_ENV !== 'test') {
  // Initialize WebSocket server
  initWebSocket(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`Linker API server running on port ${PORT}`);

    // Start all cron jobs
    startAllCronJobs();
  });
}

export { httpServer };
export default app;
