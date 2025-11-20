import { Router } from 'express';
import { adminUserController } from '@/modules/admin/adminUserController';
import { authenticateToken, requireAdmin } from '@/middleware/authMiddleware';

export const adminRouter: Router = Router();

adminRouter.get(
  '/users',
  authenticateToken,
  requireAdmin,
  adminUserController.listUsers.bind(adminUserController)
);

adminRouter.post(
  '/enrollments',
  authenticateToken,
  requireAdmin,
  adminUserController.enrollStudent.bind(adminUserController)
);
