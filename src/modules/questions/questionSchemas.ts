import { z } from 'zod';

export const QUESTION_TYPES = ['text', 'code', 'file_upload', 'multiple_choice'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

const multipleChoiceOptionSchema = z.object({
  label: z.string().min(1, 'Option label is required'),
  value: z.string().min(1, 'Option value is required'),
  isCorrect: z.boolean().default(false)
});

const baseConfigSchema = z.object({
  responseLength: z.enum(['short', 'paragraph']).optional(),
  maxLength: z.number().int().min(10).max(10000).optional(),
  language: z.string().optional(),
  starterCode: z.string().optional(),
  allowedMimeTypes: z.array(z.string()).optional(),
  maxFiles: z.number().int().min(1).max(5).optional(),
  options: z.array(multipleChoiceOptionSchema).optional(),
  allowMultiple: z.boolean().optional()
}).partial();

const createQuestionBaseSchema = z.object({
  examId: z.string().cuid(),
  pageNumber: z.number().int().min(1).default(1),
  bbox: z.record(z.string(), z.any()).nullish(),
  tipo: z.enum(QUESTION_TYPES),
  title: z.string().min(3, 'Question title must have at least 3 characters').max(200, 'Question title too long'),
  prompt: z.string().min(10, 'Question prompt must have at least 10 characters'),
  puntos: z.number().min(0.1).max(1000),
  orden: z.number().int().min(0).default(0),
  config: baseConfigSchema.nullish()
});

export const createQuestionSchema = createQuestionBaseSchema.superRefine((data, ctx) => {
  if (data.tipo === 'multiple_choice') {
    const options = data.config?.options ?? [];
    if (options.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['config', 'options'],
        message: 'Multiple choice questions require at least two options'
      });
    }

    const hasCorrectAnswer = options.some((option) => option.isCorrect);
    if (!hasCorrectAnswer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['config', 'options'],
        message: 'At least one option must be marked as correct'
      });
    }
  }

  if (data.tipo === 'file_upload') {
    const allowedMimeTypes = data.config?.allowedMimeTypes;
    if (Array.isArray(allowedMimeTypes) && allowedMimeTypes.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['config', 'allowedMimeTypes'],
        message: 'Specify at least one allowed file type'
      });
    }
  }
});

// Update question schema
export const updateQuestionSchema = createQuestionBaseSchema.partial().omit({ examId: true });

// Question filters schema
export const questionFiltersSchema = z.object({
  search: z.string().optional(),
  examId: z.string().cuid().optional(),
  tipo: z.enum(QUESTION_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10)
});

// Rubric schema - basado en el modelo existente
export const createRubricSchema = z.object({
  examId: z.string().cuid().optional(),
  questionId: z.string().cuid(),
  name: z.string().min(1, 'Name is required').default('Default Rubric'),
  estructuraJson: z.record(z.string(), z.any()), // Criterios de evaluación
  isActive: z.boolean().default(true)
});

export const updateRubricSchema = createRubricSchema.partial().omit({ questionId: true });

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
export type QuestionFilters = z.infer<typeof questionFiltersSchema>;
export type CreateRubricInput = z.infer<typeof createRubricSchema>;
export type UpdateRubricInput = z.infer<typeof updateRubricSchema>;
