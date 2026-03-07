# SIMBA V2 - Documentación Técnica y Operativa

**Última actualización:** 03/03/2026  
**Repositorio:** simbaV2 (`main`)  
**Versión de referencia:** `APP_VERSION` expuesta por `/api/version`

---

## 1) Qué es SIMBA V2

SIMBA V2 es un sistema web para **control previo**, **control posterior (escrutinio)**, **gestión de extractos**, **actas**, **historial** y **reportes operativos** de juegos de lotería.

Está orientado a operación diaria de sorteos y auditoría posterior, con trazabilidad por usuario y separación por permisos.

---

## 2) Juegos soportados

- Quiniela
- Poceada
- Tombolina
- Loto
- Loto 5
- Brinco
- Quini 6
- Quiniela Ya (en flujo de control posterior)
- Juegos offline (Hipicas/Turfito; estructura preparada para otros)

---

## 3) Arquitectura actual

### Backend
- Node.js + Express
- Punto de entrada: `src/app.js` (con `app.js` raíz como puente)
- API REST bajo `/api/*`
- Seguridad: `helmet`, `cors`, JWT, control por rol y por permiso

### Frontend
- SPA en Vanilla JS
- `public/index.html` + `public/js/app.js` (lógica principal)
- Cliente HTTP centralizado en `public/js/api.js`
- OCR con configuración en `public/js/config.js` y claves locales en `config.local.js`

### Base de datos
- MySQL (XAMPP local y entorno productivo)
- Inicialización base en `database/init.js`
- Evolución por scripts `database/migration_*.js`

### Almacenamiento de archivos
- `uploads/ntf`: insumos de control previo
- `uploads/extractos`: extractos y archivos asociados
- `uploads/temp`: staging de cargas

---

## 4) Estructura funcional (estado real)

### 4.0 Modulo en diseno: Scoring Regenerativo de Agencias

- Se incorporo el blueprint tecnico-funcional del modulo de negocio:
  - Documento: `SCORING_REGENERATIVO.md`
- Objetivo:
  - convertir recaudacion por agencia/juego en un scoring accionable y explicable
- Estado:
  - diseno listo para implementacion integrada (backend + frontend + configuracion)
- Principio de negocio:
  - la venta es un eje del desempeno, no un castigo; el enfoque es regenerativo y de mejora

### 4.1 Módulos backend registrados en `src/app.js`

- `/api/auth` → login, verify, profile, cambio de contraseña
- `/api/users` → usuarios y roles
- `/api/control-previo` → procesamiento de ZIP/NTF por juego + guardado
- `/api/control-posterior` → escrutinio por juego + exportaciones puntuales
- `/api/actas` → generación de actas PDF
- `/api/agencias` → consulta y carga desde Excel
- `/api/programacion` → carga/consulta de programación de sorteos
- `/api/historial` → dashboard, búsquedas, listados y detalle CP/CPST
- `/api/extractos` → CRUD de extractos y carga masiva
- `/api/juegos-offline` → facturación/ventas de Hipicas
- `/api/ocr` → proxy de OCR del lado servidor

### 4.2 Frontend

`public/js/app.js` gobierna:
- login y sesión,
- navegación de vistas,
- control previo,
- control posterior,
- extractos,
- programación,
- historial/dashboard,
- actas y juegos offline.

`public/js/api.js` detecta entorno y resuelve `API_BASE` automáticamente (archivo/local/apache/producción).

---

## 5) Seguridad y permisos

### Autenticación
- JWT Bearer en header `Authorization`
- Middleware principal: `authenticate`

### Autorización
- `authorize(...)` por roles
- `requirePermission(...)` por permiso granular
- `isAdmin` para operaciones críticas

### Roles de uso
- `admin`
- `operador`
- `analista`
- `auditor`

### Auditoría
- Registro de acciones en tabla `auditoria` vía `registrarAuditoria(...)`

---

## 6) Flujo operativo recomendado

1. **Programación**: cargar programación de sorteos (`/api/programacion/cargar/generico`)
2. **Control Previo**: subir ZIP por juego y guardar resultados
3. **Extractos**: cargar resultados (manual/XML/OCR)
4. **Control Posterior**: ejecutar escrutinio contra CP + extractos
5. **Actas / Reportes**: generar documentación operativa
6. **Historial**: validar consolidación, recaudación y ganadores

---

## 7) Reglas críticas de negocio

### 7.1 NTF de longitud fija
- Las posiciones documentales suelen venir 1-based.
- En código se parsea 0-based (`substr(start, length)`).
- Referencia de helpers/controllers: módulo `control-previo`.

### 7.2 Segmentación de recaudación
- Venta Web (agencia `5188880`)
- CABA
- Provincias

### 7.3 Provincias
- Mapeo central en `src/shared/helpers.js` (`PROVINCIAS`)
- Validar provincia/código antes de persistir extractos y resultados

### 7.4 Fechas y zona horaria
- Estandarización con `dayjs` + TZ `America/Argentina/Buenos_Aires`

### 7.5 Persistencia por clave lógica
- Se consolidó deduplicación por juego/sorteo/modalidad según corresponda
- En historial y escrutinio se prioriza consistencia de `numero_sorteo`

### 7.6 Formato de cuenta corriente (`cta_cte`)
- Formato operativo esperado: `51XXXXX` (7 dígitos, sin guiones).
- Se normaliza quitando separadores para mantener consistencia entre reportes y cruces.
- Referencia de migración puntual: `database/migration_normalizar_ctacte.js`.

---

## 8) OCR de extractos (estado actual)

### Proveedores configurados
Orden de fallback definido en frontend:
1. GROQ
2. OPENAI
3. (Mistral deshabilitado por límites)

### Operación
- OCR en cliente para UX + proxy servidor `/api/ocr/procesar-imagen`
- Se reforzó lectura de PDFs con fallback, normalización y filtros de ruido
- Mejoras recientes en detección de provincia y tratamiento de lotes

### Recomendación
- Mantener claves en `public/js/config.local.js` (no versionar)
- Validar salida contra programación/sorteo antes de guardar

---

## 9) Base de datos y scripts

### Scripts npm
```bash
npm start
npm run dev
npm run db:init
npm run db:seed
```

### Scripts de base (carpeta `database/`)
- `init.js` → esquema base
- `seed.js` y seeds auxiliares
- `migration_*.js` → ajustes incrementales (agencias, juegos, control, historial, etc.)

### Recomendación de operación
- Ejecutar primero `db:init` en entorno nuevo
- Aplicar migraciones pendientes según el módulo desplegado
- Ejecutar seeds solo en ambientes de prueba o bootstrap controlado

---

## 10) Configuración de entorno

### Archivo base
- `config.env.txt` (plantilla)
- En local usar `.env.local` (prioridad en carga)
- En producción usar variables del entorno del hosting

### Variables mínimas
- `NODE_ENV`, `PORT`
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `JWT_SECRET`, `JWT_EXPIRES_IN`

### Nota de seguridad
- Si en algún entorno se expusieron API keys o secretos históricos, rotarlos.

---

## 11) Endpoints útiles de diagnóstico

- `GET /health` → estado general + conexión DB
- `GET /api/health` → estado de API
- `GET /api/version` → versión visible en frontend

---

## 12) Historial de cambios consolidados (2026)

### Enero 2026
- Ajustes iniciales de dashboard, layout y despliegue
- Fortalecimiento de OCR para extractos e integración en flujo operativo

### Febrero 2026
- Normalización de metadata (`numero_sorteo`, `fecha`, modalidad)
- Correcciones en control posterior y reportes de recaudación
- Deduplicación y consistencia en historial/escrutinios
- Ajustes de OCR PDF, fallback y parsing
- Correcciones de extractos por provincia/validación de lotes

### Marzo 2026 (inicio)
- Cache-buster y ajustes de modal/corrección de orden Quiniela
- Consolidación de unicidad extractos por juego+sorteo+provincia
- Mejoras incrementales en OCR y sincronización de datos históricos

### Marzo 2026 (03/03)
- Se agregó indicador visual de tiempo de proceso en frontend (Control Previo y cargas de extractos).
- Se incorporó acción de “volver a empezar” en Control Previo para reiniciar estado sin recargar.
- Se reforzó resolución de fecha de sorteo con fallback `programacion_sorteos.tipo_juego` / `programacion_sorteos.juego`.
- Se documentó normalización de `cta_cte` a 7 dígitos sin guiones en scripts de migración.

### Marzo 2026 (06/03)
- Se definio el diseno funcional y tecnico del modulo `Modelo Regenerativo de Scoring de Agencias`.
- Se agrego documento de referencia `SCORING_REGENERATIVO.md` con:
  - arquitectura integrada al stack actual,
  - modelo de datos,
  - formulas de scoring,
  - flujo UX y pantallas,
  - adaptador a recaudacion real,
  - estrategia de salida a produccion.

### Marzo 2026 (07/03)
- Se valido el modelo de scoring contra los insumos reales cargados en raiz:
  - `Informe_Modelo_Regenerativo_Scoring_POP_LOTBA_RTM.docx`
  - `Modelo_Regenerativo_Scoring_POP_LOTBA_RTM.xlsm`
- Se actualizo `SCORING_REGENERATIVO.md` con:
  - estructura real de hojas,
  - mapeo de parametros (`PARAMS_MODELO`) y formulas por columna (`CALCULOS_AGENCIA`),
  - criterio de categoria con percentiles + umbrales historicos,
  - especificacion de acceso restringido fase 1 para `admin` y `ogonzalez`.

---

## 13) Checklist de deploy

1. Confirmar rama y commit desplegado
2. Verificar variables de entorno de BD y JWT
3. Probar `GET /health` y `GET /api/version`
4. Hacer recarga forzada del frontend (cache)
5. Ejecutar prueba mínima: Programación → CP → Extracto → CPST → Historial
6. Revisar duplicados por sorteo/modalidad/provincia en historial

### 13.1 Flujo exacto de commit y push (Git)

Usar este flujo en PowerShell para dejar trazabilidad clara y evitar subir cambios incompletos.

```bash
# 0) Ir a la carpeta del repo
cd c:/xampp/htdocs/simbaV2

# 1) Verificar rama activa y cambios
git branch --show-current
git status

# 2) Actualizar rama local antes de commitear
git pull --rebase origin main

# 3) Agregar SOLO los archivos que se quieren subir
git add DOCUMENTACION.md prompt.md

# 4) Confirmar qué quedó staged
git status

# 5) Crear commit con mensaje claro
git commit -m "docs: actualizar documentación operativa y bitácora 03-03-2026"

# 6) Subir a remoto
git push origin main
```

Si es la primera vez que se publica una rama local:

```bash
git push -u origin main
```

Buenas prácticas mínimas:
- No usar `git add .` si hay cambios no relacionados.
- Hacer un commit por tema (ejemplo: solo documentación, o solo backend).
- Si `git pull --rebase` trae conflictos, resolverlos, luego ejecutar `git add <archivo>` y `git rebase --continue`.
- Antes de `push`, revisar que el `git status` no tenga archivos inesperados en staged.

---

## 14) Observaciones para mantenimiento

- `public/js/app.js` es extenso y concentra mucha lógica; priorizar cambios quirúrgicos.
- Mantener consistencia entre frontend y backend para nombres de juego/modalidad.
- Evitar mezcla de formatos de cuenta corriente (`51-00011` vs `5100011`); sostener un único formato en BD y reportes.
- En cambios de reglas de premio, actualizar:
  - controller del juego,
  - persistencia de escrutinio,
  - reportes PDF/CSV,
  - historial y dashboard.

---

## 15) Anexo rápido de comandos operativos

```bash
# Desarrollo
npm install
npm run dev

# Producción simple
npm start

# Inicializar BD
npm run db:init
npm run db:seed
```

Si se opera con Apache/XAMPP, validar que el frontend resuelva correctamente `API_BASE` hacia `/simbaV2/public/api` cuando corresponda.
