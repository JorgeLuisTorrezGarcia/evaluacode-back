import { z } from 'zod';

// Schema para metadata de archivo
export const fileMetadataSchema = z.object({
  originalName: z.string()
    .min(1, 'Original filename required')
    .max(255, 'Filename too long'),
  mimetype: z.string()
    .min(1, 'MIME type required'),
  size: z.number()
    .int()
    .min(1, 'File size must be positive')
    .max(10 * 1024 * 1024, 'File size cannot exceed 10MB'), // 10MB limit
  purpose: z.enum(['exam_submission', 'profile_avatar', 'exam_template', 'general'])
    .default('general'),
  examId: z.string().uuid().optional(),
  submissionId: z.string().uuid().optional()
});

// Schema para configuración de Cloudinary
export const cloudinaryConfigSchema = z.object({
  folder: z.string().default('evaluacode'),
  resourceType: z.enum(['image', 'video', 'raw', 'auto']).default('auto'),
  transformation: z.object({
    quality: z.string().default('auto'),
    format: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    crop: z.string().optional()
  }).optional()
});

// Schema para respuesta de upload múltiple
export const multipleUploadSchema = z.object({
  files: z.array(z.any()).min(1, 'At least one file required').max(5, 'Maximum 5 files allowed')
});

// Schema para eliminar archivo
export const deleteFileSchema = z.object({
  publicId: z.string().min(1, 'Public ID required'),
  resourceType: z.enum(['image', 'video', 'raw']).default('image')
});

// Tipos derivados
export type FileMetadata = z.infer<typeof fileMetadataSchema>;
export type CloudinaryConfig = z.infer<typeof cloudinaryConfigSchema>;
export type MultipleUpload = z.infer<typeof multipleUploadSchema>;
export type DeleteFile = z.infer<typeof deleteFileSchema>;

// Tipos de respuesta
export interface UploadResult {
  publicId: string;
  secureUrl: string;
  originalFilename: string;
  format: string;
  bytes: number;
  resourceType: string;
  createdAt: string;
  folder?: string;
}

export interface UploadError {
  error: string;
  details?: any;
}
