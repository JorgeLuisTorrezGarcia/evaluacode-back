/* eslint-env node */
/* global console, fetch, Buffer */
import { NextFunction, Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import {
  type Content,
  type EnhancedGenerateContentResponse,
  type GenerateContentCandidate,
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
  GoogleGenerativeAIResponseError,
  HarmBlockThreshold,
  HarmCategory,
  type Part,
  type SafetySetting
} from '@google/generative-ai';
import { env } from 'process';
import { prisma } from '../../lib/prisma';
import { CustomError } from '../../middleware/errorHandler';
import { UserRole } from '../../types';
import { 
  createExamSchema,
  examFiltersSchema,
  generateAiScoreSchema,
  generateFeedbackSchema,
  gradeSubmissionSchema,
  submitExamSchema,
  updateExamSchema
} from './examSchemas';
import type {
  CreateExamRequest,
  ExamFilters,
  GenerateAiScoreRequest,
  GenerateFeedbackRequest,
  GradeSubmissionRequest,
  SubmitExamRequest,
  UpdateExamRequest
} from './examSchemas';
import type { ApiResponse } from '../../types';

function escapeCsvValue(input: unknown): string {
  if (input === null || input === undefined) {
    return '""';
  }

  const stringValue = String(input)
    .replace(/\r?\n|\r/g, ' ')
    .replace(/"/g, '""');

  return `"${stringValue}"`;
}

function formatAnswerForExport(questionType: string, rawText: string | null): string {
  if (!rawText) {
    return '';
  }

  try {
    switch (questionType) {
      case 'file_upload': {
        const parsed = JSON.parse(rawText);
        if (Array.isArray(parsed)) {
          return parsed
            .map((file) => {
              if (typeof file === 'string') return file;
              if (file && typeof file === 'object') {
                const candidate = (file.url as string) ?? (file.secureUrl as string);
                const label = (file.name as string) ?? (file.originalFilename as string);
                return label ? `${label} (${candidate ?? 'sin URL'})` : candidate ?? '';
              }
              return '';
            })
            .filter(Boolean)
            .join(' | ');
        }
        return rawText;
      }
      case 'multiple_choice': {
        const parsed = JSON.parse(rawText);
        if (Array.isArray(parsed)) {
          return parsed.join(' | ');
        }
        if (typeof parsed === 'string') {
          return parsed;
        }
        return rawText;
      }
      default:
        return rawText;
    }
  } catch {
    // Si el contenido no es JSON válido regresamos el texto original
    return rawText;
  }
}

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

      const totalPages = Math.ceil(total / limit);

      const response: ApiResponse = {
        success: true,
        message: 'Exams retrieved successfully',
        data: {
          exams: formattedExams,
          totalExams: total,
          totalPages,
          currentPage: page,
          hasNext: page < totalPages,
          hasPrevious: page > 1
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
              puntos: true,
              title: true,
              prompt: true,
              pageNumber: true,
              configJson: true,
              bbox: true
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

      const formattedQuestions = exam.questions.map((question) => ({
        id: question.id,
        orden: question.orden,
        tipo: question.tipo,
        puntos: question.puntos,
        title: question.title,
        prompt: question.prompt,
        pageNumber: question.pageNumber,
        config: question.configJson ?? null,
        bbox: question.bbox ?? null
      }));

      const response: ApiResponse = {
        success: true,
        message: 'Exam details retrieved successfully',
        data: {
          ...exam,
          questions: formattedQuestions,
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
      const bonus = validatedData.bonus ?? 0;

      await prisma.$transaction(async (tx) => {
        for (const grade of validatedData.questionGrades) {
          const question = submission.exam.questions.find((q) => q.id === grade.questionId);
          if (!question) continue;

          maxPossibleScore += question.puntos;
          totalScore += Math.min(grade.score, question.puntos);

          // Actualizar answer con calificación manual
          await tx.answer.updateMany({
            where: {
              submissionId: submission.id,
              questionId: grade.questionId
            },
            data: {
              manualScore: Math.min(grade.score, question.puntos),
              manualFeedback: grade.feedback ?? null
            }
          });
        }

        // Actualizar submission con puntuación final y feedback general
        await tx.submission.update({
          where: { id: submission.id },
          data: {
            finalScore: totalScore + bonus,
            maxScore: maxPossibleScore + bonus,
            generalFeedback: validatedData.generalFeedback ?? null,
            bonusAwarded: bonus
          }
        });
      });

      const denominator = maxPossibleScore + bonus;
      const percentage = denominator > 0 ? ((totalScore + bonus) / denominator) * 100 : 0;

      const response: ApiResponse = {
        success: true,
        message: 'Submission graded successfully',
        data: {
          submissionId: submission.id,
          studentEmail: submission.student.email,
          totalScore: totalScore + bonus,
          maxScore: denominator,
          percentage,
          bonusAwarded: bonus,
          generalFeedback: validatedData.generalFeedback ?? null,
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

  /**
   * GET /api/exams/:id/export
   * Exportar resultados del examen en CSV
   */
  async exportExamResults(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const examId = req.params.id;
      if (!examId) {
        throw new CustomError('Exam ID is required', 400);
      }

      if (!req.user?.id) {
        throw new CustomError('Authentication required', 401);
      }

      const exam = await prisma.exam.findUnique({
        where: { id: examId },
        include: {
          course: {
            select: {
              id: true,
              docenteId: true,
              nombre: true
            }
          },
          questions: {
            orderBy: { orden: 'asc' },
            select: {
              id: true,
              orden: true,
              title: true,
              tipo: true,
              puntos: true
            }
          },
          submissions: {
            orderBy: { submittedAt: 'asc' },
            select: {
              id: true,
              submittedAt: true,
              finalScore: true,
              maxScore: true,
              bonusAwarded: true,
              generalFeedback: true,
              student: {
                select: {
                  id: true,
                  email: true
                }
              },
              answers: {
                select: {
                  id: true,
                  questionId: true,
                  rawText: true,
                  manualScore: true,
                  manualFeedback: true,
                  question: {
                    select: {
                      id: true,
                      tipo: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!exam) {
        throw new CustomError('Exam not found', 404);
      }

      // Verificar permisos
      if (req.user.role === UserRole.DOCENTE && exam.course.docenteId !== req.user.id) {
        throw new CustomError('Not authorized to export this exam', 403);
      }

      if (req.user.role === UserRole.ESTUDIANTE) {
        throw new CustomError('Students cannot export exam results', 403);
      }

      const headers: string[] = [
        'ID estudiante',
        'Email estudiante',
        'Intento',
        'Fecha de envío (ISO)',
        'Estado',
        'Puntaje obtenido',
        'Puntaje máximo',
        'Bonificación',
        'Feedback general'
      ];

      exam.questions.forEach((question, index) => {
        const label = question.title?.trim() || `Pregunta ${index + 1}`;
        headers.push(
          `${label} - Respuesta`,
          `${label} - Puntaje`,
          `${label} - Retroalimentación`
        );
      });

      const rows: string[][] = [headers];

      exam.submissions.forEach((submission, index) => {
        const isGraded = submission.finalScore !== null && submission.maxScore !== null;
        const answersByQuestionId = new Map(
          submission.answers.map((answer) => [answer.questionId, answer])
        );

        const baseRow: string[] = [
          submission.student?.id ?? '',
          submission.student?.email ?? '',
          String(index + 1),
          submission.submittedAt.toISOString(),
          isGraded ? 'Calificado' : 'Pendiente',
          isGraded && submission.finalScore !== null ? submission.finalScore.toString() : '',
          isGraded && submission.maxScore !== null ? submission.maxScore.toString() : '',
          submission.bonusAwarded !== null && submission.bonusAwarded !== undefined
            ? submission.bonusAwarded.toString()
            : '',
          submission.generalFeedback ?? ''
        ];

        exam.questions.forEach((question) => {
          const answer = answersByQuestionId.get(question.id);
          const formattedAnswer = formatAnswerForExport(question.tipo, answer?.rawText ?? null);
          baseRow.push(
            formattedAnswer,
            answer?.manualScore !== null && answer?.manualScore !== undefined
              ? answer.manualScore.toString()
              : '',
            answer?.manualFeedback ?? ''
          );
        });

        rows.push(baseRow);
      });

      const csvContent = '\uFEFF' + rows.map((row) => row.map(escapeCsvValue).join(',')).join('\r\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="exam-${examId}-resultados.csv"`
      );

      res.status(200).send(csvContent);
    } catch (error) {
      next(error);
    }
  }

  private getGeminiClient() {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new CustomError('Gemini API key is not configured', 500);
    }

    return new GoogleGenerativeAI(apiKey);
  }

  /**
   * POST /api/exams/:id/submissions/:submissionId/ai-feedback
   * Generar retroalimentación automática con Gemini
   */
  async generateAIReview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const examId = req.params.id;
      const submissionId = req.params.submissionId;

      if (!examId || !submissionId) {
        throw new CustomError('Exam ID and submission ID are required', 400);
      }

      if (!req.user?.id) {
        throw new CustomError('Authentication required', 401);
      }

      const validatedBody = generateFeedbackSchema.parse(req.body) as GenerateFeedbackRequest;

      const submission = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: {
          exam: {
            include: {
              course: {
                select: {
                  docenteId: true
                }
              },
              questions: {
                select: {
                  id: true,
                  title: true,
                  prompt: true,
                  tipo: true,
                  puntos: true
                }
              }
            }
          },
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

      if (req.user.role === UserRole.DOCENTE && submission.exam.course.docenteId !== req.user.id) {
        throw new CustomError('Not authorized to review this submission', 403);
      }

      if (req.user.role === UserRole.ESTUDIANTE) {
        throw new CustomError('Students cannot request AI review', 403);
      }

      const question = submission.exam.questions.find((q) => q.id === validatedBody.questionId);
      if (!question) {
        throw new CustomError('Question not found in this exam', 400);
      }

      const aiClient = this.getGeminiClient();
      const model = validatedBody.model ?? 'gemini-2.5-flash';
      const generativeModel = aiClient.getGenerativeModel({ model });

      const userParts: Part[] = [];

      const promptText = `Eres un docente de programacion. Analiza esta respuesta que puede ser texto o archivo adjunto en url y proporciona retroalimentación constructiva y en texto plano(NO MARKDOWN).

CONSIGNA: ${question.title ?? 'Sin título'}
DESCRIPCIÓN: ${question.prompt ?? 'Sin descripción'}

Proporciona una retroalimentación que incluya:
1. Fortalezas de la respuesta
2. Áreas de mejora
3. Sugerencias específicas
4. Conceptos clave que faltan o podrían reforzarse

Respuesta del estudiante:`;

      userParts.push({ text: promptText });

      const studentAnswer = validatedBody.studentAnswer ?? 'Sin respuesta proporcionada';
      
      // Extraer URL si está en formato "nombre: url"
      let imageUrl: string | null = null;
      let cleanAnswer = studentAnswer;
      
      if (studentAnswer.includes(':') && studentAnswer.includes('http')) {
        const parts = studentAnswer.split(':');
        if (parts.length >= 2 && parts[parts.length - 1]) {
          imageUrl = parts[parts.length - 1]!.trim();
          cleanAnswer = parts.slice(0, -1).join(':').trim();
        }
      } else if (studentAnswer.startsWith('http')) {
        imageUrl = studentAnswer;
        cleanAnswer = '';
      }
      
      const isCloudinaryAsset = imageUrl !== null;

      if (isCloudinaryAsset) {
        try {
          // Descargar la imagen desde Cloudinary
          const imageResponse = await fetch(imageUrl!);
          if (!imageResponse.ok) {
            throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
          }
          
          const imageBuffer = await imageResponse.arrayBuffer();
          const imageBase64 = Buffer.from(imageBuffer).toString('base64');
          
          // Determinar el MIME type desde la URL o por defecto
          const mimeType = imageUrl!.includes('.png') ? 'image/png' : 
                          imageUrl!.includes('.jpg') || imageUrl!.includes('.jpeg') ? 'image/jpeg' : 
                          'image/png';
          
          userParts.push({
            inlineData: {
              mimeType: mimeType,
              data: imageBase64
            }
          });
          
          console.info('[AI][generateAIReview] Imagen procesada', {
            imageUrl,
            mimeType,
            sizeBytes: imageBuffer.byteLength
          });
        } catch (error) {
          console.error('[AI][generateAIReview] Error procesando imagen', {
            imageUrl,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          
          // Fallback: enviar solo la URL como texto
          userParts.push({
            text: `El estudiante envió un recurso visual. URL: ${imageUrl}`
          });
        }
      }
      
      // Siempre agregar la respuesta de texto (limpia)
      if (cleanAnswer) {
        userParts.push({
          text: `Respuesta del estudiante:\n${cleanAnswer}`
        });
      } else if (!isCloudinaryAsset) {
        userParts.push({
          text: `Respuesta del estudiante:\n${studentAnswer}`
        });
      }

      if (validatedBody.context) {
        userParts.push({ text: `Contexto adicional proporcionado por el docente:\n${validatedBody.context}` });
      }

      const content: Content[] = [{
        role: 'user',
        parts: userParts
      }];


      let aiResponse: EnhancedGenerateContentResponse | null = null;
      try {
        const safetySettings: SafetySetting[] = [
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE }
        ];

        const generation = await generativeModel.generateContent({
          contents: content,
          safetySettings
        });
        aiResponse = generation.response;

        console.info('[AI][generateAIReview] Respuesta recibida', {
          hasResponse: Boolean(aiResponse),
          candidates: aiResponse?.candidates?.length ?? 0,
          promptFeedback: aiResponse?.promptFeedback ?? null,
          usage: aiResponse?.usageMetadata ?? null
        });
      } catch (error: unknown) {
        if (error instanceof GoogleGenerativeAIFetchError) {
          console.error('[AI][generateAIReview] GoogleGenerativeAIFetchError capturado', {
            status: error.status ?? null,
            statusText: error.statusText ?? null,
            message: error.message,
            errorDetails: error.errorDetails ?? null
          });
          throw new CustomError(`Gemini API error: ${error.message}`, error.status ?? 502);
        }

        if (error instanceof GoogleGenerativeAIResponseError) {
          console.error('[AI][generateAIReview] GoogleGenerativeAIResponseError capturado', {
            message: error.message,
            response: error.response ?? null
          });
          throw new CustomError(`Gemini respondió con error: ${error.message}`, 502);
        }

        console.error('[AI][generateAIReview] Error no controlado al invocar Gemini', error);
        throw error;
      }

      if (!aiResponse) {
        console.error('[AI][generateAIReview] Respuesta vacía de Gemini', {
          examId,
          submissionId,
          model
        });
        throw new CustomError('Gemini no devolvió respuesta', 502);
      }

      const blockReason = aiResponse.promptFeedback?.blockReason;
      if (blockReason) {
        console.warn('[AI][generateAIReview] Solicitud bloqueada por Gemini', {
          blockReason,
          examId,
          submissionId,
          model
        });
        throw new CustomError(`Gemini bloqueó la generación (${blockReason})`, 422);
      }

      const textPieces = (aiResponse.candidates ?? [])
        .flatMap((candidate) => candidate.content?.parts ?? [])
        .map((part: Part) => {
          if ('text' in part && typeof part.text === 'string') {
            return part.text.trim();
          }
          return null;
        })
        .filter((piece): piece is string => Boolean(piece));

      const text = textPieces.length > 0 ? textPieces.join('\n').trim() : null;

      if (!text) {
        const finishReasons = (aiResponse.candidates ?? [])
          .map((candidate: GenerateContentCandidate): string | undefined => candidate.finishReason)
          .filter((reason): reason is string => Boolean(reason));
        console.error('[AI][generateAIReview] Gemini no generó texto', {
          examId,
          submissionId,
          model,
          candidates: aiResponse.candidates ?? null,
          finishReasons
        });
        const reasonSuffix = finishReasons.length > 0 ? ` (motivos: ${finishReasons.join(', ')})` : '';
        throw new CustomError(`Gemini no generó texto${reasonSuffix}`, 502);
      }

      console.info('[AI][generateAIReview] Retroalimentación generada correctamente', {
        examId,
        submissionId,
        model,
        feedbackPreview: text.slice(0, 160)
      });

      const apiResponse: ApiResponse = {
        success: true,
        message: 'AI feedback generated successfully',
        data: {
          feedback: text,
          model
        },
        timestamp: new Date().toISOString()
      };

      res.status(200).json(apiResponse);
    } catch (error) {
      if (error instanceof GoogleGenerativeAIFetchError || error instanceof GoogleGenerativeAIResponseError) {
        console.error('[AI][generateAIReview] Error de Gemini', {
          examId: req.params.id,
          submissionId: req.params.submissionId,
          error: error.message
        });
        throw new CustomError(`Error al comunicarse con Gemini: ${error.message}`, 502);
      }
      next(error);
    }
  }

  /**
   * POST /api/exams/:id/submissions/:submissionId/ai-score
   * Generar calificación automática con Gemini
   */
  async generateAIScore(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const examId = req.params.id;
      const submissionId = req.params.submissionId;

      if (!examId || !submissionId) {
        throw new CustomError('Exam ID and submission ID are required', 400);
      }

      if (!req.user?.id) {
        throw new CustomError('Authentication required', 401);
      }

      const validatedBody = generateAiScoreSchema.parse(req.body) as GenerateAiScoreRequest;

      const submission = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: {
          exam: {
            include: {
              course: {
                select: {
                  docenteId: true
                }
              },
              questions: {
                select: {
                  id: true,
                  title: true,
                  prompt: true,
                  tipo: true,
                  puntos: true
                }
              }
            }
          },
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

      if (req.user.role === UserRole.DOCENTE && submission.exam.course.docenteId !== req.user.id) {
        throw new CustomError('Not authorized to score this submission', 403);
      }

      if (req.user.role === UserRole.ESTUDIANTE) {
        throw new CustomError('Students cannot request AI scoring', 403);
      }

      const question = submission.exam.questions.find((q) => q.id === validatedBody.questionId);
      if (!question) {
        throw new CustomError('Question not found in this exam', 400);
      }

      const aiClient = this.getGeminiClient();
      const model = validatedBody.model ?? 'gemini-2.5-flash';
      const generativeModel = aiClient.getGenerativeModel({ model });

      const userParts: Part[] = [];

      // Prompt simple para calificación con delimitadores
      const promptText = `Eres un evaluador experto. Analiza esta respuesta y asigna un puntaje de 0 a ${validatedBody.maxPoints} puntos.
      
      CONSIGNA: ${question.title ?? 'Sin título'}
      DESCRIPCIÓN: ${question.prompt ?? 'Sin descripción'}
      
      Envuelve la puntuación final entre asteriscos así: *puntuación*
      Ejemplo: *7.5*
      
      Respuesta del estudiante:`;

      userParts.push({ text: promptText });

      const studentAnswer = validatedBody.studentAnswer ?? 'Sin respuesta proporcionada';
      const isCloudinaryAsset = studentAnswer.startsWith('http');

      if (isCloudinaryAsset) {
        userParts.push({
          text: `El estudiante envió un recurso visual. URL: ${studentAnswer}`
        });
      } else {
        userParts.push({
          text: `Respuesta del estudiante:\n${studentAnswer}`
        });
      }

      if (validatedBody.context) {
        userParts.push({ text: `Contexto adicional del docente:\n${validatedBody.context}` });
      }

      const content: Content[] = [{
        role: 'user',
        parts: userParts
      }];

      console.info('[AI][generateAIScore] Preparando solicitud de calificación', {
        examId: req.params.id,
        submissionId: req.params.submissionId,
        questionId: question.id,
        model,
        maxPoints: validatedBody.maxPoints,
        questionType: validatedBody.questionType,
        role: req.user.role,
        hasAsset: isCloudinaryAsset
      });

      let aiResponse: EnhancedGenerateContentResponse | null = null;
      try {
        const safetySettings: SafetySetting[] = [
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE }
        ];

        // Usar stream para mejor manejo de errores
        const stream = await generativeModel.generateContentStream({
          contents: content,
          safetySettings,
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 200,
            candidateCount: 1
          }
        });

        let streamText = '';
        for await (const chunk of stream.stream) {
          const chunkText = chunk.text();
          if (chunkText) {
            streamText += chunkText;
          }
        }

        // Crear respuesta artificial similar a generateContent
        aiResponse = {
          candidates: [{
            content: { parts: [{ text: streamText }] },
            finishReason: 'STOP'
          }],
          promptFeedback: undefined,
          usageMetadata: undefined
        } as unknown as EnhancedGenerateContentResponse;
        
        console.info('[AI][generateAIScore] Respuesta completa de Gemini', {
          examId: req.params.id,
          submissionId: req.params.submissionId,
          aiResponse: {
            candidates: aiResponse?.candidates,
            promptFeedback: aiResponse?.promptFeedback,
            usageMetadata: aiResponse?.usageMetadata
          }
        });
      } catch (error) {
        if (error instanceof GoogleGenerativeAIFetchError || error instanceof GoogleGenerativeAIResponseError) {
          const blockReason = (error as GoogleGenerativeAIResponseError<unknown> & { response?: { candidates?: Array<{ finishReason?: string }> } })?.response?.candidates?.[0]?.finishReason;
          console.error('[AI][generateAIScore] Error de Gemini', {
            examId: req.params.id,
            submissionId: req.params.submissionId,
            error: error.message
          });
          throw new CustomError(`Gemini bloqueó la calificación (${blockReason})`, 422);
        }
        throw error;
      }

      const textPieces = (aiResponse?.candidates ?? [])
        .flatMap((candidate) => candidate.content?.parts ?? [])
        .map((part: Part) => {
          if ('text' in part && typeof part.text === 'string') {
            return part.text.trim();
          }
          return null;
        })
        .filter((piece): piece is string => Boolean(piece));

      const text = textPieces.length > 0 ? textPieces.join('\n').trim() : null;
      console.info('[AI][generateAIScore] Texto extraído de Gemini', {
        examId: req.params.id,
        submissionId: req.params.submissionId,
        text,
        textPieces,
        candidatesCount: aiResponse?.candidates?.length ?? 0
      });

      if (!text) {
        const finishReasons = (aiResponse?.candidates ?? [])
          .map((candidate: GenerateContentCandidate): string | undefined => candidate.finishReason)
          .filter((reason): reason is string => Boolean(reason));
        console.error('[AI][generateAIScore] Gemini no generó calificación', {
          examId: req.params.id,
          submissionId: req.params.submissionId,
          model,
          candidates: aiResponse?.candidates ?? null,
          finishReasons
        });
        const reasonSuffix = finishReasons.length > 0 ? ` (motivos: ${finishReasons.join(', ')})` : '';
        throw new CustomError(`Gemini no generó calificación${reasonSuffix}`, 502);
      }

      // Extraer puntuación con delimitadores
      let score: number;
      let reasoning: string = '';
      
      console.info('[AI][generateAIScore] Procesando respuesta de Gemini', {
        examId: req.params.id,
        submissionId: req.params.submissionId,
        text,
        maxPoints: validatedBody.maxPoints
      });

      // Buscar puntuación entre asteriscos: *7.5*
      const asteriskMatch = text.match(/\*(\d+(?:\.\d+)?)\*/);
      if (asteriskMatch && asteriskMatch[1]) {
        score = parseFloat(asteriskMatch[1]);
        reasoning = (text.replace(/\*\d+(?:\.\d+)?\*/, '').trim()) || '';
      } else {
        // Fallback: buscar cualquier número en el texto
        const numberMatch = text.match(/(\d+(?:\.\d+)?)/);
        if (numberMatch && numberMatch[1]) {
          score = parseFloat(numberMatch[1]);
          reasoning = (text.replace(/\d+(?:\.\d+)?/, '').trim()) || '';
        } else {
          throw new Error('No se encontró puntuación válida en la respuesta');
        }
      }

      // Validar rango
      if (score < 0 || score > validatedBody.maxPoints) {
        throw new Error(`Puntaje fuera de rango: ${score} (máximo: ${validatedBody.maxPoints})`);
      }

      console.info('[AI][generateAIScore] Puntuación extraída exitosamente', {
        examId: req.params.id,
        submissionId: req.params.submissionId,
        score,
        reasoning: reasoning.slice(0, 100),
        method: asteriskMatch ? 'asterisk' : 'fallback'
      });

      console.info('[AI][generateAIScore] Calificación generada correctamente', {
        examId: req.params.id,
        submissionId: req.params.submissionId,
        model,
        score,
        maxPoints: validatedBody.maxPoints
      });

      const apiResponse: ApiResponse = {
        success: true,
        message: 'AI score generated successfully',
        data: {
          score,
          reasoning,
          model
        },
        timestamp: new Date().toISOString()
      };

      res.status(200).json(apiResponse);
    } catch (error) {
      if (error instanceof GoogleGenerativeAIFetchError || error instanceof GoogleGenerativeAIResponseError) {
        console.error('[AI][generateAIScore] Error de Gemini', {
          examId: req.params.id,
          submissionId: req.params.submissionId,
          error: error.message
        });
        throw new CustomError(`Error al comunicarse con Gemini: ${error.message}`, 502);
      }
      next(error);
    }
  }
}

export const examController = new ExamController();
