# Historial de Prompts - SIMBA V2

Historial consolidado de pedidos funcionales y técnicos, ordenado por sesión y sin duplicados.

## Criterio de registro

- Se conserva el pedido principal y su contexto.
- Se evita repetir el mismo pedido en múltiples secciones.
- Los pedidos de una misma línea temática se agrupan.

---

## Sesión 30/01/2026

- Error en Tombolina (hash TXT/CP y clasificación de apuestas por aciertos).
- Solicitud de continuación de tarea sobre Tombolina.
- Pedido de actualización de `DOCUMENTACION.md` y creación de `prompt.md`.
- Pedido de PDF de Control Previo Poceada (registros, ventas, distribución de premios).
- Reporte de error `Failed to fetch` al cargar agencias.
- Ajustes de PDF (fila con `[object Object]` y comparación de premios).
- Simplificación de encabezado en PDF según formato solicitado.
- Integración OCR para extractos desde imagen/PDF con IA (Groq/OpenAI).
- Confirmación de persistencia de extractos para Control Posterior.

---

## Sesión 31/01/2026 - 01/02/2026

- Fix de dashboard (`created_at` en SQL) y ajustes de layout responsive.
- Corrección de estructura frontend rota (pantalla oscura/desplazada).
- Problemas de deploy y sincronización de ramas (`main` vs `principal`).

---

## Sesiones de Febrero 2026 (módulos de juego)

- Corrección de escrutinio Loto por modalidades.
- Fix de tarjetas/totales en cero (tickets y recaudación).
- Expansión del selector de juegos en Control Posterior.
- Incorporación de Loto 5 y ajustes de UX del selector.
- Normalización de origen de número de sorteo (dashboard vs control previo).
- Mejoras de reportes PDF (Tombolina/Poceada) con métricas consolidadas.

---

## Sesión 26-27/02/2026 (consolidado actual)

- Dashboard TODOS: corrección de acumulación de métricas globales.
- Reproceso por sorteo (clave lógica por número y modalidad cuando aplica).
- Modal de historial enriquecido (ganadores individuales, agencia, provincia, dirección CABA).
- Poceada: fix de `sorteo` y persistencia de detalle de ganadores.
- Control Previo Quini6: corrección de mapeo de detalle (valores en cero/modalidad única).
- Normalización global de `numero_sorteo` y `fecha_sorteo` en resultados.
- Error backend `UPPER` en extractos: corrección de resolución de provincia.
- Validación de letras manuales ampliada (A-Z).
- Redoblona Quiniela: corrección de asignación con superposición de rangos.
- Batch web de PDFs/imágenes: priorización por metadata de archivo y fallback sin sesgo a CABA.
- Validación de archivo contra sorteo cargado (misma fecha y modalidad).
- Depuración de duplicados en lista de extractos por provincia.

---

## Pedido más reciente

- Ordenar `prompt.md` sin duplicados.

Estado: aplicado en esta versión del documento.
