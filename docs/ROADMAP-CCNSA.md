# Hoja de ruta CCNSA

## En validación
1. Administración de usuarios y vinculación con socios
   - Listar cuentas de Firebase Authentication.
   - Vincular cuenta con socio.
   - Asignar rol.
   - Activar/desactivar acceso.
   - Proteger la propia cuenta ADMIN.
   - Registrar cambios en auditoría.

## Pendientes funcionales
2. Cerrar módulo de Actividades
   - Reconciliar `cuposOcupados` de inscripciones antiguas.
   - Consolidar seguimiento de participantes.
   - Nombres de acompañantes.
   - Fecha límite / cierre de inscripciones.

3. Integrar Actividades con Finanzas
   - Relación entre inscripción, obligación/pago e ingreso de actividad.
   - Evitar doble registro o estados inconsistentes.

4. Completar estado de cuenta
   - Histórico por período.
   - Publicación mensual.
   - PDF definitivo.
   - Estados pagado/parcial/vencido.

5. Carga masiva y conciliación de pagos
   - Importación CSV/planilla.
   - Sugerencias de coincidencia.
   - Confirmación en lote.

6. Dashboard administrativo operativo
   - Morosidad.
   - Cobros pendientes.
   - Socios sin vincular.
   - Actividades próximas/cupos.
   - Pagos de actividades pendientes.
   - Excepciones que requieren atención.

7. Auditoría completa
   - Detalle antes/después.
   - Filtros por socio/actor/entidad.
   - Vista de evento individual.

8. Notificaciones
   - Diagnosticar y corregir FCM individualizado.
   - Mantener in-app.
   - Incorporar correo posteriormente.

9. Perfil del socio
   - Datos editables.
   - Preferencias.
   - Actividades.
   - Campos sensibles sujetos a aprobación.

10. Paso DEV a PROD
   - Reglas finales.
   - Limpieza de herramientas DEV.
   - Permisos.
   - Backup/exportación.
   - Pruebas por rol.
   - Índices y checklist de migración.

## Deuda técnica abierta
- Scrollbar visible en el drawer en determinados navegadores móviles.
- Push FCM individualizado: flujo todavía no validado extremo a extremo.
- Inscripciones antiguas de Actividades pueden no estar reflejadas correctamente en `cuposOcupados`.
