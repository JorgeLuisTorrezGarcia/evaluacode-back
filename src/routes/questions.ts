import { Router } from 'express';
import { QuestionController } from '../modules/questions/questionController';
import { authenticateToken, requireAuth, requireDocente } from '../middleware/authMiddleware';

const controller = new QuestionController();

export const questionsRouter: Router = Router();
export const examQuestionsRouter: Router = Router({ mergeParams: true });

questionsRouter.use(authenticateToken);
examQuestionsRouter.use(authenticateToken);

/**
 * @route GET /api/exams/:examId/questions
 * @desc Listar preguntas de un examen
 * @access Private (estudiantes matriculados, docente asignado, admin)
 */
examQuestionsRouter.get(
  '/',
  requireAuth,
  controller.getQuestions.bind(controller)
);

/**
 * @route POST /api/questions
 * @desc Crear una nueva pregunta para un examen
 * @access Private (Docente/Admin)
 */
questionsRouter.post(
  '/',
  requireDocente,
  controller.createQuestion.bind(controller)
);

/**
 * @route GET /api/questions/:id
 * @desc Obtener detalles de una pregunta específica
 * @access Private (usuarios enrolados, docente asignado, admin)
 */
questionsRouter.get(
  '/:id',
  requireAuth,
  controller.getQuestion.bind(controller)
);

/**
 * @route PUT /api/questions/:id
 * @desc Actualizar una pregunta existente
 * @access Private (Docente/Admin)
 */
questionsRouter.put(
  '/:id',
  requireDocente,
  controller.updateQuestion.bind(controller)
);

/**
 * @route DELETE /api/questions/:id
 * @desc Eliminar una pregunta
 * @access Private (Docente/Admin)
 */
questionsRouter.delete(
  '/:id',
  requireDocente,
  controller.deleteQuestion.bind(controller)
);

/**
 * @route POST /api/questions/:id/rubrics
 * @desc Crear una rúbrica asociada a una pregunta
 * @access Private (Docente/Admin)
 */
questionsRouter.post(
  '/:id/rubrics',
  requireDocente,
  (req, res, next) => {
    req.body = {
      ...req.body,
      questionId: req.params.id
    };
    return controller.createRubric(req, res, next);
  }
);

/**
 * @route PUT /api/questions/rubrics/:id
 * @desc Actualizar una rúbrica existente
 * @access Private (Docente/Admin)
 */
questionsRouter.put(
  '/rubrics/:id',
  requireDocente,
  controller.updateRubric.bind(controller)
);
