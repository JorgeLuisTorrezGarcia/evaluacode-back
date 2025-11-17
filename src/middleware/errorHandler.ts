import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { config } from '@/config/env';
import type { ApiResponse } from '@/types';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export class CustomError extends Error implements AppError {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    
    // Mantener stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  error: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Internal Server Error';

  // Manejo específico de errores conocidos
  if (error instanceof z.ZodError) {
    statusCode = 400;
    message = 'Validation Error';
    const response: ApiResponse = {
      success: false,
      message,
      error: `Validation failed: ${error.issues.map(issue => 
        `${issue.path.join('.')}: ${issue.message}`
      ).join(', ')}`,
      timestamp: new Date().toISOString()
    };
    res.status(statusCode).json(response);
    return;
  }

  // Error de Prisma
  if (error.name === 'PrismaClientKnownRequestError') {
    statusCode = 400;
    message = 'Database operation failed';
  }

  // Error de JWT
  if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // Log del error (no mostrar stack en producción)
  if (config.NODE_ENV === 'development') {
    console.error('❌ Error:', {
      message: error.message,
      stack: error.stack,
      statusCode,
      url: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString()
    });
  } else {
    console.error('❌ Error:', {
      message: error.message,
      statusCode,
      url: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString()
    });
  }

  const response: ApiResponse = {
    success: false,
    message,
    ...(config.NODE_ENV === 'development' && { stack: error.stack }),
    timestamp: new Date().toISOString()
  };

  res.status(statusCode).json(response);
};
