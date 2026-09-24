# Preflight DEV → PROD — CCNSA

No ejecutar migración ni abrir el portal productivo hasta completar esta lista.

## 1. Funcional
- [ ] Rol ADMIN validado.
- [ ] Rol TESORERIA validado con cuenta independiente.
- [ ] Rol CONSULTA validado como solo lectura.
- [ ] Portal SOCIO validado.
- [ ] Actividades: inscripción, cancelación, cupos y lista de espera probados.
- [ ] Pagos, obligaciones, conciliación y Finanzas probados.
- [ ] Push real probado al menos en un dispositivo SOCIO.

## 2. Seguridad
- [ ] Firestore Rules revisadas por mínimo privilegio.
- [ ] Auditoría registra actor, fecha, rol y operación.
- [ ] No existen escrituras/borrados directos de evidencia financiera fuera de flujos auditables.
- [ ] Usuarios PROD y ADMIN inicial definidos.
- [ ] Credenciales DEV y PROD separadas.

## 3. Infraestructura PROD
- [ ] Proyecto Firebase `ccnsa-web-prod` operativo.
- [ ] Web App PROD registrada.
- [ ] Authentication configurado.
- [ ] Firestore creado en la región aprobada.
- [ ] Variables del GitHub Environment `production` configuradas.
- [ ] Service account PROD configurado con permisos mínimos.
- [ ] VAPID PROD configurado si se habilita push.
- [ ] Workflow PROD actualizado para desplegar también Rules/Indexes/Functions antes del cutover.

## 4. Datos y migración
- [ ] Fuente productiva final congelada o con ventana de corte definida.
- [ ] Dry-run y fingerprint final aprobados.
- [ ] Firestore PROD sin colisiones inesperadas.
- [ ] Preflight de migración en estado LISTO.
- [ ] Conteos, saldos y totales de control documentados.
- [ ] Plan de reversión definido.

## 5. Respaldo y recuperación
- [ ] Política de backup/PITR decidida antes del cutover.
- [ ] Snapshot previo a migración guardado cuando corresponda.
- [ ] Procedimiento de recuperación documentado y responsable designado.

## 6. Cutover
- [ ] Deploy técnico PROD validado antes de cargar datos.
- [ ] Migración ejecutada una sola vez con baseline aprobado.
- [ ] Verificación posterior de usuarios, saldos, auditoría y notificaciones.
- [ ] Acceso a usuarios finales habilitado recién después de la validación.
