/* eslint-env node */
/* global console, process */
import express from 'express';
import cors from 'cors';
import type { CorsOptions } from 'cors';
import helmet from 'helmet';
import { config } from '@/config/env';
import { errorHandler } from '@/middleware/errorHandler';
import { requestLogger } from '@/middleware/requestLogger';
import { healthRouter } from '@/routes/health';
import { authRouter } from '@/routes/auth';
import { coursesRouter } from '@/routes/courses';
import { adminRouter } from '@/routes/admin';
import { examsRouter } from '@/routes/exams';
import { uploadRouter } from '@/routes/upload';
import { rubricRouter } from '@/routes/rubrics';
import { examQuestionsRouter, questionsRouter } from '@/routes/questions';

type EvaluaCodeApp = ReturnType<typeof express>;

export async function createApp(): Promise<EvaluaCodeApp> {
  const app = express();

  // Security middleware
  app.use(helmet());
  
  // CORS configuration
  const rawOrigins = config.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);
  const allowAllOrigins = rawOrigins.length === 0 || rawOrigins.includes('*');

  const corsOptions: CorsOptions = allowAllOrigins
    ? {
        origin: (_origin, callback) => callback(null, true),
        credentials: true
      }
    : {
        origin: rawOrigins,
        credentials: true
      };

  app.use(cors({
    ...corsOptions,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  }));

  // Body parsing
  app.use(express.json({ limit: `${config.MAX_FILE_SIZE}b` }));
  app.use(express.urlencoded({ extended: true, limit: `${config.MAX_FILE_SIZE}b` }));

  // Request logging
  app.use(requestLogger);

  // Routes
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/courses', coursesRouter);
  app.use('/api/exams', examsRouter);
  app.use('/api/questions', questionsRouter);
  app.use('/api/exams/:examId/questions', examQuestionsRouter);
  app.use('/api/upload', uploadRouter);
  app.use('/api/rubrics', rubricRouter);
  
  // Default route
  app.get('/', (_req, res) => {
    res.json({
      success: true,
      message: 'EvaluaCode API is running',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      environment: config.NODE_ENV
    });
  });

  // 404 handler (Express 5 no admite '*', usamos middleware sin ruta)
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: `Route ${req.originalUrl} not found`,
      timestamp: new Date().toISOString()
    });
  });

  // Error handling middleware (debe ir al final)
  app.use(errorHandler);

  return app;
}

export const appPromise: Promise<EvaluaCodeApp> = createApp();

async function startServer() {
  try {
    const app = await appPromise;

    app.listen(config.PORT, () => {
      console.log(`
🚀 EvaluaCode Server Started Successfully!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 URL: ${config.API_URL}
📊 Environment: ${config.NODE_ENV}
🔧 Port: ${config.PORT}
⏰ Started at: ${new Date().toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

if (!process.env.VERCEL) {
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n⏹️  Gracefully shutting down...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('⏹️  SIGTERM received. Shutting down gracefully...');
    process.exit(0);
  });

  startServer();
}
