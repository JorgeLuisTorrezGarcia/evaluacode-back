import { Router } from 'express';
import { examController } from '../modules/exams/examController';
import { authenticateToken, requireAuth, requireDocente } from '../middleware/authMiddleware';

export const examsRouter: Router = Router();

/**
 * @route GET /api/exams
 * @desc Obtener lista de exámenes con filtros y paginación
 * @access Private (All authenticated users)
 */
examsRouter.get('/', 
  authenticateToken,
  requireAuth,
  examController.getExams.bind(examController)
);

/**
 * @route GET /api/exams/:id
 * @desc Obtener detalles de un examen específico
 * @access Private (enrolled students, assigned teacher, admin)
 */
examsRouter.get('/:id',
  authenticateToken,
  requireAuth,
  examController.getExamById.bind(examController)
);

/**
 * @route GET /api/exams/:id/export
 * @desc Exportar resultados del examen en CSV
 * @access Private (Admin and Teachers)
 */
examsRouter.get('/:id/export',
  authenticateToken,
  requireDocente,
  examController.exportExamResults.bind(examController)
);

/**
 * @route POST /api/exams
 * @desc Crear nuevo examen
 * @access Private (Admin and Teachers)
 */
examsRouter.post('/',
  authenticateToken,
  requireDocente, // Allows both admin and docente
  examController.createExam.bind(examController)
);

/**
 * @route PUT /api/exams/:id
 * @desc Actualizar examen existente
 * @access Private (Admin or assigned teacher)
 */
examsRouter.put('/:id',
  authenticateToken,
  requireDocente, // Controller handles specific permissions
  examController.updateExam.bind(examController)
);

/**
 * @route DELETE /api/exams/:id
 * @desc Eliminar examen
 * @access Private (Admin or assigned teacher - no submissions)
 */
examsRouter.delete('/:id',
  authenticateToken,
  requireDocente, // Controller handles specific permissions
  examController.deleteExam.bind(examController)
);

/**
 * @route POST /api/exams/:id/submit
 * @desc Enviar respuestas de examen
 * @access Private (Students only)
 */
examsRouter.post('/:id/submit',
  authenticateToken,
  requireAuth, // Students can submit
  examController.submitExam.bind(examController)
);

/**
 * @route POST /api/exams/:id/grade
 * @desc Calificar envío manualmente
 * @access Private (Admin and Teachers)
 */
examsRouter.post('/:id/grade',
  authenticateToken,
  requireDocente, // Teachers and admins can grade
  examController.gradeSubmission.bind(examController)
);

/**
 * @route POST /api/exams/:id/submissions/:submissionId/ai-feedback
 * @desc Generar retroalimentación automática con Gemini
 * @access Private (Admin and Teachers)
 */
examsRouter.post('/:id/submissions/:submissionId/ai-feedback',
  authenticateToken,
  requireDocente,
  examController.generateAIReview.bind(examController)
);

/**
 * @route POST /api/exams/:id/submissions/:submissionId/ai-score
 * @desc Generar calificación automática con Gemini
 * @access Private (Admin and Teachers)
 */
examsRouter.post('/:id/submissions/:submissionId/ai-score',
  authenticateToken,
  requireDocente,
  examController.generateAIScore.bind(examController)
);
