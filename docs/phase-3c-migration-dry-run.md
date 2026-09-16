# Fase 3C — Dry-run de importación 2026

## Objetivo

Convertir el snapshot 3B ya conciliado en un plan exacto y determinístico de documentos Firestore, sin ejecutar escrituras.

El dry-run es deliberadamente posterior a 3B. Solo puede considerarse listo cuando:

- deuda reconstruida = deuda objetivo de migración;
- no existen filas `REVISAR`;
- no existen ajustes técnicos de cargo;
- no existen ajustes técnicos de pago.

## Alcance

El plan contempla estas colecciones:

- `socios`
- `obligaciones`
- `pagos`
- `aplicaciones_pago`
- `excepciones_cobro`
- `categoria_historial`

No crea usuarios de Firebase Authentication ni documentos `users`. Las columnas E:F del spreadsheet continúan fuera del proceso.

## Identificadores e idempotencia

Todos los documentos del dry-run reciben IDs determinísticos bajo el prefijo `m26-`. El mismo snapshot debe producir el mismo conjunto de IDs y el mismo fingerprint.

La escritura real de una fase posterior deberá utilizar esos IDs con semántica `create-if-absent`/verificación de igualdad, en lotes reanudables. No debe llamar a las funciones operativas normales `createPago` / `createObligacion`, porque esas funciones aplican FIFO y podrían reinterpretar el historial durante la migración.

El dry-run estima lotes de hasta 400 escrituras para mantener margen respecto del límite de Firestore.

## Cobros históricos previos a un cambio de condición

Los movimientos que 3B marca como `EXCLUIDO` por la propia fórmula legacy no se descartan.

Cuando el socio es actualmente `CASADO` y esos importes coinciden con la tarifa histórica `SOLTERO`, 3C:

1. rehidrata una obligación histórica por el importe efectivamente cobrado;
2. crea un pago histórico por ese mismo importe;
3. crea una aplicación 1:1 contra esa obligación;
4. propone un registro `categoria_historial` SOLTERO → CASADO desde el mes siguiente al último período histórico excluido.

Así se conserva el dinero realmente recibido y el saldo neto no cambia.

## Deuda 2025

La hoja solo aporta un saldo agregado por socio en la columna W. Para no inventar meses, conceptos ni pagos de 2025, 3C crea como máximo una obligación por socio:

- concepto: `Saldo pendiente migrado 2025`
- período: `2025-LEGACY`
- importe: saldo fuente de W

El total planificado debe coincidir exactamente con el total de Deuda 2025 de la hoja.

## Exoneraciones

Las obligaciones históricas exoneradas se migran con estado `EXENTA`; no generan pagos ni consumen crédito.

Para Carlo Camelli se propone además una excepción `EXENTO / TODOS` limitada a `2026-01` → `2026-12`. No se presume que la exoneración sea permanente en años futuros.

## Precisión temporal de pagos

Los colores legacy prueban el mes de cobro, no el día exacto. Por ello:

- cuando el mes es conocido, el pago lleva `periodoCobro = YYYY-MM` y `fechaPrecision = MES`;
- cuando ni siquiera el mes puede probarse (p. ej. ciertos pagos directos de membresía o ingreso), `fecha` queda vacía y `fechaPrecision = DESCONOCIDA`.

No se inventan días de pago.

## Controles del dry-run

El plan se bloquea si:

- alguna categoría sigue en `REVISAR`;
- existe un `AJUSTE_LEGACY` real;
- existe un `AJUSTE_PAGO_LEGACY`;
- un pago no puede vincularse a una obligación destino;
- un movimiento histórico excluido no puede convertirse determinísticamente en historial de categoría;
- la deuda 2026 del plan difiere de la deuda objetivo de 3B;
- la deuda 2025 del plan difiere del total fuente;
- se generan IDs duplicados.

## Siguiente fase

Una importación real deberá volver a leer y conciliar la fuente antes de escribir, comparar el fingerprint aprobado, comprobar conflictos con IDs existentes y ejecutar lotes idempotentes/reanudables con auditoría. La Fase 3C actual no contiene ningún botón de escritura real.
