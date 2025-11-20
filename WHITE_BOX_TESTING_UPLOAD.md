# Pruebas de Caja Blanca para `uploadController.ts`

**Versión:** 1.0
**Fecha:** 2025-11-19
**Autor:** Gemini

## 1. Introducción

Este documento detalla los casos de prueba de caja blanca para el `UploadController`, que gestiona la subida, eliminación y listado de archivos. El objetivo es asegurar la correcta funcionalidad, el manejo de errores y los controles de seguridad en cada método del controlador.

Se asume un entorno de pruebas con Jest y Supertest, con mocks para el `CloudinaryService` y `PrismaClient`. Se utilizará un usuario de prueba con rol `DOCENTE` (`profesorluis@universidad.edu`) y otro con rol `ESTUDIANTE` para verificar la lógica de permisos.

## 2. Cobertura de Pruebas del Middleware `upload` (Multer)

Estas pruebas se centran en la configuración del middleware `multer` exportado en el mismo archivo.

-   **ID:** `UPLOAD-MW-01`
-   **Descripción:** Un archivo con un tipo MIME permitido (ej. `image/png`) es aceptado por el filtro.
-   **Resultado Esperado:** El middleware `upload` pasa el control al siguiente handler (`uploadSingle`/`uploadMultiple`).

-   **ID:** `UPLOAD-MW-02`
-   **Descripción:** Un archivo con un tipo MIME no permitido (ej. `application/x-executable`) es rechazado.
-   **Resultado Esperado:** El `fileFilter` invoca su callback con un error (`Error: File type not allowed...`), que es capturado por el manejador de errores de Express. Se devuelve un error 4xx/5xx.

-   **ID:** `UPLOAD-MW-03`
-   **Descripción:** Se intenta subir un archivo que excede el límite de tamaño de 10MB.
-   **Resultado Esperado:** Multer emite un error `LIMIT_FILE_SIZE`. Se devuelve un error 4xx.

-   **ID:** `UPLOAD-MW-04`
-   **Descripción:** Se intentan subir más de 5 archivos en una petición a `uploadMultiple`.
-   **Resultado Esperado:** Multer emite un error `LIMIT_FILE_COUNT`. Se devuelve un error 4xx.

---

## 3. Casos de Prueba por Método

### 3.1. `uploadSingle`

#### 3.1.1. Ruta de Éxito

-   **ID:** `UPLOAD-SGL-01`
-   **Descripción:** Un docente sube un único archivo para una plantilla de examen (`exam_template`).
-   **Precondiciones:**
    -   Usuario `profesorluis@universidad.edu` (DOCENTE) autenticado.
-   **Datos de Entrada:**
    -   `req.file`: Un archivo válido (ej. `template.pdf`).
    -   `req.body`: `{ "purpose": "exam_template" }`.
-   **Pasos de Ejecución:**
    1.  Realizar una petición `POST /api/upload/single` con los datos.
-   **Resultado Esperado:**
    -   Código de estado `201 Created`.
    -   `CloudinaryService.uploadFile` es llamado con opciones que incluyen `folder: 'evaluacode/templates'`.
    -   `prisma.uploadedFile.create` es llamado con los metadatos correctos del archivo y el `purpose` especificado.
    -   La respuesta JSON contiene los detalles del archivo subido.

#### 3.1.2. Ruta de Fallo: Sin archivo

-   **ID:** `UPLOAD-SGL-02`
-   **Descripción:** La petición falla porque no se adjunta ningún archivo.
-   **Precondiciones:** Usuario autenticado.
-   **Datos de Entrada:** Petición sin `req.file`.
-   **Pasos de Ejecución:**
    1.  Realizar `POST /api/upload/single` sin un archivo `multipart/form-data`.
-   **Resultado Esperado:**
    -   Código de estado `400 Bad Request`.
    -   Mensaje de error: `'No file provided'`.

#### 3.1.3. Ruta de Fallo: Sin autenticación

-   **ID:** `UPLOAD-SGL-03`
-   **Descripción:** La subida falla por falta de un usuario autenticado.
-   **Precondiciones:** `req.user` es `undefined`.
-   **Datos de Entrada:** Un archivo válido.
-   **Pasos de Ejecución:**
    1.  Realizar `POST /api/upload/single` sin token de autenticación.
-   **Resultado Esperado:**
    -   Código de estado `401 Unauthorized`.
    -   Mensaje de error: `'Authenticated user required'`.

#### 3.1.4. Ruta de Fallo: Error de servicio externo

-   **ID:** `UPLOAD-SGL-04`
-   **Descripción:** La subida falla porque el servicio de Cloudinary devuelve un error.
-   **Precondiciones:** Usuario autenticado. `CloudinaryService.uploadFile` es mockeado para que lance una excepción.
-   **Datos de Entrada:** Un archivo válido.
-   **Pasos de Ejecución:**
    1.  Realizar `POST /api/upload/single`.
-   **Resultado Esperado:**
    -   El error es capturado y pasado a `next()`. Se espera un código 5xx.
    -   `prisma.uploadedFile.create` no es llamado.

---

### 3.2. `uploadMultiple`

#### 3.2.1. Ruta de Éxito

-   **ID:** `UPLOAD-MULTI-01`
-   **Descripción:** Un estudiante sube múltiples archivos como entrega de un examen (`exam_submission`).
-   **Precondiciones:** Usuario `estudiante@universidad.edu` (ESTUDIANTE) autenticado.
-   **Datos de Entrada:**
    -   `req.files`: Un array de 2 archivos válidos.
    -   `req.body`: `{ "purpose": "exam_submission", "examId": "exam-123", "submissionId": "sub-456" }`.
-   **Pasos de Ejecución:**
    1.  Realizar `POST /api/upload/multiple` con los datos.
-   **Resultado Esperado:**
    -   Código de estado `201 Created`.
    -   `CloudinaryService.uploadFile` y `prisma.uploadedFile.create` son llamados dos veces (una por cada archivo).
    -   Todas las promesas en `Promise.all` se resuelven.
    -   La respuesta contiene un array con los detalles de los dos archivos.

#### 3.2.2. Ruta de Fallo: Sin archivos

-   **ID:** `UPLOAD-MULTI-02`
-   **Descripción:** La petición falla porque no se adjuntan archivos en el array `files`.
-   **Precondiciones:** Usuario autenticado.
-   **Datos de Entrada:** Petición donde `req.files` está vacío o no es un array.
-   **Pasos de Ejecución:**
    1.  Realizar `POST /api/upload/multiple`.
-   **Resultado Esperado:**
    -   Código de estado `400 Bad Request`.
    -   Mensaje de error: `'No files provided'`.

---

### 3.3. `deleteFile`

#### 3.3.1. Ruta de Éxito: Propietario del archivo

-   **ID:** `UPLOAD-DEL-01`
-   **Descripción:** Un usuario autenticado elimina un archivo que le pertenece.
-   **Precondiciones:**
    -   Usuario `profesorluis@universidad.edu` autenticado.
    -   Existe un registro en `UploadedFile` cuyo `uploadedById` coincide con el ID del usuario y tiene un `cloudinaryPublicId` conocido.
-   **Datos de Entrada:** `req.params`: `{ "publicId": "path/to/owned_file" }`.
-   **Pasos de Ejecución:**
    1.  Realizar `DELETE /api/upload/:publicId`.
-   **Resultado Esperado:**
    -   Código de estado `200 OK`.
    -   `prisma.uploadedFile.findFirst` es llamado y encuentra el archivo.
    -   La condición `fileRecord.uploadedById !== req.user?.id` es falsa.
    -   `CloudinaryService.deleteFile` es llamado con el `publicId`.
    -   `prisma.uploadedFile.delete` es llamado para eliminar el registro.

#### 3.3.2. Ruta de Éxito: Administrador

-   **ID:** `UPLOAD-DEL-02`
-   **Descripción:** Un usuario `ADMIN` elimina un archivo que no le pertenece.
-   **Precondiciones:**
    -   Usuario con rol `ADMIN` autenticado.
    -   Existe un archivo que no fue subido por el admin.
-   **Datos de Entrada:** `req.params`: `{ "publicId": "path/to/unowned_file" }`.
-   **Pasos de Ejecución:**
    1.  Realizar `DELETE /api/upload/:publicId`.
-   **Resultado Esperado:**
    -   Código de estado `200 OK`.
    -   La condición `req.user?.role !== UserRole.ADMIN` es falsa, por lo que la comprobación de propietario se salta.
    -   El archivo es eliminado exitosamente.

#### 3.3.3. Ruta de Fallo: No autorizado

-   **ID:** `UPLOAD-DEL-03`
-   **Descripción:** Un usuario intenta eliminar un archivo que no le pertenece y no es admin.
-   **Precondiciones:**
    -   Usuario `profesorluis@universidad.edu` autenticado.
    -   El archivo con el `publicId` dado fue subido por otro usuario.
-   **Datos de Entrada:** `req.params`: `{ "publicId": "path/to/unowned_file" }`.
-   **Pasos de Ejecución:**
    1.  Realizar `DELETE /api/upload/:publicId`.
-   **Resultado Esperado:**
    -   Código de estado `403 Forbidden`.
    -   Mensaje de error: `'Not authorized to delete this file'`.
    -   `CloudinaryService.deleteFile` y `prisma.uploadedFile.delete` no son llamados.

#### 3.3.4. Ruta de Fallo: Archivo no encontrado

-   **ID:** `UPLOAD-DEL-04`
-   **Descripción:** Se intenta eliminar un archivo con un `publicId` que no existe en la base de datos.
-   **Precondiciones:** `prisma.uploadedFile.findFirst` es mockeado para devolver `null`.
-   **Datos de Entrada:** `req.params`: `{ "publicId": "non_existent_id" }`.
-   **Pasos de Ejecución:**
    1.  Realizar `DELETE /api/upload/:publicId`.
-   **Resultado Esperado:**
    -   Código de estado `404 Not Found`.
    -   Mensaje de error: `'File not found'`.

---

### 3.4. `listFiles`

#### 3.4.1. Ruta de Éxito: Listado para Docente (sin filtros)

-   **ID:** `UPLOAD-LIST-01`
-   **Descripción:** Un docente obtiene la lista de todos los archivos del sistema.
-   **Precondiciones:**
    -   Usuario `profesorluis@universidad.edu` (rol `DOCENTE`) autenticado.
-   **Datos de Entrada:** (Sin query params)
-   **Pasos de Ejecución:**
    1.  Realizar `GET /api/upload/list`.
-   **Resultado Esperado:**
    -   Código de estado `200 OK`.
    -   La cláusula `where` de `prisma.uploadedFile.findMany` es un objeto vacío `{}` porque el rol no es `ESTUDIANTE`.
    -   La respuesta contiene una lista paginada de archivos.

#### 3.4.2. Ruta de Éxito: Listado para Estudiante

-   **ID:** `UPLOAD-LIST-02`
-   **Descripción:** Un estudiante obtiene la lista de únicamente sus propios archivos.
-   **Precondiciones:**
    -   Usuario `estudiante@universidad.edu` (rol `ESTUDIANTE`) autenticado.
-   **Datos de Entrada:** (Sin query params)
-   **Pasos de Ejecución:**
    1.  Realizar `GET /api/upload/list`.
-   **Resultado Esperado:**
    -   Código de estado `200 OK`.
    -   La cláusula `where` de `prisma.uploadedFile.findMany` contiene `{ uploadedById: 'student-user-id' }`.
    -   La respuesta solo incluye archivos subidos por este estudiante.

#### 3.4.3. Ruta de Éxito: Con filtros

-   **ID:** `UPLOAD-LIST-03`
-   **Descripción:** Se lista archivos filtrando por `purpose` y `examId`.
-   **Precondiciones:** Usuario autenticado.
-   **Datos de Entrada:** `req.query`: `{ "purpose": "exam_submission", "examId": "exam-123" }`.
-   **Pasos de Ejecución:**
    1.  Realizar `GET /api/upload/list` con los query params.
-   **Resultado Esperado:**
    -   Código de estado `200 OK`.
    -   La cláusula `where` de Prisma contiene `{ purpose: 'exam_submission', examId: 'exam-123' }`.
    -   La respuesta solo incluye archivos que cumplen con ambos criterios.
