import { Request, Response, NextFunction } from 'express';
import { config } from '@/config/env';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();

  // Log request details
  if (config.LOG_LEVEL === 'debug' || config.NODE_ENV === 'development') {
    console.log(`📥 ${req.method} ${req.originalUrl}`, {
      timestamp: new Date().toISOString(),
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      contentType: req.get('Content-Type'),
      body: req.method !== 'GET' ? req.body : undefined
    });
  }

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(body: any) {
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    if (config.LOG_LEVEL === 'debug' || config.NODE_ENV === 'development') {
      console.log(`📤 ${req.method} ${req.originalUrl} - ${res.statusCode}`, {
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`,
        statusCode: res.statusCode
      });
    }

    return originalJson.call(this, body);
  };

  next();
};
