import { Request, Response, NextFunction } from 'express';
import { authService } from '@/modules/auth/authService';
import { CustomError } from '@/middleware/errorHandler';
import { UserRole } from '@/types';
import type { AuthenticatedUser, ApiResponse } from '@/types';

// Extender Request para incluir user autenticado
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Middleware para verificar JWT access token
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authService.extractTokenFromHeader(authHeader);

    if (!token) {
      throw new CustomError('Access token required', 401);
    }

    const decoded = authService.verifyAccessToken(token);
    
    // Agregar información del usuario al request
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      iat: decoded.iat,
      exp: decoded.exp
    };

    next();
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      message: error instanceof Error ? error.message : 'Authentication failed',
      timestamp: new Date().toISOString()
    };

    if (error instanceof Error && error.message === 'Token expired') {
      res.status(401).json({ ...response, error: 'TOKEN_EXPIRED' });
    } else if (error instanceof Error && error.message === 'Invalid token') {
      res.status(401).json({ ...response, error: 'INVALID_TOKEN' });
    } else {
      res.status(401).json({ ...response, error: 'AUTHENTICATION_FAILED' });
    }
  }
};

/**
 * Middleware para verificar roles específicos
 */
export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        message: 'Authentication required',
        error: 'NO_USER_CONTEXT',
        timestamp: new Date().toISOString()
      };
      res.status(401).json(response);
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      const response: ApiResponse = {
        success: false,
        message: 'Insufficient permissions',
        error: 'INSUFFICIENT_PERMISSIONS',
        timestamp: new Date().toISOString()
      };
      res.status(403).json(response);
      return;
    }

    next();
  };
};

/**
 * Middleware para verificar que el usuario es admin
 */
export const requireAdmin = requireRole(UserRole.ADMIN);

/**
 * Middleware para verificar que el usuario es docente o admin
 */
export const requireDocente = requireRole(UserRole.ADMIN, UserRole.DOCENTE);

/**
 * Middleware para verificar que el usuario es estudiante, docente o admin
 */
export const requireAuth = requireRole(UserRole.ADMIN, UserRole.DOCENTE, UserRole.ESTUDIANTE);

/**
 * Middleware para autenticación opcional (no falla si no hay token)
 */
export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authService.extractTokenFromHeader(authHeader);

    if (token) {
      const decoded = authService.verifyAccessToken(token);
      req.user = {
        id: decoded.sub,
        email: decoded.email,
        role: decoded.role,
        iat: decoded.iat,
        exp: decoded.exp
      };
    }

    next();
  } catch (error) {
    // En autenticación opcional, continuamos sin usuario si hay error
    next();
  }
};

/**
 * Middleware para verificar ownership de recursos
 */
export const requireOwnership = (userIdField: string = 'userId') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        message: 'Authentication required',
        error: 'NO_USER_CONTEXT',
        timestamp: new Date().toISOString()
      };
      res.status(401).json(response);
      return;
    }

    // Admin puede acceder a todo
    if (req.user.role === UserRole.ADMIN) {
      next();
      return;
    }

    // Obtener ID del recurso desde params, body o query
    const resourceUserId = req.params[userIdField] || 
                          req.body[userIdField] || 
                          req.query[userIdField];

    if (!resourceUserId || resourceUserId !== req.user.id) {
      const response: ApiResponse = {
        success: false,
        message: 'Access denied to this resource',
        error: 'RESOURCE_ACCESS_DENIED',
        timestamp: new Date().toISOString()
      };
      res.status(403).json(response);
      return;
    }

    next();
  };
};

/**
 * Middleware de rate limiting por usuario autenticado
 */
export const rateLimitByUser = (maxRequests: number = 60, windowMs: number = 60000) => {
  const userRequestCounts = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next();
      return;
    }

    const userId = req.user.id;
    const now = Date.now();
    const userRecord = userRequestCounts.get(userId);

    if (!userRecord || now > userRecord.resetTime) {
      // Crear nuevo registro o resetear si expiró
      userRequestCounts.set(userId, {
        count: 1,
        resetTime: now + windowMs
      });
      next();
      return;
    }

    if (userRecord.count >= maxRequests) {
      const response: ApiResponse = {
        success: false,
        message: 'Rate limit exceeded',
        error: 'RATE_LIMIT_EXCEEDED',
        timestamp: new Date().toISOString()
      };
      res.status(429).json(response);
      return;
    }

    userRecord.count++;
    next();
  };
};
