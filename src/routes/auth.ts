import { Router } from 'express';
import { authController } from '@/modules/auth/authController';
import { authenticateToken, rateLimitByUser } from '@/middleware/authMiddleware';

export const authRouter: Router = Router();

/**
 * @route POST /api/auth/register
 * @desc Registrar nuevo usuario
 * @access Public
 */
authRouter.post('/register', authController.register.bind(authController));

/**
 * @route POST /api/auth/login
 * @desc Iniciar sesión
 * @access Public
 */
authRouter.post('/login', authController.login.bind(authController));

/**
 * @route POST /api/auth/refresh
 * @desc Renovar access token
 * @access Public (requiere refresh token válido)
 */
authRouter.post('/refresh', authController.refresh.bind(authController));

/**
 * @route POST /api/auth/logout
 * @desc Cerrar sesión
 * @access Private
 */
authRouter.post('/logout', 
  authenticateToken, 
  authController.logout.bind(authController)
);

/**
 * @route GET /api/auth/me
 * @desc Obtener información del usuario actual
 * @access Private
 */
authRouter.get('/me', 
  authenticateToken,
  rateLimitByUser(30, 60000), // 30 requests per minute
  authController.me.bind(authController)
);

/**
 * @route POST /api/auth/change-password
 * @desc Cambiar contraseña del usuario actual
 * @access Private
 */
authRouter.post('/change-password',
  authenticateToken,
  rateLimitByUser(5, 300000), // 5 requests per 5 minutes
  authController.changePassword.bind(authController)
);

/**
 * @route POST /api/auth/forgot-password
 * @desc Solicitar reset de contraseña
 * @access Public
 */
authRouter.post('/forgot-password',
  rateLimitByUser(3, 600000), // 3 requests per 10 minutes
  authController.forgotPassword.bind(authController)
);

/**
 * @route POST /api/auth/reset-password
 * @desc Confirmar reset de contraseña con token
 * @access Public
 */
authRouter.post('/reset-password',
  rateLimitByUser(5, 600000), // 5 requests per 10 minutes
  authController.resetPassword.bind(authController)
);
