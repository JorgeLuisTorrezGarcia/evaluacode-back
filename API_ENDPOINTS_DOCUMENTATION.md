# 📚 EvaluaCode API - Documentación de Endpoints

## 🔧 Configuración Base
- **Base URL**: `http://localhost:3000`
- **Content-Type**: `application/json`
- **Authorization**: `Bearer {accessToken}` (excepto endpoints públicos)

---

## 🏥 Health Endpoints

### GET /api/health
**Descripción**: Health check completo del sistema
**Auth**: ❌ No requerida
**Body**: ❌ No aplica
**Response**:
```json
{
  "success": true,
  "message": "EvaluaCode API is healthy",
  "data": {
    "status": "healthy",
    "timestamp": "2024-11-16T23:47:00.000Z",
    "uptime": 3600,
    "environment": "development",
    "version": "1.0.0",
    "services": {
      "database": "connected",
      "redis": "unknown",
      "ai_engine": "unknown"
    },
    "memory": {
      "used": "45.32 MB",
      "total": "128.00 MB",
      "percentage": "35.41%"
    }
  }
}
```

### GET /api/health/ping
**Descripción**: Ping simple para load balancers
**Auth**: ❌ No requerida
**Body**: ❌ No aplica
**Response**: `pong`

### GET /api/health/ready
**Descripción**: Readiness check para Kubernetes
**Auth**: ❌ No requerida
**Body**: ❌ No aplica
**Response**:
```json
{
  "status": "ready",
  "timestamp": "2024-11-16T23:47:00.000Z"
}
```

---

## 🔐 Authentication Endpoints

### POST /api/auth/register
**Descripción**: Registrar nuevo usuario
**Auth**: ❌ No requerida
**Body**:
```json
{
  "email": "usuario@ejemplo.com",
  "password": "miPassword123",
  "role": "estudiante"
}
```
**Validaciones**:
- `email`: Formato válido de email
- `password`: Mínimo 8 caracteres
- `role`: "admin" | "docente" | "estudiante"

### POST /api/auth/login
**Descripción**: Iniciar sesión
**Auth**: ❌ No requerida
**Body**:
```json
{
  "email": "profesorjorge@universidad.edu",
  "password": "profesor123"
}
```
**Response**:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "cm2cn2zs00001i8r4oa9x796h",
      "email": "profesorjorge@universidad.edu",
      "role": "docente"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJSUzI1NiIs...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
      "expiresIn": 900,
      "tokenType": "Bearer"
    }
  }
}
```

### POST /api/auth/refresh
**Descripción**: Renovar access token
**Auth**: ❌ No requerida (usa refresh token)
**Body**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### GET /api/auth/me
**Descripción**: Obtener información del usuario actual
**Auth**: ✅ Bearer token requerido
**Body**: ❌ No aplica
**Response**:
```json
{
  "success": true,
  "data": {
    "id": "cm2cn2zs00001i8r4oa9x796h",
    "email": "profesorjorge@universidad.edu",
    "role": "docente",
    "createdAt": "2024-11-15T10:30:00.000Z"
  }
}
```

### POST /api/auth/change-password
**Descripción**: Cambiar contraseña del usuario actual
**Auth**: ✅ Bearer token requerido
**Body**:
```json
{
  "currentPassword": "passwordActual",
  "newPassword": "nuevoPassword123"
}
```

### POST /api/auth/forgot-password
**Descripción**: Solicitar enlace/token para restablecer contraseña. En desarrollo, el token se devuelve en la respuesta.
**Auth**: ❌ No requerida
**Body**:
```json
{
  "email": "usuario@ejemplo.com"
}
```
**Notas**:
- Siempre responde éxito por razones de seguridad.
- El token generado es válido por 24 horas.

### POST /api/auth/reset-password
**Descripción**: Restablecer contraseña usando el token de recuperación.
**Auth**: ❌ No requerida
**Body**:
```json
{
  "token": "c21DYXZlLWlE...",
  "newPassword": "NuevoPassword123",
  "confirmNewPassword": "NuevoPassword123"
}
```
**Validaciones**:
- El token debe ser válido y no estar expirado.
- `newPassword` debe cumplir con la política de contraseñas (mínimo 8 caracteres, mayúscula, minúscula y número).
- `confirmNewPassword` debe coincidir.

### POST /api/auth/logout
**Descripción**: Cerrar sesión (invalida refresh token)
**Auth**: ✅ Bearer token requerido
**Body**: ❌ No aplica

---

## 📚 Courses Endpoints

### GET /api/courses
**Descripción**: Obtener lista de cursos con filtros y paginación
**Auth**: ✅ Bearer token requerido
**Body**: ❌ No aplica
**Query Parameters**:
- `search` (string): Búsqueda por nombre o código
- `periodo` (string): Filtrar por período académico
- `semestre` (number): Filtrar por semestre
- `isActive` (boolean): Filtrar por estado activo/inactivo
- `page` (number, default: 1): Página actual
- `limit` (number, default: 10): Elementos por página

**Ejemplo**: `/api/courses?search=programacion&isActive=true&page=1&limit=5`

### GET /api/courses/:id
**Descripción**: Obtener detalles de un curso específico
**Auth**: ✅ Bearer token requerido
**Body**: ❌ No aplica
**Path Parameters**:
- `id` (string): ID del curso

### POST /api/courses
**Descripción**: Crear nuevo curso (Admin/Docente)
**Auth**: ✅ Bearer token requerido (Admin/Docente)
**Body**:
```json
{
  "nombre": "Programación Avanzada",
  "codigo": "PROG301",
  "descripcion": "Curso de programación orientada a objetos y estructuras de datos",
  "docenteId": "docente_id_here",
  "periodo": "2024-1",
  "semestre": 3,
  "creditos": 4,
  "isActive": true
}
```
**Validaciones**:
- `nombre`: Requerido, string
- `codigo`: Opcional, string único
- `descripcion`: Opcional, string
- `docenteId`: Opcional (se asigna automáticamente si no se proporciona)
- `periodo`: Requerido, string
- `semestre`: Opcional, number
- `creditos`: Opcional, number
- `isActive`: Opcional, boolean (default: true)

### PUT /api/courses/:id
**Descripción**: Actualizar curso existente (Admin o docente asignado)
**Auth**: ✅ Bearer token requerido
**Body** (todos los campos son opcionales):
```json
{
  "nombre": "Programación Avanzada Actualizada",
  "descripcion": "Descripción actualizada del curso",
  "semestre": 4,
  "creditos": 5,
  "isActive": true
}
```

### DELETE /api/courses/:id
**Descripción**: Eliminar curso (Solo Admin)
**Auth**: ✅ Bearer token requerido (Admin)
**Body**: ❌ No aplica
**Restricciones**: No se puede eliminar si tiene estudiantes matriculados o exámenes

### POST /api/courses/:id/assign-docente
**Descripción**: Asignar docente a curso (Solo Admin)
**Auth**: ✅ Bearer token requerido (Admin)
**Body**:
```json
{
  "docenteId": "teacher_id_here"
}
```

### POST /api/courses/:id/enroll
**Descripción**: Matricular estudiante en curso (Admin/Docente)
**Auth**: ✅ Bearer token requerido (Admin/Docente)
**Body**:
```json
{
  "estudianteId": "student_id_here"
}
```

### DELETE /api/courses/:id/unenroll
**Descripción**: Desinscribir estudiante de un curso (Admin/Docente asignado)
**Auth**: ✅ Bearer token requerido (Admin/Docente)
**Body**:
```json
{
  "estudianteId": "student_id_here"
}
```
**Restricciones**:
- El estudiante debe estar previamente matriculado en el curso.
- Solo el docente asignado o un administrador pueden ejecutar la operación.

---

## 📝 Exams Endpoints

### GET /api/exams
**Descripción**: Obtener lista de exámenes con filtros y paginación
**Auth**: ✅ Bearer token requerido
**Body**: ❌ No aplica
**Query Parameters**:
- `search` (string): Búsqueda por título o descripción
- `courseId` (string): Filtrar por curso
- `tipo` (string): "teorico" | "practico" | "mixto"
- `isActive` (boolean): Filtrar por estado activo/inactivo
- `docenteId` (string): Filtrar por docente (solo Admin)
- `startDate` (string): Fecha mínima de apertura
- `endDate` (string): Fecha máxima de cierre
- `page` (number, default: 1): Página actual
- `limit` (number, default: 10): Elementos por página

### GET /api/exams/:id
**Descripción**: Obtener detalles de un examen específico
**Auth**: ✅ Bearer token requerido
**Body**: ❌ No aplica
**Response incluye**: Estado del examen (upcoming/active/closed), posibilidad de tomar examen, preguntas (si aplicable), envíos previos

### POST /api/exams
**Descripción**: Crear nuevo examen (Admin/Docente)
**Auth**: ✅ Bearer token requerido (Admin/Docente)
**Body**:
```json
{
  "courseId": "course_id_here",
  "titulo": "Examen Final Programación",
  "descripcion": "Examen final del curso de programación avanzada",
  "tipo": "mixto",
  "fechaApertura": "2024-12-15T09:00:00.000Z",
  "fechaCierre": "2024-12-15T12:00:00.000Z",
  "duracionMinutos": 180,
  "puntuacionMaxima": 100,
  "intentosPermitidos": 1,
  "isActive": true,
  "configuracion": {
    "shuffleQuestions": true,
    "showResults": false,
    "requireProctoring": true,
    "allowLateSubmission": false
  }
}
```
**Validaciones**:
- `courseId`: Requerido, debe existir
- `titulo`: Requerido, string
- `descripcion`: Opcional, string
- `tipo`: Requerido, "teorico" | "practico" | "mixto"
- `fechaApertura`: Requerido, ISO date string
- `fechaCierre`: Requerido, ISO date string (debe ser posterior a fechaApertura)
- `duracionMinutos`: Requerido, number > 0
- `puntuacionMaxima`: Requerido, number > 0
- `intentosPermitidos`: Requerido, number >= 1
- `isActive`: Opcional, boolean (default: true)
- `configuracion`: Opcional, objeto de configuración

### PUT /api/exams/:id
**Descripción**: Actualizar examen existente (Admin o docente asignado)
**Auth**: ✅ Bearer token requerido
**Body** (todos los campos son opcionales):
```json
{
  "titulo": "Examen Final Actualizado",
  "descripcion": "Descripción actualizada del examen",
  "duracionMinutos": 120,
  "isActive": true
}
```
**Restricciones**: No se pueden modificar fechas si ya hay envíos

### DELETE /api/exams/:id
**Descripción**: Eliminar examen (Admin o docente asignado)
**Auth**: ✅ Bearer token requerido
**Body**: ❌ No aplica
**Restricciones**: No se puede eliminar si tiene envíos de estudiantes

### POST /api/exams/:id/submit
**Descripción**: Enviar respuestas de examen (Solo Estudiantes)
**Auth**: ✅ Bearer token requerido (Estudiante)
**Body**:
```json
{
  "answers": [
    {
      "questionId": "question_id_1",
      "response": "function factorial(n) { if (n <= 1) return 1; return n * factorial(n-1); }",
      "timeSpent": 600
    },
    {
      "questionId": "question_id_2",
      "response": "La complejidad temporal es O(n) y espacial O(n) por la recursión",
      "timeSpent": 300
    }
  ],
  "totalTimeSpent": 900
}
```
**Validaciones**:
- Estudiante debe estar matriculado en el curso
- Examen debe estar activo (entre fechaApertura y fechaCierre)
- No debe haber excedido los intentos permitidos
- Todas las preguntas del examen deben tener respuesta

### POST /api/exams/:id/grade
**Descripción**: Calificar envío manualmente (Docente/Admin)
**Auth**: ✅ Bearer token requerido (Docente/Admin)
**Query Parameters**:
- `submissionId` (string): ID del envío a calificar
**Body**:
```json
{
  "questionGrades": [
    {
      "questionId": "question_id_1",
      "score": 8.5,
      "feedback": "Implementación correcta pero falta documentación"
    },
    {
      "questionId": "question_id_2",
      "score": 9.0,
      "feedback": "Análisis de complejidad excelente"
    }
  ],
  "bonus": 0.5,
  "generalFeedback": "Buen trabajo en general, mejorar la documentación del código"
}
```

---

## 🧩 Questions Endpoints

### GET /api/exams/:examId/questions
**Descripción**: Listar preguntas pertenecientes a un examen, con paginación y filtros (`search`, `tipo`, `page`, `limit`).
**Auth**: ✅ Bearer token requerido (estudiantes matriculados, docente del curso o admin).

### POST /api/questions
**Descripción**: Crear una nueva pregunta asociada a un examen.
**Auth**: ✅ Docente asignado del curso o admin.
**Body** (ejemplo):
```json
{
  "examId": "exam_id_here",
  "pageNumber": 1,
  "tipo": "code",
  "title": "Implementar factorial",
  "prompt": "Escribe una función factorial en JavaScript",
  "puntos": 20,
  "orden": 0,
  "config": {
    "starterCode": "function factorial(n) {\n  // tu código\n}\n",
    "language": "javascript"
  }
}
```

### GET /api/questions/:id
**Descripción**: Obtener los detalles completos de una pregunta.
**Auth**: ✅ Estudiante matriculado, docente asignado o admin.

### PUT /api/questions/:id
**Descripción**: Actualizar los metadatos de una pregunta (prompt, título, puntaje, configuración, orden).
**Auth**: ✅ Docente asignado o admin.

### DELETE /api/questions/:id
**Descripción**: Eliminar una pregunta del examen.
**Auth**: ✅ Docente asignado o admin.

### POST /api/questions/:id/rubrics
**Descripción**: Crear una rúbrica asociada a la pregunta indicada.
**Auth**: ✅ Docente asignado o admin.

### PUT /api/questions/rubrics/:id
**Descripción**: Actualizar una rúbrica existente asociada a una pregunta.
**Auth**: ✅ Docente asignado o admin.

---

## 📊 Rubrics Endpoints

### GET /api/rubrics
**Descripción**: Obtener listado de rúbricas con filtros y paginación.
**Auth**: ✅ Bearer token requerido (Docente/Admin)
**Query Parameters**:
- `search` (string): Filtra por nombre o descripción.
- `courseId` (string): Filtra por curso asociado.
- `examId` (string): Filtra por examen asociado.
- `page` (number, default: 1): Página actual.
- `limit` (number, default: 10): Número de resultados por página.

### GET /api/rubrics/:id
**Descripción**: Obtener detalles de una rúbrica específica, incluyendo criterios y mapeos.
**Auth**: ✅ Bearer token requerido (Docente/Admin)
**Path Parameters**:
- `id` (string): ID de la rúbrica (cuid).

### POST /api/rubrics
**Descripción**: Crear una nueva rúbrica.
**Auth**: ✅ Bearer token requerido (Docente/Admin)
**Body**:
```json
{
  "nombre": "Rúbrica Examen Final",
  "descripcion": "Criterios de evaluación para el examen final",
  "courseId": "course_id_here",
  "examId": "exam_id_here",
  "criterios": [
    {
      "titulo": "Calidad del código",
      "descripcion": "Evaluar buenas prácticas y legibilidad",
      "puntajeMaximo": 10
    }
  ]
}
```
**Notas**:
- `criterios` es opcional; se pueden agregar luego.
- Se valida ownership del curso/examen.

### PUT /api/rubrics/:id
**Descripción**: Actualizar una rúbrica existente.
**Auth**: ✅ Bearer token requerido (Docente/Admin)
**Body**: Campos opcionales (`nombre`, `descripcion`, `isActive`, etc.).

### DELETE /api/rubrics/:id
**Descripción**: Eliminar una rúbrica. Si está asociada a envíos calificados, se bloquea.
**Auth**: ✅ Bearer token requerido (Docente/Admin)

### POST /api/rubrics/:id/criteria
**Descripción**: Agregar un criterio a una rúbrica existente.
**Auth**: ✅ Bearer token requerido (Docente/Admin)
**Body**:
```json
{
  "titulo": "Cobertura de pruebas",
  "descripcion": "Calidad y cantidad de tests automatizados",
  "puntajeMaximo": 5
}
```

### POST /api/rubrics/:id/duplicate
**Descripción**: Duplicar una rúbrica (junto con sus criterios) a otro examen.
**Auth**: ✅ Bearer token requerido (Docente/Admin)
**Body**:
```json
{
  "destExamId": "otro_exam_id"
}
```
**Validaciones**:
- El examen destino debe existir y pertenecer al mismo docente/curso autorizado.
- No se crean duplicados si ya existe una rúbrica equivalente en el examen destino.

---

## 📁 File Upload Endpoints

### POST /api/upload/single
**Descripción**: Subir un archivo único
**Auth**: ✅ Bearer token requerido
**Content-Type**: `multipart/form-data`
**Body** (form-data):
- `file` (file): Archivo a subir (imagen, PDF, documento)
- `examId` (text, opcional): ID del examen relacionado
- `questionId` (text, opcional): ID de la pregunta relacionada
- `fileType` (text): "image" | "document" | "exam_scan"

**Restricciones**:
- Tamaño máximo: 10MB
- Tipos permitidos: jpg, jpeg, png, gif, pdf, doc, docx, txt

### POST /api/upload/multiple
**Descripción**: Subir múltiples archivos (máximo 5)
**Auth**: ✅ Bearer token requerido
**Content-Type**: `multipart/form-data`
**Body** (form-data):
- `files` (files): Múltiples archivos (máximo 5)
- `examId` (text, opcional): ID del examen relacionado
- `fileType` (text): "image" | "document" | "exam_scan"

### GET /api/upload/list
**Descripción**: Listar archivos del usuario
**Auth**: ✅ Bearer token requerido
**Body**: ❌ No aplica
**Query Parameters**:
- `fileType` (string): Filtrar por tipo
- `page` (number, default: 1): Página actual
- `limit` (number, default: 10): Elementos por página

### DELETE /api/upload/:publicId
**Descripción**: Eliminar archivo (Propietario o Admin)
**Auth**: ✅ Bearer token requerido
**Body**: ❌ No aplica
**Path Parameters**:
- `publicId` (string): Public ID de Cloudinary del archivo

---

## 📋 Códigos de Estado Comunes

- **200**: Operación exitosa
- **201**: Recurso creado exitosamente
- **400**: Error en la petición (validación, datos faltantes)
- **401**: No autenticado (token faltante/inválido)
- **403**: No autorizado (permisos insuficientes)
- **404**: Recurso no encontrado
- **409**: Conflicto (recurso ya existe)
- **422**: Error de validación de datos
- **500**: Error interno del servidor

## 🔒 Niveles de Autorización

- **🟢 Public**: Sin autenticación
- **🟡 Authenticated**: Token válido requerido
- **🟠 Admin**: Solo usuarios admin
- **🔵 Docente**: Admin y docentes
- **🟣 Owner**: Propietario del recurso o admin

## 📱 Formato de Respuesta Estándar

```json
{
  "success": true,
  "message": "Descripción de la operación",
  "data": { ... },
  "timestamp": "2024-11-16T23:47:00.000Z"
}
```

**En caso de error**:
```json
{
  "success": false,
  "message": "Descripción del error",
  "error": "Detalles técnicos del error",
  "timestamp": "2024-11-16T23:47:00.000Z"
}
```
