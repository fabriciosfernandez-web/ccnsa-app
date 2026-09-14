# Fase 2 — Núcleo financiero

Esta fase introduce imputación automática de pagos, pagos parciales y saldos a favor sobre datos ficticios en el proyecto de desarrollo.

La colección `aplicaciones_pago` es append-only. Un pago nuevo se aplica primero a las obligaciones pendientes más antiguas. Si sobra importe, el remanente permanece disponible como saldo a favor. Al crear una obligación nueva, cualquier saldo a favor existente se consume automáticamente.

La implementación actual corre en cliente autorizado sobre Firebase Spark y utiliza operaciones batch. Antes de una operación productiva de mayor escala o con concurrencia significativa debe trasladarse la lógica crítica a un backend transaccional confiable.
