import { Request, Response, NextFunction } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { CustomError } from '../../middleware/errorHandler';
import { UserRole } from '../../types';
import { 
  createExamSchema,
  updateExamSchema,
  examFiltersSchema,
  submitExamSchema,
  gradeSubmissionSchema
} from './examSchemas';
import type {
  CreateExamRequest,
  UpdateExamRequest,
  ExamFilters,
  SubmitExamRequest,
  GradeSubmissionRequest
} from './examSchemas';
import type { ApiResponse, PaginatedResponse } from '../../types';

export class ExamController {
  /**
   * GET /api/exams
   * Obtener lista de exámenes con filtros y paginación
   */
  async getExams(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = examFiltersSchema.parse(req.query) as ExamFilters;
      const { search, courseId, tipo, isActive, docenteId, startDate, endDate, page, limit } = filters;

      // Construir condiciones de búsqueda
      const whereClause: Prisma.ExamWhereInput = {};
      const andConditions: Prisma.ExamWhereInput[] = [];

      if (search) {
        whereClause.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { descripcion: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (courseId) {
        whereClause.courseId = courseId;
      }

      if (tipo) {
        whereClause.type = tipo;
      }

      if (isActive !== undefined) {
        whereClause.isActive = isActive;
      }

      if (startDate) {
        whereClause.fechaApertura = {
          ...(whereClause.fechaApertura as Prisma.DateTimeNullableFilter | undefined),
          gte: new Date(startDate)
        };
      }

      if (endDate) {
        whereClause.fechaCierre = {
          ...(whereClause.fechaCierre as Prisma.DateTimeNullableFilter | undefined),
          lte: new Date(endDate)
        };
      }

      // Filtros específicos por rol
      if (req.user?.role === UserRole.DOCENTE) {
        andConditions.push({
          course: {
            docenteId: req.user.id
          }
        });
      }

      if (req.user?.role === UserRole.ESTUDIANTE) {
        andConditions.push(
          { isActive: true },
          {
            course: {
              enrollments: {
                some: { studentId: req.user.id }
              }
            }
          }
        );
      }

      // Si se especifica docenteId (solo admin)
      if (docenteId && req.user?.role === UserRole.ADMIN) {
        andConditions.push({
          course: {
            docenteId
          }
        });
      }

      if (andConditions.length > 0) {
        if (whereClause.AND) {
          whereClause.AND = Array.isArray(whereClause.AND)
            ? [...whereClause.AND, ...andConditions]
            : [whereClause.AND, ...andConditions];
        } else {
          whereClause.AND = andConditions;
        }
      }

      const offset = (page - 1) * limit;

      const submissionsInclude: Prisma.Exam$submissionsArgs = req.user?.role === UserRole.ESTUDIANTE
        ? {
            where: { studentId: req.user.id },
            select: {
              id: true,
              submittedAt: true,
              finalScore: true,
              maxScore: true
            }
          }
        : {
            select: {
              id: true,
              studentId: true,
              submittedAt: true,
              finalScore: true,
              maxScore: true
            }
          };

      // Obtener exámenes y total
      const [exams, total] = await Promise.all([
        prisma.exam.findMany({
          where: whereClause,
          include: {
            course: {
              select: {
                id: true,
                nombre: true,
                codigo: true,
                docente: {
                  select: {
                    id: true,
                    email: true
                  }
                }
              }
            },
            questions: {
              select: {
                id: true,
                tipo: true,
                puntos: true
              }
            },
            submissions: submissionsInclude
          },
          skip: offset,
          take: limit,
          orderBy: [
            { fechaApertura: 'desc' },
            { createdAt: 'desc' }
          ]
        }),
        prisma.exam.count({ where: whereClause })
      ]);

      // Formatear respuesta
      const formattedExams = exams.map((exam) => {
        const now = new Date();
        const openDate = exam.fechaApertura ? new Date(exam.fechaApertura) : null;
        const closeDate = exam.fechaCierre ? new Date(exam.fechaCierre) : null;

        let status = 'upcoming';
        if (openDate && closeDate) {
          if (now >= openDate && now <= closeDate) status = 'active';
          else if (now > closeDate) status = 'closed';
        } else if (openDate && now >= openDate) {
          status = 'active';
        }

        const totalSubmissions = exam.submissions.length;
        const submissionScores = exam.submissions
          .map((sub) => sub.finalScore ?? 0)
          .filter((score) => score !== null && score !== undefined);
        const averageScore = submissionScores.length > 0
          ? submissionScores.reduce((acc, score) => acc + (score ?? 0), 0) / submissionScores.length
          : null;

        return {
          id: exam.id,
          titulo: exam.title,
          descripcion: exam.descripcion,
          tipo: exam.type,
          fechaApertura: exam.fechaApertura,
          fechaCierre: exam.fechaCierre,
          duracionMinutos: exam.duracionMinutos,
          intentosPermitidos: exam.intentosPermitidos,
          puntuacionMaxima: exam.puntuacionMaxima,
          isActive: exam.isActive,
          status,
          course: exam.course,
          stats: {
            totalQuestions: exam.questions.length,
            totalSubmissions,
            // Solo mostrar para docentes/admin
            ...(req.user?.role !== UserRole.ESTUDIANTE && {
              averageScore
            })
          },
          // Mostrar mi envío si soy estudiante
          ...(req.user?.role === UserRole.ESTUDIANTE && exam.submissions.length > 0 && {
            mySubmission: exam.submissions[0]
          })
        };
      });

      const response: ApiResponse<PaginatedResponse<typeof formattedExams[0]>> = {
        success: true,
        message: 'Exams retrieved successfully',
        data: {
          items: formattedExams,
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
   * GET /api/exams/:id
   * Obtener detalles de un examen específico
   */
  async getExamById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const examId = req.params.id;
      if (!examId) {
        throw new CustomError('Exam ID is required', 400);
      }

      const submissionsInclude: Prisma.Exam$submissionsArgs = req.user?.role === UserRole.ESTUDIANTE
        ? {
            where: { studentId: req.user.id },
            include: {
              answers: {
                include: {
                  question: {
                    select: { id: true, puntos: true }
                  }
                }
              }
            }
          }
        : {
            include: {
              student: {
                select: { id: true, email: true }
              },
              answers: {
                include: {
                  question: {
                    select: { id: true, puntos: true }
                  }
                }
              }
            }
          };

      const exam = await prisma.exam.findUnique({
        where: { id: examId },
        include: {
          course: {
            include: {
              docente: {
                select: {
                  id: true,
                  email: true
                }
              }
            }
          },
          questions: {
            orderBy: { orden: 'asc' },
            select: {
              id: true,
              orden: true,
              tipo: true,
              puntos: true
            }
          },
          submissions: submissionsInclude
        }
      });

      if (!exam) {
        throw new CustomError('Exam not found', 404);
      }

      // Verificar permisos de acceso
      if (req.user?.role === UserRole.ESTUDIANTE) {
        const isEnrolled = await prisma.courseEnrollment.findFirst({
          where: {
            courseId: exam.courseId,
            studentId: req.user.id
          }
        });
        
        if (!isEnrolled) {
          throw new CustomError('Not enrolled in exam course', 403);
        }
      }

      if (req.user?.role === UserRole.DOCENTE && exam.course.docenteId !== req.user.id) {
        throw new CustomError('Not authorized to access this exam', 403);
      }

      // Determinar estado del examen
      const now = new Date();
      const openDate = exam.fechaApertura ? new Date(exam.fechaApertura) : null;
      const closeDate = exam.fechaCierre ? new Date(exam.fechaCierre) : null;
      
      let status = 'upcoming';
      if (openDate && closeDate) {
        if (now >= openDate && now <= closeDate) status = 'active';
        else if (now > closeDate) status = 'closed';
      } else if (openDate && now >= openDate) {
        status = 'active';
      }

      const attemptsTaken = req.user?.role === UserRole.ESTUDIANTE ? exam.submissions.length : 0;

      const response: ApiResponse = {
        success: true,
        message: 'Exam details retrieved successfully',
        data: {
          ...exam,
          status,
          canTakeExam: req.user?.role === UserRole.ESTUDIANTE && 
                      status === 'active' && 
                      attemptsTaken < exam.intentosPermitidos
        },
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/exams
   * Crear nuevo examen (solo Admin/Docente)
   */
  async createExam(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedData = createExamSchema.parse(req.body) as CreateExamRequest;

      // Verificar que el curso existe
      const course = await prisma.course.findUnique({
        where: { id: validatedData.courseId }
      });

      if (!course) {
        throw new CustomError('Course not found', 404);
      }

      // Verificar permisos: Admin o docente del curso
      if (req.user?.role === UserRole.DOCENTE && course.docenteId !== req.user.id) {
        throw new CustomError('Not authorized to create exam for this course', 403);
      }

      // Crear examen
      const exam = await prisma.exam.create({
        data: {
          courseId: validatedData.courseId,
          title: validatedData.titulo,
          descripcion: validatedData.descripcion ?? null,
          type: validatedData.tipo,
          fechaApertura: new Date(validatedData.fechaApertura),
          fechaCierre: new Date(validatedData.fechaCierre),
          duracionMinutos: validatedData.duracionMinutos,
          intentosPermitidos: validatedData.intentosPermitidos,
          puntuacionMaxima: validatedData.puntuacionMaxima,
          configuracion: (validatedData.configuracion ?? {}) as Prisma.JsonObject,
          isActive: validatedData.isActive ?? true,
          createdById: req.user?.id ?? course.docenteId
        },
        include: {
          course: {
            select: {
              id: true,
              nombre: true,
              codigo: true
            }
          }
        }
      });

      const response: ApiResponse = {
        success: true,
        message: 'Exam created successfully',
        data: exam,
        timestamp: new Date().toISOString()
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/exams/:id
   * Actualizar examen existente
   */
  async updateExam(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const examId = req.params.id;
      if (!examId) {
        throw new CustomError('Exam ID is required', 400);
      }

      const validatedData = updateExamSchema.parse(req.body) as UpdateExamRequest;

      const existingExam = await prisma.exam.findUnique({
        where: { id: examId },
        include: { course: true }
      });

      if (!existingExam) {
        throw new CustomError('Exam not found', 404);
      }

      // Verificar permisos
      if (req.user?.role === UserRole.DOCENTE && 
          existingExam.course.docenteId !== req.user.id) {
        throw new CustomError('Not authorized to modify this exam', 403);
      }

      // Verificar que no se modifique un examen con envíos
      const hasSubmissions = await prisma.submission.count({
        where: { examId }
      });

      if (hasSubmissions > 0 && (validatedData.fechaApertura || validatedData.fechaCierre)) {
        throw new CustomError('Cannot modify dates of exam with submissions', 400);
      }

      // Preparar datos de actualización
      const updateData: Prisma.ExamUpdateInput = {};
      if (validatedData.titulo !== undefined) updateData.title = validatedData.titulo;
      if (validatedData.descripcion !== undefined) updateData.descripcion = validatedData.descripcion;
      if (validatedData.isActive !== undefined) updateData.isActive = validatedData.isActive;
      if (validatedData.duracionMinutos !== undefined) updateData.duracionMinutos = validatedData.duracionMinutos;
      if (validatedData.puntuacionMaxima !== undefined) updateData.puntuacionMaxima = validatedData.puntuacionMaxima;
      if (validatedData.intentosPermitidos !== undefined) updateData.intentosPermitidos = validatedData.intentosPermitidos;
      if (validatedData.tipo !== undefined) updateData.type = validatedData.tipo;
      if (validatedData.configuracion !== undefined) {
        updateData.configuracion = validatedData.configuracion as Prisma.JsonObject;
      }
      if (validatedData.fechaApertura !== undefined) {
        updateData.fechaApertura = new Date(validatedData.fechaApertura);
      }
      if (validatedData.fechaCierre !== undefined) {
        updateData.fechaCierre = new Date(validatedData.fechaCierre);
      }

      // Actualizar examen
      const updatedExam = await prisma.exam.update({
        where: { id: examId },
        data: updateData,
        include: {
          course: {
            select: {
              id: true,
              nombre: true,
              codigo: true
            }
          }
        }
      });

      const response: ApiResponse = {
        success: true,
        message: 'Exam updated successfully',
        data: updatedExam,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/exams/:id
   * Eliminar examen (solo Admin o docente sin envíos)
   */
  async deleteExam(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const examId = req.params.id;
      if (!examId) {
        throw new CustomError('Exam ID is required', 400);
      }

      const exam = await prisma.exam.findUnique({
        where: { id: examId },
        include: { 
          course: true,
          submissions: true,
          questions: true 
        }
      });

      if (!exam) {
        throw new CustomError('Exam not found', 404);
      }

      // Solo admin o docente del curso
      if (req.user?.role === UserRole.DOCENTE && exam.course.docenteId !== req.user.id) {
        throw new CustomError('Not authorized to delete this exam', 403);
      }

      // Verificar si hay envíos
      if (exam.submissions.length > 0) {
        throw new CustomError('Cannot delete exam with submissions', 400);
      }

      await prisma.exam.delete({ where: { id: examId } });

      const response: ApiResponse = {
        success: true,
        message: 'Exam deleted successfully',
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/exams/:id/submit
   * Enviar respuestas de examen (estudiante)
   */
  async submitExam(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const examId = req.params.id;
      if (!examId) {
        throw new CustomError('Exam ID is required', 400);
      }

      if (!req.user?.id) {
        throw new CustomError('Authentication required', 401);
      }

      const validatedData = submitExamSchema.parse(req.body) as SubmitExamRequest;

      // Verificar que el examen existe y está activo
      const exam = await prisma.exam.findUnique({
        where: { id: examId },
        include: {
          course: {
            include: {
              enrollments: {
                where: { studentId: req.user.id }
              }
            }
          },
          questions: {
            orderBy: { orden: 'asc' }
          }
        }
      });

      if (!exam) {
        throw new CustomError('Exam not found', 404);
      }

      // Verificar que el estudiante está matriculado
      if (exam.course.enrollments.length === 0) {
        throw new CustomError('Not enrolled in exam course', 403);
      }

      // Verificar que el examen está activo
      const now = new Date();
      const openDate = exam.fechaApertura ? new Date(exam.fechaApertura) : null;
      const closeDate = exam.fechaCierre ? new Date(exam.fechaCierre) : null;

      if (openDate && now < openDate) {
        throw new CustomError('Exam not yet open', 400);
      }

      if (closeDate && now > closeDate) {
        throw new CustomError('Exam submission deadline has passed', 400);
      }

      // Verificar intentos restantes
      const previousSubmissions = await prisma.submission.count({
        where: {
          examId,
          studentId: req.user.id
        }
      });

      if (previousSubmissions >= exam.intentosPermitidos) {
        throw new CustomError('Maximum attempts exceeded', 400);
      }

      // Verificar que todas las preguntas requeridas tienen respuesta
      const questionIds = exam.questions.map((q) => q.id);
      const answeredQuestionIds = validatedData.answers.map((a) => a.questionId);
      
      const missingQuestions = questionIds.filter(qId => !answeredQuestionIds.includes(qId));
      if (missingQuestions.length > 0) {
        throw new CustomError('All questions must be answered', 400);
      }

      // Crear submission y respuestas en transacción
      const submission = await prisma.$transaction(async (tx) => {
        // Crear submission
        const newSubmission = await tx.submission.create({
          data: {
            examId,
            studentId: req.user!.id,
            submittedAt: new Date()
          }
        });

        // Crear respuestas
        await tx.answer.createMany({
          data: validatedData.answers.map(answer => ({
            submissionId: newSubmission.id,
            questionId: answer.questionId,
            rawText: answer.response,
            ocrConfidence: null
          }))
        });

        return newSubmission;
      });

      // TODO: Trigger IA processing job
      // await queueProcessingJob(submission.id);

      const totalTimeSpent = validatedData.totalTimeSpent ?? validatedData.answers.reduce((acc, answer) => acc + (answer.timeSpent ?? 0), 0);

      const response: ApiResponse = {
        success: true,
        message: 'Exam submitted successfully',
        data: {
          submissionId: submission.id,
          submittedAt: submission.submittedAt,
          totalTimeSpent,
          attemptNumber: previousSubmissions + 1,
          maxAttempts: exam.intentosPermitidos
        },
        timestamp: new Date().toISOString()
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/exams/:id/grade
   * Calificar envío manualmente (docente)
   */
  async gradeSubmission(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const examId = req.params.id;
      if (!examId) {
        throw new CustomError('Exam ID is required', 400);
      }

      const { submissionId } = req.query;
      const validatedData = gradeSubmissionSchema.parse(req.body) as GradeSubmissionRequest;

      if (!submissionId || typeof submissionId !== 'string') {
        throw new CustomError('Submission ID is required', 400);
      }

      // Verificar que el examen y submission existen
      const submission = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: {
          exam: {
            include: {
              course: true,
              questions: {
                select: {
                  id: true,
                  puntos: true
                }
              }
            }
          },
          answers: true,
          student: {
            select: {
              id: true,
              email: true
            }
          }
        }
      });

      if (!submission || submission.examId !== examId) {
        throw new CustomError('Submission not found', 404);
      }

      // Verificar permisos: Admin o docente del curso
      if (req.user?.role === UserRole.DOCENTE && 
          submission.exam.course.docenteId !== req.user.id) {
        throw new CustomError('Not authorized to grade this submission', 403);
      }

      // Calcular puntuación total
      let totalScore = 0;
      let maxPossibleScore = 0;

      // Verificar que todas las preguntas calificadas existen
      const questionIds = submission.exam.questions.map((q) => q.id);
      const gradedQuestionIds = validatedData.questionGrades.map((g) => g.questionId);
      
      const invalidQuestions = gradedQuestionIds.filter((qId) => !questionIds.includes(qId));
      if (invalidQuestions.length > 0) {
        throw new CustomError('Invalid question IDs provided', 400);
      }

      // Actualizar calificaciones en transacción
      await prisma.$transaction(async (tx) => {
        for (const grade of validatedData.questionGrades) {
          const question = submission.exam.questions.find((q) => q.id === grade.questionId);
          if (!question) continue;

          maxPossibleScore += question.puntos;
          totalScore += Math.min(grade.score, question.puntos);

          // Actualizar answer con calificación
          await tx.answer.updateMany({
            where: {
              submissionId: submission.id,
              questionId: grade.questionId
            },
            data: {
              rawText: grade.feedback || null
            }
          });
        }

        // Agregar bonus si existe
        totalScore += validatedData.bonus || 0;

        // Actualizar submission con puntuación final
        await tx.submission.update({
          where: { id: submission.id },
          data: {
            finalScore: totalScore,
            maxScore: maxPossibleScore + (validatedData.bonus || 0)
          }
        });
      });

      const denominator = maxPossibleScore + (validatedData.bonus || 0);
      const percentage = denominator > 0 ? (totalScore / denominator) * 100 : 0;

      const response: ApiResponse = {
        success: true,
        message: 'Submission graded successfully',
        data: {
          submissionId: submission.id,
          studentEmail: submission.student.email,
          totalScore,
          maxScore: denominator,
          percentage,
          gradedAt: new Date().toISOString(),
          gradedBy: req.user?.email
        },
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}

export const examController = new ExamController();
