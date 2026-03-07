# SIMBA V2 - Copilot Instructions

## Project Overview
Sistema de control y análisis de sorteos de lotería (Quiniela, Poceada) para LOTBA (Lotería de Buenos Aires). Node.js + Express backend, vanilla JS frontend, MySQL database.

## Architecture
- **Backend**: `src/` - Express.js with modular controllers (`src/modules/{module}/{module}.controller.js`)
- **Frontend**: `public/` - Single Page Application with `app.js` (main logic) and `api.js` (HTTP client)
- **Database**: MySQL via XAMPP, schema in `database/init.js`
- **Config**: Game rules in `src/config/distribucion-juegos.json` (updated monthly from LOTBA documents)

## Key Patterns

### Module Structure
Each module follows: `{module}.controller.js` + `{module}.routes.js`
```javascript
// Controllers use shared response helpers
const { successResponse, errorResponse } = require('../../shared/helpers');
return successResponse(res, data, 'Message');
return errorResponse(res, 'Error message', 400);
```

### Authentication & Authorization
- JWT tokens via `authenticate` middleware
- RBAC with `requirePermission('module.action')` 
- Roles: `admin`, `operador`, `analista`, `auditor`
- Scoring access: `allowScoringUsers` middleware (admin + ogonzalez only)

### NTF File Parsing (Critical)
Lottery data comes in fixed-width text format (NTF v2). Positions are 1-based in docs, 0-based in code:
```javascript
// Example: src/modules/control-previo/quiniela.controller.js
const NTF_GENERIC = {
  PROVINCIA: { start: 13, length: 2 },  // Position 14-15 in PDF docs
  AGENCIA: { start: 15, length: 5 },    // Position 16-20
  // ...
};
const value = line.substr(field.start, field.length);
```

### Game Configuration
Prize distributions and rules are in `src/config/distribucion-juegos.json`:
- Load via `cargarConfigJuegos()` from `poceada.controller.js`
- Reload without restart: `POST /api/control-previo/config/recargar`

### Province Codes
Use `PROVINCIAS` map from `src/shared/helpers.js`:
- `'51'` = CABA, `'53'` = Buenos Aires, `'55'` = Córdoba, etc.
- Web sales agency: `5188880` (province 51 + agency 88880)

## Commands
```bash
npm start          # Production server (port 3000)
npm run dev        # Development with nodemon
npm run db:init    # Initialize database schema
npm run db:seed    # Seed test data
```

## Important Files
- `DOCUMENTACION.md` - Detailed system documentation (Spanish)
- `SCORING_REGENERATIVO.md` - Scoring module specification and implementation status
- `src/shared/helpers.js` - Date formatting (Argentina TZ), response utilities, province maps
- `src/shared/middleware.js` - JWT auth, role-based access control, scoring access
- `src/modules/scoring-agencias/scoring.controller.js` - Scoring engine + CRUD (real-time calculation)
- `database/init.js` - Full MySQL schema definition
- `database/migration_scoring_agencias.js` - 7 scoring tables migration

## Conventions
- All dates use `America/Argentina/Buenos_Aires` timezone via dayjs
- Money values stored as integers (centavos), displayed with `formatNumber()`
- ZIP files processed via `adm-zip`, XML via `xml2js`
- Frontend functions prefixed by module: `renderTablasPoceada()`, `mostrarResultadosCP()`

## Testing Data
- Quiniela: `QNL*.TXT` files, game code `'81'`
- Poceada: `PCD*.TXT` or `TMB*.TXT` files, game code `'82'`
- Cancelled tickets: `FECHA_CANCELACION` field not blank (positions 71-78)

## Scoring Module
- Real-time calculation from `control_previo_agencias` + 6 support tables
- 5 weighted axes: Ventas (35%), Cliente (30%), LOTO (15%), Compliance (10%), Digital (10%)
- Categories: DIAMANTE, PLATINO, ORO, PLATA, BRONCE, CERRADO (percentile + historical thresholds)
- Auto-seed: `ensureDefaultScoringData()` populates defaults on first use
- Frontend: "Comercial" sidebar section, 5 tabs (Ranking, Ficha, Análisis, Simulador, Config)
- Tables: `scoring_modelo_parametros`, `scoring_cliente_coeficientes`, `scoring_asesores`, `scoring_compliance`, `scoring_digital`, `scoring_cliente`, `scoring_hist_score`
- Excel parity notes (critical):
  - `B5` used for network growth differential (`I = E - B5`, with fallback to operational calc if absent)
  - category cuts apply `MAX(percentile, B45..B48)`
  - client fallback score uses weighted `B32..B35`
  - ranking follows Excel `RANK.EQ` tie behavior
- Chart status: Excel has 6 charts; SIMBA currently has 6 equivalent visualizations (5 Chart.js in Analisis + 1 historical sparkline in Ficha)
