import { z } from 'zod';
import { UserRole } from '@/types';

export const adminUserFiltersSchema = z.object({
  search: z
    .string()
    .trim()
    .min(1)
    .optional(),
  role: z.nativeEnum(UserRole).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const adminEnrollStudentSchema = z.object({
  courseId: z.string().cuid(),
  studentId: z.string().cuid()
});

export type AdminUserFilters = z.infer<typeof adminUserFiltersSchema>;
export type AdminEnrollStudentRequest = z.infer<typeof adminEnrollStudentSchema>;
