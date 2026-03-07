# Modulo Regenerativo de Scoring de Agencias

Ultima actualizacion: 07/03/2026
Estado: especificacion funcional y tecnica validada contra Word + XLSM real

## 0. Alcance validado
- Fuente funcional: `Informe_Modelo_Regenerativo_Scoring_POP_LOTBA_RTM.docx`
- Fuente tecnica/calculo: `Modelo_Regenerativo_Scoring_POP_LOTBA_RTM.xlsm`
- Objetivo: implementar en SIMBA el mismo modelo operativo del Excel, con trazabilidad y seguridad por usuario.

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

## 6. Integracion en SIMBA (arquitectura objetivo)
Backend propuesto:
- `src/modules/scoring-agencias/scoring.controller.js`
- `src/modules/scoring-agencias/scoring.routes.js`
- `src/modules/scoring-agencias/scoring.service.js`
- `src/modules/scoring-agencias/scoring.engine.js`
- `src/modules/scoring-agencias/scoring.repository.js`

Frontend propuesto:
- `public/js/scoring-agencias.js`
- nueva vista/tab en `public/index.html`
- integracion de navegacion/carga en `public/js/app.js`

Persistencia recomendada:
- `scoring_agencias_config`
- `scoring_agencias_inputs`
- `scoring_agencias_snapshot`
- `scoring_agencias_hist` (opcional si no se reutiliza `HIST_SCORE` logico)

## 7. Adaptacion de datos desde SIMBA
Fuente principal:
- `control_previo_agencias` para ventas totales por agencia/periodo.
- mismo set para extraer mix LOTO (`juego in ('loto','loto5')` segun homologacion local).

Fuentes complementarias:
- Compliance, digital y cliente inicialmente cargables por CSV/API interna.
- Mientras no haya fuente online, usar tabla de insumos manual con versionado por periodo.

## 8. Seguridad y restriccion de acceso (fase 1)
Requisito operativo confirmado:
- Solo pueden ver/usar el modulo: `admin` y usuario `ogonzalez`.

Propuesta de implementacion (sin hardcode inseguro):
- Mantener `authenticate` obligatorio.
- Crear middleware especifico `allowScoringUsers` que valide `req.user.username` en allowlist configurable.
- Configuracion via `.env`:
  - `SCORING_ENABLED=true`
  - `SCORING_ALLOWED_USERS=admin,ogonzalez`
- Adicionalmente exigir permiso RBAC de lectura (`reportes.read`) para no romper modelo de permisos existente.
- En frontend ocultar la vista si el usuario no esta autorizado (validacion de conveniencia, no de seguridad).

## 9. Endpoints definidos para implementacion
- `GET /api/scoring-agencias/resumen?periodo=2025-Q3`
- `GET /api/scoring-agencias/ranking?periodo=2025-Q3&asesor=&categoria=`
- `GET /api/scoring-agencias/agencia/:ctaCte?periodo=2025-Q3`
- `POST /api/scoring-agencias/simular`
- `GET /api/scoring-agencias/config`
- `PUT /api/scoring-agencias/config`
- `POST /api/scoring-agencias/snapshot` (cierre de periodo)

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

## 12. Plan de implementacion por fases
Fase 1 (acceso restringido):
- endpoints de lectura (`resumen`, `ranking`, `ficha`) y vista ejecutiva.
- permiso solo `admin` + `ogonzalez`.

Fase 2:
- simulador y recomendaciones predictivas completas.
- snapshot/historico automatizado.

Fase 3:
- tablero ejecutivo completo con graficos y exportables.
- eventual exposicion a mas perfiles segun resultado.

---
Este documento reemplaza el diseno preliminar y queda como base de desarrollo alineada con el modelo real entregado por negocio (Word + XLSM).
