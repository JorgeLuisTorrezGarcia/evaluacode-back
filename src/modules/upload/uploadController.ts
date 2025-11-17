import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import type { Prisma } from '@prisma/client';
import { CloudinaryService } from './cloudinaryService';
import { CustomError } from '../../middleware/errorHandler';
import { prisma } from '../../lib/prisma';
import type { ApiResponse } from '../../types';
import { UserRole } from '../../types';
import type { UploadResult } from './uploadSchemas';

// Configuración de Multer para memoria
const storage = multer.memoryStorage();

// Filtros de archivo
const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Tipos de archivo permitidos
  const allowedMimes = [
    'image/jpeg',
    'image/png', 
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/x-zip-compressed',
    'text/x-python',
    'text/x-java-source',
    'text/x-c++src',
    'text/javascript'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${file.mimetype}`));
  }
};

// Configuración de Multer
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5 // Máximo 5 archivos
  }
});

export class UploadController {
  /**
   * POST /api/upload/single
   * Subir un archivo único
   */
  async uploadSingle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        throw new CustomError('No file provided', 400);
      }

      const { purpose = 'general', examId, submissionId } = req.body as {
        purpose?: string;
        examId?: string;
        submissionId?: string;
      };

      if (!req.user?.id) {
        throw new CustomError('Authenticated user required', 401);
      }
      const currentUserId = req.user.id;

      // Determinar carpeta basada en el propósito
      let folder = 'evaluacode';
      switch (purpose) {
        case 'exam_submission':
          folder = `evaluacode/submissions/${examId || 'general'}`;
          break;
        case 'profile_avatar':
          folder = `evaluacode/avatars`;
          break;
        case 'exam_template':
          folder = `evaluacode/templates`;
          break;
        default:
          folder = 'evaluacode/general';
      }

      // Configurar opciones de upload
      const uploadOptions = {
        folder,
        resourceType: req.file.mimetype.startsWith('image/') ? 'image' as const : 'raw' as const,
      };

      // Subir a Cloudinary
      const result = await CloudinaryService.uploadFile(req.file.buffer, uploadOptions) as any;

      // Guardar metadata en base de datos
      const fileRecord = await prisma.uploadedFile.create({
        data: {
          originalName: req.file.originalname,
          filename: result.public_id,
          mimetype: req.file.mimetype,
          size: req.file.size,
          cloudinaryPublicId: result.public_id,
          cloudinaryUrl: result.secure_url,
          folder: result.folder,
          uploadedById: currentUserId,
          purpose,
          examId: examId ?? null,
          submissionId: submissionId ?? null
        },
        include: {
          uploadedBy: {
            select: {
              id: true,
              email: true
            }
          }
        }
      });

      const uploadResult: UploadResult = {
        publicId: result.public_id,
        secureUrl: result.secure_url,
        originalFilename: req.file.originalname,
        format: result.format,
        bytes: result.bytes,
        resourceType: result.resource_type,
        createdAt: result.created_at,
        folder: result.folder
      };

      const response: ApiResponse = {
        success: true,
        message: 'File uploaded successfully',
        data: {
          file: uploadResult,
          database: {
            id: fileRecord.id,
            createdAt: fileRecord.createdAt,
            uploadedBy: fileRecord.uploadedBy.email
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
   * POST /api/upload/multiple
   * Subir múltiples archivos
   */
  async uploadMultiple(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        throw new CustomError('No files provided', 400);
      }

      const { purpose = 'general', examId, submissionId } = req.body as {
        purpose?: string;
        examId?: string;
        submissionId?: string;
      };
      const files = req.files as Express.Multer.File[];

      if (!req.user?.id) {
        throw new CustomError('Authenticated user required', 401);
      }
      const currentUserId = req.user.id;

      // Determinar carpeta
      let folder = 'evaluacode';
      switch (purpose) {
        case 'exam_submission':
          folder = `evaluacode/submissions/${examId || 'general'}`;
          break;
        case 'profile_avatar':
          folder = `evaluacode/avatars`;
          break;
        case 'exam_template':
          folder = `evaluacode/templates`;
          break;
        default:
          folder = 'evaluacode/general';
      }

      // Subir todos los archivos en paralelo
      const uploadPromises = files.map(async (file: Express.Multer.File) => {
        const uploadOptions = {
          folder,
          resourceType: file.mimetype.startsWith('image/') ? 'image' as const : 'raw' as const,
        };

        const result = await CloudinaryService.uploadFile(file.buffer, uploadOptions) as any;

        // Guardar en base de datos
        const fileRecord = await prisma.uploadedFile.create({
          data: {
            originalName: file.originalname,
            filename: result.public_id,
            mimetype: file.mimetype,
            size: file.size,
            cloudinaryPublicId: result.public_id,
            cloudinaryUrl: result.secure_url,
            folder: result.folder,
            uploadedById: currentUserId,
            purpose,
            examId: examId ?? null,
            submissionId: submissionId ?? null
          }
        });

        return {
          publicId: result.public_id,
          secureUrl: result.secure_url,
          originalFilename: file.originalname,
          format: result.format,
          bytes: result.bytes,
          resourceType: result.resource_type,
          createdAt: result.created_at,
          folder: result.folder,
          databaseId: fileRecord.id
        };
      });

      const results = await Promise.all(uploadPromises);

      const response: ApiResponse = {
        success: true,
        message: `${results.length} files uploaded successfully`,
        data: {
          files: results,
          totalSize: results.reduce((sum, file) => sum + file.bytes, 0),
          uploadedAt: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/upload/:publicId
   * Eliminar archivo
   */
  async deleteFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { publicId } = req.params;
      if (!publicId) {
        throw new CustomError('File publicId is required', 400);
      }
      const resourceTypeParam = Array.isArray(req.query.resourceType)
        ? req.query.resourceType[0]
        : req.query.resourceType;
      const resourceType = (resourceTypeParam ?? 'image') as 'image' | 'video' | 'raw';

      // Buscar archivo en base de datos
      const fileRecord = await prisma.uploadedFile.findFirst({
        where: { cloudinaryPublicId: publicId },
        include: {
          uploadedBy: {
            select: {
              id: true,
              email: true
            }
          }
        }
      });

      if (!fileRecord) {
        throw new CustomError('File not found', 404);
      }

      // Verificar permisos: solo el propietario o admin puede eliminar
      if (req.user?.role !== UserRole.ADMIN && fileRecord.uploadedById !== req.user?.id) {
        throw new CustomError('Not authorized to delete this file', 403);
      }

      // Eliminar de Cloudinary
      await CloudinaryService.deleteFile(publicId, resourceType);

      // Eliminar de base de datos
      await prisma.uploadedFile.delete({
        where: { id: fileRecord.id }
      });

      const response: ApiResponse = {
        success: true,
        message: 'File deleted successfully',
        data: {
          deletedFile: {
            publicId: fileRecord.cloudinaryPublicId,
            originalName: fileRecord.originalName
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
   * GET /api/upload/list
   * Listar archivos del usuario
   */
  async listFiles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { purpose, examId } = req.query;
      const rawPage = Array.isArray(req.query.page) ? req.query.page[0] : req.query.page;
      const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
      const page = rawPage ? Number(rawPage) : 1;
      const limit = rawLimit ? Number(rawLimit) : 20;
      const offset = (page - 1) * limit;

      const whereClause: Prisma.UploadedFileWhereInput = {};

      // Filtrar por usuario (estudiantes solo ven sus archivos)
      const currentUserId = req.user?.id;
      if (req.user?.role === UserRole.ESTUDIANTE && currentUserId) {
        whereClause.uploadedById = currentUserId;
      }

      if (purpose && typeof purpose === 'string') {
        whereClause.purpose = purpose;
      }

      if (examId && typeof examId === 'string') {
        whereClause.examId = examId;
      }

      const [files, total] = await Promise.all([
        prisma.uploadedFile.findMany({
          where: whereClause,
          include: {
            uploadedBy: {
              select: {
                id: true,
                email: true
              }
            }
          },
          skip: offset,
          take: limit,
          orderBy: {
            createdAt: 'desc'
          }
        }),
        prisma.uploadedFile.count({ where: whereClause })
      ]);

      const response: ApiResponse = {
        success: true,
        message: 'Files retrieved successfully',
        data: {
          files: files.map(file => ({
            id: file.id,
            originalName: file.originalName,
            mimetype: file.mimetype,
            size: file.size,
            publicId: file.cloudinaryPublicId,
            secureUrl: file.cloudinaryUrl,
            purpose: file.purpose,
            examId: file.examId,
            submissionId: file.submissionId,
            createdAt: file.createdAt,
            uploadedBy: file.uploadedBy?.email || 'Unknown'
          })),
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          }
        },
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}

export const uploadController = new UploadController();
