# SIMBA V2 - Sistema de Control de Loterías

## 📋 Descripción General

Sistema web para el **control y análisis de sorteos de lotería** de LOTBA (Lotería de Buenos Aires). Diseñado como sistema **polimórfico** que detecta automáticamente el tipo de juego desde los archivos NTF.

**Juegos soportados (7 + Hipicas):**
- **Quiniela** - 5 modalidades (Previa, Primera, Matutina, Vespertina, Nocturna)
- **Poceada** - 8 números de 20 sorteados, 3 niveles de premio + acumulados
- **Tombolina** - 3-7 números, premios variables por cantidad y aciertos
- **Loto (6/45 + PLUS)** - 5 modalidades (Tradicional, Match, Desquite, Sale o Sale, Multiplicador)
- **Loto 5** - 5 números del 0-36, 3 niveles de premio
- **BRINCO** - 6 números del 1-41, modalidades Tradicional y Junior Siempre Sale
- **QUINI 6** - 6 números del 01-45, 5 modalidades (Trad. Primera, Trad. Segunda, Revancha, Siempre Sale, Premio Extra)
- **Hipicas (Turfito)** - Juego offline, facturación de hipódromos

**Funcionalidades principales:**
1. **Control Previo** - Procesamiento de archivos ZIP/NTF antes del sorteo
2. **Actas Notariales** - Generación de documentos legales PDF para escribanos
3. **Control Posterior (Escrutinio)** - Verificación de ganadores comparando apuestas vs extractos
4. **Reportes/Dashboard** - Estadísticas consolidadas por juego, fecha, agencia
5. **Historial** - Consulta de sorteos procesados y escrutinios previos
6. **Programación** - Carga de sorteos programados desde Excel
7. **Extractos** - Carga manual, por XML o por OCR (IA) de números sorteados
8. **Agencias** - Gestión de base de datos de agencias desde Excel
9. **Juegos Offline** - Procesamiento de facturación de hipódromos (Turfito)

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND                                │
│  HTML + CSS + JavaScript (Vanilla)                          │
│  SPA con navegación por hash/secciones                      │
│  OCR con IA multi-proveedor (Groq → OpenAI)                │
│  Puerto: 3000 (servido por Express) o 80 (Apache proxy)     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      BACKEND                                 │
│  Node.js + Express.js (24 controllers, 11 route files)      │
│  JWT Authentication + RBAC (4 roles)                        │
│  PDFKit (actas/reportes) + ExcelJS (importación)            │
│  Multer (uploads) + ADM-ZIP (procesamiento)                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      DATABASE                                │
│  MySQL (control_loterias)                                   │
│  XAMPP localhost:3306 / Hostinger (producción)               │
│  ~30 tablas (7 juegos × ~4 tablas + auxiliares)              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Estructura de Archivos

```
simbaV2/
├── public/                         # Frontend (SPA)
│   ├── index.html                  # Página principal (~2000+ líneas)
│   ├── css/
│   │   └── styles.css              # Estilos (tema oscuro + responsive)
│   └── js/
│       ├── app.js                  # Lógica principal (~12,700 líneas)
│       ├── api.js                  # Cliente API (346 líneas, 7 objetos API)
│       ├── config.js              # Config OCR + proveedores IA
│       ├── config.local.js        # API keys (NO versionado, .gitignore)
│       └── ocr-extractos.js       # OCR multi-proveedor (793 líneas)
│
├── src/                            # Backend
│   ├── app.js                      # Express server + rutas registradas
│   ├── config/
│   │   ├── database.js             # Conexión MySQL (local/producción)
│   │   └── distribucion-juegos.json # Config de premios Poceada/Quiniela
│   ├── shared/
│   │   ├── helpers.js              # Utilidades (fechas, provincias, formateo)
│   │   ├── middleware.js           # Auth JWT + RBAC + auditoría
│   │   ├── control-previo.helper.js # Guardar control previo en BD (567 líneas)
│   │   └── escrutinio.helper.js    # Guardar escrutinios en BD (581 líneas)
│   └── modules/
│       ├── auth/                   # Login, JWT, perfil
│       ├── users/                  # CRUD usuarios + roles
│       ├── control-previo/         # 8 controllers (1 por juego + main)
│       ├── control-posterior/      # 8 controllers (escrutinio por juego + extracto)
│       ├── actas/                  # Generación PDFs (3044 líneas)
│       ├── agencias/               # Carga Excel de agencias
│       ├── programacion/           # Programación de sorteos
│       ├── historial/              # Dashboard + historial (2350 líneas)
│       ├── extractos/              # CRUD de extractos
│       └── juegos-offline/         # Hipicas (Turfito)
│
├── config/
│   └── loto-distribucion.json      # Config premios Loto Plus
│
├── database/
│   ├── init.js                     # Schema completo de BD
│   ├── seed.js                     # Datos de prueba
│   ├── seed_agencias.js            # Agencias de prueba
│   ├── reset_admin.js              # Reset de admin
│   └── migration_*.js              # 13 migraciones (brinco, quini6, loto, etc.)
│
├── uploads/                        # Archivos subidos
│   ├── ntf/                        # ZIPs procesados
│   ├── extractos/                  # Extractos guardados
│   └── temp/                       # Temporales
│
├── logs/                           # Logs del servidor
├── DOCUMENTACION.md                # Este archivo
├── prompt.md                       # Historial de desarrollo
└── package.json                    # v2.3.0, Node.js
```

---

## 🔐 Sistema de Autenticación

### Roles y Permisos (RBAC)

| Rol | Descripción | Permisos |
|-----|-------------|----------|
| `admin` | Administrador | Acceso total al sistema |
| `operador` | Operador de sorteos | control_previo, actas |
| `analista` | Analista de datos | control_previo, control_posterior, reportes |
| `auditor` | Auditor externo | Solo lectura de resultados |

### Implementación
- **JWT** gestionado por `src/shared/middleware.js`
- `authenticate` - Verifica token JWT en cada request
- `requirePermission('modulo.accion')` - Verifica permisos por rol
- `registrarAuditoria` - Log de acciones del usuario
- Tokens almacenados en localStorage del frontend

---

## 📊 MÓDULO: Control Previo

### Procesamiento Universal de Archivos

**Controller principal:** `src/modules/control-previo/main.controller.js`

El sistema detecta automáticamente el juego por el **código NTF** (posiciones 3-4 del archivo TXT):

| Código NTF | Juego | Prefijo Archivo | Controller |
|------------|-------|-----------------|------------|
| 80 | Quiniela | QNL | `quiniela.controller.js` (773 líneas) |
| 82 | Poceada | PCD / TMB | `poceada.controller.js` (1039 líneas) |
| 74 | Tombolina | TMB | `tombolina.controller.js` (210 líneas) |
| 09 | Loto Plus | LOTO / LOT / LTO | `loto.controller.js` (735 líneas) |
| 05 | Loto 5 | LT5 | `loto5.controller.js` (569 líneas) |
| 13 | BRINCO | BRN | `brinco.controller.js` (592 líneas) |
| 69 | QUINI 6 | QN6 | `quini6.controller.js` (888 líneas) |

### Flujo de Procesamiento
1. Usuario sube archivo **ZIP** (drag & drop o selección)
2. El ZIP contiene: **TXT** (NTF v2), **XML**, **HASH**, **PDF**
3. El sistema detecta el juego por código NTF o prefijo de archivo
4. Se parsea el TXT línea por línea (formato de longitud fija, 200+ caracteres)
5. Se comparan datos del TXT vs XML oficial
6. Se verifican archivos HASH (SHA-512)
7. Se muestran estadísticas y discrepancias en el frontend
8. Se guarda en base de datos

### Formato NTF v2 (Genérico - 200 caracteres base)

Todos los juegos comparten una parte genérica:

| Campo | Posición (0-based) | Longitud | Descripción |
|-------|-------------------|----------|-------------|
| PROVINCIA | 13 | 2 | Código de provincia (51=CABA, etc.) |
| AGENCIA | 15 | 5 | Número de agencia |
| ORDINAL | 26 | 2 | '01' para primer ticket |
| FECHA_CANCELACION | 70 | 8 | En blanco = válido, con fecha = anulado |
| AGENCIA_AMIGA | 113 | 8 | Solo para agencia 88880 (venta web) |
| VALOR_APUESTA | 121 | 10 | Formato EEEEEEEEDD (÷100) |
| LOTERIAS_JUGADAS | 204 | 8 | Desglose por provincia (Quiniela) |

**Campos específicos por juego** (después de posición 200):
- **Poceada**: `CANTIDAD_NUMEROS` (207-208), números jugados codificados binariamente
- **Tombolina**: `CANTIDAD_NUMEROS` (215-216), `SECUENCIA_NUMEROS` (211-224), `LETRAS` (203-206)
- **Loto/Loto5/Brinco/Quini6**: Números codificados con BINARY_CODE (A-P → 4 bits)

### Segmentación de Recaudación (Triple)

Cada control previo calcula automáticamente:
- **Venta Web** - Agencia 88880 (Cuenta Corriente)
- **CABA Propia** - Provincia 51, excluyendo venta web
- **Provincias (Interior)** - Resto de jurisdicciones

Columnas en BD: `recaudacion_caba`, `recaudacion_provincias`, `recaudacion_web`

### Mapa de Provincias (`src/shared/helpers.js`)

| Código | Provincia | | Código | Provincia |
|--------|-----------|---|--------|-----------|
| 51 | CABA | | 65 | Neuquén |
| 53 | Buenos Aires | | 67 | Río Negro |
| 55 | Córdoba | | 69 | Salta |
| 57 | Corrientes | | 71 | Santa Fe |
| 59 | Entre Ríos | | 73 | Sgo. del Estero |
| 61 | Formosa | | 75 | Tucumán |
| 63 | Misiones | | 90 | Uruguay |

### Validación de Agencias Amigas
- Solo la agencia **88880** (venta web) puede tener agencia amiga
- Campo `AGENCIA_AMIGA` (posiciones 114-121)
- Se valida contra tabla `agencias` en BD
- Errores reportados con: número de fila, ticket, agencia detectada

---

## 🎯 MÓDULO: Control Posterior (Escrutinio)

### Flujo General
1. Se cargan datos desde Control Previo (registros NTF procesados)
2. Se cargan los **extractos** (números sorteados) por:
   - **XML** oficial (detección automática de modalidad y provincia)
   - **OCR** con IA (Groq / OpenAI) desde imagen/foto
   - **Manual** (ingreso directo por el usuario)
3. Se ejecuta el **escrutinio** (comparación apuestas vs extracto)
4. Se calculan **premios** según distribución configurada
5. Se generan **reportes** (HTML + PDF + CSV)
6. Se guardan resultados en BD automáticamente

### Escrutinio por Juego

#### Quiniela (`quiniela-escrutinio.controller.js` - 1305 líneas)
- **Multiplicadores por cifras**: 1→×7, 2→×70, 3→×600, 4→×3500
- **Redoblona**: Algoritmo VB6 replicado con extensión efectiva, corrimiento (shifting) y topes (1a2, 1a3, general)
- **Letras**: Premio fijo $1000 exclusivo CABA, solo si no gana por números
- **Exports**: `ejecutarEscrutinio`, `ejecutarControlPosterior`, `generarExcel`, `generarPDFReporte`

#### Poceada (`poceada-escrutinio.controller.js` - 617 líneas)
- **Decodificación binaria**: BINARY_CODE (A-P → 4 bits) para números
- **Combinaciones**: C(n, 8) para n números jugados (8-15)
- **Niveles**: 8 aciertos (1er premio, 62%), 7 aciertos (2do, 23.5%), 6 aciertos (3er, 10%)
- **Pozos de arrastre**: 4 pozos independientes (1er, 2do, 3er, agenciero)
- **Pozo asegurado**: $60.000.000 (1er premio)
- **Fondo de reserva**: 4% de recaudación

#### Tombolina (`tombolina-escrutinio.controller.js` - 238 líneas)
- **Premios variables**: Tabla de multiplicadores según cantidad de números (3-7) y aciertos (hasta 8000×)
- **Letras**: Premio fijo $1000 por 4 letras exactas (solo si no ganó por números)
- **Estímulo agenciero**: 1% sobre premios pagados

#### Loto Plus (`loto-escrutinio.controller.js` - 1100+ líneas)
- **5 modalidades**: Tradicional, Match, Desquite, Sale o Sale, Multiplicador
- **Todas las apuestas participan** en todas las modalidades
- **Premios del XML**: Se leen montos del archivo XML oficial
- **Config**: `config/loto-distribucion.json`
  - Tradicional/Match: 65%/15%/3% por 6/5/4 aciertos
  - Desquite: 80% solo 6 aciertos
  - Sale o Sale: 85% cascada 6→1
  - Multiplicador: 2x premio extra, agenciero $500.000/agencia
- **Agenciero vacante**: Cuando ganadores son de venta web (5188880), el premio queda vacante
- **Número PLUS**: Decodificación mejorada (dígito directo, letra A-J, o formato A-P)
- **Logging detallado**: Debug de ganadores por modalidad y multiplicador

#### Loto 5 (`loto5-escrutinio.controller.js` - 450+ líneas)
- **3 niveles**: 5 aciertos (1er), 4 aciertos (2do), 3 aciertos (devolución apuesta)
- **Agenciero**: 1% del total premios (1er + 2do), a agencias que vendieron tickets ganadores de 5 aciertos
- **Agenciero vacante**: Si ganadores de 5 son todos de venta web, el premio queda vacante con nota explicativa
- **Rango**: 0-36, 5 números por apuesta
- **Campo `esVentaWeb`**: Agregado a cada ganador para tracking de venta web

#### BRINCO (`brinco-escrutinio.controller.js` - 755 líneas)
- **Decodificación binaria** de números (letras A-P = 4 bits)
- **Tradicional**: 6/5/4/3 aciertos → 33%/11%/13%/25% del pozo
- **Junior Siempre Sale**: 5+ aciertos → 10% del pozo
- **Ticket display**: Muestra premio ganado (no importe/apuesta). Cada ganador tiene `premio` y `premioUnitario` asignados
- **Persistencia automática**: `guardarEscrutinioBrinco()` → `escrutinio_brinco` + `escrutinio_brinco_ganadores`

#### QUINI 6 (`quini6-escrutinio.controller.js` - 969 líneas)
- **Tradicional Primera/Segunda**: 6/5/4 aciertos → 45%/19% del pozo
- **Revancha**: Solo 6 aciertos → 13% del pozo
- **Siempre Sale**: Sorteos iterativos hasta encontrar ganador (6→3 aciertos) → 14%
- **Premio Extra**: Pool de números separado, jackpot acumulado, 6 aciertos exactos
  - Pool ingresable manualmente en frontend (campo `cpst-quini6-pe-pool`)
  - Debugging detallado con logs de tickets evaluados y acumulados
- **Ticket display**: Muestra premio ganado (no importe/apuesta)
- **Resumen**: Tabla con columna "Premio Total" por modalidad
- **Persistencia automática**: `guardarEscrutinioQuini6DB()` → `escrutinio_quini6` + `escrutinio_quini6_ganadores`

---

## 🤖 MÓDULO: OCR de Extractos

### Sistema Multi-Proveedor con Fallback

**Archivo**: `public/js/ocr-extractos.js` (793 líneas)

**Proveedores configurados** en `public/js/config.js`:

| Proveedor | Modelo | Estado | Prioridad |
|-----------|--------|--------|-----------|
| **GROQ** | meta-llama/llama-4-scout-17b-16e-instruct | ✅ Activo | 1 (primario) |
| **MISTRAL** | mistral-small-2506 | ❌ Deshabilitado (rate limits) | - |
| **OPENAI** | gpt-4o | ✅ Activo | 2 (fallback) |

**Nota:** El modelo Groq se actualizó de `llama-3.2-90b-vision-preview` a `llama-4-scout-17b-16e-instruct` en febrero 2026.

**API keys**: Almacenadas en `public/js/config.local.js` (gitignored). Se mezclan en `CONFIG` al cargar.

**Funciones OCR por juego:**

| Función | Juego | Extrae |
|---------|-------|--------|
| `procesarImagenQuiniela()` | Quiniela | 20 números + letras por provincia |
| `procesarImagenPoceada()` | Poceada | 20 números + 4 letras |
| `procesarImagenTombolina()` | Tombolina | Números + letras (formato Quiniela) |
| `procesarImagenBrinco()` | BRINCO | 6 números Tradicional + 6 Revancha |
| `procesarImagenQuini6()` | QUINI 6 | Números de 4 sorteos + Premio Extra |
| `procesarExtractoAuto()` | Automático | Detecta tipo de juego y aplica función correcta |

**Flujo**: Imagen → Llamada API IA (Groq) → Si falla → Fallback (OpenAI) → Parse JSON → Llenar inputs del frontend

---

## 📝 MÓDULO: Actas y Reportes PDF

**Controller**: `src/modules/actas/actas.controller.js` (3044 líneas)

Genera PDFs con **PDFKit** para:

### Acta de Control Previo
- Resumen de procesamiento del ZIP
- Estadísticas: registros, apuestas, recaudación (total/válida/anulada)
- Tabla de segmentación (Web/CABA/Interior)
- Validación de archivos de seguridad (HASH)
- Adaptado por juego (Quiniela, Poceada, Tombolina, Loto, Brinco, Quini6)

### Acta Notarial
- Documento legal para escribanos
- Datos del sorteo y configuración

### Acta de Control Posterior
- Resumen de escrutinio
- Comparación Control Previo vs Escrutinio (tickets, apuestas, montos)
- Ganadores por provincia/categoría con detalle
- Premios pagados
- Extractos sorteados (números + letras)
- Estándar visual unificado para todos los juegos

---

## 📈 MÓDULO: Reportes / Dashboard

**Controller**: `src/modules/historial/historial.controller.js` (2350 líneas)

### Vistas del Dashboard

| Vista | Descripción |
|-------|-------------|
| **Detallado** | Una fila por cada sorteo/juego con todos los campos |
| **Totalizado** | Agrupado por juego sumando montos |
| **Agencias con Venta** | Una fila por agencia con métricas |
| **Comparativo** | Comparación entre períodos |
| **Totalizado por Agencia** | Agrupa TODOS los juegos por agencia, badges de colores por juego |

### Columnas Condicionales por Tipo de Juego

| Columna | Hipicas | Otros juegos |
|---------|---------|-------------|
| Recaudación | ✅ monto | ✅ monto |
| Cancelaciones | ✅ monto | `-` |
| Devoluciones | ✅ monto | `-` |
| Tickets | `-` | ✅ cantidad |
| Apuestas | `-` | ✅ cantidad |
| Anulados | `-` | ✅ cantidad |
| Ganadores | `-` | ✅ cantidad |
| Premios | ✅ monto | ✅ monto |

### Funciones Principales

| Función | Descripción |
|---------|-------------|
| `obtenerDatosDashboard()` | Datos consolidados para las 5 vistas (7 juegos + hipicas) |
| `obtenerStatsDashboard()` | Tarjetas resumen (recaudación, premios, cancelaciones, devoluciones) |
| `obtenerFiltrosDashboard()` | Opciones de filtros dinámicos |
| `listarControlPrevioGeneral()` | Historial de todos los control previo |
| `listarEscrutiniosGeneral()` | Historial de todos los escrutinios |
| `obtenerDetalleEscrutinio()` | Detalle completo de un escrutinio |
| `buscarSorteo()` | Búsqueda por número de sorteo (7 juegos) |
| `obtenerGanadores()` | Lista de ganadores por escrutinio |
| `obtenerPremiosAgencias()` | Premios agrupados por agencia |

---

## 📅 MÓDULO: Programación

**Controller**: `src/modules/programacion/programacion.controller.js` (1236 líneas)

### Funcionalidades
- Carga de programación desde **Excel** (ExcelJS)
- Mapeo de códigos de juegos: `0080`=Quiniela, `0069`=Quini6, `0013`=Brinco, etc.
- Filtro por mes usando **rango de fechas** (`fecha_sorteo >= ? AND fecha_sorteo < ?`)
- Horas correctas con UTC (no timezone local)
- Cada registro calcula su propio `mes_carga` según su `fecha_sorteo`
- Verificación de sorteo programado antes de guardar extracto

### Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/programacion/cargar-excel` | Cargar Excel de programación |
| GET | `/api/programacion/listar` | Listar programación con filtros |
| GET | `/api/programacion/fecha` | Sorteos por fecha |
| GET | `/api/programacion/sorteo/:numero` | Detalle de sorteo |
| GET | `/api/programacion/verificar` | Verificar existencia de sorteo |
| GET | `/api/programacion/sorteos-del-dia` | Sorteos programados para hoy |
| DELETE | `/api/programacion/borrar` | Eliminar programación |

---

## 🏢 MÓDULO: Agencias

**Controller**: `src/modules/agencias/agencias.controller.js` (263 líneas)

- Carga masiva desde **Excel** con `cargarExcelAgencias()`
- UPSERT: Si la agencia existe (por número) se actualiza, si no se inserta
- Búsqueda por número de agencia
- Función `agenciasAPI.cargarExcel()` en frontend
- Frontend con tabla paginada

---

## 🐴 MÓDULO: Juegos Offline - Hipicas (Turfito)

**Controller**: `src/modules/juegos-offline/hipicas.controller.js` (675 líneas)

### Hipódromos Soportados

| Código | Nombre | Abreviatura |
|--------|--------|-------------|
| 0099 | Palermo | HP |
| 0021 | La Plata | LP |
| 0020 | San Isidro | SI |

### Parser TXT Posicional (port de Python TurfitoLoader)
| Campo | Posición | Longitud |
|-------|----------|----------|
| codigo_juego | 0 | 4 |
| provincia_agencia | 4 | 7 |
| reunion | 19 | 3 |
| fecha | 22 | 8 |
| ventas | 30 | 12 |
| cancelaciones | 42 | 12 |
| devoluciones | 53 | 13 |
| premios | 64 | 14 |

### Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/juegos-offline/hipicas/procesar-txt` | Subir archivo TXT (multer, 10MB, solo TXT) |
| GET | `/api/juegos-offline/hipicas/facturacion` | Consultar facturación con filtros |
| DELETE | `/api/juegos-offline/hipicas/facturacion/:id` | Eliminar registro |

### Integración con Reportes
- Checkbox "HIPICAS" en selector de juegos del dashboard
- Columnas de Cancelaciones y Devoluciones específicas
- Datos incluidos en vistas detallado, totalizado, agencias_venta, comparativo
- Modalidad "H" = Hipicas en `getModalidadNombre()`
- Frontend: `initJuegosOffline()`, `procesarArchivoHipicas()`, `cargarHistorialHipicas()`, `exportarHipicasExcel()`

---

## ⚙️ Sistema de Configuración Dinámica

### Distribución de Premios

**Archivo**: `src/config/distribucion-juegos.json` (297 líneas)

```json
{
  "version": "2026-01",
  "vigencia": { "desde": "2026-01-01", "hasta": "2026-01-31" },
  "fuente": "IF-2025-55768962-GCABA-LOTBA",
  "juegos": {
    "poceada": {
      "porcentajePozoTotal": 45,
      "distribucionPremios": {
        "primerPremio": { "porcentaje": 62, "aciertos": 8 },
        "segundoPremio": { "porcentaje": 23.5, "aciertos": 7 },
        "tercerPremio": { "porcentaje": 10, "aciertos": 6 },
        "agenteVendedor": { "porcentaje": 0.5 },
        "fondoReserva": { "porcentaje": 4 }
      },
      "pozoAsegurado": { "primerPremio": 60000000 },
      "valorApuesta": { "simple": 1100 }
    },
    "quiniela": {
      "multiplicadores": { "1cifra": 7, "2cifras": 70, "3cifras": 600, "4cifras": 3500 },
      "topeBanca": 5
    }
  }
}
```

**Archivo**: `config/loto-distribucion.json` (52 líneas)
- Tradicional/Match: 65%/15%/3% por 6/5/4 aciertos + 2% agenciero + 15% fondo reserva
- Desquite: 80% solo 6 aciertos + 2% agenciero + 18% fondo reserva
- Sale o Sale: 85% cascada 6→1 + agenciero solo con 6 aciertos
- Multiplicador: 2x premio extra + agenciero fijo $500.000

**Configuración BRINCO y QUINI 6** en `distribucion-juegos.json`:
```json
"brinco": {
  "codigoNTF": "13", "numerosPorApuesta": 6,
  "rangoNumeros": { "min": 1, "max": 41 },
  "instancias": { "1": "Tradicional", "2": "Trad+Revancha" }
}
"quini6": {
  "codigoNTF": "69", "numerosPorApuesta": 6,
  "rangoNumeros": { "min": 1, "max": 45 },
  "instancias": { "1": "Tradicional", "2": "Trad+Revancha", "3": "Completo" },
  "modalidades": {
    "tradicionalPrimera": { "aciertos": [6, 5, 4], "porcentajePozo": 45 },
    "tradicionalSegunda": { "aciertos": [6, 5, 4], "porcentajePozo": 19 },
    "revancha": { "aciertos": [6], "porcentajePozo": 13 },
    "siempreSale": { "aciertos": [6, 5, 4, 3], "porcentajePozo": 14 },
    "premioExtra": { "aciertos": [6], "tipo": "jackpot" }
  }
}
```

### Endpoints de Configuración

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/control-previo/config/distribucion` | Obtener configuración actual |
| POST | `/api/control-previo/config/recargar` | Recargar desde archivo (sin reiniciar) |

### Actualización Mensual
1. Actualizar `distribucion-juegos.json` con valores de la resolución LOTBA del mes
2. Llamar `POST /api/control-previo/config/recargar`
3. El sistema aplica cambios inmediatamente

---

## 🗄️ Base de Datos

### Tablas por Juego

| Juego | Tablas |
|-------|--------|
| **Quiniela** | `control_previo_quiniela`, `escrutinio_quiniela`, `escrutinio_ganadores`, `escrutinio_premios_agencia` |
| **Poceada** | `control_previo_poceada`, `escrutinio_poceada`, `poceada_sorteos` |
| **Tombolina** | `control_previo_tombolina` |
| **Loto** | `control_previo_loto`, `control_previo_loto_tickets`, `escrutinio_loto`, `escrutinio_loto_ganadores` |
| **Loto 5** | `control_previo_loto5`, `control_previo_loto5_tickets`, `escrutinio_loto5`, `escrutinio_loto5_ganadores` |
| **BRINCO** | `control_previo_brinco`, `control_previo_brinco_tickets`, `escrutinio_brinco`, `escrutinio_brinco_ganadores` |
| **QUINI 6** | `control_previo_quini6`, `control_previo_quini6_tickets`, `escrutinio_quini6`, `escrutinio_quini6_ganadores` |

### Tablas Auxiliares

| Tabla | Descripción |
|-------|-------------|
| `usuarios` | Login, roles, contraseñas bcrypt |
| `agencias` | Base de agencias (número, nombre, provincia, localidad) |
| `juegos` | Catálogo de juegos soportados |
| `sorteos` | Catálogo de modalidades (Previa, Primera, etc.) |
| `extractos` | Números sorteados guardados |
| `programacion_sorteos` | Programación cargada desde Excel |
| `programacion_cargas` | Historial de cargas de Excel |
| `control_previo_agencias` | Detalle por agencia del control previo |
| `facturacion_turfito` | Facturación de hipicas (UNIQUE: sorteo + agency) |
| `archivos` | Registro de archivos procesados |

### Migraciones (13 archivos en `database/`)

| Archivo | Propósito |
|---------|-----------|
| `init.js` | Schema completo inicial |
| `migration_brinco.js` | 4 tablas BRINCO |
| `migration_quini6.js` | 4 tablas QUINI 6 |
| `migration_loto.js` | 4 tablas Loto Plus |
| `migration_loto5.js` | 4 tablas Loto 5 |
| `migration_poceada.js` | Tablas Poceada + sorteos |
| `migration_pozos_arrastre.js` | Columnas arrastre en `poceada_sorteos` |
| `migration_agencias.js` | Tabla agencias base |
| `migration_agencias_localidad.js` | Columna localidad |
| `migration_agencias_split_columns.js` | Separar columnas |
| `migration_control_previo_agencias.js` | Detalle por agencia |
| `migration_control_resguardo.js` | Tablas de resguardo |
| `migration_programacion.js` | Programación sorteos |
| `migration_programacion_juegos.js` | Config juegos en programación |

---

## 🌐 API Endpoints Completa

### Autenticación (`/api/auth`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/login` | Login → JWT |
| GET | `/profile` | Perfil del usuario |
| POST | `/change-password` | Cambiar contraseña |
| GET | `/verify` | Verificar token |

### Usuarios (`/api/users`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Listar usuarios |
| POST | `/` | Crear usuario |
| PUT | `/:id` | Editar usuario |
| POST | `/:id/reset-password` | Reset contraseña |
| GET | `/roles` | Listar roles |

### Control Previo (`/api/control-previo`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/procesar-universal` | Procesar ZIP (detección automática) |
| POST | `/quiniela/procesar-zip` | Procesar ZIP Quiniela |
| POST | `/poceada/procesar-zip` | Procesar ZIP Poceada |
| POST | `/tombolina/procesar` | Procesar ZIP Tombolina |
| POST | `/loto/procesar-zip` | Procesar ZIP Loto |
| POST | `/loto5/procesar-zip` | Procesar ZIP Loto 5 |
| POST | `/brinco/procesar-zip` | Procesar ZIP BRINCO |
| POST | `/quini6/procesar-zip` | Procesar ZIP QUINI 6 |
| POST | `/poceada/guardar-arrastres` | Guardar pozos arrastre |
| GET | `/config/distribucion` | Config premios |
| POST | `/config/recargar` | Recargar config |

### Control Posterior (`/api/control-posterior`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/quiniela/escrutinio` | Escrutinio Quiniela |
| POST | `/poceada/escrutinio` | Escrutinio Poceada |
| POST | `/tombolina/escrutinio` | Escrutinio Tombolina |
| POST | `/loto/escrutinio` | Escrutinio Loto |
| POST | `/loto5/escrutinio` | Escrutinio Loto 5 |
| POST | `/brinco/escrutinio` | Escrutinio BRINCO |
| POST | `/quini6/escrutinio` | Escrutinio QUINI 6 |

### Actas (`/api/actas`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/control-previo` | PDF control previo |
| POST | `/notarial` | Acta notarial |
| POST | `/control-posterior` | PDF escrutinio |

### Extractos (`/api/extractos`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Listar extractos |
| POST | `/` | Guardar extracto |
| POST | `/bulk` | Guardar múltiples |
| PUT | `/:id` | Actualizar extracto |
| DELETE | `/:id` | Eliminar extracto |

### Programación (`/api/programacion`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/cargar-excel` | Cargar Excel |
| GET | `/listar` | Listar programación |
| GET | `/fecha` | Sorteos por fecha |
| GET | `/sorteo/:numero` | Detalle sorteo |
| GET | `/verificar` | Verificar sorteo |
| GET | `/sorteos-del-dia` | Sorteos de hoy |
| DELETE | `/borrar` | Eliminar programación |

### Historial / Reportes (`/api/historial`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/control-previo` | Historial control previo |
| GET | `/escrutinios` | Historial escrutinios |
| GET | `/dashboard` | Datos dashboard |
| GET | `/dashboard/stats` | Tarjetas estadísticas |
| GET | `/dashboard/filtros` | Filtros disponibles |
| GET | `/ganadores` | Ganadores por escrutinio |
| GET | `/premios-agencias` | Premios por agencia |
| GET | `/buscar-sorteo` | Buscar por número |

### Agencias (`/api/agencias`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Listar agencias |
| POST | `/cargar-excel` | Cargar Excel |
| GET | `/buscar` | Buscar agencia |

### Juegos Offline (`/api/juegos-offline`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/hipicas/procesar-txt` | Procesar TXT Turfito |
| GET | `/hipicas/facturacion` | Consultar facturación |
| DELETE | `/hipicas/facturacion/:id` | Eliminar registro |

---

## 🖥️ Frontend (SPA)

### Arquitectura
- **Single Page Application** con navegación por secciones (sin framework)
- `public/js/app.js` (~12,700 líneas) - Toda la lógica del frontend
- `public/js/api.js` (346 líneas) - 7 objetos API para comunicación con backend
- `public/index.html` (~2000+ líneas) - HTML completo con todas las secciones

### Objetos API del Frontend

| Objeto | Responsabilidad |
|--------|----------------|
| `authAPI` | Login, perfil, cambio de contraseña |
| `controlPrevioAPI` | Upload ZIPs, guardar control previo, buscar pozos |
| `controlPosteriorAPI` | Escrutinios, generación Excel/PDF |
| `agenciasAPI` | Carga Excel, búsqueda de agencias |
| `extractosAPI` | CRUD de extractos |
| `programacionAPI` | Sorteos, programación, verificación |
| `juegosOfflineAPI` | Hipicas / Turfito |

### Detección Automática de API Base
```javascript
// api.js detecta entorno automáticamente:
// Producción (Hostinger) → ruta relativa
// Apache/XAMPP (proxy 80) → ruta relativa
// Node.js directo → http://localhost:3000/api
```

### Secciones del Frontend
1. **Dashboard** - Vista inicial con resumen del día
2. **Control Previo** - Upload de ZIP, drag & drop, procesamiento automático
3. **Control Posterior** - Escrutinio con barra horizontal selector de juegos
4. **Reportes** - Dashboard con 5 vistas, filtros, exportación
5. **Programación** - Carga de Excel y consulta de sorteos
6. **Extractos** - Gestión de números sorteados (manual/XML/OCR)
7. **Agencias** - Carga Excel y tabla de agencias
8. **Juegos Offline** - Hipicas con upload drag & drop
9. **Usuarios** - CRUD (solo admin)

### Funciones Clave del Frontend por Módulo

**Control Previo:**
- `mostrarResultadosCP()` - Renderiza resultados con tarjetas de estadísticas
- `renderTablasPoceada()` - Tabla de desglose por tipo de apuesta
- `renderTablasTombolina()` - Tabla con barras de progreso

**Control Posterior:**
- `ejecutarEscrutinio[Juego]()` - Función de escrutinio por cada juego
- `renderTicketsGanadores()` - Tabla de ganadores con premio (no importe)
- `llenarInputs[Juego]DesdeOCR()` - Llenar formulario desde datos OCR

**Reportes:**
- `cargarDatosDashboard()` - Obtener y renderizar datos
- `renderVista[Tipo]()` - Renderizar cada vista (detallado, totalizado, etc.)
- `exportarHipicasExcel()` - Exportar datos a Excel

---

## 🛠️ Configuración del Servidor

### Desarrollo Local
```bash
npm run dev        # Node.js + Nodemon en puerto 3000
npm run db:init    # Inicializar schema de BD
npm run db:seed    # Datos de prueba
```

### Producción (Hostinger)
- Deploy automático desde rama `main` (sincronizada con `principal`)
- Variables de entorno con fallback hardcodeado en `database.js`
- Archivos `.env` desaparecen al redeploy → se usa fallback
- Tarda 1+ hora en completar redeploy
- Cache busters en index.html (`v=20260207a`)

### MySQL
- **Puerto**: 3306 (XAMPP default)
- **Base de datos**: `control_loterias`
- **Charset**: utf8mb4

### Apache (Opcional)
- `mod_proxy_http` → proxy a `http://localhost:3000`

### Dependencias (package.json v2.3.0)
```
express, mysql2, adm-zip, xml2js, jsonwebtoken, bcryptjs,
exceljs, pdfkit, tesseract.js, dayjs, helmet, cors, multer,
iconv-lite, pdf-parse, uuid, dotenv, express-validator
Dev: nodemon
```

---

## 🐛 Troubleshooting

| Error | Causa | Solución |
|-------|-------|----------|
| `ERR_CONNECTION_REFUSED` | Node.js no corriendo | `npm run dev` |
| `404 Not Found` en `/api/*` | Falta proxy Apache | Usar `localhost:3000` |
| `Column count doesn't match` | Mismatch INSERT SQL | Verificar columnas vs `?` |
| `Collation mix` (utf8mb4) | Incompatibilidad charset | Usar rango de fechas |
| OCR no funciona | API key faltante | Verificar `config.local.js` |
| Escrutinio no guarda en BD | Falta función guardar | Verificar controller tiene `guardarEscrutinio*()` |
| Ticket muestra importe no premio | Frontend no asigna premioUnitario | Verificar backend asigna `premio` a cada ganador |

---

## 📋 Convenciones del Proyecto

- **Timezone**: `America/Argentina/Buenos_Aires` via dayjs
- **Moneda**: Valores en centavos, display con `formatNumber()`
- **ZIP**: Procesados con `adm-zip`
- **XML**: Parseados con `xml2js`
- **Hash**: SHA-512 para archivos NTF
- **Encoding**: `latin1` para archivos TXT del NTF
- **Frontend**: Funciones prefijadas por módulo: `renderTablasPoceada()`, `mostrarResultadosCP()`
- **Backend**: `successResponse(res, data, 'Mensaje')` / `errorResponse(res, 'Error', 400)`
- **Git**: Rama `main` principal, sincronizada con `principal` para Hostinger
- **Decodificación binaria**: BINARY_CODE (A=0000, B=0001, ... P=1111) para números en Poceada/Brinco/Quini6/Loto
- **Agencia venta web**: `5188880` (provincia 51 + agencia 88880)
- **Formato ctaCte**: `5100011` (provincia 2 dígitos + agencia 5 dígitos, sin guión, sin verificador)

---

## 🆕 Historial de Versiones

| Versión | Fecha | Cambios Principales |
|---------|-------|---------------------|
| 3.5 | 8 Feb 2026 | Guardado premios por agencia para TODOS los juegos (LOTO, LOTO5, QUINI6, BRINCO), tablas `escrutinio_loto_ganadores` y `escrutinio_loto5_ganadores`, consulta acumulada "Todos los juegos" por cta_cte, fix bug agenciero LOTO $0 |
| 3.4 | 8 Feb 2026 | Agenciero vacante/venta web para LOTO y LOTO5, Multiplicador debugging mejorado, modelo OCR actualizado a llama-4-scout |
| 3.3 | 7 Feb 2026 | ctaCte formato unificado "5100011", Fecha Sorteo vs Fecha Control en historial, Premio Extra exclusión Art. 30°, Migraciones BD completas |
| 3.2 | 7 Feb 2026 | Ticket display con premio (no importe) en Brinco/Quini6, Premio Extra pool manual, cleanup display |
| 3.1 | 6 Feb 2026 | OCR Poceada/Tombolina, persistencia BRINCO/QUINI6 en BD, reportes 7 juegos |
| 3.0 | 5 Feb 2026 | BRINCO y QUINI 6 completos, historial extendido a 7 juegos, 8 tablas BD nuevas |
| 2.9 | 2 Feb 2026 | Loto Plus escrutinio corregido, todas apuestas en todas modalidades |
| 2.8 | 2 Feb 2026 | Juegos Offline (Hipicas/Turfito), vista Totalizado por Agencia |
| 2.7 | 2 Feb 2026 | Fix filtro programación, horas UTC, sincronización ramas git |
| 2.6 | 1 Feb 2026 | Segmentación triple recaudación, juegos en tabla maestra |
| 2.5 | 31 Ene 2026 | Fix dashboard SQL, HTML saneado, CSS responsive |
| 2.4 | 30 Ene 2026 | Tombolina CP completo, escrutinio profesional, OCR Groq Vision |
| 2.3 | 30 Ene 2026 | Poceada modal 4 pozos, extractos, validación programación |
| 2.2 | 30 Ene 2026 | Deploy Hostinger, producción MySQL, control posterior unificado |

---

**Versión del Documento**: 3.5  
**Última actualización**: 8 de Febrero, 2026

**Estado actual:**
- ✅ **Quiniela**: Control Previo + Escrutinio completo + Premios por agencia
- ✅ **Poceada**: Control Previo + Escrutinio + Modal 4 Pozos + OCR + Premios por agencia
- ✅ **Tombolina**: Control Previo + Escrutinio profesional + OCR
- ✅ **Loto (6/45 + PLUS)**: Control Previo + Escrutinio (5 modalidades) + Agenciero vacante/venta web + Multiplicador + Premios por agencia
- ✅ **Loto 5**: Control Previo + Escrutinio (3 niveles) + Agenciero vacante/venta web + Premios por agencia
- ✅ **BRINCO**: Control Previo + Escrutinio (Tradicional + Junior) + Persistencia BD + Premios por agencia
- ✅ **QUINI 6**: Control Previo + Escrutinio (5 modalidades) + Premio Extra + Persistencia BD + Premios por agencia
- ✅ **Hipicas (Turfito)**: Parser TXT + Facturación + Integrado en Reportes + Premios por agencia
- ✅ **OCR**: Multi-proveedor (Groq llama-4-scout → OpenAI GPT-4o) para todos los juegos
- ✅ **Reportes**: Dashboard con vista "Todos los juegos" acumulado por cta_cte, columnas condicionales, 7 juegos + Hipicas
- ✅ **Programación**: Carga Excel, filtro por mes, verificación de sorteo
- ✅ **Agencias**: Carga Excel, búsqueda, validación de amigas
- ✅ **Actas PDF**: Control previo, notarial, control posterior (todos los juegos)
- 📋 **Pendiente**: Telekino, Money Las Vegas (placeholders creados)
