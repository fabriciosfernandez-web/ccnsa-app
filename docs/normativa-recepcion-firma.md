# ADR-007 — Recepción electrónica de normativa con firma manuscrita y validación reforzada

**Estado:** adoptada como decisión de arquitectura; pendiente de implementación y pruebas.  
**Ámbito:** Centro Cultural Nuestra Señora de la Asunción (CCNSA).  
**Fecha:** 2026-10-28.  
**Objetivo:** obtener constancias verificables de recepción de documentos internos sin adquirir una plataforma comercial de firmas.

## 1. Decisión

Incorporar a la aplicación React/Firebase del CCNSA un módulo **Normativa institucional** con:

1. Acceso por cuenta personal activa vinculada a un `socioId` institucional.
2. Presentación de un PDF **publicado e inmutable por versión**, con título, versión, fecha y hash SHA-256 calculado sobre los bytes reales.
3. Declaración expresa y específica de **acuse de recibo** (no equiparar automáticamente recepción con consentimiento, aprobación o lectura efectivamente realizada).
4. **Verificación adicional** mediante código de un solo uso (OTP) enviado a un canal previamente verificado, con desafío de corta duración y límites de intentos y reenvíos.
5. Firma manuscrita dibujada con mouse o pantalla táctil, vinculada al expediente del acuse.
6. Registro de la operación **exclusivamente desde un backend confiable** que compruebe identidad, OTP, documento y unicidad en una transacción.
7. Generación de constancia PDF individual, con firma visible, datos de identificación mínimos, declaración exacta, fecha/hora de servidor, identificador, versión y hashes.
8. Bitácora de auditoría, panel de pendientes, descarga segura de constancias y exportaciones para Secretaría/Consejo.
9. Conservación de cada versión y su acuse histórico, incluso cuando se publique una versión posterior.

**No equivale** a una firma electrónica cualificada bajo legislación paraguaya; no debe llamarse firma digital certificada ni prometer no repudio absoluto. La firma dibujada es evidencia complementaria, no un control criptográfico autónomo.

## 2. Modelo propuesto de datos

### `normativas/{normativaId}`

Documento **versionado**. `normativaId` único por documento y versión; por ejemplo `normas-basicas_v2026-01`.

- `codigo`, `titulo`, `version`, `descripcion`, `categoria`.
- `declaracion`: texto literal firmado, estable para esa versión (p. ej.: «Declaro haber recibido y tenido a disposición...», con identificación inequívoca del documento).
- `documentoStoragePath`: ruta privada al PDF original, no un enlace de descarga público.
- `documentoSha256`: hash obtenido **del archivo**, validado en backend.
- `estado`: `BORRADOR | PUBLICADA | RETIRADA`.
- `publicadaAt`, `vigenteDesde`, `publicadaPorUid`: controlados desde backend.
- `requiereAcuse`: booleano. Nunca se edita una versión PUBLICADA; una modificación requiere nueva versión/ID.

### `normativa_challenges/{challengeId}` (servidor solamente)

- `uid`, `normativaId`, `canal`, `destinoVerificado` (idealmente minimizado), `otpHmac`, `createdAt`, `expiresAt`, `attempts`, `sentCount`, `consumedAt`.
- HMAC del OTP con secreto en Secret Manager: **no** guardar el código en claro ni utilizar SHA-256 simple para un código de 6 dígitos.
- Expiración orientativa: 5 minutos; máximo 5 intentos, reenvíos limitados, invalidación del anterior. Usar transacciones para evitar condiciones de carrera.
- El control de envío e intentos se refuerza con límites por usuario, documento y ventana temporal; los desafíos no son legibles por clientes.

### `normativa_acuses/{normativaId}__{uid}` (escritura exclusiva del servidor)

- `uid`, `socioId`, `normativaId`, `documentoSha256`, `version`, `declaracion`.
- `verifiedChannel`, `verifiedAt`, `signedAt` (tiempo de servidor), `signaturePath`, `constanciaPath`, `constanciaSha256`.
- `evidenceId` aleatorio (además de clave de unicidad), `evidenceFormatVersion`, `status`: `CONFIRMADA | PENDIENTE_REPARACION`.
- No almacenar PIN, OTP, contraseña ni tokens de acceso. No almacenar datos adicionales como IP completa salvo base jurídica, necesidad y política de conservación definidas.
- No permitir actualizaciones o borrados ordinarios; si hay corrección excepcional, registrar un **evento compensatorio** separado sin reescribir el acuse original.

### `normativa_audit/{eventId}` (escritura exclusiva del servidor)

Eventos: publicación, envío de desafío (sin OTP), OTP validado o rechazado, firma confirmada, descarga administrativa, cambio de estado excepcional. Incluye actor, documento/versión, identificador de evidencia y fecha de servidor.

## 3. Diseño de autorización y seguridad

- SOCIO: ve normativas vigentes para su alcance y **solo sus propios acuses/constancias**. No puede crear, modificar o borrar un acuse directamente en Firestore.
- ADMIN: publica versiones mediante backend y consulta estado global. `CONSULTA` puede ver reportes según criterio institucional; no obtiene automáticamente acceso irrestricto a firmas.
- TESORERIA: **sin permiso de publicación** salvo decisión expresa posterior.
- Desafíos, evidencias privadas y bitácoras: `allow write: if false` en reglas de cliente; solamente funciones con Admin SDK. Restringir lecturas de Storage por identidad/rol; evitar URL públicas permanentes.
- Cloud Functions callable con comprobación de Firebase Auth, `users/{uid}` activo, `role == SOCIO` y `socioId` coherente. Verificar `email_verified` si el OTP se envía por correo.
- El backend vuelve a verificar **bytes/hash de PDF**, estado publicado, coincidencia de OTP con usuario y documento, intento no consumido y acuse inexistente. Confirmación transaccional e idempotente.
- Recomendado: App Check con enforcement antes de producción, protección contra replay en operación sensible y registro de alertas por abuso.
- Reglas y funciones deben probarse con emuladores, incluidos casos de carreras, OTP expirado, suplantación de `socioId`, otro `uid`, PDF alterado, doble firma y roles erróneos.
- Para resistencia a alteraciones por administradores del proyecto, exportar periódicamente hashes/constancias a ubicación independiente con controles de conservación, separar funciones de administración y revisar política de copias de seguridad. **Firestore no es por sí mismo inmutable frente al administrador**.

## 4. Flujo de experiencia

**Socio:**
1. Ingresa → «Normativa institucional».
2. Abre/descarga versión publicada. No inferir que *leyó* solamente porque abrió el PDF.
3. Marca «Acuso recibo», cuya declaración exacta se muestra completa.
4. Dibuja firma (opción «Limpiar»); la firma no se reutiliza sin autorización.
5. Solicita código al canal verificado; introduce OTP.
6. Confirma → la función verifica y registra. **Nunca** mostrar «Firmado» antes del acuse positivo del backend.
7. Descarga la constancia y puede revisar historial por documento y versión.

**Administrador/Secretaría:** carga borrador, verifica archivo y hash, publica versión sin posibilidad de sobreescribirla, supervisa pendientes y confirmados, exporta matriz, consulta evidencias conforme a roles.

**Estados:** `PENDIENTE`, `DESAFIO_EMITIDO` (transitorio), `CONFIRMADA`, `SUSTITUIDA_POR_NUEVA_VERSION`; esta última no modifica el registro histórico.

## 5. Constancia PDF

Encabezado CCNSA; identificación de socio; título/código/versión; hash SHA-256 completo del PDF normativo; declaración literal; fecha/hora de servidor con zona `America/Asuncion`; firma dibujada; método de verificación adicional; identificador de evidencia y hash de la constancia registrado fuera del archivo.

**Evitar dependencia circular:** el hash de la constancia no debe imprimirse dentro del PDF que se está calculando. Conservarlo en el registro de evidencia, exportable junto con el PDF.

La constancia no es certificado cualificado ni acreditación de lectura efectiva. La puesta a disposición, la recepción y la aceptación se modelan como declaraciones diferentes.

## 6. Implementación y condiciones de salida

**Etapa A — base (desarrollo):** páginas de consulta/publicación, documento versionado, reglas de lectura, lienzo de firma accesible, configuración de backend; sin activación de firma real.

**Etapa B — validación segura:** elegir y configurar envío OTP (correo institucional mediante servicio autorizado o TOTP de Identity Platform si se aprueba su activación). El canal debe estar previamente verificado; enviar OTP a la misma cuenta utilizada para iniciar sesión no equivale necesariamente a MFA independiente. Implementar funciones, reglas y tests.

**Etapa C — evidencia:** constancia PDF de servidor, Storage privado, audit trail, idempotencia, exportación de hashes, backups y reportes de cumplimiento.

**Etapa D — piloto:** cuentas ficticias → grupo reducido de socios con consentimiento → pruebas de restauración, controles de acceso y costo → decisión explícita de publicación.

**Criterios de aceptación obligatorios:**
- No se puede firmar sin identidad válida y prueba adicional verificable.
- Un socio no puede firmar por otro ni alterar campos de identidad o hash.
- No se puede cambiar el contenido de un PDF ya publicado conservando la misma versión.
- Reintentos/concurrencia no generan constancias duplicadas.
- El acuse y el PDF se recuperan consistentemente; fallas intermedias tienen reparación controlada.
- Un socio no puede ver la firma de otro.
- Un administrador ordinario no puede borrar silenciosamente evidencia sin controles independientes.
- Los estados se calculan respecto de la **versión concreta**.
- Pruebas de Firebase Emulator/Storage/Functions y revisión de protección de datos superadas.

## 7. Costos y dependencias

No se compra servicio comercial de firma, pero **costo cero no está garantizado**: Cloud Functions/Storage/Secret Manager/correo pueden generar cargos o requerir Blaze/Identity Platform. Mantener alertas de presupuesto, métricas y límites de cuotas; el presupuesto no es necesariamente un techo de facturación.

**Dependencias previas a activar:** dirección institucional y canal de correo efectivo; propiedad/verificación de emails de socios; configuración de funciones y secretos; políticas de conservación y respaldo; validación jurídica de la redacción del acuse; permisos institucionales para publicar normativa.

## 8. Alcance de esta decisión

Este archivo constituye una **decisión funcional y técnica**. No despliega Cloud Functions ni crea constancias reales, y no modifica el módulo financiero ni el servicio de notificaciones actual. No habilitar firmas en producción por un simple cambio de interfaz o formulario sin los controles previos.
