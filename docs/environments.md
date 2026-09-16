# Ambientes Firebase: DEV y PROD

## Principio

El repositorio es único, pero Firebase se separa por ambiente:

- DEV: `ccnsa-web-dev`
- PROD: `ccnsa-web-prod`

Los Pull Requests y el despliegue automático actual de `main` continúan apuntando exclusivamente a DEV hasta el cutover productivo.

## Salvaguardas incorporadas

1. `.firebaserc` mantiene `default` y `dev` en `ccnsa-web-dev`; `prod` queda reservado para `ccnsa-web-prod`.
2. La aplicación exige `VITE_APP_ENV=dev|prod` y bloquea builds con `projectId` cruzado.
3. Los previews de Pull Request fijan `VITE_APP_ENV=dev` y usan solamente el service account DEV.
4. El workflow de PROD es manual (`workflow_dispatch`) y usa el GitHub Environment `production`.
5. El workflow PROD valida que `VITE_FIREBASE_PROJECT_ID_PROD=ccnsa-web-prod` antes de compilar.
6. DEV y PROD usan credenciales/service accounts separados.

## Variables de GitHub para el Environment `production`

Crear, después de registrar la Web App de producción:

- `VITE_FIREBASE_API_KEY_PROD`
- `VITE_FIREBASE_AUTH_DOMAIN_PROD`
- `VITE_FIREBASE_PROJECT_ID_PROD=ccnsa-web-prod`
- `VITE_FIREBASE_STORAGE_BUCKET_PROD`
- `VITE_FIREBASE_MESSAGING_SENDER_ID_PROD`
- `VITE_FIREBASE_APP_ID_PROD`

Secret requerido:

- `FIREBASE_SERVICE_ACCOUNT_CCNSA_WEB_PROD`

## Provisionamiento inicial de PROD

1. Crear proyecto Firebase `CCNSA Web Prod` con Project ID `ccnsa-web-prod`.
2. Registrar una Web App.
3. Crear Firestore en la misma región elegida para el sistema.
4. Habilitar los mismos proveedores de Authentication realmente necesarios.
5. Desplegar `firestore.rules` y `firestore.indexes.json` desde este repositorio.
6. Crear el usuario ADMIN inicial y su documento `users/{uid}`.
7. Configurar el GitHub Environment `production`, sus variables y su service account.
8. Ejecutar build/deploy manual de PROD y validar login/rutas antes de migrar datos.
9. Ejecutar preflight de migración contra Firestore PROD vacío.
10. Importar el baseline aprobado únicamente si el fingerprint coincide.
11. Verificar saldos, conteos y `audit_log` antes de habilitar acceso a usuarios finales.

## Regla operativa

Nunca copiar la base Firestore DEV a PROD. DEV conserva datos de prueba. Los datos productivos entran mediante migración controlada o funcionalidades normales de la aplicación.
