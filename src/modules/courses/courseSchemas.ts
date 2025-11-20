import { z } from 'zod';

// Schema para crear curso
export const createCourseSchema = z.object({
  nombre: z.string()
    .min(3, 'Course name must be at least 3 characters')
    .max(100, 'Course name too long'),
  descripcion: z.string()
    .min(10, 'Description must be at least 10 characters')
    .max(500, 'Description too long')
    .optional()
    .or(z.literal("")),
  docenteId: z.string()
    .cuid('Invalid docente ID format')
    .optional(),
  periodo: z.string()
    .min(4, 'Period must be at least 4 characters')
    .max(20, 'Period too long'),
  codigo: z.string()
    .min(2, 'Course code must be at least 2 characters')
    .max(10, 'Course code too long')
    .regex(/^[A-Z0-9-]+$/, 'Course code must contain only uppercase letters, numbers, and hyphens'),
  creditos: z.number()
    .int()
    .min(1, 'Credits must be at least 1')
    .max(10, 'Credits cannot exceed 10'),
  semestre: z.number()
    .int()
    .min(1, 'Semester must be at least 1')
    .max(12, 'Semester cannot exceed 12'),
  isActive: z.boolean().default(true)
});

// Schema para actualizar curso
export const updateCourseSchema = createCourseSchema.partial();

// Schema para filtros de cursos
export const courseFiltersSchema = z.object({
  search: z.string().optional(),
  periodo: z.string().optional(),
  semestre: z.coerce.number().int().optional(),
  isActive: z.coerce.boolean().optional(),
  docenteId: z.string().refine(val => !val || z.string().cuid().safeParse(val).success, 'Invalid docente ID format').optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10)
});

// Schema para asignar docente
export const assignDocenteSchema = z.object({
  docenteId: z.string()
    .cuid('Invalid docente ID format')
});

// Schema para matricular estudiante
export const enrollStudentSchema = z.object({
  estudianteId: z.string()
    .cuid('Invalid student ID format')
});

// Schema para inscripción masiva
export const bulkEnrollSchema = z.object({
  estudianteIds: z.array(z.string().cuid())
    .min(1, 'At least one student ID required')
    .max(100, 'Cannot enroll more than 100 students at once')
});

// Schema para subir archivos al curso
export const uploadCourseFileSchema = z.object({
  category: z.enum(['MATERIAL', 'ASSIGNMENT', 'SUBMISSION', 'RESOURCE']).default('MATERIAL'),
  description: z.string().max(500).optional(),
  isPublic: z.coerce.boolean().default(true)
});

// Tipos derivados de los schemas
export type CreateCourseRequest = z.infer<typeof createCourseSchema>;
export type UpdateCourseRequest = z.infer<typeof updateCourseSchema>;
export type CourseFilters = z.infer<typeof courseFiltersSchema>;
export type AssignDocenteRequest = z.infer<typeof assignDocenteSchema>;
export type EnrollStudentRequest = z.infer<typeof enrollStudentSchema>;
export type BulkEnrollRequest = z.infer<typeof bulkEnrollSchema>;
export type UploadCourseFileRequest = z.infer<typeof uploadCourseFileSchema>;
