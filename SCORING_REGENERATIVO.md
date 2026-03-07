# Modulo Regenerativo de Scoring de Agencias

Ultima actualizacion: 07/03/2026 (noche)
Estado: **IMPLEMENTADO Y EN PRODUCCION** (chatomar.shop)

## 0. Alcance validado
- Fuente funcional: `Informe_Modelo_Regenerativo_Scoring_POP_LOTBA_RTM.docx`
- Fuente tecnica/calculo: `Modelo_Regenerativo_Scoring_POP_LOTBA_RTM.xlsm`
- Objetivo: implementar en SIMBA el mismo modelo operativo del Excel, con trazabilidad y seguridad por usuario.
- **Resultado**: modulo completo, sin dependencia de Excel, datos 100% manejados desde la app.

## 1. Estructura real del modelo (XLSM)
Hojas detectadas y su rol:
- `VENTAS`: base trimestral 2024/2025 por agencia.
- `LOTO`: importes LOTO por agencia y trimestre.
- `COMPLIANCE`: score y observaciones de control.
- `ASESORES`: mapeo agencia -> asesor.
- `DIGITAL`: score digital por percentil ponderado.
- `CLIENTE`: score de experiencia + categoria + coeficiente.
- `MEDIDAS DIGITAL Y CLIENTE`: metrica auxiliar y criterios de negocio.
- `PARAMS_MODELO`: parametros, pesos, caps, periodos.
- `PIVOT_HIST`: percentiles historicos por periodo.
- `HIST_SCORE`: historico de score final y categoria.
- `SNAPSHOT_ACTUAL`: foto del periodo actual para historizar.
- `CALCULOS_AGENCIA`: motor completo (score, categoria, movilidad, prediccion, impacto).
- `DASH_EJECUTIVO`, `GRAF_EJECUTIVO`, `FICHA_AGENCIA`: visualizacion ejecutiva.

## 2. Regla central del scoring
- Puntaje base: `R` (0..100) con 6 componentes ponderados.
- Capa cliente: `T` (coeficiente multiplicador por categoria de cliente).
- Puntaje final: `U = clamp(R * T, 0, 100)`.
- Categoria: se define por maximo entre percentiles actuales y umbrales historicos.

## 3. Parametros reales observados (PARAMS_MODELO)
Llaves clave del modelo:
- `B1`: anio seleccionado.
- `B2`: quarter seleccionado (`Q1/Q2/Q3`).
- `B3`: periodo actual (`YYYY-Qx`).
- `B4`: periodo anterior (`YYYY-Qx`).

Pesos del score base:
- `B7`: ventas crecimiento personal.
- `B8`: ventas impacto absoluto.
- `B9`: ventas diferencial vs red.
- `B10`: mix LOTO.
- `B11`: compliance.
- `B12`: digital.

Bandas y objetivos:
- `B15/B16/B17`: piso/objetivo/cap para crecimiento personal.
- `B18/B19`: piso/cap para diferencial vs red.
- `B20/B21`: ponderacion interna del impacto absoluto (componente porcentual + log).
- `B23`: target de mix LOTO.

Cliente:
- `B32`: ponderacion QR.
- `B33`: base tasa cero de quejas.
- `B34`: ponderacion cliente incognito.
- `B35`: ponderacion resenas Google.
- `A36:A40` + `B36:B40`: mapeo categoria cliente -> coeficiente `T`.

Cortes y estabilidad:
- `B50/B51/B52/B53`: percentiles objetivo (`P95/P80/P50/P20`).
- `B45/B46/B47/B48`: pisos historicos por categoria.
- `E16`: N periodos historicos para promedio en `PIVOT_HIST`.

## 4. Motor real por columna (CALCULOS_AGENCIA)
Columnas nucleares:
- `E`: crecimiento (`D/C - 1`).
- `F`: puntos crecimiento (con banda `B15..B17`, tope 100, luego peso `B7`).
- `G`: incremento absoluto (`MAX(0,D-C)`).
- `H`: puntos impacto absoluto usando mezcla de `%` + `LN(1+G)` normalizado y peso `B8`.
- `I`: diferencial vs red (`E - PARAMS_MODELO!B5`).
- `J`: puntos diferencial con banda `B18..B19` y peso `B9`.
- `L`: mix LOTO (`K/D`).
- `M`: puntos mix con target `B23` y peso `B10`.
- `N/O`: compliance y puntos (`O = N * B11`).
- `P/Q`: digital y puntos (`Q = P * B12`).
- `R`: score base `clamp(F+H+J+M+O+Q,0,100)`.
- `S/T`: categoria cliente y coeficiente.
- `U`: score final `clamp(R*T,0,100)`.

Categoria y movilidad:
- `V`: categoria actual (`DIAMANTE/PLATINO/ORO/PLATA/BRONCE/CERRADO`) usando `MAX(percentil_actual, piso_historico)`.
- `W`: categoria anterior por lookup en `HIST_SCORE` y `PARAMS_MODELO!B4`.
- `X`: movilidad (`Mejora`, `Estable`, `Baja`).

Gestion predictiva:
- `AE`: proximo corte de ascenso en `U`.
- `AF`: piso de permanencia en categoria actual.
- `AG`: delta requerido en score base `R` para subir.
- `AH`: eje predictivo recomendado (`VENTAS/LOTO/COMPLIANCE/DIGITAL/CLIENTE`).
- `AI`: accion predictiva textual.
- `AJ`: probabilidad operativa de ascenso (0..1), ajustada por movilidad y cliente.
- `AK`: distancia al ascenso.
- `AL`: distancia al descenso.
- `AM/AN`: indice y prioridad de gestion.
- `AO..AV`: impacto potencial por eje y mayor retorno probable.

## 5. Regla de categorias (critica)
La categoria no depende solo del trimestre actual. Para cada corte se usa:

`corte_efectivo = MAX(percentil_actual, umbral_historico)`

Interpretacion:
- Evita que los cortes caigan por un trimestre atipico.
- Mantiene estabilidad de categorias entre periodos.
- Requiere mantener actualizado `HIST_SCORE` y `PIVOT_HIST`.

## 6. Implementacion real en SIMBA

### Backend (implementado)
- `src/modules/scoring-agencias/scoring.controller.js` — Motor de calculo + CRUD de datasets + snapshot historico
- `src/modules/scoring-agencias/scoring.routes.js` — Rutas REST con RBAC

### Frontend (implementado)
- `public/js/scoring-agencias.js` — Estado reactivo, tabs, ranking, ficha, simulador, config
- Seccion **Comercial** en sidebar de `public/index.html`
- Integracion de navegacion/carga en `public/js/app.js`

### Persistencia (7 tablas activas)
- `scoring_modelo_parametros` — 31 parametros del modelo (pesos, caps, percentiles)
- `scoring_cliente_coeficientes` — 6 categorias con coeficiente multiplicador
- `scoring_asesores` — Mapeo agencia → asesor
- `scoring_compliance` — Puntaje de compliance por agencia
- `scoring_digital` — Puntaje digital por agencia
- `scoring_cliente` — Experiencia de cliente por agencia (QR, quejas, incognito, Google)
- `scoring_hist_score` — Historico de score/categoria/ranking por periodo
- Migracion: `database/migration_scoring_agencias.js`
- Import opcional desde Excel: `database/import_scoring_xlsm.js`

### Auto-seed
- Al primer uso, si las tablas estan vacias, se insertan automaticamente:
  - 31 parametros por defecto (B1-B53)
  - 6 coeficientes de categoria (DIAMANTE=1.0 ... CERRADO=0.90)
- Funcion: `ensureDefaultScoringData()` en `scoring.controller.js`
- No requiere Excel ni carga manual para arrancar

## 7. Adaptacion de datos desde SIMBA
Fuente principal:
- `control_previo_agencias` para ventas totales por agencia/periodo.
- mismo set para extraer mix LOTO (`juego in ('loto','loto5')` segun homologacion local).

Fuentes complementarias:
- Compliance, digital y cliente inicialmente cargables por CSV/API interna.
- Mientras no haya fuente online, usar tabla de insumos manual con versionado por periodo.

## 8. Seguridad y restriccion de acceso (implementado)
- `authenticate` obligatorio en todas las rutas.
- Middleware `allowScoringUsers` valida: `req.user.rol === 'admin'` o `req.user.username === 'ogonzalez'`.
- Middleware `isAdmin` protege escritura (POST/DELETE en datasets y snapshot).
- Permiso RBAC requerido: `control_previo.ver`.
- Frontend: clase `.scoring-only` oculta la seccion Comercial para usuarios no autorizados.

## 9. Endpoints implementados
- `GET /api/scoring-agencias/resumen?periodo=2026-Q1` — Snapshot completo (KPIs + ranking + distribucion)
- `GET /api/scoring-agencias/ranking?periodo=2026-Q1&categoria=ORO` — Ranking filtrado
- `GET /api/scoring-agencias/agencia/:ctaCte?periodo=2026-Q1` — Ficha individual
- `GET /api/scoring-agencias/configuracion` — Resumen de datasets + periodos historicos
- `GET /api/scoring-agencias/configuracion/:dataset` — Listar registros de un dataset
- `POST /api/scoring-agencias/configuracion/:dataset` — Crear/actualizar registro (admin)
- `DELETE /api/scoring-agencias/configuracion/:dataset` — Eliminar registro (admin)
- `POST /api/scoring-agencias/snapshot` — Generar snapshot historico del periodo (admin)

## 10. Flujo operativo trimestral
1. Cargar/validar insumos de `VENTAS`, `LOTO`, `COMPLIANCE`, `DIGITAL`, `CLIENTE`.
2. Confirmar periodo actual/anterior en parametros.
3. Ejecutar calculo y publicar ranking + ficha.
4. Cerrar periodo: guardar snapshot historico (score U + categoria + ranking).
5. Refrescar percentiles historicos para cortes estables.

## 11. QA minimo antes de liberar
- Verificar agencias presentes en todos los ejes (o fallback controlado).
- Revisar outliers de crecimiento e incremento absoluto.
- Validar que `HIST_SCORE` tenga el periodo anterior (si no, movilidad queda sin base).
- Validar que cortes historicos no queden en cero por pivot incompleto.
- Testear casos borde:
  - agencia nueva,
  - agencia sin ventas,
  - cliente `Malo` (penalizacion),
  - categoria `DIAMANTE` y `CERRADO` (probabilidad y distancias no aplican).

## 12. Estado de implementacion por fases

### Fase 1 — COMPLETADA (07/03/2026)
- Seccion Comercial en sidebar con Scoring Agencias
- UI con 5 tabs: Ranking, Ficha de agencia, Analisis, Simulador, Configuracion
- Ranking con medallas (top-3), posiciones, indicadores de movimiento (Mejora/Baja/Estable)
- Backend con calculo real-time desde `control_previo_agencias` + 6 tablas auxiliares
- CRUD completo de los 7 datasets desde pestaña Configuracion
- Auto-seed de parametros y coeficientes (sin Excel)
- Snapshot historico para cierre de periodo
- Acceso restringido: admin + ogonzalez
- Deploy en produccion (chatomar.shop)

### Fase 2 — EN PROGRESO
- Importacion masiva CSV para datasets (Cliente, Compliance, Digital)
- Simulador con proyeccion mas granular por sub-eje

### Fase 3 — PENDIENTE
- Exportar ranking/ficha a PDF
- Notificaciones por prioridad alta
- Permisos granulares por asesor (ver solo sus agencias)
- Historico visual multi-periodo (evolucion Q1→Q2→Q3→Q4)

## 13. Matriz de paridad Excel -> SIMBA (fuente unica para auditoria IA)

Esta seccion resume la equivalencia funcional entre `Modelo_Regenerativo_Scoring_POP_LOTBA_RTM.xlsm`
y la implementacion productiva en SIMBA.

### 13.1 Formula a formula (CALCULOS_AGENCIA)

- `E = D/C - 1` (crecimiento): replicado en backend.
- `F` (banda `B15..B17`, peso `B7`): replicado.
- `G = MAX(0,D-C)`: replicado.
- `H` (mix componente porcentual + logaritmico, `B20/B21`, peso `B8`): replicado.
- `I = E - B5` (diferencial vs red): replicado usando `PARAMS_MODELO.B5` con fallback operativo si falta dato.
- `J` (banda `B18..B19`, peso `B9`): replicado.
- `L = K/D` (mix loto): replicado.
- `M` (target `B23`, peso `B10`): replicado.
- `N/O` (compliance + peso `B11`): replicado.
- `P/Q` (digital + peso `B12`): replicado.
- `R = clamp(F+H+J+M+O+Q,0,100)`: replicado.
- `S/T` (categoria/coeficiente cliente): replicado.
- `U = clamp(R*T,0,100)`: replicado.
- `V` (categoria por `MAX(percentil, piso historico)`): replicado usando `B50..B53` y `B45..B48`.
- `W` (categoria anterior por periodo `B4`): replicado con `scoring_hist_score`.
- `X` (movilidad por categoria): replicado.
- `AA` (ranking tipo `RANK.EQ`): replicado (empates comparten posicion).
- `AE..AV` (cortes, distancia, probabilidad, prioridad e impacto por eje): replicado en logica y campos API.

### 13.2 Parametros del modelo

- `B1..B4`: periodo actual/anterior y seleccion temporal, replicados.
- `B5`: crecimiento de red, aplicado en diferencial.
- `B7..B12`: pesos de ejes, replicados.
- `B15..B23`: bandas y objetivos, replicados.
- `B32..B35`: ponderaciones cliente, aplicadas al fallback de score cliente.
- `B44`: periodos historicos para promediar umbrales historicos, replicado.
- `B45..B48`: pisos historicos por categoria, replicados.
- `B50..B53`: percentiles de corte, replicados.

### 13.3 Snapshot historico

- Tabla: `scoring_hist_score`.
- Persistencia: score final, categoria y ranking del periodo.
- Ranking historico guardado con el mismo criterio visual (estilo `RANK.EQ`) para consistencia con Excel.

### 13.4 Graficos (estado real)

En el XLSM hay **6 graficos reales** (`chart1.xml` ... `chart6.xml`).

En SIMBA hay actualmente **6 visualizaciones equivalentes**:
- 5 graficos Chart.js en tab Analisis:
  - Distribucion por categoria
  - Riesgo de movilidad
  - Eje de impacto
  - Concentracion de ventas
  - Distribucion de prioridad
- 1 sparkline historico en Ficha de agencia.

Conclusion operativa:
- **Completitud por cantidad de graficos: 6/6.**
- **Completitud de formula de scoring: alta (paridad funcional).**
- Puede haber diferencias menores de presentacion visual (estilo/layout) respecto a Excel, sin afectar calculo.

### 13.5 Fuente de verdad para IA y auditoria

Para consultas tecnicas automáticas, tomar este orden de prioridad:
1. `SCORING_REGENERATIVO.md` (este documento, estado operativo real)
2. `src/modules/scoring-agencias/scoring.controller.js` (implementacion efectiva)
3. `Modelo_Regenerativo_Scoring_POP_LOTBA_RTM.xlsm` (origen de formulas)
4. `DOCUMENTACION.md` (vista global del sistema)

---
Este documento refleja el estado real de implementacion del modulo Scoring Regenerativo en SIMBA V2.
