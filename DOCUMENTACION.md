# SIMBA V2 - Sistema de Control de Loterías

## 📋 Descripción General

Sistema web para el **control y análisis de sorteos de lotería**, diseñado para ser **polimórfico** (detecta automáticamente el tipo de juego). Actualmente implementado para **Quiniela** (completo y operativo) y **Poceada** (en planificación).

El sistema permite:

1. **Control Previo**: Análisis de archivos ZIP con datos de apuestas antes del sorteo.
2. **Actas Notariales**: Generación de documentos legales PDF para escribanos.
3. **Control Posterior**: Escrutinio detallado de ganadores comparando apuestas reales vs extractos sorteados.
4. **Gestión de Agencias**: Carga y validación de agencias desde archivos Excel.

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND                                │
│  HTML + CSS + JavaScript (Vanilla)                          │
│  Puerto: 3000 (servido por Express) o 80 (Apache proxy)     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      BACKEND                                 │
│  Node.js + Express.js                                       │
│  JWT Authentication                                          │
│  Roles: admin, operador, analista, auditor                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      DATABASE                                │
│  MySQL (control_loterias)                                   │
│  XAMPP localhost:3306                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Estructura de Archivos

```
simbaV2/
├── public/                     # Frontend
│   ├── index.html              # Página principal SPA
│   ├── css/
│   │   └── styles.css          # Estilos (tema oscuro + responsive)
│   └── js/
│       ├── app.js              # Lógica principal frontend (SPA)
│       └── api.js              # Cliente API
│
├── src/                        # Backend
│   ├── app.js                  # Express server principal
│   ├── config/
│   │   └── database.js         # Conexión MySQL
│   ├── shared/
│   │   ├── helpers.js          # Funciones utilitarias
│   │   └── middleware.js       # Auth middleware (RBAC)
│   └── modules/
│       ├── auth/               # Autenticación
│       ├── control-previo/     # Control Previo (NTF Parsing)
│       │   └── quiniela.controller.js
│       ├── actas/              # Generación PDFs (Actas)
│       ├── control-posterior/  # Escrutinio y Reportes Finales
│       │   └── quiniela-escrutinio.controller.js
│       └── agencias/           # Gestión de agencias
│           ├── agencias.controller.js
│           └── agencias.routes.js
│
├── database/
│   └── init.js                 # Script inicialización BD
│
├── package.json
└── DOCUMENTACION.md            # Este archivo
```

---

## 🔐 Sistema de Autenticación

### Roles y Permisos

| Rol | Descripción | Permisos |
|-----|-------------|----------|
| `admin` | Administrador | Acceso total al sistema |
| `operador` | Operador de sorteos | control_previo, actas |
| `analista` | Analista de datos | control_previo, control_posterior, reportes |
| `auditor` | Auditor externo | Solo lectura de resultados |

### Credenciales de Prueba
- **Usuario**: `admin`
- **Contraseña**: (consultar con el administrador del sistema)

---

## 📊 MÓDULO: Control Previo

### ¿Qué hace?
Procesa archivos ZIP mediante **Drag & Drop** o selección manual. El ZIP debe contener:
- **TXT (NTF v2)**: Archivo de apuestas en formato fijo (longitud 232+ para Quiniela).
- **XML**: Datos oficiales de la UTE para comparación.
- **HASH**: Verificación de integridad.
- **PDF**: Comprobante de seguridad firmado.

### Interpretación de NTF v2 (Quiniela)
- **Anulaciones**: Se detectan mediante el campo `FECHA_CANCELACION` (posiciones 71-78).
- **Desglose Provincial**: Se utiliza el campo `Loterías Jugadas` (posiciones 205-212, 8 dígitos). Cada dígito indica la cantidad de apuestas por provincia.
- **Modalidades**: Previa (R), Primera (P), Matutina (M), Vespertina (V), Nocturna (N), y sus variantes con "S" (AS, MS, VS, US, NS).
- **Registros**: Se cuentan solo los tickets únicos (ordinal '01' o vacío/'1'). Los anulados se cuentan por separado pero se incluyen en el total para comparación con Control Posterior.

### Validación de Agencias Amigas
- Solo la agencia **88880** (venta web) puede tener agencia amiga.
- Si el campo `AGENCIA_AMIGA` (posiciones 114-121) tiene valor distinto de '00000000' o espacios, se valida contra la tabla `agencias`.
- Si la agencia amiga no existe en la base de datos, se registra un error con:
  - Número de fila del TXT
  - Número de ticket (secuencia)
  - Número de agencia amiga detectada

### Estadísticas Mostradas
- **Registros Válidos**: Tickets únicos no anulados
- **Apuestas Totales**: Suma de todas las apuestas (puede ser mayor que registros si hay múltiples apuestas por ticket)
- **Recaudación Válida**: Suma de valores de apuestas válidas (sin decimales en display)
- **Registros Anulados**: Tickets cancelados
- **Recaudación Anulada**: Suma de valores de apuestas anuladas
- **Agencias Amigas**: 
  - Total detectadas
  - Válidas (registradas en BD)
  - Inválidas (no registradas, con detalle de errores)

---

## 🎯 MÓDULO: Control Posterior (Escrutinio) - QUINIELA

### Carga de Extractos (Automatizada)
El sistema prioriza la carga mediante **XML**. Al cargar múltiples archivos, el sistema:
1. Detecta la **modalidad** (R, P, M, V, N) desde los datos del Control Previo.
2. Filtra automáticamente los archivos XML que no corresponden a la modalidad del sorteo en curso.
3. Asigna cada extracto a su provincia correspondiente mediante la nomenclatura: `QNL<PROV><MOD><FECHA>.xml`
   - Ejemplo: `QNLCABAN20250116.xml` = CABA, Nocturna, 16/01/2025

### Lógica de Escrutinio (Fiel al sistema original Python)

#### Multiplicadores por Cifras
- **1 Cifra**: Multiplicador x7
- **2 Cifras**: Multiplicador x70
- **3 Cifras**: Multiplicador x600
- **4 Cifras**: Multiplicador x3500

#### Redoblona (Algoritmo VB6 replicado)
La Redoblona es un tipo de apuesta compleja que permite apostar a 2 números en diferentes posiciones. El algoritmo incluye:

1. **Extensión Efectiva**: Si se apuesta desde posición X hasta Y, se generan todas las combinaciones posibles.
2. **Corrimiento (Shifting)**: Si los números apostados no coinciden exactamente con los sorteados, se verifica si coinciden con un "corrimiento" (desplazamiento de posiciones).
3. **Números Iguales**: Manejo especial cuando ambos números apostados son iguales.
4. **Topes de Premio**:
   - **Tope 1a2**: Límite cuando se acierta el primer número en posición 1 y el segundo en posición 2.
   - **Tope 1a3**: Límite cuando se acierta el primer número en posición 1 y el segundo en posición 3.
   - **Tope General**: Límite máximo para cualquier combinación.
5. **Fórmula de Cálculo**: `REL_PAGO_2C * (Valor Apuesta / 2) * (1 + Extensión Efectiva)`

#### Letras
- Premio fijo de **$1,000** exclusivo para **CABA**.
- Solo se otorga si el ticket **NO resultó ganador por números**.
- Se compara la letra apostada con la letra sorteada en CABA.

### Reportes PDF (Mejoras Visuales Enero 2026)

El reporte final de Control Posterior ha sido optimizado para máxima claridad:

1. **Header**: Número de sorteo, modalidad detectada, fecha del sorteo.
2. **Resumen General**:
   - Registros (válidos + anulados)
   - Apuestas totales
   - Recaudación total
3. **Ganadores por Extracto**: Tabla mostrando:
   - Provincia
   - Cantidad de tickets ganadores
   - Total pagado en premios
   - Porcentaje del total
   - Premio promedio por ticket
4. **Detalle por Extracto**: Tabla detallada con:
   - Provincia
   - Para cada tipo de apuesta (1, 2, 3, 4 Cifras, Redoblona, Letras):
     - Cantidad de ganadores
     - Total pagado
   - Filas de totales por provincia
5. **Resumen por Tipo de Apuesta**: Totales generales por categoría.
6. **Extractos Sorteados**: Al final, se muestran los 20 números y letras de cada extracto utilizado.

**Características Visuales**:
- Líneas divisoras verticales y horizontales nítidas (color oscuro).
- Fondos alternantes para facilitar la lectura.
- Importes completos (ej: `$35,000`) sin abreviaturas.
- Fuente negrita y oscura para importes.
- Solo se muestran provincias con extracto cargado y ganadores/premios > 0.

---

## 🎲 MÓDULO: Poceada (EN PLANIFICACIÓN)

### ¿Qué es Poceada?

**Poceada** es un juego de lotería donde los jugadores seleccionan entre **2 y 20 números** (del 00 al 99) y deben acertar **8 números** del sorteo para ganar premios. A diferencia de Quiniela (que premia por cifras), Poceada premia por **cantidad de aciertos** (de 2 a 8 números).

### Formato de Archivos

#### Archivo TXT (NTF v2)
- **Patrón de nombre**: `PCDxxxxxx.TXT` o `TMBxxxxxx.TXT` (donde xxxxxx es el número de sorteo)
- **Formato**: Similar a Quiniela pero con campos específicos:
  - **Posición 207-208**: Cantidad de números jugados (2-20)
  - **Posición 102-128**: Valor de apuesta (27 caracteres)
  - **Cálculo de apuestas**: Se calcula como combinaciones C(n, 8) donde n es la cantidad de números jugados
    - Ejemplo: Si se juegan 10 números, hay C(10,8) = 45 apuestas posibles

#### Archivo XML
- **Patrón de nombre**: `PCDxxxxxxCP.XML` o `TMBxxxxxxCP.XML`
- **Estructura**:
```xml
<QUINIELA_POCEADA_DE_LA_CIUDAD>
  <SORTEO>xxxxxx</SORTEO>
  <FECHA_SORTEO>DD/MM/YYYY</FECHA_SORTEO>
  <REGISTROS_VALIDOS>xxxxx</REGISTROS_VALIDOS>
  <REGISTROS_ANULADOS>xxxxx</REGISTROS_ANULADOS>
  <APUESTAS_EN_SORTEO>xxxxx</APUESTAS_EN_SORTEO>
  <RECAUDACION_BRUTA>xxxxx.0</RECAUDACION_BRUTA>
  <IMPORTE_TOTAL_PREMIOS_A_DISTRIBUIR>xxxxx.0</IMPORTE_TOTAL_PREMIOS_A_DISTRIBUIR>
  <PRIMER_PREMIO>
    <MONTO>xxxxx.0</MONTO>
    <GANADORES>xxxxx</GANADORES>
  </PRIMER_PREMIO>
  <SEGUNDO_PREMIO>
    <MONTO>xxxxx.0</MONTO>
    <GANADORES>xxxxx</GANADORES>
  </SEGUNDO_PREMIO>
  <TERCER_PREMIO>
    <MONTO>xxxxx.0</MONTO>
    <GANADORES>xxxxx</GANADORES>
  </TERCER_PREMIO>
  <PREMIO_AGENCIERO>
    <MONTO>xxxxx.0</MONTO>
  </PREMIO_AGENCIERO>
  <FONDO_RESERVA>
    <MONTO>xxxxx.0</MONTO>
  </FONDO_RESERVA>
</QUINIELA_POCEADA_DE_LA_CIUDAD>
```

### Distribución de Premios

Según `poceadadistribucion.json`:
- **45%** de la recaudación se destina a premios
- **23.5%** al segundo premio (del 45%)
- **10%** al tercer premio (del 45%)
- **0.5%** al premio agenciero
- **4%** al fondo de reserva
- El resto (resto del 45%) va al primer premio

### Lógica de Escrutinio (A Implementar)

El escrutinio de Poceada debe:

1. **Cargar Extracto**: 20 números sorteados (del 00 al 99)
2. **Procesar Apuestas**: Para cada ticket válido:
   - Leer los números apostados (cantidad variable, 2-20 números)
   - Calcular todas las combinaciones C(n, 8) posibles
   - Para cada combinación de 8 números, verificar cuántos coinciden con los 20 sorteados
3. **Categorizar Aciertos**:
   - **8 aciertos**: Primer Premio
   - **7 aciertos**: Segundo Premio
   - **6 aciertos**: Tercer Premio
   - **2-5 aciertos**: No ganan premio (pero se pueden contar para estadísticas)
4. **Calcular Premios**:
   - Si hay ganadores, el premio se divide entre todos los ganadores de esa categoría
   - Si no hay ganadores, el premio queda "vacante" y se acumula al siguiente sorteo

### Archivos de Referencia (Sistema Legacy)

Los siguientes archivos del sistema anterior (`simba/public_html/`) contienen la lógica de referencia:

- **`src/UtilesPHP/Juego_Poceada/poceada.php`**: 
  - Procesamiento de archivos ZIP
  - Cálculo de combinaciones C(n, 8)
  - Lectura de XML y distribución de premios
  - **IMPORTANTE**: Este archivo NO hace escrutinio, solo procesa el Control Previo

- **`js/Poceada/poceada.js`**: 
  - Interfaz frontend del sistema legacy
  - Muestra resultados del Control Previo
  - Generación de gráficas

- **`js/Poceada/poceadadistribucion.json`**: 
  - Porcentajes de distribución de premios

### Sistema de Configuración Dinámica

A partir de Enero 2026, los porcentajes y configuraciones de juegos se cargan desde un archivo JSON centralizado en lugar de estar hardcodeados.

#### Archivo de Configuración

**Ubicación**: `src/config/distribucion-juegos.json`

**Estructura**:
```json
{
  "version": "2026-01",
  "vigencia": {
    "desde": "2026-01-01",
    "hasta": "2026-01-31"
  },
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
      "valorApuesta": { "simple": 1100 },
      "agenciaVentaWeb": "5188880"
    },
    "quiniela": { ... },
    "tombolina": { ... },
    "quinielaYa": { ... }
  }
}
```

#### Endpoints de Configuración

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/control-previo/config/distribucion` | Obtener configuración actual |
| POST | `/api/control-previo/config/recargar` | Recargar configuración desde archivo |

#### Actualización de Configuración

Cuando LOTBA emita una nueva programación mensual:

1. Actualizar el archivo `distribucion-juegos.json` con los nuevos valores
2. Llamar al endpoint `/api/control-previo/config/recargar` para aplicar cambios
3. El sistema mostrará la versión de configuración en uso en la interfaz

### Estado Actual de Implementación

#### ✅ 1. Control Previo (COMPLETADO)
- [x] Creado `src/modules/control-previo/poceada.controller.js`
- [x] Parser NTF v2 para Poceada implementado:
  - Detecta archivos `PCD*.TXT` o `TMB*.TXT`
  - Extrae cantidad de números jugados (posición 207-208 según PDF oficial)
  - Calcula apuestas = C(n, 8) para cada ticket usando tabla predefinida
  - Cuenta registros válidos/anulados (solo ordinal '01' o vacío)
  - Lee recaudación y premios del XML
- [x] Validación de estructura del XML
- [x] Comparación de datos TXT vs XML (registros, anulados, apuestas, recaudación)
- [x] Validación de archivos de seguridad (HASH TXT y HASH XML)
- [x] Mostrar resultados en frontend con tablas de provincias
- [x] Búsqueda de pozo de arrastre del sorteo anterior
- [x] Validación de agencias amigas (solo para agencia 88880 - venta web)
- [x] **NUEVO**: Sistema de configuración dinámica desde JSON
- [x] **NUEVO**: Detección de ventas web (agencia 5188880)
- [x] **NUEVO**: Comparación de premios calculados vs XML oficial
- [x] **NUEVO**: Frontend con tablas de comparación de premios y distribución calculada

**Notas importantes:**
- El parser usa las posiciones correctas según el PDF oficial "2-Diseño Apuestas.pdf"
- `VALOR_APUESTA` está en posición 122-131 (10 caracteres, formato EEEEEEEEDD)
- `CANTIDAD_NUMEROS` está en posición 207-208 (2 dígitos)
- `FECHA_CANCELACION` se valida como 8 espacios en blanco si no está cancelada
- Las combinaciones se calculan usando una tabla predefinida para optimizar rendimiento

#### 2. Control Posterior - Escrutinio (PRIORIDAD ALTA)
- [ ] Crear `src/modules/control-posterior/poceada-escrutinio.controller.js`
- [ ] Implementar carga de extracto:
  - Cargar 20 números sorteados (desde XML, imagen, PDF o manual)
  - Validar que sean números del 00 al 99
- [ ] Implementar algoritmo de escrutinio:
  - Para cada ticket válido del Control Previo:
    - Leer números apostados
    - Generar todas las combinaciones C(n, 8)
    - Para cada combinación, contar aciertos con los 20 sorteados
    - Categorizar: 8 aciertos (1er premio), 7 aciertos (2do premio), 6 aciertos (3er premio)
  - Agrupar ganadores por categoría
  - Calcular premio individual = Premio Total / Cantidad de Ganadores
- [ ] Generar reporte PDF:
  - Resumen de ganadores por categoría
  - Detalle de premios pagados
  - Comparación con valores del XML (Control Previo)

#### 3. Frontend (PRIORIDAD MEDIA)
- [ ] Agregar detección automática de tipo de juego en `app.js`:
  - Al cargar ZIP, detectar si es Quiniela (`QNL*.TXT`) o Poceada (`PCD*.TXT` / `TMB*.TXT`)
  - Mostrar módulo correspondiente
- [ ] Crear interfaz para Control Previo Poceada:
  - Mostrar registros, apuestas, recaudación
  - Mostrar distribución de premios (1er, 2do, 3er, agenciero, fondo)
  - Comparación con XML
- [ ] Crear interfaz para Control Posterior Poceada:
  - Carga de extracto (20 números)
  - Ejecutar escrutinio
  - Mostrar ganadores por categoría
  - Generar PDF

#### 4. Base de Datos (PRIORIDAD BAJA)
- [ ] Agregar campo `tipo_juego` a tabla `archivos` (si no existe)
- [ ] Agregar campo `tipo_juego` a tabla `extractos` (si no existe)
- [ ] Considerar tablas específicas para Poceada si es necesario

### Cómo Continuar el Desarrollo

#### Paso 1: Control Previo Poceada ✅ COMPLETADO
~~1. Copiar `src/modules/control-previo/quiniela.controller.js` como base~~ ✅
~~2. Modificar para detectar archivos `PCD*.TXT` o `TMB*.TXT`~~ ✅
~~3. Adaptar parser para leer cantidad de números jugados (posición 207-208)~~ ✅
~~4. Implementar función `combinations(n, r)` para calcular C(n, 8)~~ ✅
~~5. Leer valores de premios desde XML (similar a Quiniela)~~ ✅

**Estado:** El Control Previo de Poceada está completamente funcional. Puede procesar archivos ZIP, comparar datos TXT vs XML, y mostrar resultados en el frontend.
6. Crear ruta en `src/app.js`: `/api/control-previo/poceada/procesar-zip`

#### Paso 2: Control Posterior Poceada
1. Crear `src/modules/control-posterior/poceada-escrutinio.controller.js`
2. Implementar carga de extracto (20 números del 00 al 99)
3. Implementar algoritmo de escrutinio:
   ```javascript
   // Pseudocódigo
   for (cada ticket válido) {
     numerosApostados = leerNumeros(ticket);
     combinaciones = generarCombinaciones(numerosApostados, 8);
     for (cada combinacion in combinaciones) {
       aciertos = contarAciertos(combinacion, numerosSorteados);
       if (aciertos === 8) categoria = 'primerPremio';
       else if (aciertos === 7) categoria = 'segundoPremio';
       else if (aciertos === 6) categoria = 'tercerPremio';
     }
   }
   ```
4. Calcular premios individuales dividiendo el premio total entre ganadores
5. Generar reporte PDF similar a Quiniela pero adaptado a categorías de aciertos

#### Paso 3: Integración Frontend
1. Modificar `public/js/app.js` para detectar tipo de juego automáticamente
2. Agregar secciones en `public/index.html` para Poceada
3. Adaptar funciones de visualización para mostrar resultados de Poceada

---

## 🏢 MÓDULO: Agencias

### ¿Qué hace?
Permite gestionar la base de datos de agencias desde archivos Excel.

### Funcionalidades
1. **Carga de Excel**: Subir archivo Excel con datos de agencias
2. **Actualización Automática**: 
   - Si la agencia existe (por número), se actualiza
   - Si no existe, se inserta
3. **Validación**: Se valida que el Excel tenga las columnas correctas
4. **Visualización**: Tabla con todas las agencias activas

### Estructura de Tabla `agencias`
- `id`: INT PRIMARY KEY AUTO_INCREMENT
- `numero`: VARCHAR(8) UNIQUE (número de agencia, 8 dígitos)
- `nombre`: VARCHAR(255)
- `provincia`: VARCHAR(50)
- `activa`: BOOLEAN (default TRUE)
- `fecha_creacion`: TIMESTAMP
- `fecha_actualizacion`: TIMESTAMP

### Uso
1. Ir a la sección "Agencias" en el menú
2. Hacer clic en "Cargar Excel"
3. Seleccionar archivo Excel con columnas: `numero`, `nombre`, `provincia`, `activa`
4. El sistema procesa y actualiza/inserta registros
5. Ver resultados en la tabla

---

## 🔄 Flujo de Trabajo Actual (Quiniela)

1. **Control Previo**: 
   - Se sube el ZIP con TXT, XML, HASH, PDF
   - Se valida estructura y se procesan datos
   - Se muestran estadísticas (registros, apuestas, recaudación)
   - Se valida agencias amigas (si aplica)
   - Se genera el Acta Notarial (PDF)

2. **Control Posterior**: 
   - Se cargan los datos desde el Control Previo
   - Se suben los XML de extractos (el sistema los filtra y asigna automáticamente por modalidad)
   - Se ejecuta el escrutinio
   - Se verifica que Registros/Apuestas/Recaudación coincidan (incluyendo anulados)
   - Se genera el Reporte PDF final con:
     - Resumen general
     - Ganadores por extracto
     - Detalle por extracto y tipo de apuesta
     - Extractos sorteados (20 números + letras)

---

## 🛠️ Configuración del Servidor

### Node.js
- **Puerto**: 3000
- **Comando de inicio**: `npm run dev` (desde `simbaV2/`)
- **Variables de entorno**: Verificar `package.json` para scripts

### Apache (Opcional - Proxy)
- **Puerto**: 80
- **Configuración**: 
  - `mod_proxy_http` debe estar habilitado
  - VirtualHost configurado en `httpd-vhosts.conf` para proxy a `http://localhost:3000`
  - `.htaccess` en `public/` con reglas de rewrite

### MySQL
- **Puerto**: 3306 (XAMPP default)
- **Base de datos**: `control_loterias`
- **Inicialización**: Ejecutar `npm run db:init` (crea tablas si no existen)

---

## 📝 Notas de Desarrollo

### Detección Polimórfica de Juegos
El sistema está diseñado para detectar automáticamente el tipo de juego:
- **Quiniela**: Archivos `QNL*.TXT`
- **Poceada**: Archivos `PCD*.TXT` o `TMB*.TXT`
- **Loto**: (Futuro) Archivos `LOT*.TXT`

### Formato NTF v2
El formato NTF v2 es un formato de longitud fija donde cada campo tiene posiciones específicas. Ver código fuente para detalles de posiciones.

### Validaciones Importantes
- **Registros**: Solo se cuentan tickets únicos (ordinal '01')
- **Anulados**: Se cuentan por separado pero se incluyen en totales para comparación
- **Agencias Amigas**: Solo válidas para agencia 88880 (venta web)
- **Modalidades**: El sistema filtra XMLs automáticamente por modalidad detectada

---

## 🔮 Próximos Pasos (Roadmap)

### Corto Plazo
- [x] Optimización de reportes PDF (Quiniela)
- [x] Validación de agencias amigas
- [x] Gestión de agencias desde Excel
- [ ] Implementación Control Previo Poceada
- [ ] Implementación Control Posterior Poceada (Escrutinio)

### Mediano Plazo
- [ ] Guardado histórico de resultados de escrutinio en base de datos
- [ ] Dashboard interactivo con gráficos de premios vs recaudación
- [ ] Módulo de auditoría de cambios (Logs)
- [ ] Exportación de resultados a Excel/CSV

### Largo Plazo
- [ ] Implementación de otros juegos (Loto, Telekino, etc.)
- [ ] API pública para consultas
- [ ] Sistema de notificaciones
- [ ] Aplicación móvil

---

## 📚 Referencias

### Archivos Legacy (Sistema Anterior)
Los siguientes archivos en `simba/public_html/` contienen lógica de referencia:

**Quiniela**:
- `src/UtilesPHP/Juego_Quiniela/quiniela.php`: Lógica de procesamiento
- `js/Quiniela/quiniela.js`: Frontend legacy
- `python/analyzers/quiniela_analyzer.py`: Lógica de escrutinio (replicada en Node.js)

**Poceada**:
- `src/UtilesPHP/Juego_Poceada/poceada.php`: Control Previo (NO escrutinio)
- `js/Poceada/poceada.js`: Frontend legacy
- `js/Poceada/poceadadistribucion.json`: Distribución de premios

**Loto**:
- `src/UtilesPHP/Juego_Loto/Loto.php`: Lógica de referencia
- `js/Loto/lotodistribucion.json`: Distribución de premios

---

## 🐛 Troubleshooting

### Error: `ERR_CONNECTION_REFUSED`
- **Causa**: Node.js no está corriendo
- **Solución**: Ejecutar `npm run dev` desde `simbaV2/`

### Error: `404 Not Found` en `/api/*`
- **Causa**: Apache no está configurado como proxy o Node.js no está en puerto 3000
- **Solución**: 
  1. Verificar que Node.js esté corriendo en puerto 3000
  2. Verificar configuración de Apache (mod_proxy_http habilitado)
  3. O acceder directamente a `http://localhost:3000`

### Error: `Cannot read properties of undefined`
- **Causa**: Datos faltantes en respuesta del backend
- **Solución**: Verificar logs del servidor Node.js y estructura de datos esperada

### Error: `Duplicate key name 'idx_*'`
- **Causa**: Índices ya existen en la base de datos
- **Solución**: Ejecutar manualmente solo las sentencias CREATE TABLE que falten

---

**Última actualización**: 17 de Enero, 2026  
**Estado**: 
- ✅ Quiniela: Completo y Optimizado
- 🚧 Poceada: En Planificación (Control Previo y Escrutinio pendientes)
- 📋 Loto y otros juegos: Futuro

**Versión del Documento**: 2.0
