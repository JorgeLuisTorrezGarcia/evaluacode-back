# Pruebas de Caja Blanca para `authController.ts`

**Versión:** 1.0
**Fecha:** 2025-11-19
**Autor:** Gemini

## 1. Introducción

Este documento detalla el diseño de las pruebas de caja blanca para el módulo `AuthController`, ubicado en `src/modules/auth/authController.ts`. El objetivo es garantizar que cada ruta de ejecución lógica, cada bifurcación, y cada manejo de errores del controlador de autenticación sean verificados exhaustivamente.

Las pruebas se diseñan asumiendo el uso de un framework de pruebas como Jest y Supertest, con capacidades para mockear la base de datos (Prisma Client) y los servicios externos (`authService`).

## 2. Cobertura de Pruebas

Las pruebas cubrirán los siguientes aspectos del código:

-   **Rutas de Decisión:** Todas las declaraciones `if`/`else`.
-   **Manejo de Errores:** Todos los bloques `try`/`catch` y las instancias donde se lanzan `CustomError`.
-   **Interacciones con la Base de Datos:** Verificación de que se realizan las llamadas correctas a `prisma` (creación, búsqueda, actualización).
-   **Llamadas a Servicios:** Verificación de las llamadas a `authService` (hashing, verificación, generación de tokens).
-   **Validación de Esquemas:** Pruebas para datos de entrada válidos e inválidos según los esquemas de Zod.

---

## 3. Casos de Prueba por Método

### 3.1. `register`

#### 3.1.1. Ruta de Éxito

-   **ID:** `AUTH-REG-01`
-   **Descripción:** Un usuario se registra exitosamente con datos válidos, un email no existente y un rol válido.
-   **Precondiciones:**
    -   La base de datos no contiene un usuario con el email proporcionado.
    -   El rol (`STUDENT` o `DOCENTE`) existe en la tabla `Role`.
-   **Datos de Entrada:** `{ "email": "newuser@test.com", "password": "Password123!", "role": "STUDENT" }`
-   **Pasos de Ejecución:**
    1.  Realizar una petición `POST /api/auth/register` con los datos de entrada.
-   **Resultado Esperado:**
    -   Código de estado `201 Created`.
    -   La respuesta contiene un objeto `user` y `tokens`.
    -   Se verifica que `prisma.user.findUnique` fue llamado para chequear el email.
    -   Se verifica que `authService.hashPassword` fue llamado.
    -   Se verifica que `prisma.role.findUnique` fue llamado para obtener el rol.
    -   Se verifica que `prisma.user.create` fue llamado con los datos correctos.
    -   Se verifica que `authService.generateTokenPair` fue llamado.

#### 3.1.2. Ruta de Fallo: Email ya registrado

-   **ID:** `AUTH-REG-02`
-   **Descripción:** El registro falla porque el email ya existe en la base de datos.
-   **Precondiciones:**
    -   La base de datos ya contiene un usuario con el email `existinguser@test.com`.
-   **Datos de Entrada:** `{ "email": "existinguser@test.com", "password": "Password123!", "role": "STUDENT" }`
-   **Pasos de Ejecución:**
    1.  Realizar una petición `POST /api/auth/register` con los datos de entrada.
-   **Resultado Esperado:**
    -   Código de estado `400 Bad Request`.
    -   El mensaje de error es `'Email already registered'`.
    -   `prisma.user.create` no es llamado.

#### 3.1.3. Ruta de Fallo: Rol inválido

-   **ID:** `AUTH-REG-03`
-   **Descripción:** El registro falla porque el rol proporcionado no existe.
-   **Precondiciones:**
    -   El rol `INVALID_ROLE` no existe en la tabla `Role`.
-   **Datos de Entrada:** `{ "email": "anotheruser@test.com", "password": "Password123!", "role": "INVALID_ROLE" }`
-   **Pasos de Ejecución:**
    1.  Realizar una petición `POST /api/auth/register` con los datos de entrada.
-   **Resultado Esperado:**
    -   Código de estado `400 Bad Request`.
    -   El mensaje de error es `'Invalid role'`.
    -   `prisma.user.create` no es llamado.

#### 3.1.4. Ruta de Fallo: Validación de datos

-   **ID:** `AUTH-REG-04`
-   **Descripción:** El registro falla porque los datos de entrada no cumplen con el esquema de validación (ej. email inválido).
-   **Datos de Entrada:** `{ "email": "bademail", "password": "short", "role": "STUDENT" }`
-   **Pasos de Ejecución:**
    1.  Realizar una petición `POST /api/auth/register` con los datos de entrada.
-   **Resultado Esperado:**
    -   Código de estado `400 Bad Request`.
    -   La respuesta contiene errores de validación de Zod.

---

### 3.2. `login`

#### 3.2.1. Ruta de Éxito

-   **ID:** `AUTH-LOG-01`
-   **Descripción:** Un usuario inicia sesión exitosamente con credenciales válidas.
-   **Precondiciones:**
    -   Existe un usuario con el email `testuser@test.com` y una contraseña conocida.
    -   La cuenta no está bloqueada (`lockedUntil` es `null` o en el pasado).
-   **Datos de Entrada:** `{ "email": "testuser@test.com", "password": "CorrectPassword" }`
-   **Pasos de Ejecución:**
    1.  Realizar una petición `POST /api/auth/login` con los datos de entrada.
-   **Resultado Esperado:**
    -   Código de estado `200 OK`.
    -   La respuesta contiene el objeto `user` y `tokens`.
    -   Se verifica que `prisma.user.update` fue llamado para resetear `failedLoginAttempts` a `0`.

#### 3.2.2. Ruta de Fallo: Usuario no encontrado

-   **ID:** `AUTH-LOG-02`
-   **Descripción:** El inicio de sesión falla porque el email no existe.
-   **Datos de Entrada:** `{ "email": "nouser@test.com", "password": "anypassword" }`
-   **Pasos de Ejecución:**
    1.  Realizar una petición `POST /api/auth/login`.
-   **Resultado Esperado:**
    -   Código de estado `401 Unauthorized`.
    -   El mensaje de error es `'Invalid credentials'`.

#### 3.2.3. Ruta de Fallo: Contraseña incorrecta

-   **ID:** `AUTH-LOG-03`
-   **Descripción:** El inicio de sesión falla por contraseña incorrecta y se incrementa el contador de intentos fallidos.
-   **Precondiciones:**
    -   Existe un usuario `testuser@test.com` con `failedLoginAttempts` < 4.
-   **Datos de Entrada:** `{ "email": "testuser@test.com", "password": "WrongPassword" }`
-   **Pasos de Ejecución:**
    1.  Realizar una petición `POST /api/auth/login`.
-   **Resultado Esperado:**
    -   Código de estado `401 Unauthorized`.
    -   El mensaje de error es `'Invalid credentials'`.
    -   Se verifica que `prisma.user.update` fue llamado para incrementar `failedLoginAttempts`.

#### 3.2.4. Ruta de Fallo: Bloqueo de cuenta

-   **ID:** `AUTH-LOG-04`
-   **Descripción:** Al quinto intento fallido, la cuenta del usuario se bloquea.
-   **Precondiciones:**
    -   Existe un usuario `testuser@test.com` con `failedLoginAttempts` igual a 4.
-   **Datos de Entrada:** `{ "email": "testuser@test.com", "password": "WrongPassword" }`
-   **Pasos de Ejecución:**
    1.  Realizar una petición `POST /api/auth/login`.
-   **Resultado Esperado:**
    -   Código de estado `401 Unauthorized`.
    -   Se verifica que `prisma.user.update` fue llamado para establecer un valor en `lockedUntil`.

#### 3.2.5. Ruta de Fallo: Cuenta ya bloqueada

-   **ID:** `AUTH-LOG-05`
-   **Descripción:** El inicio de sesión falla porque la cuenta ya se encuentra bloqueada.
-   **Precondiciones:**
    -   Existe un usuario `testuser@test.com` con `lockedUntil` establecido a una fecha futura.
-   **Datos de Entrada:** `{ "email": "testuser@test.com", "password": "anypassword" }`
-   **Pasos de Ejecución:**
    1.  Realizar una petición `POST /api/auth/login`.
-   **Resultado Esperado:**
    -   Código de estado `423 Locked`.
    -   El mensaje de error contiene `'Account locked until...'`.

---

### 3.3. `refresh`

#### 3.3.1. Ruta de Éxito

-   **ID:** `AUTH-REF-01`
-   **Descripción:** Se renueva el `accessToken` usando un `refreshToken` válido.
-   **Precondiciones:**
    -   `authService.verifyRefreshToken` decodifica el token exitosamente y devuelve un payload con un `sub` (ID de usuario) válido.
    -   El usuario con el `id` del payload existe en la base de datos.
-   **Datos de Entrada:** `{ "refreshToken": "valid.refresh.token" }`
-   **Pasos de Ejecución:**
    1.  Realizar una petición `POST /api/auth/refresh`.
-   **Resultado Esperado:**
    -   Código de estado `200 OK`.
    -   La respuesta contiene un nuevo `accessToken`.
    -   Se verifica que `authService.generateAccessToken` fue llamado.

#### 3.3.2. Ruta de Fallo: Token inválido o expirado

-   **ID:** `AUTH-REF-02`
-   **Descripción:** La renovación falla porque el `refreshToken` es inválido o ha expirado.
-   **Precondiciones:**
    -   `authService.verifyRefreshToken` lanza una excepción (ej. `JsonWebTokenError`).
-   **Datos de Entrada:** `{ "refreshToken": "invalid.or.expired.token" }`
-   **Pasos de Ejecución:**
    1.  Realizar una petición `POST /api/auth/refresh`.
-   **Resultado Esperado:**
    -   El error es capturado y pasado a `next()`. Se espera un código de estado de error JWT (ej. `401` o `403`).

#### 3.3.3. Ruta de Fallo: Usuario no encontrado

-   **ID:** `AUTH-REF-03`
-   **Descripción:** La renovación falla porque el usuario asociado al token ya no existe.
-   **Precondiciones:**
    -   `authService.verifyRefreshToken` devuelve un payload con un `sub` que no corresponde a ningún usuario en la BD.
-   **Datos de Entrada:** `{ "refreshToken": "valid.token.for.deleted.user" }`
-   **Pasos de Ejecución:**
    1.  Realizar una petición `POST /api/auth/refresh`.
-   **Resultado Esperado:**
    -   Código de estado `404 Not Found`.
    -   El mensaje de error es `'User not found'`.

---

### 3.4. `me`

#### 3.4.1. Ruta de Éxito

-   **ID:** `AUTH-ME-01`
-   **Descripción:** Se obtiene la información del usuario autenticado.
-   **Precondiciones:**
    -   La petición incluye un `Authorization` header con un token JWT válido.
    -   El middleware de autenticación ha añadido el objeto `user` a `req`.
    -   El usuario existe en la base de datos.
-   **Datos de Entrada:** (Ninguno, solo header `Authorization`)
-   **Pasos de Ejecución:**
    1.  Realizar una petición `GET /api/auth/me`.
-   **Resultado Esperado:**
    -   Código de estado `200 OK`.
    -   La respuesta contiene la información del usuario sin datos sensibles.
    -   Se verifica que `prisma.user.findUnique` fue llamado con el `id` del usuario.

#### 3.4.2. Ruta de Fallo: Sin autenticación

-   **ID:** `AUTH-ME-02`
-   **Descripción:** La petición falla por falta de token de autenticación.
-   **Precondiciones:**
    -   `req.user` es `undefined`.
-   **Datos de Entrada:** (Ninguno)
-   **Pasos de Ejecución:**
    1.  Realizar una petición `GET /api/auth/me` sin el header `Authorization`.
-   **Resultado Esperado:**
    -   Código de estado `401 Unauthorized`.
    -   El mensaje de error es `'Authentication required'`.

#### 3.4.3. Ruta de Fallo: Usuario no encontrado

-   **ID:** `AUTH-ME-03`
-   **Descripción:** La petición falla porque el usuario del token ya no existe.
-   **Precondiciones:**
    -   `req.user` está definido, pero `prisma.user.findUnique` devuelve `null`.
-   **Datos de Entrada:** (Header `Authorization` con token de un usuario eliminado)
-   **Pasos de Ejecución:**
    1.  Realizar una petición `GET /api/auth/me`.
-   **Resultado Esperado:**
    -   Código de estado `404 Not Found`.
    -   El mensaje de error es `'User not found'`.

---

### 3.5. `changePassword`

#### 3.5.1. Ruta de Éxito

-   **ID:** `AUTH-CPW-01`
-   **Descripción:** El usuario cambia su contraseña exitosamente.
-   **Precondiciones:**
    -   Usuario autenticado (`req.user` existe).
    -   La `currentPassword` proporcionada es correcta.
-   **Datos de Entrada:** `{ "currentPassword": "OldPassword123", "newPassword": "NewPassword456!" }`
-   **Pasos de Ejecución:**
    1.  Realizar una petición `POST /api/auth/change-password`.
-   **Resultado Esperado:**
    -   Código de estado `200 OK`.
    -   Mensaje `'Password changed successfully'`.
    -   Se verifica que `authService.verifyPassword` fue llamado.
    -   Se verifica que `authService.hashPassword` fue llamado para la nueva contraseña.
    -   Se verifica que `prisma.user.update` fue llamado para guardar el nuevo hash.

#### 3.5.2. Ruta de Fallo: Contraseña actual incorrecta

-   **ID:** `AUTH-CPW-02`
-   **Descripción:** Falla el cambio de contraseña porque la contraseña actual es incorrecta.
-   **Precondiciones:**
    -   Usuario autenticado.
    -   `authService.verifyPassword` devuelve `false`.
-   **Datos de Entrada:** `{ "currentPassword": "WrongOldPassword", "newPassword": "NewPassword456!" }`
-   **Pasos de Ejecución:**
    1.  Realizar una petición `POST /api/auth/change-password`.
-   **Resultado Esperado:**
    -   Código de estado `400 Bad Request`.
    -   El mensaje de error es `'Current password is incorrect'`.

#### 3.5.3. Ruta de Fallo: Sin autenticación

-   **ID:** `AUTH-CPW-03`
-   **Descripción:** El cambio de contraseña falla por falta de autenticación.
-   **Precondiciones:**
    -   `req.user` es `undefined`.
-   **Datos de Entrada:** `{ "currentPassword": "OldPassword123", "newPassword": "NewPassword456!" }`
-   **Pasos de Ejecución:**
    1.  Realizar una petición `POST /api/auth/change-password` sin token.
-   **Resultado Esperado:**
    -   Código de estado `401 Unauthorized`.
    -   El mensaje de error es `'Authentication required'`.

---
### 3.6. `resetPassword`

#### 3.6.1. Ruta de Éxito

-   **ID:** `AUTH-RPW-01`
-   **Descripción:** Se resetea la contraseña con un token válido y no expirado.
-   **Precondiciones:**
    -   El token proporcionado es un string base64 válido que decodifica a `userId-timestamp`.
    -   El `timestamp` tiene menos de 24 horas de antigüedad.
    -   El `userId` existe en la base de datos.
-   **Datos de Entrada:** `{ "token": "valid-base64-token", "newPassword": "NewPassword123!" }`
-   **Pasos de Ejecución:**
    1.  Realizar una petición `POST /api/auth/reset-password`.
-   **Resultado Esperado:**
    -   Código de estado `200 OK`.
    -   Mensaje `'Password has been successfully reset'`.
    -   Se verifica que `prisma.user.update` se llamó para actualizar la contraseña.

#### 3.6.2. Ruta de Fallo: Token con formato inválido

-   **ID:** `AUTH-RPW-02`
-   **Descripción:** El reseteo falla porque el token no se puede decodificar o no tiene el formato `userId-timestamp`.
-   **Datos de Entrada:** `{ "token": "invalid-token-format", "newPassword": "NewPassword123!" }`
-   **Pasos de Ejecución:**
    1.  Realizar una petición `POST /api/auth/reset-password`.
-   **Resultado Esperado:**
    -   Código de estado `400 Bad Request`.
    -   Mensaje `'Invalid reset token'`.

#### 3.6.3. Ruta de Fallo: Token expirado

-   **ID:** `AUTH-RPW-03`
-   **Descripción:** El reseteo falla porque el timestamp del token tiene más de 24 horas.
-   **Precondiciones:**
    -   El token es válido en formato, pero el `timestamp` es > 24 horas en el pasado.
-   **Datos de Entrada:** `{ "token": "valid-but-expired-token", "newPassword": "NewPassword123!" }`
-   **Pasos de Ejecución:**
    1.  Realizar una petición `POST /api/auth/reset-password`.
-   **Resultado Esperado:**
    -   Código de estado `400 Bad Request`.
    -   Mensaje `'Reset token has expired'`.

#### 3.6.4. Ruta de Fallo: Usuario no encontrado

-   **ID:** `AUTH-RPW-04`
-   **Descripción:** El reseteo falla porque el `userId` del token no corresponde a un usuario existente.
-   **Precondiciones:**
    -   El token es válido y no expirado, pero el `userId` no está en la base de datos.
-   **Datos de Entrada:** `{ "token": "token-for-deleted-user", "newPassword": "NewPassword123!" }`
-   **Pasos de Ejecución:**
    1.  Realizar una petición `POST /api/auth/reset-password`.
-   **Resultado Esperado:**
    -   Código de estado `400 Bad Request`.
    -   Mensaje `'Invalid reset token'`.
