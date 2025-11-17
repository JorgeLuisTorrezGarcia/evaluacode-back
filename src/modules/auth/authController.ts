import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { authService } from '@/modules/auth/authService';
import { CustomError } from '@/middleware/errorHandler';
import { 
  loginSchema, 
  registerSchema, 
  refreshTokenSchema,
  changePasswordSchema,
  resetPasswordSchema,
  confirmResetPasswordSchema
} from '@/modules/auth/authSchemas';
import type { 
  LoginRequest, 
  RegisterRequest, 
  RefreshTokenRequest,
  ChangePasswordRequest,
  ResetPasswordRequest,
  ConfirmResetPasswordRequest
} from '@/modules/auth/authSchemas';
import type { ApiResponse, AuthenticatedUser, UserRole } from '@/types';

const prisma = new PrismaClient();

export class AuthController {
  /**
   * POST /api/auth/register
   * Registrar nuevo usuario
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validar datos de entrada
      const validatedData = registerSchema.parse(req.body) as RegisterRequest;

      // Verificar si el email ya existe
      const existingUser = await prisma.user.findUnique({
        where: { email: validatedData.email }
      });

      if (existingUser) {
        throw new CustomError('Email already registered', 400);
      }

      // Hash de la contraseña
      const { hash, salt } = await authService.hashPassword(validatedData.password);

      // Obtener rol ID
      const role = await prisma.role.findUnique({
        where: { name: validatedData.role }
      });

      if (!role) {
        throw new CustomError('Invalid role', 400);
      }

      // Crear usuario
      const user = await prisma.user.create({
        data: {
          email: validatedData.email,
          passwordHash: hash,
          salt,
          roleId: role.id,
          isVerified: false // En producción, requerir verificación por email
        },
        include: {
          role: true
        }
      });

      // Generar tokens
      const authenticatedUser: AuthenticatedUser = {
        id: user.id,
        email: user.email,
        role: user.role.name as UserRole
      };

      const tokens = authService.generateTokenPair(authenticatedUser);

      // TODO: Guardar refresh token en base de datos con expiración

      const response: ApiResponse = {
        success: true,
        message: 'User registered successfully',
        data: {
          user: {
            id: user.id,
            email: user.email,
            role: user.role.name,
            isVerified: user.isVerified,
            createdAt: user.createdAt
          },
          tokens: {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresIn: tokens.expiresIn,
            tokenType: 'Bearer'
          }
        },
        timestamp: new Date().toISOString()
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/login
   * Iniciar sesión
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validar datos de entrada
      const validatedData = loginSchema.parse(req.body) as LoginRequest;

      // Buscar usuario por email
      const user = await prisma.user.findUnique({
        where: { email: validatedData.email },
        include: { role: true }
      });

      if (!user) {
        throw new CustomError('Invalid credentials', 401);
      }

      // Verificar si la cuenta está bloqueada
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const unlockTime = user.lockedUntil.toISOString();
        throw new CustomError(`Account locked until ${unlockTime}`, 423);
      }

      // Verificar contraseña
      const isValidPassword = await authService.verifyPassword(
        validatedData.password, 
        user.passwordHash
      );

      if (!isValidPassword) {
        // Incrementar intentos fallidos
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: { increment: 1 },
            // Bloquear cuenta después de 5 intentos fallidos por 15 minutos
            ...(user.failedLoginAttempts >= 4 && {
              lockedUntil: new Date(Date.now() + 15 * 60 * 1000)
            })
          }
        });

        throw new CustomError('Invalid credentials', 401);
      }

      // Reset intentos fallidos en login exitoso
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLogin: new Date()
        }
      });

      // Generar tokens
      const authenticatedUser: AuthenticatedUser = {
        id: user.id,
        email: user.email,
        role: user.role.name as UserRole
      };

      const tokens = authService.generateTokenPair(authenticatedUser);

      // TODO: Guardar refresh token en base de datos

      const response: ApiResponse = {
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user.id,
            email: user.email,
            role: user.role.name,
            isVerified: user.isVerified,
            lastLogin: user.lastLogin
          },
          tokens: {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresIn: tokens.expiresIn,
            tokenType: 'Bearer'
          }
        },
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/refresh
   * Renovar access token usando refresh token
   */
  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedData = refreshTokenSchema.parse(req.body) as RefreshTokenRequest;

      // Verificar refresh token
      const decoded = authService.verifyRefreshToken(validatedData.refreshToken);

      // TODO: Verificar que el refresh token existe en la base de datos y no ha sido revocado

      // Buscar usuario actual
      const user = await prisma.user.findUnique({
        where: { id: decoded.sub },
        include: { role: true }
      });

      if (!user) {
        throw new CustomError('User not found', 404);
      }

      // Generar nuevo access token
      const authenticatedUser: AuthenticatedUser = {
        id: user.id,
        email: user.email,
        role: user.role.name as UserRole
      };

      const newAccessToken = authService.generateAccessToken(authenticatedUser);

      const response: ApiResponse = {
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken: newAccessToken,
          expiresIn: authService['parseTokenExpiration'](process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || '15m'),
          tokenType: 'Bearer'
        },
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/logout
   * Cerrar sesión (invalidar refresh token)
   */
  async logout(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // TODO: Implementar validación y revocación de refresh token
      // const validatedData = refreshTokenSchema.parse(req.body) as RefreshTokenRequest;
      // const decoded = authService.verifyRefreshToken(validatedData.refreshToken);
      // await prisma.refreshToken.update({
      //   where: { tokenId: decoded.tokenId },
      //   data: { revokedAt: new Date() }
      // });

      const response: ApiResponse = {
        success: true,
        message: 'Logout successful',
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/auth/me
   * Obtener información del usuario actual
   */
  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new CustomError('Authentication required', 401);
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { 
          role: true,
          coursesAsDocente: {
            select: {
              id: true,
              nombre: true,
              periodo: true
            }
          }
        }
      });

      if (!user) {
        throw new CustomError('User not found', 404);
      }

      const response: ApiResponse = {
        success: true,
        message: 'User information retrieved successfully',
        data: {
          id: user.id,
          email: user.email,
          role: user.role.name,
          isVerified: user.isVerified,
          twoFactorEnabled: user.twoFactorEnabled,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt,
          courses: user.coursesAsDocente
        },
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/change-password
   * Cambiar contraseña del usuario actual
   */
  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new CustomError('Authentication required', 401);
      }

      const validatedData = changePasswordSchema.parse(req.body) as ChangePasswordRequest;

      // Buscar usuario actual
      const user = await prisma.user.findUnique({
        where: { id: req.user.id }
      });

      if (!user) {
        throw new CustomError('User not found', 404);
      }

      // Verificar contraseña actual
      const isValidCurrentPassword = await authService.verifyPassword(
        validatedData.currentPassword,
        user.passwordHash
      );

      if (!isValidCurrentPassword) {
        throw new CustomError('Current password is incorrect', 400);
      }

      // Hash nueva contraseña
      const { hash, salt } = await authService.hashPassword(validatedData.newPassword);

      // Actualizar contraseña
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hash,
          salt,
          updatedAt: new Date()
        }
      });

      const response: ApiResponse = {
        success: true,
        message: 'Password changed successfully',
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/forgot-password
   * Solicitar reset de contraseña
   */
  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedData = resetPasswordSchema.parse(req.body) as ResetPasswordRequest;

      // Buscar usuario por email
      const user = await prisma.user.findUnique({
        where: { email: validatedData.email }
      });

      // Por seguridad, siempre respondemos success aunque el email no exista
      if (!user) {
        const response: ApiResponse = {
          success: true,
          message: 'If the email exists, a password reset link has been sent',
          timestamp: new Date().toISOString()
        };
        res.status(200).json(response);
        return;
      }

      // Generar token de reset (simulado - en producción usar crypto)
      const resetToken = Buffer.from(`${user.id}-${Date.now()}`).toString('base64');
      
      // En una implementación real, aquí se enviaría un email con el token
      // Para desarrollo, simplemente logueamos el token
      console.log(`Password reset token for ${user.email}: ${resetToken}`);

      // Guardar token en base de datos (necesitaríamos agregar un campo resetToken)
      // Por ahora, simulamos el proceso
      
      const response: ApiResponse = {
        success: true,
        message: 'If the email exists, a password reset link has been sent',
        data: {
          // Solo en desarrollo - REMOVER en producción
          resetToken: resetToken
        },
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/reset-password
   * Confirmar reset de contraseña con token
   */
  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedData = confirmResetPasswordSchema.parse(req.body) as ConfirmResetPasswordRequest;

      // Decodificar token (implementación simplificada)
      let userId: string;
      let timestamp: number;
      
      try {
        const decoded = Buffer.from(validatedData.token, 'base64').toString();
        const parts = decoded.split('-');
        if (parts.length !== 2) {
          throw new Error('Invalid token format');
        }
        userId = parts[0] || '';
        timestamp = parseInt(parts[1] || '0');
      } catch {
        throw new CustomError('Invalid reset token', 400);
      }

      // Verificar que el token no haya expirado (24 horas)
      const tokenAge = Date.now() - timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 horas en millisegundos
      
      if (tokenAge > maxAge) {
        throw new CustomError('Reset token has expired', 400);
      }

      // Buscar usuario
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new CustomError('Invalid reset token', 400);
      }

      // Hashear nueva contraseña
      const { hash, salt } = await authService.hashPassword(validatedData.newPassword);

      // Actualizar contraseña
      await prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: hash,
          salt: salt
        }
      });

      const response: ApiResponse = {
        success: true,
        message: 'Password has been successfully reset',
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
