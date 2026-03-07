# Bitácora de Prompts y Cambios - SIMBA V2

**Fecha de corte:** 03/03/2026  
**Objetivo:** mantener un historial técnico útil, sin duplicados y alineado con el estado real del repositorio.

---

## 1) Alcance de este archivo

Este documento resume:
- pedidos funcionales recurrentes,
- correcciones técnicas relevantes,
- cambios consolidados por etapa,
- foco operativo para próximas iteraciones.

No busca reemplazar el `git log`, sino servir como contexto rápido de continuidad.

---

## 2) Línea de tiempo consolidada

### 2.1 Etapa inicial (enero 2026)

#### Objetivos principales
- estabilizar frontend y dashboard,
- corregir fallas críticas de carga/datos,
- consolidar base documental.

#### Pedidos/acciones destacadas
- Correcciones en Tombolina (hash/validaciones/clasificación de aciertos).
- Arreglo de errores de fetch y carga de agencias.
- Ajustes de PDFs operativos (encabezado, filas y comparativas de premios).
- Integración de OCR para extractos (flujo imagen/PDF).
- Persistencia y disponibilidad de extractos para control posterior.

---

### 2.2 Etapa de expansión funcional (febrero 2026)

#### Objetivos principales
- cerrar brechas de consistencia entre módulos,
- robustecer escrutinio multijuego,
- mejorar calidad de reportes e historial.

#### Cambios funcionales consolidados
- Normalización de `numero_sorteo` y `fecha_sorteo` en CP/CPST/historial.
- Reproceso y deduplicación por clave lógica (juego+sorteo+modalidad según aplique).
- Historial con detalle de ganadores, agencias, provincia y datos complementarios.
- Correcciones de recaudación y totales en reportes y dashboard.
- Soporte y ajustes para Loto 5, Quini 6, Brinco y Quiniela Ya.

#### OCR / Extractos
- Mejoras en parsing de PDF y fallback entre proveedores.
- Correcciones por sesgos de provincia y metadatos de archivo.
- Validación de lotes contra sorteo activo (fecha/modalidad) y depuración de duplicados.
- Ajustes de unicidad para extractos y saneo de datos previos.

#### UX / Operación
- Botón de “nueva carga limpia” en control posterior.
- Reseteo automático de estado en recargas.
- Ajustes de modales y flujo de corrección de orden (Quiniela).

---

### 2.3 Etapa actual (inicio marzo 2026)

#### Foco
- estabilidad fina,
- limpieza documental,
- consistencia entre estado real y documentación.

#### Consolidado reciente
- Ajustes de cache-buster frontend.
- Mejoras incrementales en OCR PDF (doble pasada y calidad de lectura).
- Deduplicación adicional en historial/escrutinios.
- Unicidad extractos por combinación juego+sorteo+provincia.
- Normalización de `cta_cte` a formato de 7 dígitos sin guión.
- Indicador de tiempo de proceso en frontend para CP y cargas de extractos.
- Fallback de búsqueda en programación por columnas `tipo_juego`/`juego`.

---

## 3) Resumen técnico por áreas

### 3.1 Control Previo
- Procesamiento ZIP/NTF por juego.
- Guardado con segmentación de recaudación y validaciones.
- Ajustes de normalización para evitar inconsistencias en historial y CPST.

### 3.2 Control Posterior (Escrutinio)
- Ejecución por juego con reportes y persistencia.
- Fortalecimiento de deduplicación por sorteo/modalidad.
- Mejoras en trazabilidad de ganadores y recaudación total.

### 3.3 Historial / Dashboard
- Consultas generales y detalladas por juego.
- Fallbacks robustos para recuperar recaudación y número de sorteo en datos legacy.
- Prevención de duplicados visibles en listados operativos.

### 3.4 Extractos / OCR
- Pipeline de carga manual/XML/OCR.
- Mejoras de robustez de parser PDF y clasificación por provincia.
- Ajustes para ambientes de producción sin dependencias de configuración local.

---

## 4) Patrones de pedido más frecuentes

1. “Ajustar discrepancias de sorteo/fecha/modalidad entre módulos.”
2. “Corregir recaudación total y desglose en reportes/historial.”
3. “Evitar duplicados de escrutinios/extractos.”
4. “Mejorar OCR en casos de PDFs ruidosos o incompletos.”
5. “Alinear frontend y backend para que lo persistido coincida con lo mostrado.”

---

## 5) Decisiones de implementación repetidas (útiles)

- Preferir corrección en **causa raíz** (modelo/normalización) frente a parches UI.
- Mantener compatibilidad con datos legacy mediante fallback controlado.
- Priorizar consistencia de llaves de negocio (`juego`, `numero_sorteo`, `modalidad`, `provincia`).
- Evitar defaults silenciosos que oculten errores operativos.
- Registrar y exponer mensajes claros cuando una carga no califica para el sorteo activo.

---

## 6) Lista corta de commits representativos recientes

- `e2b04e7` cache-buster frontend.
- `228e295` ajuste modal/corrección de orden Quiniela.
- `a4a2d4a` unicidad de extractos + ajuste OCR Entre Ríos.
- `13e94e0` fallback OCR PDF (doble pasada).
- `ac05277` deduplicación de escrutinios en historial.
- `6fe0562` reemplazo de registros por `numero_sorteo`.
- `30bdffd` normalización sorteo/modalidad/recaudación.
- `03/03/2026` normalización `cta_cte` + mejoras de UX de procesamiento + fallback de programación.

---

## 7) Estado actual de la bitácora

- Documento ordenado por etapas.
- Sin entradas duplicadas por sesión.
- Enfocado en decisiones y resultados, no en ruido transaccional.

---

## 8) Próximos focos sugeridos

1. Reducir complejidad de `public/js/app.js` por módulos funcionales.
2. Centralizar validaciones compartidas de sorteo/modalidad/provincia.
3. Agregar checklist automático de consistencia post-proceso (CP + extracto + CPST).
4. Mantener esta bitácora actualizada en cada bloque de cambios productivos.

---

## 9) Nuevo frente en diseno (06/03/2026)

- Se definio y documento el modulo `Modelo Regenerativo de Scoring de Agencias`.
- Documento base agregado: `SCORING_REGENERATIVO.md`.
- El diseno fue validado contra `Informe_Modelo_Regenerativo_Scoring_POP_LOTBA_RTM.docx` y `Modelo_Regenerativo_Scoring_POP_LOTBA_RTM.xlsm`.
- Quedo especificado acceso restringido fase 1 del modulo para `admin` y `ogonzalez`.
- Alcance del diseno:
	- integracion sobre stack actual (Express + Vanilla JS + MySQL),
	- calculo de score base y score final con coeficiente cliente,
	- categorias, movilidad, prioridad y recomendaciones operativas,
	- adaptador de datos a recaudacion real por agencia/juego.
