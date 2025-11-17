import { z } from 'zod';

// Enum para tipos de criterio
export const CriteriaTypeSchema = z.enum(['puntos', 'porcentaje', 'escala']);
export type CriteriaType = z.infer<typeof CriteriaTypeSchema>;

// Schema para crear rúbrica
export const createRubricSchema = z.object({
  nombre: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name cannot exceed 100 characters'),
  descripcion: z.string()
    .max(500, 'Description cannot exceed 500 characters')
    .optional(),
  examId: z.string().cuid('Invalid exam ID'),
  totalPuntos: z.number()
    .int('Total points must be an integer')
    .min(1, 'Total points must be at least 1')
    .max(1000, 'Total points cannot exceed 1000'),
  isActive: z.boolean().default(true)
});

// Schema para actualizar rúbrica
export const updateRubricSchema = createRubricSchema
  .omit({ examId: true })
  .partial();

// Schema para criterio de rúbrica
export const createCriteriaSchema = z.object({
  rubricId: z.string().cuid('Invalid rubric ID'),
  nombre: z.string()
    .min(1, 'Criteria name is required')
    .max(100, 'Name cannot exceed 100 characters'),
  descripcion: z.string()
    .max(300, 'Description cannot exceed 300 characters')
    .optional(),
  tipo: CriteriaTypeSchema,
  puntuacionMaxima: z.number()
    .int('Max score must be an integer')
    .min(1, 'Max score must be at least 1')
    .max(100, 'Max score cannot exceed 100'),
  peso: z.number()
    .min(0, 'Weight cannot be negative')
    .max(100, 'Weight cannot exceed 100%'),
  orden: z.number()
    .int('Order must be an integer')
    .min(1, 'Order must be at least 1'),
  isRequired: z.boolean().default(true),
  criteriosEvaluacion: z.array(z.string())
    .min(1, 'At least one evaluation criteria is required')
    .max(10, 'Cannot exceed 10 evaluation criteria')
});

// Schema para actualizar criterio
export const updateCriteriaSchema = createCriteriaSchema
  .omit({ rubricId: true })
  .partial();

// Schema para filtros de rúbricas
export const rubricFiltersSchema = z.object({
  search: z.string().optional(),
  examId: z.string().cuid().optional(),
  isActive: z.boolean().optional(),
  docenteId: z.string().cuid().optional(),
  page: z.preprocess((val) => Number(val) || 1, z.number().min(1).default(1)),
  limit: z.preprocess((val) => Number(val) || 10, z.number().min(1).max(100).default(10))
});

// Schema para calificación usando rúbrica
export const rubricGradingSchema = z.object({
  submissionId: z.string().cuid('Invalid submission ID'),
  criteriaGrades: z.array(z.object({
    criteriaId: z.string().cuid('Invalid criteria ID'),
    puntuacion: z.number()
      .min(0, 'Score cannot be negative'),
    comentario: z.string()
      .max(200, 'Comment cannot exceed 200 characters')
      .optional()
  })).min(1, 'At least one criteria grade is required'),
  comentarioGeneral: z.string()
    .max(500, 'General comment cannot exceed 500 characters')
    .optional(),
  bonificacion: z.number()
    .min(0, 'Bonus cannot be negative')
    .max(50, 'Bonus cannot exceed 50 points')
    .default(0)
});

// Tipos derivados
export type CreateRubricRequest = z.infer<typeof createRubricSchema>;
export type UpdateRubricRequest = z.infer<typeof updateRubricSchema>;
export type CreateCriteriaRequest = z.infer<typeof createCriteriaSchema>;
export type UpdateCriteriaRequest = z.infer<typeof updateCriteriaSchema>;
export type RubricFilters = z.infer<typeof rubricFiltersSchema>;
export type RubricGradingRequest = z.infer<typeof rubricGradingSchema>;

// Schema para duplicar rúbrica
export const duplicateRubricSchema = z.object({
  newExamId: z.string().cuid('Invalid exam ID'),
  newName: z.string()
    .min(1, 'New name is required')
    .max(100, 'Name cannot exceed 100 characters'),
  copyGrades: z.boolean().default(false)
});

export type DuplicateRubricRequest = z.infer<typeof duplicateRubricSchema>;
