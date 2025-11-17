import { Router } from 'express';
import { rubricController } from '../modules/rubrics/rubricController';
import { authenticateToken } from '../middleware/authMiddleware';

export const rubricRouter: Router = Router();

// Todas las rutas requieren autenticación
rubricRouter.use(authenticateToken);

// GET /api/rubrics - Listar rúbricas con filtros
rubricRouter.get('/', rubricController.getRubrics.bind(rubricController));

// GET /api/rubrics/:id - Obtener detalles de rúbrica
rubricRouter.get('/:id', rubricController.getRubricById.bind(rubricController));

// POST /api/rubrics - Crear nueva rúbrica (Admin/Docente)
rubricRouter.post('/', rubricController.createRubric.bind(rubricController));

// PUT /api/rubrics/:id - Actualizar rúbrica (Admin/Docente asignado)
rubricRouter.put('/:id', rubricController.updateRubric.bind(rubricController));

// DELETE /api/rubrics/:id - Eliminar rúbrica (Admin/Docente asignado)
rubricRouter.delete('/:id', rubricController.deleteRubric.bind(rubricController));

// POST /api/rubrics/:id/criteria - Agregar criterio (Admin/Docente)
rubricRouter.post('/:id/criteria', rubricController.addCriteria.bind(rubricController));

// POST /api/rubrics/:id/duplicate - Duplicar rúbrica (Admin/Docente)
rubricRouter.post('/:id/duplicate', rubricController.duplicateRubric.bind(rubricController));
