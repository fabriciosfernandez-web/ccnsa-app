# Fase 3B — Snapshot conciliado de migración 2026

## Objetivo

Reconstruir, todavía en modo **solo lectura**, un ledger de migración a partir de `Lista de miembros 2026` y demostrar que el saldo resultante reproduce la `Deuda 2026` de la hoja antes de habilitar cualquier escritura a Firestore.

## Qué se conserva del sistema legacy

La lógica de colores se usa exclusivamente como adaptador de migración:

- la columna mensual identifica la obligación (`periodoObligacion`);
- el color identifica el mes histórico de cobro (`periodoCobro`);
- el rojo se interpreta como exoneración, no como pago;
- julio rojo corresponde a la exoneración por asistencia al retiro de silencio anual 2026.

Esta codificación **no se incorporará al modelo operativo futuro**.

## Reconstrucción de obligaciones

La fórmula de `Deuda 2026` se usa como evidencia de negocio:

- `Y3*n` -> tarifa individual/soltero por `n` cuotas pagables;
- `Z3*n` -> tarifa casado por `n` cuotas pagables;
- `Y4*n` -> tarifa legacy especial de Gs. 18.500 por `n` cuotas;
- `Y6` -> membresía anual;
- `Z6` -> aporte de ingreso.

Cuando una cuota del período está exonerada en rojo, se genera una obligación `EXENTA`; esa obligación se conserva para trazabilidad, pero no integra el saldo exigible.

Las referencias positivas que aparecen después de `-U<fila>` en la fórmula (por ejemplo `+J37+K37`) se tratan como cobros explícitamente excluidos del saldo exigible por la propia planilla legacy.

## Conciliación matemática

Para cada socio:

1. `cobrosElegibles = SumatoriaAnual - cobrosExcluidosPorFormula`;
2. `cargosObjetivo = Deuda2026 + cobrosElegibles`;
3. se reconstruyen cuotas, membresía, aporte de ingreso y exoneraciones;
4. se imputan pagos mensuales usando la columna como obligación y el color como mes de cobro;
5. cualquier importe que no pueda asignarse sin inventar información queda como `AJUSTE_LEGACY` de revisión;
6. `deudaReconstruida = cargosNormales - pagosElegibles`;
7. se compara `deudaReconstruida` contra `Deuda2026`.

## Estados del snapshot

- `LIMPIO`: conciliación exacta sin ajustes técnicos ni evidencia ambigua.
- `CONCILIADO_CON_AJUSTES`: el saldo coincide, pero la fuente legacy obliga a conservar un ajuste o exclusión explícita antes de importar.
- `REVISAR`: existe una diferencia, color no interpretado, fórmula no suficientemente estructurada o movimiento que no puede asociarse de forma segura.

## Restricciones de seguridad

- no se escribe en Firestore;
- no se modifica Google Sheets;
- no se crean usuarios de Authentication;
- no se leen las columnas legacy E:F;
- no se inventa una fecha diaria de pago cuando la fuente solo demuestra el mes;
- los ajustes técnicos no deben pasar a producción automáticamente.

## Siguiente fase

Fase 3C tomará únicamente un snapshot aprobado y construirá un plan de importación idempotente. Antes de ejecutar escrituras se exigirá que las filas `REVISAR` estén resueltas y que los totales de deuda coincidan con la fuente.