import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import {
  createQuestionSchema,
  createRubricSchema,
  questionFiltersSchema,
  updateQuestionSchema,
  updateRubricSchema
} from './questionSchemas';
import type {
  CreateQuestionInput,
  QuestionFilters,
  UpdateQuestionInput,
  UpdateRubricInput
} from './questionSchemas';
import type { ApiResponse, AuthenticatedUser } from '../../types';
import { UserRole } from '../../types';

type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

const parseCuid = (value: unknown): string => z.string().cuid().parse(value);

const buildQuestionResponse = <T extends { configJson?: Prisma.JsonValue | null }>(question: T) => ({
  ...question,
  config: question.configJson ?? null
});

const formatPagination = ({
  total,
  limit,
  page
}: {
  total: number;
  limit: number;
  page: number;
}) => ({
  totalQuestions: total,
  totalPages: Math.ceil(total / limit),
  currentPage: page,
  hasNext: page * limit < total,
  hasPrevious: page > 1
});

const assertExamAccess = async (
  examId: string,
  req: AuthenticatedRequest
) => {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      course: {
        include: {
          docente: { select: { id: true } },
          enrollments: req.user?.role === UserRole.ESTUDIANTE
            ? { where: { studentId: req.user.id }, select: { id: true } }
            : false
        }
      }
    }
  });

  if (!exam) {
    return { error: { status: 404, message: 'Exam not found' } } as const;
  }

  const isAdmin = req.user?.role === UserRole.ADMIN;
  const isDocenteOwner = req.user?.role === UserRole.DOCENTE &&
    exam.course.docente?.id === req.user?.id;
  const isEnrolledStudent = req.user?.role === UserRole.ESTUDIANTE &&
    Boolean(exam.course.enrollments?.length);

  if (!isAdmin && !isDocenteOwner && !isEnrolledStudent) {
    return { error: { status: 403, message: 'Access denied to this exam' } } as const;
  }

  return { exam } as const;
};

const assertQuestionAccess = async (
  questionId: string,
  req: AuthenticatedRequest
) => {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      exam: {
        include: {
          course: {
            include: {
              docente: { select: { id: true } },
              enrollments: req.user?.role === UserRole.ESTUDIANTE
                ? { where: { studentId: req.user.id }, select: { id: true } }
                : false
            }
          }
        }
      },
      rubrics: true
    }
  });

  if (!question) {
    return { error: { status: 404, message: 'Question not found' } } as const;
  }

  const isAdmin = req.user?.role === UserRole.ADMIN;
  const isDocenteOwner = req.user?.role === UserRole.DOCENTE &&
    question.exam.course.docente?.id === req.user?.id;
  const isEnrolledStudent = req.user?.role === UserRole.ESTUDIANTE &&
    Boolean(question.exam.course.enrollments?.length);

  if (!isAdmin && !isDocenteOwner && !isEnrolledStudent) {
    return { error: { status: 403, message: 'Access denied to this question' } } as const;
  }

  return { question } as const;
};

const mapQuestionData = (
  validatedData: CreateQuestionInput
): Prisma.QuestionUncheckedCreateInput => {
  const data: Prisma.QuestionUncheckedCreateInput = {
    examId: validatedData.examId,
    pageNumber: validatedData.pageNumber,
    tipo: validatedData.tipo,
    title: validatedData.title,
    prompt: validatedData.prompt,
    puntos: validatedData.puntos,
    orden: validatedData.orden
  };

  if (validatedData.bbox === null) {
    data.bbox = Prisma.JsonNull;
  } else if (validatedData.bbox !== undefined) {
    data.bbox = validatedData.bbox as Prisma.InputJsonValue;
  }

  if (validatedData.config === null) {
    data.configJson = Prisma.JsonNull;
  } else if (validatedData.config !== undefined) {
    data.configJson = validatedData.config as Prisma.InputJsonValue;
  }

  return data;
};

const mapQuestionUpdateData = (
  validatedData: UpdateQuestionInput
): Prisma.QuestionUncheckedUpdateInput => {
  const update: Prisma.QuestionUncheckedUpdateInput = {};

  if (validatedData.pageNumber !== undefined) {
    update.pageNumber = validatedData.pageNumber;
  }

  if (validatedData.tipo !== undefined) {
    update.tipo = validatedData.tipo;
  }

  if (validatedData.title !== undefined) {
    update.title = validatedData.title;
  }

  if (validatedData.prompt !== undefined) {
    update.prompt = validatedData.prompt;
  }

  if (validatedData.puntos !== undefined) {
    update.puntos = validatedData.puntos;
  }

  if (validatedData.orden !== undefined) {
    update.orden = validatedData.orden;
  }

  if (validatedData.bbox === null) {
    update.bbox = Prisma.JsonNull;
  } else if (validatedData.bbox !== undefined) {
    update.bbox = validatedData.bbox as Prisma.InputJsonValue;
  }

  if (validatedData.config === null) {
    update.configJson = Prisma.JsonNull;
  } else if (validatedData.config !== undefined) {
    update.configJson = validatedData.config as Prisma.InputJsonValue;
  }

  return update;
};

export class QuestionController {
  async getQuestions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const examId = parseCuid(req.params.examId);
      const filters = questionFiltersSchema.parse(req.query) as QuestionFilters;

      const access = await assertExamAccess(examId, req);
      if ('error' in access) {
        res.status(access.error.status).json({
          success: false,
          message: access.error.message,
          timestamp: new Date().toISOString()
        });
        return;
      }

      const { page, limit, search, tipo } = filters;
      const offset = (page - 1) * limit;

      const whereClause: Prisma.QuestionWhereInput = {
        examId,
        ...(tipo && { tipo })
      };

      const searchTerm = search?.trim();
      if (searchTerm) {
        whereClause.OR = [
          { title: { contains: searchTerm, mode: 'insensitive' } },
          { prompt: { contains: searchTerm, mode: 'insensitive' } },
          { tipo: { contains: searchTerm, mode: 'insensitive' } }
        ];
      }

      const [questions, total] = await Promise.all([
        prisma.question.findMany({
          where: whereClause,
          include: {
            rubrics: {
              where: { isActive: true },
              select: {
                id: true,
                name: true,
                isActive: true
              }
            }
          },
          orderBy: [{ orden: 'asc' }, { id: 'asc' }],
          skip: offset,
          take: limit
        }),
        prisma.question.count({ where: whereClause })
      ]);

      const response: ApiResponse = {
        success: true,
        message: 'Questions retrieved successfully',
        data: {
          questions: questions.map(buildQuestionResponse),
          ...formatPagination({ total, limit, page })
        },
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  async getQuestion(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const questionId = parseCuid(req.params.id);
      const access = await assertQuestionAccess(questionId, req);

      if ('error' in access) {
        res.status(access.error.status).json({
          success: false,
          message: access.error.message,
          timestamp: new Date().toISOString()
        });
        return;
      }

      const { question } = access;

      const response: ApiResponse = {
        success: true,
        message: 'Question retrieved successfully',
        data: buildQuestionResponse(question),
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  async createQuestion(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedData = createQuestionSchema.parse(req.body);

      const exam = await prisma.exam.findUnique({
        where: { id: validatedData.examId },
        select: { course: { select: { docenteId: true } } }
      });

      if (!exam) {
        res.status(404).json({
          success: false,
          message: 'Exam not found',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const isAdmin = req.user?.role === UserRole.ADMIN;
      const isDocenteOwner = req.user?.role === UserRole.DOCENTE &&
        exam.course.docenteId === req.user.id;

      if (!isAdmin && !isDocenteOwner) {
        res.status(403).json({
          success: false,
          message: 'Only exam owner or admin can create questions',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const question = await prisma.question.create({
        data: mapQuestionData(validatedData),
        include: {
          rubrics: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              isActive: true
            }
          },
          exam: {
            select: {
              id: true,
              title: true,
              type: true,
              course: {
                select: {
                  id: true,
                  nombre: true,
                  docenteId: true
                }
              }
            }
          }
        }
      });

      const response: ApiResponse = {
        success: true,
        message: 'Question created successfully',
        data: {
          ...buildQuestionResponse(question),
          exam: question.exam,
          course: question.exam?.course
        },
        timestamp: new Date().toISOString()
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  async updateQuestion(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const questionId = parseCuid(req.params.id);
      const validatedData = updateQuestionSchema.parse(req.body);

      const access = await assertQuestionAccess(questionId, req);
      if ('error' in access) {
        res.status(access.error.status).json({
          success: false,
          message: access.error.message,
          timestamp: new Date().toISOString()
        });
        return;
      }

      const { question: existing } = access;

      const isAdmin = req.user?.role === UserRole.ADMIN;
      const isDocenteOwner = req.user?.role === UserRole.DOCENTE &&
        existing.exam.course.docente?.id === req.user.id;

      if (!isAdmin && !isDocenteOwner) {
        res.status(403).json({
          success: false,
          message: 'Only question owner or admin can update questions',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const updatedQuestion = await prisma.question.update({
        where: { id: questionId },
        data: mapQuestionUpdateData(validatedData),
        include: {
          rubrics: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              isActive: true
            }
          },
          exam: {
            select: {
              id: true,
              title: true,
              type: true,
              course: {
                select: {
                  id: true,
                  nombre: true,
                  docenteId: true
                }
              }
            }
          }
        }
      });

      const response: ApiResponse = {
        success: true,
        message: 'Question updated successfully',
        data: {
          ...buildQuestionResponse(updatedQuestion),
          exam: updatedQuestion.exam,
          course: updatedQuestion.exam?.course
        },
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  async deleteQuestion(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const questionId = parseCuid(req.params.id);
      const access = await assertQuestionAccess(questionId, req);

      if ('error' in access) {
        res.status(access.error.status).json({
          success: false,
          message: access.error.message,
          timestamp: new Date().toISOString()
        });
        return;
      }

      const { question } = access;

      const isAdmin = req.user?.role === UserRole.ADMIN;
      const isDocenteOwner = req.user?.role === UserRole.DOCENTE &&
        question.exam.course.docente?.id === req.user.id;

      if (!isAdmin && !isDocenteOwner) {
        res.status(403).json({
          success: false,
          message: 'Only question owner or admin can delete questions',
          timestamp: new Date().toISOString()
        });
        return;
      }

      await prisma.question.delete({ where: { id: questionId } });

      const response: ApiResponse = {
        success: true,
        message: 'Question deleted successfully',
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  async createRubric(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedData = createRubricSchema.parse(req.body);

      const access = await assertQuestionAccess(validatedData.questionId, req);

      if ('error' in access) {
        res.status(access.error.status).json({
          success: false,
          message: access.error.message,
          timestamp: new Date().toISOString()
        });
        return;
      }

      const { question } = access;

      const isAdmin = req.user?.role === UserRole.ADMIN;
      const isDocenteOwner = req.user?.role === UserRole.DOCENTE &&
        question.exam.course.docente?.id === req.user.id;

      if (!isAdmin && !isDocenteOwner) {
        res.status(403).json({
          success: false,
          message: 'Only question owner or admin can create rubrics',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const rubricData: Prisma.RubricCreateInput = {
        question: { connect: { id: validatedData.questionId } },
        name: validatedData.name,
        estructuraJson: validatedData.estructuraJson as Prisma.InputJsonValue,
        isActive: validatedData.isActive
      };

      if (validatedData.examId) {
        rubricData.exam = { connect: { id: validatedData.examId } };
      }

      const rubric = await prisma.rubric.create({
        data: rubricData,
        include: {
          question: {
            select: { tipo: true, puntos: true }
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

  async updateRubric(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const rubricId = parseCuid(req.params.id);
      const validatedData = updateRubricSchema.parse(req.body) as UpdateRubricInput;

      const existingRubric = await prisma.rubric.findUnique({
        where: { id: rubricId },
        include: {
          question: {
            include: {
              exam: {
                include: {
                  course: {
                    select: { docenteId: true }
                  }
                }
              }
            }
          }
        }
      });

      if (!existingRubric) {
        res.status(404).json({
          success: false,
          message: 'Rubric not found',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const isAdmin = req.user?.role === UserRole.ADMIN;
      const isDocenteOwner = req.user?.role === UserRole.DOCENTE &&
        existingRubric.question.exam.course.docenteId === req.user.id;

      if (!isAdmin && !isDocenteOwner) {
        res.status(403).json({
          success: false,
          message: 'Only rubric owner or admin can update rubrics',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const updateData: Prisma.RubricUpdateInput = {};

      if (validatedData.name !== undefined) {
        updateData.name = validatedData.name;
      }

      if (validatedData.estructuraJson !== undefined) {
        updateData.estructuraJson = validatedData.estructuraJson as Prisma.InputJsonValue;
      }

      if (validatedData.isActive !== undefined) {
        updateData.isActive = validatedData.isActive;
      }

      if (validatedData.examId !== undefined) {
        updateData.exam = validatedData.examId
          ? { connect: { id: validatedData.examId } }
          : { disconnect: true };
      }

      const rubric = await prisma.rubric.update({
        where: { id: rubricId },
        data: updateData,
        include: {
          question: {
            select: { tipo: true, puntos: true }
          }
        }
      });

      const response: ApiResponse = {
        success: true,
        message: 'Rubric updated successfully',
        data: rubric,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}
