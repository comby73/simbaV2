# Modulo Regenerativo de Scoring de Agencias

Ultima actualizacion: 06/03/2026
Estado: Diseno funcional y tecnico listo para implementacion integrada

## 0. Contexto real del sistema
- Stack actual: Node.js + Express (backend), Vanilla JS SPA (frontend), MySQL (datos)
- Estructura actual: rutas modulares en `src/modules/*`, UI central en `public/js/app.js`
- Fuente base disponible: recaudacion/venta por agencia y por juego desde `control_previo_agencias`
- Seccion objetivo sugerida en la app: nueva vista dentro de Facturacion/Reportes

## 1. Diagnostico de integracion en la app actual
- Encaje backend: nuevo modulo `src/modules/scoring-agencias/` siguiendo patron `{module}.controller.js` + `{module}.routes.js`
- Encaje frontend: nueva vista `view-scoring-agencias` reutilizando el sistema de tabs y render en `public/js/app.js`
- Encaje de datos: capa adaptadora sobre `control_previo_agencias` para no romper modulos existentes
- Encaje de seguridad: usar `authenticate` + `requirePermission('reportes.read')` en lectura y `requirePermission('reportes.write')` en configuracion

Decision de producto:
- No reemplaza reportes existentes
- Se agrega como capa de inteligencia comercial-operativa
- Debe funcionar aunque falten ejes no financieros (compliance/digital/cliente)

## 2. Propuesta de arquitectura

### 2.1 Backend
- `src/modules/scoring-agencias/scoring.controller.js`
: endpoints de resumen, ranking, ficha, configuracion y simulador
- `src/modules/scoring-agencias/scoring.routes.js`
: registro de rutas REST
- `src/modules/scoring-agencias/scoring.service.js`
: orquestacion de calculos por periodo
- `src/modules/scoring-agencias/scoring.engine.js`
: funciones puras de scoring (sin SQL)
- `src/modules/scoring-agencias/scoring.repository.js`
: consultas SQL y mapeo a DTOs de dominio
- `src/modules/scoring-agencias/scoring.config.js`
: parametros editables del modelo

### 2.2 Frontend
- `public/js/scoring-agencias.js`
: render de tablero, ranking, ficha, filtros, simulador
- Reuso de helpers ya existentes
: `apiRequest`, `showToast`, tabla y cards actuales
- Carga diferida
: inicializar solo cuando el usuario abre la vista

### 2.3 Persistencia
Tablas nuevas sugeridas:
- `scoring_agencias_config` (versionado de parametros)
- `scoring_agencias_snapshot` (resultado por periodo/agencia)
- `scoring_agencias_inputs` (compliance/digital/cliente por periodo/agencia)

Nota:
- Si no se desea persistencia inicial, el motor puede correr on-demand y devolver calculo en caliente

## 3. Modelo de datos

## 3.1 Entidades de entrada
- Agencia
: `cta_cte`, `codigo_agencia`, `nombre`, `zona`, `asesor`
- Periodo
: `desde`, `hasta`, `periodo_id`, `periodo_anterior_id`
- VentasAgenciaPeriodo
: `venta_total`, `venta_por_juego`, `venta_loto`
- InputsNoFinancieros
: `compliance_score`, `digital_score`, `cliente_nivel`

## 3.2 Resultado de scoring
- `score_base_r` (0..100)
- `coef_cliente_t` (ej. 1.20, 1.15, 1.10, 1.00, 0.70)
- `score_final_u = clamp(r * t, 0, 100)`
- `categoria_actual`, `categoria_anterior`, `movilidad`
- `dist_ascenso`, `dist_descenso`, `prob_ascenso`
- `prioridad_gestion`, `eje_mayor_impacto`, `recomendacion`

## 3.3 Parametros de scoring (configurables)
- Pesos base:
- `ventas_crecimiento = 0.35`
- `ventas_impacto_abs = 0.15`
- `ventas_diff_red = 0.15`
- `mix_loto = 0.15`
- `compliance = 0.10`
- `digital = 0.10`
- Coeficientes cliente:
- `excelente=1.20`, `muy_bueno=1.15`, `bueno=1.10`, `regular=1.00`, `malo=0.70`
- Modo categorias:
- `percentiles` o `umbrales_fijos`

## 4. Formulas del scoring

## 4.1 Ventas
- `crecimiento_agencia = (ventas_actual / ventas_anterior) - 1`
- `incremento_abs = max(0, ventas_actual - ventas_anterior)`
- `crecimiento_red = (ventas_red_actual / ventas_red_anterior) - 1`
- `diff_red = crecimiento_agencia - crecimiento_red`
- `mix_loto = venta_loto / max(venta_total, 1)`

## 4.2 Normalizacion a subscore (0..100)
Para cada eje se aplica una funcion de normalizacion configurable con caps:
- `sub_ventas_crecimiento = norm(crecimiento_agencia, min, max)`
- `sub_impacto_abs = norm(incremento_abs, min, max)`
- `sub_diff_red = norm(diff_red, min, max)`
- `sub_mix_loto = proximity(mix_loto, objetivo_mix_loto)`
- `sub_compliance = clamp(compliance_score, 0, 100)`
- `sub_digital = clamp(digital_score, 0, 100)`

## 4.3 Score base y final
- `R = sum(peso_eje * subscore_eje)`
- `T = map(cliente_nivel)`
- `U = clamp(R * T, 0, 100)`

## 5. Flujo UX propuesto

### 5.1 Vista ejecutiva
- Filtro de periodo, asesor, zona, categoria
- KPIs: promedio score, variacion, agencias en riesgo, prioridad alta
- Distribucion por categorias
- Ranking top/bottom
- Tabla resumida con accion sugerida

### 5.2 Ranking de agencias
Columnas:
- Agencia, Asesor, Ventas actual, Ventas anterior, Crecimiento
- Score base R, Coeficiente T, Score final U
- Categoria, Movilidad, Prioridad, Eje mayor impacto

### 5.3 Ficha de agencia
Bloques:
- Resumen score/categoria
- Desglose por ejes
- Cliente (nivel y coeficiente)
- Historico por periodos
- Distancias a ascenso/descenso
- Simulador de mejora

### 5.4 Configuracion del modelo
Editable por permisos:
- pesos
- targets/caps
- coeficientes cliente
- modo de cortes de categoria

## 6. Estructura de pantallas
- Pantalla 1: `Scoring > Resumen Ejecutivo`
- Pantalla 2: `Scoring > Ranking Agencias`
- Pantalla 3: `Scoring > Ficha Agencia`
- Pantalla 4: `Scoring > Configuracion`

## 7. Codigo necesario (esqueleto integrado)

### 7.1 Endpoints backend sugeridos
- `GET /api/scoring-agencias/resumen?desde=&hasta=`
- `GET /api/scoring-agencias/ranking?desde=&hasta=&asesor=&zona=`
- `GET /api/scoring-agencias/agencia/:ctaCte?desde=&hasta=`
- `POST /api/scoring-agencias/simular`
- `GET /api/scoring-agencias/config`
- `PUT /api/scoring-agencias/config`

### 7.2 Contrato de respuesta (resumen)
```json
{
  "success": true,
  "data": {
    "periodo": { "desde": "2026-01-01", "hasta": "2026-01-31" },
    "kpis": {
      "scorePromedio": 74.2,
      "agenciasEvaluadas": 132,
      "prioridadAlta": 21
    },
    "distribucionCategorias": [
      { "categoria": "ORO", "cantidad": 34 }
    ],
    "ranking": []
  }
}
```

## 8. Adaptador a datos reales de recaudacion

### 8.1 SQL base para ventas por agencia
```sql
SELECT
  cta_cte,
  SUM(total_recaudacion) AS venta_total,
  SUM(CASE WHEN LOWER(TRIM(juego)) IN ('loto','loto5') THEN total_recaudacion ELSE 0 END) AS venta_loto
FROM control_previo_agencias
WHERE fecha >= ? AND fecha <= ?
GROUP BY cta_cte;
```

### 8.2 SQL base para ventas por juego
```sql
SELECT
  cta_cte,
  LOWER(TRIM(juego)) AS juego,
  SUM(total_recaudacion) AS recaudacion
FROM control_previo_agencias
WHERE fecha >= ? AND fecha <= ?
GROUP BY cta_cte, LOWER(TRIM(juego));
```

### 8.3 Periodo anterior
- Reusar mismo query cambiando rango de fechas
- Calcular crecimiento comparando `actual` vs `anterior`

## 9. Datos mock para desarrollo
```json
[
  {
    "cta_cte": "5101234",
    "agencia": "Agencia Centro",
    "venta_total_actual": 12500000,
    "venta_total_anterior": 10800000,
    "venta_loto_actual": 4200000,
    "compliance_score": 88,
    "digital_score": 64,
    "cliente_nivel": "muy_bueno"
  }
]
```

## 10. Instrucciones para llevar a produccion
1. Crear tablas nuevas (`config`, `inputs`, `snapshot`) o habilitar modo on-demand
2. Registrar rutas en `src/app.js` bajo `/api/scoring-agencias`
3. Integrar nueva vista en el menu del frontend
4. Probar con un periodo cerrado y validar contra recaudacion ya disponible
5. Activar fallback si faltan `compliance/digital/cliente`
6. Versionar parametros de scoring para trazabilidad de cambios
7. Publicar con feature flag inicial (solo admin/analista)

## 11. Estado de datos parciales (degradacion controlada)
- Si falta compliance: usar 50 por defecto y marcar `fuente=compliance_default`
- Si falta digital: usar 50 por defecto y marcar `fuente=digital_default`
- Si falta cliente: usar `regular (1.00)` y marcar `fuente=cliente_default`
- La UI siempre debe mostrar indicador de cobertura de datos

## 12. Mensajeria de producto (tono operativo)
- "Tu principal oportunidad de mejora esta en el eje Digital."
- "La experiencia cliente esta reduciendo tu score final."
- "Tu crecimiento estuvo por debajo del promedio de la red."
- "Con una mejora estimada de X puntos podrias subir de categoria."

## 13. Archivos a crear y modificar (implementacion futura)
Crear:
- `src/modules/scoring-agencias/scoring.controller.js`
- `src/modules/scoring-agencias/scoring.routes.js`
- `src/modules/scoring-agencias/scoring.service.js`
- `src/modules/scoring-agencias/scoring.engine.js`
- `src/modules/scoring-agencias/scoring.repository.js`
- `src/modules/scoring-agencias/scoring.config.js`
- `public/js/scoring-agencias.js`

Modificar:
- `src/app.js` (registrar rutas)
- `public/index.html` (nueva vista)
- `public/js/app.js` (navegacion + init vista)
- `DOCUMENTACION.md` (seccion del modulo)

---
Este documento define la version base de diseno para integrar el modulo sin romper arquitectura actual y aprovechando la recaudacion existente por agencia/juego.
