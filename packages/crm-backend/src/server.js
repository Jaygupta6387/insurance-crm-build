require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');

const { port, frontendUrl, isDev } = require('./config/env');
const logger = require('./config/logger');
const swaggerSpec = require('./config/swagger');
const { generalLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes/index');
const { getSuperAdminClient } = require('./prisma/superAdminClient');
const { disconnectSuperAdmin } = require('./prisma/superAdminClient');
const { disconnectAllCompanyClients, isDesktopMode } = require('./modules/dynamic-db/dbResolver');

const app = express();

// ─── Security Headers ─────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: isDev ? false : undefined,
    crossOriginEmbedderPolicy: false,
  })
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: frontendUrl,
    credentials: true, // Required for httpOnly cookie (refresh token)
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// ─── General Rate Limit ───────────────────────────────────────────────────────
app.use(generalLimiter);

// ─── Request Logging (dev) ────────────────────────────────────────────────────
if (isDev) {
  app.use((req, _res, next) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });
}

// ─── Trust Proxy (needed for correct IP behind load balancer/nginx) ───────────
app.set('trust proxy', 1);

// ─── Swagger Docs ─────────────────────────────────────────────────────────────
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'CRM API Docs',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: { persistAuthorization: true },
  })
);

// Raw OpenAPI spec endpoint
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api', routes);

// ─── Desktop SPA (bundled frontend) ───────────────────────────────────────────
if (isDesktopMode() && process.env.DESKTOP_FRONTEND_DIST) {
  const dist = process.env.DESKTOP_FRONTEND_DIST;
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
}

// ─── Centralised Error Handler ────────────────────────────────────────────────
app.use(errorHandler);

// ─── Database Connection ──────────────────────────────────────────────────────
const connectDb = async () => {
  if (isDesktopMode()) {
    logger.info('✅  Desktop mode — using local PostgreSQL');
    return;
  }
  const client = getSuperAdminClient();
  await client.$connect();
  logger.info('✅  Connected to Super Admin database');
};

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
const shutdown = async (signal) => {
  logger.info(`${signal} received — shutting down gracefully...`);
  await disconnectAllCompanyClients();
  if (!isDesktopMode()) await disconnectSuperAdmin();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─── Start Server ─────────────────────────────────────────────────────────────
const start = async () => {
  try {
    await connectDb();
    const host = isDesktopMode() ? '127.0.0.1' : undefined;
    const server = app.listen(port, host, () => {
      logger.info(`🚀  CRM Server running on port ${port}`);
      logger.info(`📚  Swagger docs: http://localhost:${port}/api-docs`);
      logger.info(`🌐  API base: http://localhost:${port}/api`);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${port} is already in use — stop the other process or change PORT in .env`);
      } else {
        logger.error(`Server error: ${err.message}`);
      }
      process.exit(1);
    });
  } catch (err) {
    logger.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
};

start();
