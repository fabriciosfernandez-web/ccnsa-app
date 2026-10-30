# ADR-007 — Recepción y aceptación electrónica de normativa con validación reforzada

**Estado:** adoptada como decisión de arquitectura; pendiente de implementación y pruebas.  
**Ámbito:** Centro Cultural Nuestra Señora de la Asunción (CCNSA).  
**Fecha:** 2026-10-28.  
**Objetivo:** obtener constancias verificables de recepción de documentos internos sin adquirir una plataforma comercial de firmas.

## 1. Decisión

Incorporar a la aplicación React/Firebase del CCNSA un módulo **Normativa institucional** con:

1. Acceso por cuenta personal activa vinculada a un `socioId` institucional.
2. Presentación de un PDF **publicado e inmutable por versión**, con título, versión, fecha y hash SHA-256 calculado sobre los bytes reales.
3. Declaración expresa y específica, configurable por documento, de **acuse de recibo** o **aceptación de condiciones**. Nunca inferir lectura efectiva. Conservar el texto literal mostrado al usuario.
4. **Verificación adicional** mediante código de un solo uso (OTP) enviado a un canal previamente verificado, con desafío de corta duración y límites de intentos y reenvíos.
5. Confirmación mediante el botón inequívoco **«Acepto las condiciones»** (o «Confirmo recepción», según la finalidad) después de autenticar y verificar la operación. **No se requiere firma manuscrita dibujada**.
6. Registro de la operación **exclusivamente desde un backend confiable** que compruebe identidad, OTP, documento y unicidad en una transacción.
7. Generación de constancia PDF individual, con leyenda **«Confirmado electrónicamente por [nombre]»** o **«Firmado electrónicamente por [nombre]»**, datos de identificación mínimos, declaración exacta, fecha/hora del servidor, identificador, versión y hashes. El texto no debe confundirse con un certificado digital o una firma electrónica cualificada.
8. Bitácora de auditoría, panel de pendientes, descarga segura de constancias y exportaciones para Secretaría/Consejo.
9. Conservación de cada versión y su acuse histórico, incluso cuando se publique una versión posterior.

**No equivale** a una firma electrónica cualificada bajo legislación paraguaya; no debe llamarse firma digital certificada ni prometer no repudio absoluto. La manifestación mediante botón no es por sí sola una prueba criptográfica de autoría: la evidencia reside en los controles de autenticación, confirmación, integridad y auditoría.

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
- `verifiedChannel`, `verifiedAt`, `confirmedAt` (tiempo de servidor), `confirmationAction`, `constanciaPath`, `constanciaSha256`.
- `evidenceId` aleatorio (además de clave de unicidad), `evidenceFormatVersion`, `status`: `CONFIRMADA | PENDIENTE_REPARACION`.
- No almacenar PIN, OTP, contraseña ni tokens de acceso. No almacenar datos adicionales como IP completa salvo base jurídica, necesidad y política de conservación definidas.
- No permitir actualizaciones o borrados ordinarios; si hay corrección excepcional, registrar un **evento compensatorio** separado sin reescribir el acuse original.

### `normativa_audit/{eventId}` (escritura exclusiva del servidor)

Eventos: publicación, envío de desafío (sin OTP), OTP validado o rechazado, aceptación confirmada, descarga administrativa, cambio de estado excepcional. Incluye actor, documento/versión, identificador de evidencia y fecha de servidor.

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
4. Marca la declaración y pulsa «Acepto las condiciones» (o «Confirmo recepción», según el documento); el sistema inicia desafío OTP asociado a usuario, versión y acción concreta.
5. Solicita código al canal verificado; introduce OTP para confirmar esa operación (no basta un OTP que valide solo un inicio de sesión previo).
6. Confirma → la función verifica y registra. **Nunca** mostrar «Firmado» o «Aceptado» antes de recibir confirmación del backend.
7. Descarga la constancia y puede revisar historial por documento y versión.

**Administrador/Secretaría:** carga borrador, verifica archivo y hash, publica versión sin posibilidad de sobreescribirla, supervisa pendientes y confirmados, exporta matriz, consulta evidencias conforme a roles.

**Estados:** `PENDIENTE`, `DESAFIO_EMITIDO` (transitorio), `CONFIRMADA`, `SUSTITUIDA_POR_NUEVA_VERSION`; esta última no modifica el registro histórico.

## 5. Constancia PDF

Encabezado CCNSA; identificación de socio; título/código/versión; hash SHA-256 completo del PDF normativo; **declaración literal aceptada**; leyenda «Aceptado/confirmado electrónicamente por [nombre]»; fecha/hora del servidor con zona `America/Asuncion`; método de verificación OTP (sin revelar el código), identificador de evidencia y hash de la constancia registrado fuera del archivo. Todo dato debe provenir del registro confirmado en backend y jamás de campos libres del navegador.

**Evitar dependencia circular:** el hash de la constancia no debe imprimirse dentro del PDF que se está calculando. Conservarlo en el registro de evidencia, exportable junto con el PDF.

La constancia no es certificado cualificado ni acreditación de lectura efectiva. La puesta a disposición, la recepción y la aceptación se modelan como declaraciones diferentes.

## 6. Implementación y condiciones de salida

**Etapa A — base (desarrollo):** páginas de consulta/publicación, documento versionado, reglas de lectura, declaración y botón de aceptación, configuración de backend; sin activación de aceptación real.

**Etapa B — validación segura:** elegir y configurar envío OTP por correo mediante servicio autorizado y backend propio, o TOTP de Identity Platform si se aprueba su activación. El canal debe estar previamente verificado; enviar un OTP a la misma casilla utilizada para iniciar sesión no equivale necesariamente a MFA independiente. El MFA nativo de Firebase requiere Identity Platform; OTP por correo es una implementación personalizada. Implementar funciones, reglas, secretos y tests.

**Etapa C — evidencia:** constancia PDF de servidor, Storage privado, audit trail, idempotencia, exportación de hashes, backups y reportes de cumplimiento.

**Etapa D — piloto:** cuentas ficticias → grupo reducido de socios con consentimiento → pruebas de restauración, controles de acceso y costo → decisión explícita de publicación.

**Criterios de aceptación obligatorios:**
- No se puede aceptar sin identidad válida, declaración inequívoca y prueba adicional verificable.
- Un socio no puede confirmar por otro ni alterar campos de identidad o hash.
- No se puede cambiar el contenido de un PDF ya publicado conservando la misma versión.
- Reintentos/concurrencia no generan constancias duplicadas.
- El acuse y el PDF se recuperan consistentemente; fallas intermedias tienen reparación controlada.
- Un socio no puede ver las constancias de otro.
- Un administrador ordinario no puede borrar silenciosamente evidencia sin controles independientes.
- Los estados se calculan respecto de la **versión concreta**.
- Pruebas de Firebase Emulator/Storage/Functions y revisión de protección de datos superadas.

## 7. Costos y dependencias

No se compra servicio comercial de firma, pero **costo cero no está garantizado**: Cloud Functions/Storage/Secret Manager/correo pueden generar cargos o requerir Blaze/Identity Platform. Mantener alertas de presupuesto, métricas y límites de cuotas; el presupuesto no es necesariamente un techo de facturación.

**Dependencias previas a activar:** dirección institucional y canal de correo efectivo; propiedad/verificación de emails de socios; configuración de funciones y secretos; políticas de conservación y respaldo; validación jurídica de la redacción del acuse; permisos institucionales para publicar normativa.

## 8. Alcance de esta decisión

Este archivo constituye una **decisión funcional y técnica**. No despliega Cloud Functions ni crea constancias reales, y no modifica el módulo financiero ni el servicio de notificaciones actual. No habilitar firmas en producción por un simple cambio de interfaz o formulario sin los controles previos.


## 9. Plan de pruebas — OTP y constancia (sin ejecutar)

**Estado de ejecución:** PENDIENTE. El repositorio todavía no contiene servicio de envío/validación OTP, funciones de aceptación ni generador PDF integrado. Una maqueta visual del PDF NO acredita autenticación ni entrega del código.

| Caso | Ejecución requerida | Resultado esperado |
|---|---|---|
| OTP-01 | Socio activo, correo verificado, documento publicado, OTP correcto | Aceptación confirmada una sola vez y vinculada a UID/versión |
| OTP-02 | OTP equivocado | Rechazo, incremento atómico de intentos, sin aceptación |
| OTP-03 | OTP vencido | Rechazo sin escritura de constancia |
| OTP-04 | Reutilizar OTP consumido | Rechazo por replay |
| OTP-05 | Reenvío de código | Invalidar anterior; respetar límite de reenvíos |
| OTP-06 | Cinco intentos fallidos y sexto intento | Bloqueo según política, con auditoría y sin aceptación |
| OTP-07 | Intercambiar usuario, sesión o versión documental | Rechazo de desafío no vinculado |
| OTP-08 | Dos confirmaciones simultáneas o doble clic | Una sola constancia por UID y versión |
| OTP-09 | Correo no verificado, socio inactivo o usuario sin rol | Rechazo sin emitir desafío |
| OTP-10 | Falla del proveedor de correo o función | Estado pendiente, error visible, sin aceptación ficticia |
| PDF-01 | OTP válido y aceptación confirmada | PDF con nombre, identificación, fecha y hora del servidor, declaración exacta, versión y evidencia ID |
| PDF-02 | PDF normativo sustituido o bytes alterados | Rechazo o exigencia de nueva versión; hash no coincide |
| PDF-03 | Descargar PDF y contrastar el registro | Hash del PDF coincide con huella almacenada externamente |
| ACL-01 | Usuario A intenta descargar constancia de B | Acceso denegado |
| E2E-01 | Prueba con cuenta ficticia y buzón de prueba real | Correo llega, código recibido y aplicado, constancia emitida, auditada y descargable |

**Criterio de salida:** no declarar «OTP probado» sin E2E-01 real y resultados documentados (proveedor, fecha, ID de desafío sin exposición del código, expiración, logs y constancia). Probar en Firebase Emulator no sustituye una prueba con correo entregado a buzón real. No activar aceptación en producción mientras fallen controles de seguridad o trazabilidad.


## 10. Decisión operativa — OTP por correo para acelerar el lanzamiento (2026-10-30)

**Prioridad del CCNSA:** facilitar recepción/aceptación de normativa a socios sin exigir que instalen aplicaciones autenticadoras ni exigir SMS. Se adopta como primera versión **login de la app con credenciales individuales + confirmación transaccional mediante OTP al correo verificado**. No denominar este proceso «MFA» ni «2FA certificado»; es una validación adicional del acto. Conforme a NIST SP 800-63B-4, email no satisface el canal de autenticación fuera de banda; OWASP lo caracteriza como débil y dependiente de la seguridad del buzón.

### Flujo mínimo viable obligatorio
1. Ingresar con la cuenta individual Firebase; el identificador de cuenta (correo o usuario) no cambia la exigencia de una contraseña.
2. Mostrar el PDF íntegro, **código/versión y texto literal** de la declaración. El PDF debe estar guardado en una ubicación no pública y ligado a hash calculado desde servidor.
3. El socio elige la declaración adecuada («Confirmo recepción» o «Acepto las condiciones»). El backend valida usuario activo, vinculación UID/socioId, email verificado y documento publicado.
4. El backend genera código aleatorio, desafío asociado a (uid, documento/versión/hash, declaración), con máximo cinco minutos y cinco intentos, sin persistir OTP en claro; realiza envío de correo con contexto del documento e instrucciones para desconocer la operación.
5. La aplicación solicita código; backend valida de manera atómica desafío, expiración, intentos, estado de documento y que no exista constancia previa. Nunca crear aceptación directamente desde el navegador.
6. En la misma operación confirmada registrar timestamp del servidor, UID/socioId, declaración, versión, hash, desafío consumido e ID de evento. Generar PDF de constancia en servicio de confianza con leyenda «Confirmado electrónicamente por [nombre]», y permitir descarga. Fallas de creación de PDF quedan en estado de reparación controlada, sin volver a solicitar firma ni inventar estado exitoso.
7. Secretaría ve por versión pendientes/aceptados; la cuenta de socio ve **solo** sus constancias.

### Controles de riesgo y alcance
- Verificar **propiedad y exactitud del correo del socio**, y registrar por procedimiento controlado cualquier cambio. No basta copiar un correo arbitrario del perfil.
- Las cuentas de correo pueden compartir contraseña con CCNSA, estar abiertas en el mismo dispositivo o habilitar restablecer la contraseña de acceso. Por eso el correo OTP mejora la evidencia del acto pero **no demuestra un factor independiente ni proporciona garantías equivalentes a MFA fuerte o firma electrónica cualificada**.
- El código identifica la operación concreta: nombre de normativa, versión, hash y tipo de declaración. El envío por correo NO debe ser un aviso genérico de login.
- Exigir sesiones recientes para aceptar; rechazar sesiones obsoletas y cambios de email pendientes.
- No exponer secretos SMTP o API de correo en React, variables VITE_*, Firestore o commits; utilizar Secret Manager y Cloud Functions.
- Medidas de abuso: límites de envío y verificación por usuario/IP cuando sea posible, bloqueo temporal, idempotencia, mensaje de error neutro, logs sin OTP, reenvío que invalide el código anterior.
- Para documentos que requieran mayores garantías jurídicas, admitir un proceso diferenciado con firma electrónica cualificada.
- Priorizar **primera prueba end-to-end real** con cuenta ficticia y buzón verificado; posteriormente piloto reducido, sin activar firma en producción antes de superar todas las pruebas críticas de auditoría y seguridad.

### Dependencias externas pendientes de configuración
- Proveedor de envío de correo transaccional autorizado, dominio o remitente verificado, credenciales guardadas como secreto y recepción comprobada.
- Backend Firebase Functions, Firestore/Storage privados, permiso de despliegue y revisión de consumo/costo.
- Validación de correo y relación UID/socioId; política institucional para publicación y conservación de normativas.
- Pruebas de entrega real, fallos, caducidad, doble confirmación y prueba PDF/backup.
