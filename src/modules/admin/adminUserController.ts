import { NextFunction, Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { adminEnrollStudentSchema, adminUserFiltersSchema } from './adminUserSchemas';
import type { AdminUserFilters } from './adminUserSchemas';
import type { ApiResponse } from '@/types';
import { createEnrollmentForCourse } from '@/modules/courses/courseEnrollmentService';

class AdminUserController {
  async listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = adminUserFiltersSchema.parse(req.query) as AdminUserFilters;
      const { search, role, page, limit } = filters;

      const whereClause: Prisma.UserWhereInput = {};

      if (search) {
        whereClause.OR = [
          { email: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (role) {
        whereClause.role = {
          name: role
        };
      }

      const [users, totalUsers] = await prisma.$transaction([
        prisma.user.findMany({
          where: whereClause,
          include: {
            role: {
              select: {
                name: true
              }
            },
            _count: {
              select: {
                coursesAsDocente: true,
                enrollments: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          skip: (page - 1) * limit,
          take: limit
        }),
        prisma.user.count({ where: whereClause })
      ]);

      const totalPages = Math.ceil(totalUsers / limit) || 1;

      const response: ApiResponse = {
        success: true,
        message: 'Users retrieved successfully',
        data: {
          users: users.map((user) => ({
            id: user.id,
            email: user.email,
            role: user.role?.name,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
            stats: {
              coursesAsDocente: user._count.coursesAsDocente,
              enrollments: user._count.enrollments
            }
          })),
          pagination: {
            page,
            limit,
            total: totalUsers,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        },
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  async enrollStudent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payload = adminEnrollStudentSchema.parse(req.body);

      const enrollment = await createEnrollmentForCourse({
        courseId: payload.courseId,
        studentId: payload.studentId
      });

      const response: ApiResponse = {
        success: true,
        message: 'Student enrolled successfully',
        data: enrollment,
        timestamp: new Date().toISOString()
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }
}

export const adminUserController = new AdminUserController();
