import { Router, Request, Response } from 'express';
import { config } from '@/config/env';
import type { ApiResponse } from '@/types';

export const healthRouter: Router = Router();

interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  services: {
    database: 'connected' | 'disconnected' | 'unknown';
    redis: 'connected' | 'disconnected' | 'unknown';
    ai_engine: 'connected' | 'disconnected' | 'unknown';
  };
  memory: {
    used: string;
    total: string;
    percentage: string;
  };
}

healthRouter.get('/', async (_req: Request, res: Response) => {
  try {
    // Información de memoria
    const memUsed = process.memoryUsage();
    const memTotal = memUsed.heapTotal;
    const memUsedMB = (memUsed.heapUsed / 1024 / 1024).toFixed(2);
    const memTotalMB = (memTotal / 1024 / 1024).toFixed(2);
    const memPercentage = ((memUsed.heapUsed / memTotal) * 100).toFixed(2);

    const healthData: HealthCheck = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      environment: config.NODE_ENV,
      version: '1.0.0',
      services: {
        database: 'unknown', // TODO: Implementar check de PostgreSQL
        redis: 'unknown',    // TODO: Implementar check de Redis
        ai_engine: 'unknown' // TODO: Implementar check del motor IA
      },
      memory: {
        used: `${memUsedMB} MB`,
        total: `${memTotalMB} MB`,
        percentage: `${memPercentage}%`
      }
    };

    const response: ApiResponse<HealthCheck> = {
      success: true,
      message: 'EvaluaCode API is healthy',
      data: healthData,
      timestamp: new Date().toISOString()
    };

    res.status(200).json(response);
  } catch (error) {
    const errorResponse: ApiResponse = {
      success: false,
      message: 'Health check failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }
});

// Endpoint simple para load balancers
healthRouter.get('/ping', (_req: Request, res: Response) => {
  res.status(200).send('pong');
});

// Endpoint de readiness (para Kubernetes)
healthRouter.get('/ready', async (_req: Request, res: Response) => {
  try {
    // TODO: Verificar que todos los servicios críticos estén disponibles
    // - Base de datos
    // - Redis  
    // - Motor IA (opcional)
    
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});
