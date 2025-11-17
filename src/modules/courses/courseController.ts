import { Request, Response, NextFunction } from 'express';
import type { Prisma } from '@prisma/client';
import { CustomError } from '../../middleware/errorHandler';
import { UserRole } from '../../types';
import { 
  createCourseSchema,
  updateCourseSchema,
  courseFiltersSchema,
  assignDocenteSchema,
  enrollStudentSchema,
} from './courseSchemas';
import type {
  CreateCourseRequest,
  UpdateCourseRequest,
  CourseFilters,
  AssignDocenteRequest,
  EnrollStudentRequest
} from './courseSchemas';
import type { ApiResponse, PaginatedResponse } from '../../types';
import { prisma } from '../../lib/prisma';

const courseDetailInclude = {
  docente: {
    select: {
      id: true,
      email: true,
      role: { select: { name: true } }
    }
  },
  enrollments: {
    include: {
      student: {
        select: {
          id: true,
          email: true,
          createdAt: true
        }
      }
    },
    orderBy: {
      enrolledAt: 'asc' as const
    }
  },
  exams: {
    select: {
      id: true,
      title: true,
      descripcion: true,
      fechaApertura: true,
      fechaCierre: true,
      duracionMinutos: true,
      intentosPermitidos: true,
      isActive: true,
      createdAt: true
    },
    orderBy: {
      fechaApertura: 'desc' as const
    }
  }
} satisfies Prisma.CourseInclude;

export class CourseController {
  /**
   * GET /api/courses
   * Obtener lista de cursos con filtros y paginación
   */
  async getCourses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = courseFiltersSchema.parse(req.query) as CourseFilters;
      const { search, periodo, semestre, isActive, docenteId, page, limit } = filters;

      // Construir condiciones de búsqueda
      const whereClause: Prisma.CourseWhereInput = {};

      if (search) {
        whereClause.OR = [
          { nombre: { contains: search, mode: 'insensitive' } },
          { codigo: { contains: search, mode: 'insensitive' } },
          { descripcion: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (periodo) whereClause.periodo = periodo;
      if (semestre !== undefined) whereClause.semestre = semestre;
      if (isActive !== undefined) whereClause.isActive = isActive;
      if (docenteId) whereClause.docenteId = docenteId;

      // Solo mostrar cursos activos para estudiantes
      if (req.user?.role === UserRole.ESTUDIANTE) {
        whereClause.isActive = true;
      }

      // Buscar courses con include explícito
      const courses = await prisma.course.findMany({
        where: whereClause,
        include: {
          docente: {
            select: {
              id: true,
              email: true,
              role: { select: { name: true } }
            }
          },
          enrollments: {
            include: {
              student: {
                select: {
                  id: true,
                  email: true
                }
              }
            }
          },
          exams: {
            select: {
              id: true,
              title: true,
              status: true
            }
          }
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      });

      const coursesWithStats = courses.map((course) => {
        const enrollmentCount = course.enrollments.length;
        const activeStudents = course.enrollments.filter((enrollment) => 
          enrollment.student && enrollment.student.id
        ).length;
        const examCount = course.exams.length;
        const activeExams = course.exams.filter((e) => e.status === 'active').length;

        return {
          id: course.id,
          nombre: course.nombre,
          codigo: course.codigo,
          periodo: course.periodo,
          semestre: course.semestre,
          creditos: course.creditos,
          isActive: course.isActive,
          createdAt: course.createdAt,
          updatedAt: course.updatedAt,
          docente: {
            id: course.docente.id,
            email: course.docente.email,
            roleName: course.docente.role.name
          },
          stats: {
            enrollmentCount,
            activeStudents,
            examCount,
            activeExams
          }
        };
      });

      const response: ApiResponse<PaginatedResponse<typeof coursesWithStats[0]>> = {
        success: true,
        message: 'Courses retrieved successfully',
        data: {
          items: coursesWithStats,
          pagination: {
            page,
            limit,
            total: courses.length,
            totalPages: Math.ceil(courses.length / limit),
            hasNext: page < Math.ceil(courses.length / limit),
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

  /**
   * GET /api/courses/:id
   * Obtener detalles de un curso específico
   */
  async getCourseById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const courseId = req.params.id;

      if (!courseId) {
        throw new CustomError('Course ID is required', 400);
      }

      const course = await prisma.course.findUnique({
        where: { id: courseId },
        include: courseDetailInclude
      });

      if (!course) {
        throw new CustomError('Course not found', 404);
      }

      // Verificar permisos de acceso
      if (req.user?.role === UserRole.ESTUDIANTE) {
        const isEnrolled = course.enrollments.some(
          (enrollment) => enrollment.student.id === req.user?.id
        );
        if (!isEnrolled) {
          throw new CustomError('Not enrolled in this course', 403);
        }
      }

      const response: ApiResponse = {
        success: true,
        message: 'Course details retrieved successfully',
        data: {
          ...course,
          students: course.enrollments.map((e) => e.student),
          enrollmentCount: course.enrollments.length
        },
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/courses
   * Crear nuevo curso (solo Admin/Docente)
   */
  async createCourse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedData = createCourseSchema.parse(req.body) as CreateCourseRequest;

      // Verificar si el código del curso ya existe en el mismo periodo
      const existingCourse = await prisma.course.findFirst({
        where: {
          codigo: validatedData.codigo,
          periodo: validatedData.periodo
        }
      });

      if (existingCourse) {
        throw new CustomError('Course code already exists for this period', 400);
      }

      // Crear datos para Prisma con manejo correcto de optional properties
      const createData: any = {
        docenteId: validatedData.docenteId,
        nombre: validatedData.nombre,
        periodo: validatedData.periodo,
        codigo: validatedData.codigo,
        creditos: validatedData.creditos,
        semestre: validatedData.semestre,
        isActive: validatedData.isActive
      };
      
      // Solo agregar descripcion si está definida
      if (validatedData.descripcion !== undefined) {
        createData.descripcion = validatedData.descripcion;
      }

      // Crear curso
      const course = await prisma.course.create({
        data: createData,
        include: {
          docente: {
            select: {
              id: true,
              email: true,
              role: { select: { name: true } }
            }
          }
        }
      });

      const response: ApiResponse = {
        success: true,
        message: 'Course created successfully',
        data: course,
        timestamp: new Date().toISOString()
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/courses/:id
   * Actualizar curso existente
   */
  async updateCourse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const courseId = req.params.id;

      const validatedData = updateCourseSchema.parse(req.body) as UpdateCourseRequest;

      if (!courseId) {
        throw new CustomError('Course ID is required', 400);
      }

      // Verificar que el curso existe
      const existingCourse = await prisma.course.findUnique({
        where: { id: courseId },
        include: { docente: true }
      });

      if (!existingCourse) {
        throw new CustomError('Course not found', 404);
      }

      // Verificar permisos: Admin o docente asignado
      if (req.user?.role === UserRole.DOCENTE &&
          existingCourse.docenteId !== req.user.id) {
        throw new CustomError('Not authorized to modify this course', 403);
      }

      // Verificar código único si se actualiza
      if (validatedData.codigo && validatedData.codigo !== existingCourse.codigo) {
        const codeExists = await prisma.course.findFirst({
          where: {
            codigo: validatedData.codigo,
            periodo: validatedData.periodo || existingCourse.periodo,
            NOT: { id: courseId }
          }
        });

        if (codeExists) {
          throw new CustomError('Course code already exists for this period', 400);
        }
      }

      // Preparar datos de actualización
      const updateData: any = {};
      if (validatedData.nombre !== undefined) updateData.nombre = validatedData.nombre;
      if (validatedData.descripcion !== undefined) updateData.descripcion = validatedData.descripcion;
      if (validatedData.docenteId !== undefined) updateData.docenteId = validatedData.docenteId;
      if (validatedData.periodo !== undefined) updateData.periodo = validatedData.periodo;
      if (validatedData.codigo !== undefined) updateData.codigo = validatedData.codigo;
      if (validatedData.creditos !== undefined) updateData.creditos = validatedData.creditos;
      if (validatedData.semestre !== undefined) updateData.semestre = validatedData.semestre;
      if (validatedData.isActive !== undefined) updateData.isActive = validatedData.isActive;

      // Actualizar curso
      const updatedCourse = await prisma.course.update({
        where: { id: courseId },
        data: updateData,
        include: {
          docente: {
            select: {
              id: true,
              email: true,
              role: { select: { name: true } }
            }
          }
        }
      });

      const response: ApiResponse = {
        success: true,
        message: 'Course updated successfully',
        data: updatedCourse,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/courses/:id
   * Eliminar curso (solo Admin)
   */
  async deleteCourse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const courseId = req.params.id;

      if (!courseId) {
        throw new CustomError('Course ID is required', 400);
      }

      const course = await prisma.course.findUnique({
        where: { id: courseId },
        include: {
          enrollments: true,
          exams: true
        }
      });

      if (!course) {
        throw new CustomError('Course not found', 404);
      }

      // Verificar si hay exámenes o inscripciones
      if (course.exams.length > 0 || course.enrollments.length > 0) {
        throw new CustomError('Cannot delete course with existing exams or enrollments', 400);
      }

      await prisma.course.delete({
        where: { id: courseId }
      });

      const response: ApiResponse = {
        success: true,
        message: 'Course deleted successfully',
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/courses/:id/assign-docente
   * Asignar docente a curso (solo Admin)
   */
  async assignDocente(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const courseId = req.params.id;
      const { docenteId } = assignDocenteSchema.parse(req.body) as AssignDocenteRequest;

      if (!courseId) {
        throw new CustomError('Course ID is required', 400);
      }

      // Verificar que el curso existe
      const existingCourse = await prisma.course.findUnique({ where: { id: courseId } });
      if (!existingCourse) {
        throw new CustomError('Course not found', 404);
      }

      // Verificar que el docente existe y tiene el rol correcto
      const docente = await prisma.user.findUnique({
        where: { id: docenteId },
        include: { role: true }
      });

      if (!docente || docente.role.name !== UserRole.DOCENTE) {
        throw new CustomError('Invalid docente or user is not a teacher', 400);
      }

      // Actualizar curso con nuevo docente
      const updatedCourse = await prisma.course.update({
        where: { id: courseId },
        data: { docenteId },
        include: {
          docente: {
            select: {
              id: true,
              email: true,
              role: { select: { name: true } }
            }
          }
        }
      });

      const response: ApiResponse = {
        success: true,
        message: 'Docente assigned successfully',
        data: updatedCourse,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/courses/:id/enroll
   * Matricular estudiante en curso
   */
  async enrollStudent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const courseId = req.params.id;
      const { estudianteId } = enrollStudentSchema.parse(req.body) as EnrollStudentRequest;

      if (!courseId) {
        throw new CustomError('Course ID is required', 400);
      }

      // Verificar que el curso existe y está activo
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course || !course.isActive) {
        throw new CustomError('Course not found or inactive', 404);
      }

      // Verificar que el estudiante existe
      const student = await prisma.user.findUnique({
        where: { id: estudianteId },
        include: { role: true }
      });

      if (!student || student.role.name !== UserRole.ESTUDIANTE) {
        throw new CustomError('Student not found or invalid role', 400);
      }

      // Verificar si ya está matriculado
      const existingEnrollment = await prisma.courseEnrollment.findUnique({
        where: {
          courseId_studentId: {
            courseId: courseId,
            studentId: estudianteId
          }
        }
      });

      if (existingEnrollment) {
        throw new CustomError('Student already enrolled in this course', 400);
      }

      // Crear matrícula
      const enrollment = await prisma.courseEnrollment.create({
        data: {
          courseId: courseId,
          studentId: estudianteId,
          enrolledAt: new Date()
        },
        include: {
          course: { select: { nombre: true, codigo: true } },
          student: { select: { email: true } }
        }
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

  /**
   * DELETE /api/courses/:id/unenroll
   * Desinscribir estudiante de un curso
   */
  async unenrollStudent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const courseId = req.params.id;
      const { estudianteId } = req.body;

      if (!courseId) {
        throw new CustomError('Course ID is required', 400);
      }

      if (!estudianteId) {
        throw new CustomError('Student ID is required', 400);
      }

      // Verificar que el curso existe
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        include: { docente: { select: { id: true, email: true } } }
      });

      if (!course) {
        throw new CustomError('Course not found', 404);
      }

      // Verificar permisos (solo Admin o docente asignado)
      if (req.user?.role === UserRole.DOCENTE && course.docenteId !== req.user.id) {
        throw new CustomError('Not authorized to manage enrollments for this course', 403);
      }

      // Verificar que el estudiante está inscrito
      const existingEnrollment = await prisma.courseEnrollment.findFirst({
        where: {
          courseId: courseId,
          studentId: estudianteId
        },
        include: {
          student: { select: { email: true } }
        }
      });

      if (!existingEnrollment) {
        throw new CustomError('Student is not enrolled in this course', 404);
      }

      // Eliminar matrícula
      await prisma.courseEnrollment.delete({
        where: { id: existingEnrollment.id }
      });

      const response: ApiResponse = {
        success: true,
        message: 'Student successfully unenrolled from course',
        data: {
          course: { 
            id: course.id, 
            nombre: course.nombre, 
            codigo: course.codigo 
          },
          student: { 
            id: estudianteId, 
            email: existingEnrollment.student.email 
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

export const courseController = new CourseController();
