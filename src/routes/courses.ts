import { Router } from 'express';
import { courseController } from '../modules/courses/courseController';
import { authenticateToken, requireAuth, requireAdmin, requireDocente } from '../middleware/authMiddleware';
import { upload } from '../modules/upload/uploadController';

export const coursesRouter: Router = Router();

/**
 * @route GET /api/courses
 * @desc Obtener lista de cursos con filtros y paginación
 * @access Private (All authenticated users)
 */
coursesRouter.get('/', 
  authenticateToken,
  requireAuth,
  courseController.getCourses.bind(courseController)
);

/**
 * @route GET /api/courses/:id
 * @desc Obtener detalles de un curso específico
 * @access Private (enrolled students, assigned teacher, admin)
 */
coursesRouter.get('/:id',
  authenticateToken,
  requireAuth,
  courseController.getCourseById.bind(courseController)
);

/**
 * @route POST /api/courses
 * @desc Crear nuevo curso
 * @access Private (Admin and Teachers)
 */
coursesRouter.post('/',
  authenticateToken,
  requireDocente, // Allows both admin and docente
  courseController.createCourse.bind(courseController)
);

/**
 * @route PUT /api/courses/:id
 * @desc Actualizar curso existente
 * @access Private (Admin or assigned teacher)
 */
coursesRouter.put('/:id',
  authenticateToken,
  requireDocente, // Controller handles specific permissions
  courseController.updateCourse.bind(courseController)
);

/**
 * @route POST /api/courses/:courseId/files
 * @desc Subir archivo asociado a un curso
 * @access Private (Admin or assigned teacher)
 */
coursesRouter.post('/:courseId/files',
  authenticateToken,
  requireDocente,
  upload.single('file'),
  courseController.uploadCourseFile.bind(courseController)
);

/**
 * @route DELETE /api/courses/:id
 * @desc Eliminar curso
 * @access Private (Admin only)
 */
coursesRouter.delete('/:id',
  authenticateToken,
  requireAdmin,
  courseController.deleteCourse.bind(courseController)
);

/**
 * @route POST /api/courses/:id/assign-docente
 * @desc Asignar docente a curso
 * @access Private (Admin only)
 */
coursesRouter.post('/:id/assign-docente',
  authenticateToken,
  requireAdmin,
  courseController.assignDocente.bind(courseController)
);

/**
 * @route POST /api/courses/:id/enroll
 * @desc Matricular estudiante en curso
 * @access Private (Admin and Teachers)
 */
coursesRouter.post('/:id/enroll',
  authenticateToken,
  requireDocente,
  courseController.enrollStudent.bind(courseController)
);

/**
 * @route DELETE /api/courses/:id/unenroll
 * @desc Desinscribir estudiante de curso
 * @access Private (Admin and Teachers)
 */
coursesRouter.delete('/:id/unenroll',
  authenticateToken,
  requireDocente,
  courseController.unenrollStudent.bind(courseController)
);
