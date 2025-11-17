import { Router } from 'express';
import { uploadController, upload } from '../modules/upload/uploadController';
import { authenticateToken, requireAuth } from '../middleware/authMiddleware';

export const uploadRouter: Router = Router();

/**
 * @route POST /api/upload/single
 * @desc Subir un archivo único
 * @access Private (All authenticated users)
 */
uploadRouter.post('/single',
  authenticateToken,
  requireAuth,
  upload.single('file'),
  uploadController.uploadSingle.bind(uploadController)
);

/**
 * @route POST /api/upload/multiple
 * @desc Subir múltiples archivos (máximo 5)
 * @access Private (All authenticated users)
 */
uploadRouter.post('/multiple',
  authenticateToken,
  requireAuth,
  upload.array('files', 5),
  uploadController.uploadMultiple.bind(uploadController)
);

/**
 * @route DELETE /api/upload/:publicId
 * @desc Eliminar archivo
 * @access Private (Owner or Admin)
 */
uploadRouter.delete('/:publicId',
  authenticateToken,
  requireAuth,
  uploadController.deleteFile.bind(uploadController)
);

/**
 * @route GET /api/upload/list
 * @desc Listar archivos del usuario
 * @access Private (All authenticated users)
 */
uploadRouter.get('/list',
  authenticateToken,
  requireAuth,
  uploadController.listFiles.bind(uploadController)
);
