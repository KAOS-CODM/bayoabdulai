import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import session from 'express-session';
import connectMongo from 'connect-mongo';

import apiRouter from './routes/v1/index.js';
import pagesRouter, { PUBLIC_DIR } from './routes/pages.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { configureDns } from './config/dns.js';
import { configureCloudinary } from './config/cloudinary.js';

export function createApp(config) {
  configureDns();
  configureCloudinary(config.cloudinary);

  const app = express();
  app.locals.config = config;

  // Render terminates TLS; trust exactly one proxy hop so secure cookies work.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Security headers. Existing pages rely on inline scripts/styles, so those
  // are allowed explicitly; everything else stays locked down. frameSrc covers
  // the approved video-embed providers for future project sections.
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com', 'https://images.unsplash.com'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameSrc: ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com', 'https://player.vimeo.com'],
      },
    },
  }));

  // JSON API body limit
  app.use(express.json({ limit: config.jsonBodyLimit }));

  // API rate limiting (static site assets are not throttled)
  app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } },
  }));

  // Server-side sessions backed by MongoDB (never MemoryStore in production).
  const sessionStore = connectMongo.create({
    mongoUrl: config.mongoUri,
    dbName: config.mongoDbName,
    collectionName: 'sessions',
    ttl: Math.round(config.sessionTtlMs / 1000),
  });
  app.locals.sessionStore = sessionStore;

  app.use(session({
    name: 'bayo.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: config.sessionTtlMs,
      path: '/',
    },
  }));

  // API — Phase 2+ mounts additional routers here
  app.use('/api/v1', apiRouter);

  // The existing static website — unchanged files, unchanged .html URLs.
  app.use(express.static(PUBLIC_DIR, {
    index: 'index.html',
    etag: true,
    maxAge: config.isProduction ? '1h' : 0,
  }));

  // Clean URLs for existing pages (/work, /about, /contact, /resume)
  app.use(pagesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
