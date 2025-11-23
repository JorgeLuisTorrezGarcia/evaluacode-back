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



# Docker
docker build -t evaluacode-back:1.0 .

docker run -d -p 3000:3000 --env-file .env evaluacode-back:1.0



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
| Método | Ruta              | Descripción                              |
|--------|-------------------|------------------------------------------|
| GET    | `/api/health`     | Estado completo del sistema              |
| GET    | `/api/health/ping`| Ping sencillo para balanceadores         |
| GET    | `/api/health/ready` | Verificación de readiness (Kubernetes) |

### Autenticación y Sesiones
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/register` | Registrar nuevo usuario |
| POST | `/api/auth/login` | Iniciar sesión |
| POST | `/api/auth/refresh` | Renovar access token con refresh token |
| POST | `/api/auth/logout` | Cerrar sesión e invalidar refresh token |
| GET  | `/api/auth/me` | Información del usuario autenticado |
| POST | `/api/auth/change-password` | Cambiar contraseña actual |
| POST | `/api/auth/forgot-password` | Solicitar token de recuperación (simulado en consola) |
| POST | `/api/auth/reset-password` | Restablecer contraseña con token |

### Gestión de Cursos
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET  | `/api/courses` | Listar cursos con filtros y paginación |
| GET  | `/api/courses/:id` | Detalles del curso |
| POST | `/api/courses` | Crear curso (admin/docente) |
| PUT  | `/api/courses/:id` | Actualizar curso (admin/docente asignado) |
| DELETE | `/api/courses/:id` | Eliminar curso (admin, sin exámenes asociados) |
| POST | `/api/courses/:id/assign-docente` | Asignar docente (admin) |
| POST | `/api/courses/:id/enroll` | Matricular estudiante (admin/docente) |
| DELETE | `/api/courses/:id/unenroll` | Desmatricular estudiante (admin/docente) |

### Gestión de Exámenes
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET  | `/api/exams` | Listar exámenes con filtros |
| GET  | `/api/exams/:id` | Detalle de examen |
| POST | `/api/exams` | Crear examen (admin/docente) |
| PUT  | `/api/exams/:id` | Actualizar examen (admin/docente asignado) |
| DELETE | `/api/exams/:id` | Eliminar examen (sin submissions)|
| POST | `/api/exams/:id/submit` | Enviar respuestas (estudiantes) |
| POST | `/api/exams/:id/grade` | Calificar manualmente (docentes/admin) |

### Gestión de Rúbricas
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET  | `/api/rubrics` | Listar rúbricas con filtros |
| GET  | `/api/rubrics/:id` | Detalle de rúbrica |
| POST | `/api/rubrics` | Crear rúbrica |
| PUT  | `/api/rubrics/:id` | Actualizar rúbrica |
| DELETE | `/api/rubrics/:id` | Eliminar rúbrica |
| POST | `/api/rubrics/:id/criteria` | Agregar criterio |
| POST | `/api/rubrics/:id/duplicate` | Duplicar rúbrica a otro examen |

### Upload de Archivos
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/upload/single` | Subir archivo único (hasta 10 MB) |
| POST | `/api/upload/multiple` | Subir hasta 5 archivos |
| GET  | `/api/upload/list` | Listar archivos del usuario |
| DELETE | `/api/upload/:publicId` | Eliminar archivo (propietario/admin) |

### Roadmap / Próximos Endpoints
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/ai/process-exam` | Procesamiento automático con motor IA (FastAPI) |
| GET  | `/api/submissions/:id` | Detalle de submission (pendiente) |
| GET  | `/api/analytics/course/:id` | Analytics avanzadas para docentes |

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
