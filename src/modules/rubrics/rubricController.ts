import { Request, Response, NextFunction } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { CustomError } from '../../middleware/errorHandler';
import { UserRole } from '../../types';
import { 
  createRubricSchema,
  updateRubricSchema,
  createCriteriaSchema,
  rubricFiltersSchema,
  duplicateRubricSchema
} from './rubricSchemas';
import type {
  CreateRubricRequest,
  UpdateRubricRequest,
  CreateCriteriaRequest,
  RubricFilters,
  DuplicateRubricRequest
} from './rubricSchemas';
import type { ApiResponse, PaginatedResponse } from '../../types';

export class RubricController {
  /**
   * GET /api/rubrics
   * Obtener lista de rúbricas con filtros y paginación
   */
  async getRubrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = rubricFiltersSchema.parse(req.query) as RubricFilters;
      const { search, examId, isActive, docenteId, page, limit } = filters;

      // Construir condiciones de búsqueda
      const whereClause: Prisma.RubricWhereInput = {};
      const andConditions: Prisma.RubricWhereInput[] = [];

      if (search) {
        whereClause.OR = [
          { question: { exam: { title: { contains: search, mode: 'insensitive' } } } },
          { estructuraJson: { path: ['nombre'], string_contains: search } }
        ];
      }

      const questionFilters: Prisma.QuestionWhereInput = {};

      if (examId) {
        questionFilters.examId = examId;
      }

      if (isActive !== undefined) {
        questionFilters.exam = {
          is: {
            isActive
          }
        };
      }

      if (Object.keys(questionFilters).length > 0) {
        whereClause.question = {
          is: questionFilters
        };
      }

      // Filtros específicos por rol
      if (req.user?.role === UserRole.DOCENTE) {
        andConditions.push({
          question: {
            exam: {
              course: {
                docenteId: req.user.id
              }
            }
          }
        });
      }

      if (docenteId && req.user?.role === UserRole.ADMIN) {
        andConditions.push({
          question: {
            exam: {
              course: {
                docenteId
              }
            }
          }
        });
      }

      if (andConditions.length > 0) {
        whereClause.AND = andConditions;
      }

      const offset = (page - 1) * limit;

      const [rubrics, total] = await Promise.all([
        prisma.rubric.findMany({
          where: whereClause,
          include: {
            question: {
              include: {
                exam: {
                  include: {
                    course: {
                      select: {
                        id: true,
                        nombre: true,
                        codigo: true
                      }
                    }
                  }
                }
              }
            }
          },
          skip: offset,
          take: limit,
          orderBy: { question: { exam: { createdAt: 'desc' } } }
        }),
        prisma.rubric.count({ where: whereClause })
      ]);

      const formattedRubrics = rubrics.map(rubric => {
        const estructura = rubric.estructuraJson as any;
        return {
          id: rubric.id,
          questionId: rubric.questionId,
          nombre: estructura?.nombre || 'Sin nombre',
          descripcion: estructura?.descripcion,
          totalPuntos: estructura?.totalPuntos || 0,
          criteriosCount: estructura?.criterios?.length || 0,
          isActive: estructura?.isActive || true,
          exam: {
            id: rubric.question.exam.id,
            title: rubric.question.exam.title,
            course: rubric.question.exam.course
          },
          createdAt: rubric.question.exam.createdAt
        };
      });

      const response: ApiResponse<PaginatedResponse<typeof formattedRubrics[0]>> = {
        success: true,
        message: 'Rubrics retrieved successfully',
        data: {
          items: formattedRubrics,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasNext: page < Math.ceil(total / limit),
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
   * GET /api/rubrics/:id
   * Obtener detalles de una rúbrica específica
   */
  async getRubricById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rubricId = req.params.id;
      
      if (!rubricId) {
        throw new CustomError('Rubric ID is required', 400);
      }

      const rubric = await prisma.rubric.findUnique({
        where: { id: rubricId },
        include: {
          question: {
            include: {
              exam: {
                include: {
                  course: {
                    include: {
                      docente: {
                        select: { id: true, email: true }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!rubric) {
        throw new CustomError('Rubric not found', 404);
      }

      // Verificar permisos de acceso
      if (req.user?.role === UserRole.DOCENTE && 
          rubric.question.exam.course.docenteId !== req.user.id) {
        throw new CustomError('Not authorized to access this rubric', 403);
      }

      const response: ApiResponse = {
        success: true,
        message: 'Rubric details retrieved successfully',
        data: {
          id: rubric.id,
          questionId: rubric.questionId,
          estructura: rubric.estructuraJson,
          question: rubric.question,
          exam: rubric.question.exam
        },
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/rubrics
   * Crear nueva rúbrica
   */
  async createRubric(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedData = createRubricSchema.parse(req.body) as CreateRubricRequest;

      // Verificar que el examen existe
      const exam = await prisma.exam.findUnique({
        where: { id: validatedData.examId },
        include: { course: true }
      });

      if (!exam) {
        throw new CustomError('Exam not found', 404);
      }

      // Verificar permisos (solo Admin o docente asignado)
      if (req.user?.role === UserRole.DOCENTE && 
          exam.course.docenteId !== req.user.id) {
        throw new CustomError('Not authorized to create rubric for this exam', 403);
      }

      // Crear pregunta primero (si no existe)
      let question = await prisma.question.findFirst({
        where: { examId: validatedData.examId, tipo: 'rubrica' }
      });

      if (!question) {
        question = await prisma.question.create({
          data: {
            examId: validatedData.examId,
            pageNumber: 1,
            tipo: 'rubrica',
            puntos: validatedData.totalPuntos,
            orden: 0
          }
        });
      }

      // Estructura de rúbrica
      const rubricStructure = {
        nombre: validatedData.nombre,
        descripcion: validatedData.descripcion,
        totalPuntos: validatedData.totalPuntos,
        isActive: validatedData.isActive,
        criterios: [],
        createdAt: new Date().toISOString(),
        createdBy: req.user?.id
      };

      // Crear rúbrica
      const rubric = await prisma.rubric.create({
        data: {
          questionId: question.id,
          estructuraJson: rubricStructure as Prisma.JsonObject
        },
        include: {
          question: {
            include: {
              exam: {
                include: {
                  course: {
                    select: { nombre: true, codigo: true }
                  }
                }
              }
            }
          }
        }
      });

      const response: ApiResponse = {
        success: true,
        message: 'Rubric created successfully',
        data: rubric,
        timestamp: new Date().toISOString()
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/rubrics/:id
   * Actualizar rúbrica existente
   */
  async updateRubric(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rubricId = req.params.id;
      const validatedData = updateRubricSchema.parse(req.body) as UpdateRubricRequest;

      if (!rubricId) {
        throw new CustomError('Rubric ID is required', 400);
      }

      // Verificar que la rúbrica existe
      const existingRubric = await prisma.rubric.findUnique({
        where: { id: rubricId },
        include: {
          question: {
            include: {
              exam: {
                include: { course: true }
              }
            }
          }
        }
      });

      if (!existingRubric) {
        throw new CustomError('Rubric not found', 404);
      }

      // Verificar permisos
      if (req.user?.role === UserRole.DOCENTE && 
          existingRubric.question.exam.course.docenteId !== req.user.id) {
        throw new CustomError('Not authorized to modify this rubric', 403);
      }

      // Actualizar estructura JSON
      const currentStructure = existingRubric.estructuraJson as any;
      const updatedStructure = {
        ...currentStructure,
        ...validatedData,
        updatedAt: new Date().toISOString(),
        updatedBy: req.user?.id
      };

      // Actualizar rúbrica
      const updatedRubric = await prisma.rubric.update({
        where: { id: rubricId },
        data: {
          estructuraJson: updatedStructure as Prisma.JsonObject
        },
        include: {
          question: {
            include: {
              exam: {
                include: {
                  course: {
                    select: { nombre: true, codigo: true }
                  }
                }
              }
            }
          }
        }
      });

      // Actualizar puntos en pregunta si cambió totalPuntos
      if (validatedData.totalPuntos) {
        await prisma.question.update({
          where: { id: existingRubric.questionId },
          data: { puntos: validatedData.totalPuntos }
        });
      }

      const response: ApiResponse = {
        success: true,
        message: 'Rubric updated successfully',
        data: updatedRubric,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/rubrics/:id
   * Eliminar rúbrica
   */
  async deleteRubric(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rubricId = req.params.id;

      if (!rubricId) {
        throw new CustomError('Rubric ID is required', 400);
      }

      const rubric = await prisma.rubric.findUnique({
        where: { id: rubricId },
        include: {
          question: {
            include: {
              exam: {
                include: { course: true }
              }
            }
          }
        }
      });

      if (!rubric) {
        throw new CustomError('Rubric not found', 404);
      }

      // Verificar permisos
      if (req.user?.role === UserRole.DOCENTE && 
          rubric.question.exam.course.docenteId !== req.user.id) {
        throw new CustomError('Not authorized to delete this rubric', 403);
      }

      // Verificar si hay calificaciones existentes
      const hasGrades = await prisma.result.findFirst({
        where: { 
          answer: { 
            question: { 
              id: rubric.questionId 
            }
          }
        }
      });

      if (hasGrades) {
        throw new CustomError('Cannot delete rubric with existing grades', 400);
      }

      await prisma.rubric.delete({
        where: { id: rubricId }
      });

      const response: ApiResponse = {
        success: true,
        message: 'Rubric deleted successfully',
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/rubrics/:id/criteria
   * Agregar criterio a rúbrica
   */
  async addCriteria(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rubricId = req.params.id;
      const validatedData = createCriteriaSchema.parse({
        ...req.body,
        rubricId
      }) as CreateCriteriaRequest;

      if (!rubricId) {
        throw new CustomError('Rubric ID is required', 400);
      }

      const rubric = await prisma.rubric.findUnique({
        where: { id: rubricId },
        include: {
          question: {
            include: {
              exam: {
                include: { course: true }
              }
            }
          }
        }
      });

      if (!rubric) {
        throw new CustomError('Rubric not found', 404);
      }

      // Verificar permisos
      if (req.user?.role === UserRole.DOCENTE && 
          rubric.question.exam.course.docenteId !== req.user.id) {
        throw new CustomError('Not authorized to modify this rubric', 403);
      }

      // Actualizar estructura JSON con nuevo criterio
      const currentStructure = rubric.estructuraJson as any;
      const newCriteria = {
        id: `criteria_${Date.now()}`,
        ...validatedData,
        createdAt: new Date().toISOString()
      };

      const updatedStructure = {
        ...currentStructure,
        criterios: [...(currentStructure.criterios || []), newCriteria],
        updatedAt: new Date().toISOString()
      };

      const updatedRubric = await prisma.rubric.update({
        where: { id: rubricId },
        data: {
          estructuraJson: updatedStructure as Prisma.JsonObject
        }
      });

      const response: ApiResponse = {
        success: true,
        message: 'Criteria added successfully',
        data: {
          rubric: updatedRubric,
          newCriteria
        },
        timestamp: new Date().toISOString()
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/rubrics/:id/duplicate
   * Duplicar rúbrica a otro examen
   */
  async duplicateRubric(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rubricId = req.params.id;
      const validatedData = duplicateRubricSchema.parse(req.body) as DuplicateRubricRequest;

      if (!rubricId) {
        throw new CustomError('Rubric ID is required', 400);
      }

      // Verificar rúbrica original
      const originalRubric = await prisma.rubric.findUnique({
        where: { id: rubricId },
        include: {
          question: {
            include: {
              exam: {
                include: { course: true }
              }
            }
          }
        }
      });

      if (!originalRubric) {
        throw new CustomError('Original rubric not found', 404);
      }

      // Verificar examen destino
      const targetExam = await prisma.exam.findUnique({
        where: { id: validatedData.newExamId },
        include: { course: true }
      });

      if (!targetExam) {
        throw new CustomError('Target exam not found', 404);
      }

      // Verificar permisos
      if (req.user?.role === UserRole.DOCENTE && 
          (originalRubric.question.exam.course.docenteId !== req.user.id ||
           targetExam.course.docenteId !== req.user.id)) {
        throw new CustomError('Not authorized to duplicate this rubric', 403);
      }

      // Crear pregunta para el nuevo examen
      let targetQuestion = await prisma.question.findFirst({
        where: { examId: validatedData.newExamId, tipo: 'rubrica' }
      });

      if (!targetQuestion) {
        const originalStructure = originalRubric.estructuraJson as any;
        targetQuestion = await prisma.question.create({
          data: {
            examId: validatedData.newExamId,
            pageNumber: 1,
            tipo: 'rubrica',
            puntos: originalStructure.totalPuntos || 100,
            orden: 0
          }
        });
      }

      // Duplicar estructura
      const originalStructure = originalRubric.estructuraJson as any;
      const duplicatedStructure = {
        ...originalStructure,
        nombre: validatedData.newName,
        originalRubricId: rubricId,
        createdAt: new Date().toISOString(),
        createdBy: req.user?.id
      };

      // Si no se copian las calificaciones, limpiar datos de calificación
      if (!validatedData.copyGrades) {
        duplicatedStructure.criterios = (duplicatedStructure.criterios || []).map((criterio: any) => ({
          ...criterio,
          calificaciones: undefined,
          promedioCalificacion: undefined
        }));
      }

      const duplicatedRubric = await prisma.rubric.create({
        data: {
          questionId: targetQuestion.id,
          estructuraJson: duplicatedStructure as Prisma.JsonObject
        }
      });

      const response: ApiResponse = {
        success: true,
        message: 'Rubric duplicated successfully',
        data: {
          original: originalRubric,
          duplicated: duplicatedRubric
        },
        timestamp: new Date().toISOString()
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }
}

export const rubricController = new RubricController();
