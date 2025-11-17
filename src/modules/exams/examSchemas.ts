import { z } from 'zod';
import { ExamType } from '../../types';

// Schema para crear examen
export const createExamSchema = z.object({
  titulo: z.string()
    .min(3, 'Exam title must be at least 3 characters')
    .max(200, 'Exam title too long'),
  descripcion: z.string()
    .min(10, 'Description must be at least 10 characters')
    .max(1000, 'Description too long')
    .optional(),
  courseId: z.string()
    .cuid('Invalid course ID format'),
  tipo: z.enum([ExamType.TEORICO, ExamType.PRACTICO, ExamType.MIXTO]),
  fechaApertura: z.string()
    .datetime('Invalid opening date format'),
  fechaCierre: z.string()
    .datetime('Invalid closing date format'),
  duracionMinutos: z.number()
    .int()
    .min(0, 'Duration must be non-negative')
    .max(480, 'Duration cannot exceed 8 hours'),
  intentosPermitidos: z.number()
    .int()
    .min(1, 'Must allow at least 1 attempt')
    .max(10, 'Cannot allow more than 10 attempts')
    .default(1),
  puntuacionMaxima: z.number()
    .min(1, 'Max score must be at least 1')
    .max(1000, 'Max score cannot exceed 1000')
    .default(100),
  configuracion: z.object({
    shuffleQuestions: z.boolean().default(false),
    showResults: z.boolean().default(true),
    requireProctoring: z.boolean().default(false),
    allowLateSubmission: z.boolean().default(false)
  }).optional(),
  isActive: z.boolean().default(true)
}).refine((data) => {
  const openingDate = new Date(data.fechaApertura);
  const closingDate = new Date(data.fechaCierre);
  return closingDate > openingDate;
}, {
  message: "Closing date must be after opening date",
  path: ["fechaCierre"]
});

// Schema para actualizar examen
export const updateExamSchema = createExamSchema.partial().omit({ courseId: true });

// Schema para filtros de exámenes
export const examFiltersSchema = z.object({
  search: z.string().optional(),
  courseId: z.string().cuid().optional(),
  tipo: z.enum([ExamType.TEORICO, ExamType.PRACTICO, ExamType.MIXTO]).optional(),
  isActive: z.boolean().optional(),
  docenteId: z.string().cuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(50).default(10)
});

// Schema para envío de examen (estudiante)
export const submitExamSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string().cuid(),
    response: z.string().min(1, 'Response cannot be empty'),
    timeSpent: z.number().int().min(0).optional()
  })).min(1, 'At least one answer required'),
  totalTimeSpent: z.number().int().min(0).optional(),
  additionalFiles: z.array(z.string()).optional() // URLs de archivos subidos
});

// Schema para calificación manual
export const gradeSubmissionSchema = z.object({
  questionGrades: z.array(z.object({
    questionId: z.string().cuid(),
    score: z.number().min(0),
    feedback: z.string().optional()
  })).min(1, 'At least one question grade required'),
  generalFeedback: z.string().optional(),
  bonus: z.number().min(0).default(0)
});

// Tipos derivados de los schemas
export type CreateExamRequest = z.infer<typeof createExamSchema>;
export type UpdateExamRequest = z.infer<typeof updateExamSchema>;
export type ExamFilters = z.infer<typeof examFiltersSchema>;
export type SubmitExamRequest = z.infer<typeof submitExamSchema>;
export type GradeSubmissionRequest = z.infer<typeof gradeSubmissionSchema>;
