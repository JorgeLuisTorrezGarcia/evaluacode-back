# EvaluaCode Backend

Sistema de corrección automática de exámenes de programación con IA - Core API Backend

## 🚀 Quick Start

### Prerrequisitos
- Node.js 20+ LTS
- PostgreSQL 15+
- Redis 7+
- pnpm (gestor de paquetes)

### Instalación
```bash
# Instalar dependencias
pnpm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales reales

# Generar cliente de Prisma
pnpm prisma:generate

# Ejecutar migraciones (cuando tengas PostgreSQL configurado)
pnpm prisma:migrate

# Poblar base de datos con datos iniciales
pnpm prisma:seed

# Modo desarrollo
pnpm dev
```

### Scripts Disponibles
```bash
pnpm dev          # Servidor en modo desarrollo con hot-reload
pnpm build        # Compilar TypeScript a JavaScript
pnpm start        # Ejecutar servidor en producción
pnpm lint         # Verificar calidad de código
pnpm lint:fix     # Corregir automáticamente errores de linting
pnpm prisma:generate    # Generar cliente de Prisma
pnpm prisma:migrate     # Aplicar migraciones de BD
pnpm prisma:studio      # Abrir interfaz web de Prisma
pnpm clean        # Limpiar carpeta dist
pnpm prisma:seed  # Poblar BD con datos iniciales
pnpm prisma:reset # Reset completo de BD (⚠️ destructivo)
```

## 📁 Estructura del Proyecto
```
src/
├── config/          # Configuración y variables de entorno
├── middleware/      # Middlewares personalizados (auth, errors, logging)
├── modules/         # Módulos de negocio
│   ├── auth/        # Autenticación JWT + RSA
│   ├── courses/     # Gestión de cursos y matrículas
│   └── exams/       # Gestión de exámenes y calificaciones
├── routes/          # Definición de endpoints REST
├── types/           # Tipos TypeScript compartidos
├── utils/           # Utilidades y helpers
└── main.ts          # Punto de entrada principal
```

## 🔧 Configuración

### Variables de Entorno Requeridas
```bash
# Base de datos
DATABASE_URL="postgresql://username:password@localhost:5432/evaluacode?schema=public"

# Cloudinary (Free Tier)
CLOUDINARY_URL="cloudinary://api_key:api_secret@cloud_name"

# IA Services
GEMINI_API_KEY="your_gemini_api_key_here"
OPENAI_API_KEY="your_openai_api_key_here_optional"

# JWT Keys (generar con openssl)
JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----..."
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----..."
JWT_REFRESH_SECRET="minimum_32_characters_random_secret"

# Redis
REDIS_URL="redis://localhost:6379"
```

### Generar Claves JWT
```bash
# Generar clave privada
openssl genrsa -out private.key 2048

# Extraer clave pública
openssl rsa -in private.key -pubout -out public.key

# Copiar contenido a las variables de entorno
```

## 📊 API Endpoints

### Health Check
```
GET /api/health      # Estado completo del sistema
GET /api/health/ping # Ping simple (load balancers)  
GET /api/health/ready # Readiness check (Kubernetes)
```

### Endpoints de Autenticación (✅ Implementados)
```
POST /api/auth/register       # Registrar nuevo usuario
POST /api/auth/login          # Iniciar sesión
POST /api/auth/refresh        # Renovar access token
POST /api/auth/logout         # Cerrar sesión
GET  /api/auth/me            # Información del usuario actual
POST /api/auth/change-password # Cambiar contraseña
```

### Endpoints de Cursos (✅ Implementados)
```
GET  /api/courses             # Listar cursos (filtros, paginación)
GET  /api/courses/:id         # Detalles de curso específico
POST /api/courses             # Crear nuevo curso (Admin/Docente)
PUT  /api/courses/:id         # Actualizar curso (Admin/Docente asignado)
DELETE /api/courses/:id       # Eliminar curso (Admin, sin exámenes)
POST /api/courses/:id/assign-docente  # Asignar docente (Admin)
POST /api/courses/:id/enroll  # Matricular estudiante (Admin/Docente)
```

### Endpoints de Exámenes (✅ Implementados)
```
GET  /api/exams               # Listar exámenes (filtros, paginación)
GET  /api/exams/:id           # Detalles de examen específico
POST /api/exams               # Crear nuevo examen (Admin/Docente)
PUT  /api/exams/:id           # Actualizar examen (Admin/Docente asignado)
DELETE /api/exams/:id         # Eliminar examen (Admin/Docente, sin envíos)
```

### Endpoints de Envío y Calificación (✅ Implementados)
```
POST /api/exams/:id/submit    # Enviar respuestas de examen (Estudiante)
POST /api/exams/:id/grade     # Calificar manualmente (Docente)
```

### Endpoints de Upload de Archivos (✅ Implementados)
```
POST /api/upload/single       # Subir archivo único (hasta 10MB)
POST /api/upload/multiple     # Subir múltiples archivos (máx 5)
GET  /api/upload/list         # Listar archivos del usuario
DELETE /api/upload/:publicId  # Eliminar archivo (propietario/admin)
```

### Próximos Endpoints (Roadmap)
```
POST /ai/process-exam         # Procesar examen con IA (Sistema)
GET  /api/submissions/:id     # Detalles de envío específico
GET  /api/analytics/course/:id # Analytics de curso para docentes
```

## 🔐 Sistema de Autenticación

### Flujo de Autenticación JWT + RSA
1. **Registro/Login** → Recibe `accessToken` (RSA-256) + `refreshToken` (HMAC)
2. **Requests protegidos** → `Authorization: Bearer <accessToken>`
3. **Token expira** → Usar `/api/auth/refresh` con `refreshToken`
4. **Logout** → Invalidar `refreshToken`

### Roles y Permisos
```typescript
enum UserRole {
  ADMIN = 'admin',        // Acceso total al sistema
  DOCENTE = 'docente',    // Gestión de cursos y exámenes
  ESTUDIANTE = 'estudiante', // Solo consulta de resultados
  WORKER = 'worker'       // Procesamiento de IA (sistema)
}
```

### Credenciales por Defecto (Desarrollo)
```bash
Email: admin@evaluacode.com
Password: Admin123!
Role: admin

⚠️ IMPORTANTE: Cambiar en producción
```

### Ejemplos de Uso

#### Registro
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "profesor@universidad.edu",
    "password": "SecurePass123!",
    "confirmPassword": "SecurePass123!",
    "role": "docente"
  }'
```

#### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@evaluacode.com",
    "password": "Admin123!"
  }'
```

#### Acceso a Endpoint Protegido
```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <your-access-token>"
```

## 📁 Sistema de Upload de Archivos

### Integración con Cloudinary
- **Storage**: Cloudinary Free Tier (25 créditos/mes)
- **Límites**: 10MB por archivo, máximo 5 archivos simultáneos
- **Tipos soportados**: Imágenes, PDFs, documentos, código fuente
- **Organización**: Carpetas automáticas por propósito (submissions, avatars, templates)

### Ejemplos de Upload

#### Subir archivo único
```bash
curl -X POST http://localhost:3000/api/upload/single \
  -H "Authorization: Bearer <your-access-token>" \
  -F "file=@/path/to/file.pdf" \
  -F "purpose=exam_submission" \
  -F "examId=uuid-del-examen"
```

#### Subir múltiples archivos
```bash
curl -X POST http://localhost:3000/api/upload/multiple \
  -H "Authorization: Bearer <your-access-token>" \
  -F "files=@/path/to/file1.jpg" \
  -F "files=@/path/to/file2.pdf" \
  -F "purpose=general"
```

## 🏗️ Arquitectura

### Stack Tecnológico
- **Runtime:** Node.js 20+ con TypeScript
- **Framework:** Express.js con Helmet + CORS
- **Base de Datos:** PostgreSQL + Prisma ORM
- **Autenticación:** JWT con OAuth 2.0 + PKCE
- **Cache:** Redis para sesiones y colas
- **Almacenamiento:** Cloudinary (plan free)
- **IA/ML:** Gemini SDK + OpenAI (fallback)

### Principios de Diseño
- **Microservicios:** Separación entre Core API y Motor IA
- **Type Safety:** TypeScript estricto con Zod para validaciones
- **Security First:** Helmet, CORS, rate limiting, JWT rotation
- **Observabilidad:** Logging estructurado y health checks
- **Escalabilidad:** Redis queues y horizontal scaling ready

## 🔄 Estado del Desarrollo

### **Backend Express (API Core) - ✅ COMPLETO**
1. **✅ Sistema de Autenticación** - JWT + RSA + RBAC completo
2. **✅ Gestión Académica** - Cursos + inscripciones + permisos
3. **✅ Gestión de Exámenes** - CRUD + metadatos + ubicación archivos
4. **✅ Envío y Calificación** - Submit + manual grading
5. **✅ Upload de Archivos** - Cloudinary integration
6. **✅ Gestión de Rúbricas** - Esquemas definidos (implementación pendiente)

### **Próximas Fases**
7. **🔄 Motor de IA (FastAPI)** - OCR + análisis semántico + evaluación código
8. **🔄 Analytics y Reportes** - Dashboard de métricas
9. **🔄 Frontend Web** - React/Next.js dashboard

## 🚨 Notas Importantes

- El servidor se inicia en `http://localhost:3000` por defecto
- Los logs detallados solo aparecen en modo `development`
- Las claves JWT deben rotarse cada 6 meses en producción
- Cloudinary free tier tiene límite de 25 créditos/mes
- Gemini API tiene límite de 60 RPM y 32k tokens/mes

---

**Desarrollado siguiendo las mejores prácticas de 2025 para aplicaciones enterprise**
