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


## 📁 Estructura de Archivos

---

## 🗂️ Historial de Deploy y Control de Versiones

### 1 de Febrero 2026: Solución de despliegue automático (Hostinger/Vercel)

- Se detectó que el deploy automático estaba configurado para la rama `main` y no para `principal`.
- Se realizó la fusión de la rama `principal` en `main` usando:
  - `git checkout main`
  - `git merge principal`
  - `git push origin main`
- Esto permitió que los cambios recientes se reflejen en producción y se active el despliegue automático.
- Se recomienda mantener la rama `main` como rama principal para despliegues automáticos.

---

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

---

## 🆕 Actualizaciones Enero 2026 (Últimas)

### Extractos - Detección de Modalidad desde XML

**Problema resuelto:** Los archivos XML tenían nombres con una modalidad (ej: `QNL51P...` = Primera) pero el contenido XML decía otra modalidad (`<Modalidad>LA PREVIA</Modalidad>`).

**Solución implementada:**
1. El sistema ahora lee la modalidad del **contenido XML**, no del nombre del archivo
2. La función `extraerDatosXML()` extrae `<Modalidad>` del XML y la retorna junto con números y letras
3. Se prioriza la modalidad del contenido sobre la del nombre del archivo

**Mapeo de modalidades:**
| Código | Nombre XML | Nombre BD | Código Sorteo |
|--------|------------|-----------|---------------|
| R | LA PREVIA | Previa | PREV |
| P | LA PRIMERA | Primera | PRIM |
| M | MATUTINA | Matutina | MAT |
| V | VESPERTINA | Vespertina | VESP |
| N | NOCTURNA | Nocturna | NOCT |

**Archivos modificados:**
- `public/js/app.js`: `extraerDatosXML()`, `procesarArchivoXMLInteligente()`, `procesarMultiplesXML()`
- `src/modules/extractos/extractos.controller.js`: Búsqueda exacta de sorteo (sin LIKE)

### Validación contra Programación

**Nueva funcionalidad:** Antes de guardar un extracto, el sistema verifica que exista un sorteo programado para esa fecha + modalidad.

**Endpoint nuevo:**
```
GET /api/programacion/verificar?fecha=YYYY-MM-DD&modalidad=R&juego=Quiniela
```

**Respuesta si existe:**
```json
{
  "encontrado": true,
  "sorteo": {
    "numeroSorteo": "51957",
    "fecha": "2026-01-28",
    "modalidad_nombre": "LA PREVIA",
    "provincias": { "caba": 1, "bsas": 1, ... }
  }
}
```

**Respuesta si NO existe:**
```json
{
  "encontrado": false,
  "mensaje": "No hay sorteo de LA PREVIA programado para 2026-01-28",
  "modalidadesProgramadas": [
    { "codigo": "P", "nombre": "LA PRIMERA", "numeroSorteo": "51958" }
  ]
}
```

**Archivos modificados:**
- `src/modules/programacion/programacion.controller.js`: Nueva función `verificarSorteo()`
- `src/modules/programacion/programacion.routes.js`: Nueva ruta `/verificar`
- `public/js/api.js`: Nueva API `programacionAPI.verificarSorteo()`

### Breakdown de Tickets en Reportes

**Nueva funcionalidad:** Los reportes ahora muestran:
- **Tickets (Total)**: Incluye anulados
- **Tickets Válidos**: Total - Anulados
- **Anulados**: Tickets cancelados

**Implementado en:**
- Control Previo (HTML y PDF)
- Control Posterior (HTML y PDF)

**Archivos modificados:**
- `public/index.html`: Nuevas tarjetas de estadísticas
- `public/js/app.js`: `mostrarResultadosCP()`, `mostrarResultadosEscrutinio()`
- `src/modules/actas/actas.controller.js`: PDFs de Control Previo y Posterior

### Extractos Sorteados en Control Posterior

**Nueva funcionalidad:** Después del escrutinio, se muestran los 20 números y letras de cada provincia.

**Implementado en:**
- HTML: Nueva sección `#cpst-extractos-sorteados`
- PDF: Sección final con todos los extractos

**Estilos:**
- Cabeza (posición 1) resaltada en amarillo
- Letras en color warning
- Grid responsive de 10 columnas

### Tabla de Sorteos (Base de Datos)

Se agregó el sorteo **Previa** que faltaba:

```sql
INSERT INTO sorteos (juego_id, nombre, codigo) VALUES (1, 'Previa', 'PREV');
```

| id | nombre | codigo |
|----|--------|--------|
| 1 | Primera | PRIM |
| 2 | Matutina | MAT |
| 3 | Vespertina | VESP |
| 4 | Nocturna | NOCT |
| 11 | Previa | PREV |

### APIs del Frontend

**extractosAPI** (api.js):
```javascript
extractosAPI.listar(params)      // GET /api/extractos
extractosAPI.guardar(data)       // POST /api/extractos
extractosAPI.guardarBulk(arr)    // POST /api/extractos/bulk
extractosAPI.actualizar(id,data) // PUT /api/extractos/:id
extractosAPI.eliminar(id)        // DELETE /api/extractos/:id
```

**programacionAPI** (api.js) - NUEVO:
```javascript
programacionAPI.verificarSorteo(fecha, modalidad, juego)  // GET /api/programacion/verificar
programacionAPI.getSorteosPorFecha(fecha, juego)          // GET /api/programacion/fecha
programacionAPI.getSorteoPorNumero(numero, juego)         // GET /api/programacion/sorteo/:numero
```

---

---

## 🆕 Actualizaciones 30 de Enero 2026

### Deploy en Hostinger (Producción)

**Problema resuelto:** La aplicación no conectaba a la BD en producción. Hostinger no inyecta las variables de entorno al proceso Node.js, y los archivos `.env` se eliminan/ocultan al hacer redeploy.

**Solución implementada:**
- `src/config/database.js`: Se eliminó la guarda `NODE_ENV !== 'production'` que impedía cargar dotenv. Se agregaron credenciales hardcodeadas como fallback para producción Hostinger.
- `src/app.js`: Misma corrección de carga de dotenv.

**Notas sobre Hostinger:**
- Deploya desde branch `principal` (no `main`)
- Tarda 1+ hora en completar un redeploy
- El file manager muestra nombres en español (publico, origen, paquete.json)
- Los archivos dotfiles (`.env`) desaparecen al hacer redeploy

**Archivos modificados:**
- `src/config/database.js`
- `src/app.js`

### Tablas de Producción

Se crearon todas las tablas faltantes en la BD de producción (Hostinger):
- `control_previo_quiniela` (con total_tickets, total_apuestas, total_anulados)
- `control_previo_poceada` (con distribucion_premios JSON, pozos_arrastre JSON)
- `control_previo_tombolina` (con desglose apuestas 3-7 números)
- `escrutinio_quiniela`, `escrutinio_poceada`
- `escrutinio_premios_agencia`, `escrutinio_ganadores`
- `control_previo_agencias`
- `programacion_sorteos`, `programacion_cargas`
- `poceada_sorteos`

### Modal Pozos de Arrastre - Poceada (4 pozos)

**Problema:** Cuando no se encontraban datos de arrastre del sorteo anterior en la BD, la tabla de Comparación de Premios mostraba $0 en todos los arrastres. Solo existía un `prompt()` para corregir un único pozo.

**Solución implementada:**

#### Frontend (index.html)
- Nuevo **modal con 4 campos de entrada**: 1er Premio (8 aciertos), 2do Premio (7 aciertos), 3er Premio (6 aciertos), Premio Agenciero
- La sección "Pozos de Arrastre" ahora muestra **4 tarjetas** con los valores individuales
- Indicador de fuente de datos: BD (verde), manual (amarillo), sin datos (rojo con link)

#### Frontend (app.js) - Funciones nuevas
| Función | Descripción |
|---------|-------------|
| `abrirModalPozosArrastre()` | Abre el modal pre-cargando valores actuales |
| `cerrarModalPozosArrastre()` | Cierra el modal |
| `aplicarPozosArrastre()` | Aplica arrastres, recalcula distribución, guarda en BD |
| `actualizarDisplayPozosArrastre()` | Actualiza las 4 tarjetas visuales |
| `recalcularDistribucionConArrastres()` | Recalcula distribución de premios localmente (62%, 23.5%, 10%, etc.) |
| `actualizarComparacionPremiosConArrastres()` | Actualiza tabla Comparación de Premios en tiempo real |
| `verificarYMostrarModalArrastres()` | Se ejecuta al procesar Poceada. Si no hay datos, abre modal automáticamente tras 1.5s |

#### Backend (poceada.controller.js)
- Nuevo endpoint: `POST /api/control-previo/poceada/guardar-arrastres`
- Nueva función: `buscarTodosArrastresAnterior()` - retorna los 4 arrastres del sorteo anterior
- `procesarZip` ahora usa los 4 arrastres (antes solo usaba el del 1er premio)

#### Migración BD
Nuevas columnas en `poceada_sorteos`:
```sql
ALTER TABLE poceada_sorteos ADD COLUMN arrastre_segundo_premio DECIMAL(15,2) DEFAULT 0;
ALTER TABLE poceada_sorteos ADD COLUMN arrastre_tercer_premio DECIMAL(15,2) DEFAULT 0;
ALTER TABLE poceada_sorteos ADD COLUMN arrastre_agenciero DECIMAL(15,2) DEFAULT 0;
```

**Archivos modificados:**
- `public/index.html`: Modal HTML + sección 4 tarjetas pozos
- `public/js/app.js`: Funciones de modal, recálculo, display
- `src/modules/control-previo/poceada.controller.js`: `buscarTodosArrastresAnterior()`, `guardarArrastres`
- `src/modules/control-previo/control-previo.routes.js`: Ruta `/poceada/guardar-arrastres`
- `database/migration_pozos_arrastre.js`: Script de migración

### Tombolina - Control Previo con Desglose por Tipo de Apuesta

**Nueva funcionalidad:** Soporte completo para el juego Tombolina en Control Previo, con desglose de apuestas por cantidad de números jugados (3 a 7).

#### NTF Tombolina - Diseño de Registro

La parte genérica (200 chars) es idéntica a Poceada/Quiniela. La parte específica:

| Campo | Posición (1-based) | Índice | Length | Descripción |
|-------|-------------------|--------|--------|-------------|
| VERSION_ESPECIFICA | 201-202 | 200 | 2 | "01" versión 1 |
| LETRAS | 203-206 | 202 | 4 | Letras jugadas |
| APUESTAS_SIMPLES | 207-208 | 206 | 2 | Cantidad apuestas simples |
| CANTIDAD_NUMEROS | 215-216 | 214 | 2 | Números jugados (3-7) |
| SECUENCIA_NUMEROS | 211-224 | 210 | 14 | 7 números x 2 dígitos |

**Detección de anulación:** Igual que Poceada/Quiniela, por `FECHA_CANCELACION` (pos 71-78). Si no está en blanco, el registro está anulado.

**Valor de apuesta:** Pos 122-131, formato EEEEEEEEDD (8 enteros + 2 decimales), dividir por 100.

**Hash:** SHA-512 (igual que Poceada). Los archivos de hash son `.HASH` y `CP.HASH`.

#### Frontend (index.html)
- Nueva card "Desglose por Tipo de Apuesta" con tabla:
  - Apuesta a 7, 6, 5, 4, 3 números
  - Apuestas válidas, % del total (con barra de progreso visual), apuestas anuladas, total
  - Footer con totales generales

#### Frontend (app.js)
| Función | Descripción |
|---------|-------------|
| `renderTablasTombolina()` | Renderiza tabla de desglose con barras de progreso |
| `ocultarCardTombolina()` | Oculta card al cambiar de juego |

- Soporte para `comparacionXml` en formato array (Tombolina) vs objeto (Poceada)
- Detección automática de tipo de juego: Quiniela, Poceada, Tombolina

#### Backend (tombolina.controller.js) - Reescrito completo
- **Bug corregido:** El código XML se ejecutaba antes del `try` donde se definían variables, causando crash
- Usa NTF_GENERIC completo (idéntico a Poceada/Quiniela)
- Hash SHA-512 (era SHA-256, incompatible con archivos `.HASH` de LOTBA)
- Encoding `latin1` para TXT (era `utf8`, causaba diferencia en hash)
- Busca archivos `.HASH` y `CP.HASH` (antes buscaba `.SHA256`)
- Debug de primeros 5 registros para diagnosticar posiciones de campos
- Escaneo automático de posiciones candidatas si `CANTIDAD_NUMEROS` no se detecta en la posición principal
- Respuesta incluye `seguridad` completo para que el frontend muestre todos los checks

#### Tabla BD
```sql
CREATE TABLE control_previo_tombolina (
  id INT PRIMARY KEY AUTO_INCREMENT,
  fecha DATE NOT NULL,
  numero_sorteo INT NOT NULL,
  total_registros INT DEFAULT 0,
  total_tickets INT DEFAULT 0,
  total_apuestas INT DEFAULT 0,
  total_anulados INT DEFAULT 0,
  total_recaudacion DECIMAL(15,2) DEFAULT 0,
  apuestas_7_numeros INT DEFAULT 0,
  apuestas_6_numeros INT DEFAULT 0,
  apuestas_5_numeros INT DEFAULT 0,
  apuestas_4_numeros INT DEFAULT 0,
  apuestas_3_numeros INT DEFAULT 0,
  nombre_archivo_zip VARCHAR(255),
  hash_archivo VARCHAR(255),
  hash_verificado BOOLEAN DEFAULT FALSE,
  resumen_agencias JSON,
  datos_adicionales JSON,
  usuario_id INT,
  usuario_nombre VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**Archivos modificados:**
- `public/index.html`: Card desglose Tombolina
- `public/js/app.js`: `renderTablasTombolina()`, `ocultarCardTombolina()`, soporte comparacionXml
- `src/modules/control-previo/tombolina.controller.js`: Reescritura completa
- `src/modules/control-previo/control-previo.routes.js`: Ya tenía ruta `/tombolina/procesar`

---

**Última actualización**: 30 de Enero, 2026
**Estado**:
- ✅ Quiniela: Completo y Optimizado
- ✅ Poceada: Control Previo completo, Escrutinio completo, Modal 4 Pozos de Arrastre
- ✅ Tombolina: Control Previo y Escrutinio Profesional con premios variables y letras
- ✅ OCR Inteligente: Carga de extractos vía IA (Groq Vision) para todos los juegos
- ✅ Detección de modalidad desde contenido XML
- ✅ Validación contra programación
- ✅ Breakdown de tickets (Total/Válidos/Anulados)
- ✅ Extractos sorteados en reportes
- ✅ Deploy en Hostinger (producción) operativo
- 📋 Loto y otros juegos: Soporte inicial en Control Posterior (Detección y Selección)


---

## 🆕 Actualizaciones 31 de Enero 2026

### Estabilidad del Backend y Dashboard

**Corrección de Error SQL (Dashboard Stats):**
- **Problema**: Error `Unknown column 'created_at' in 'where clause'` al intentar cargar estadísticas para juegos genéricos (Quini 6, Loto, etc.) en el Dashboard.
- **Solución**: Se modificó `historial.controller.js` para eliminar la dependencia de la columna `created_at` en tablas que no la poseen. Se optimizó el conteo de `total_provincias_activas` realizando una consulta directa a `control_previo_agencias`, lo cual es más preciso.

### Mejoras de Interfaz (Frontend)

**Optimización de Rejilla de Estadísticas:**
- Se ajustó el valor `minmax` de la clase `.stats-grid` en `styles.css` de **180px a 150px**.
- Esto permite que los **8 indicadores** del Dashboard (incluyendo el nuevo "Agencias c/Venta") se distribuyan correctamente en pantallas estándar y realicen un salto de línea (wrapping) fluido en lugar de superponerse.

**Saneamiento de Código CSS:**
- Se eliminaron errores de sintaxis (llaves de cierre huérfanas y propiedades sin selector) en `styles.css` que impedían la carga correcta de estilos en secciones secundarias.

**Corrección Estructural HTML (Main Content):**
- **Problema**: Las secciones de **Reportes** y **Usuarios** aparecían desplazadas o el sistema mostraba una "pantalla negra" parcial debido a un error de anidamiento.
- **Solución**: Se identificó y eliminó un tag `</div>` extra en el módulo de Control Posterior que cerraba prematuramente el contenedor `<main class="main-content">`. Esto restauró la jerarquía visual y el correcto posicionamiento de todas las vistas SPA.

**Versión del Documento**: 2.5
**Última actualización**: 31 de Enero, 2026

### Control Posterior - Unificación y Polimorfismo (30 de Enero 2026 - Parte 2)

**Mejoras en la Interfaz de Selección:**
- Se implementó una **barra de selección de juegos horizontal** (flex-row con scroll) que permite acceder rápidamente a: Quiniela, Poceada, Tombolina, Quini 6, Brinco, Loto y Loto 5.
- Las tarjetas de juego ahora son más compactas y cuentan con iconos descriptivos para mejorar la densidad de información.

**Detección Automática de Juego:**
- Al cargar datos desde el módulo de **Control Previo**, el sistema detecta automáticamente el tipo de juego y ajusta la interfaz de Control Posterior de forma transparente.
- Se agregaron prefijos de detección automática para nuevos juegos: `Q6` (Quini 6), `BRC` (Brinco), `LOTO` (Loto), `L5` (Loto 5 Plus), `TMB` (Tombolina).

**Unificación de Carga de Extractos (Modo Lista):**
- Por solicitud del usuario, juegos como **Tombolina** ahora utilizan el formato de carga de "lista de números" (el mismo de Poceada) en lugar del grid de provincias de Quiniela, unificando la experiencia de carga de XMLs de loto.
- El sistema adapta dinámicamente el encabezado del panel de extractos según el juego seleccionado.

**Corrección Escrutinio Tombolina:**
- Se corrigió el error "No hay registros del TXT" mediante la implementación de la captura de registros individuales en `tombolina.controller.js`.
- Ahora el backend retorna la lista completa de apuestas (`registrosNTF`) con sus números jugados (secuencia de hasta 7 números) para que el escrutinio pueda operar correctamente.

**Gestión de Número de Sorteo Dinámico:**
- El sistema ahora prioriza el número de sorteo proveniente del **Dashboard/Programación** si el usuario navega directamente desde allí (vía `sessionStorage`).
- Si el usuario carga un archivo ZIP, el sistema toma el número de sorteo contenido en el archivo y actualiza la vista.
- Se normalizó el acceso a este campo en el frontend para soportar tanto objetos (Quiniela) como strings planos (Poceada/Tombolina) retornados por el API.

---

### Control Posterior - Tombolina y Poceada Profesional (30 de Enero 2026 - Parte 3)

**Escrutinio Profesional de Tombolina:**
- **Motor de Escrutinio**: Implementada la tabla de premios completa con multiplicadores variables (de 1x a 8000x) según la cantidad de números jugados (3 a 7) y aciertos obtenidos.
- **Premios por Letras**: Se añadió la lógica para otorgar un premio fijo de $1000 por coincidencia exacta de las 4 letras del extracto (solo si no hubo premio por números).
- **Estímulo Agenciero**: El sistema calcula y muestra ahora un 1% de estímulo para el agenciero sobre el total de premios pagados.
- **Balance Financiero**: Se incorporó el seguimiento de recaudación de apuestas anuladas para permitir un balance comercial exacto entre recaudación bruta y neta.

**Nuevos Reportes PDF (Actas de Escrutinio):**
- **Reporte Tombolina**: Rediseñado para incluir resumen ejecutivo con tarjetas de colores, tabla de comparación técnica con Control Previo, desglose detallado de premios por categoría y visualización clara del extracto sorteado.
- **Reporte Poceada**: Actualizado para incluir cajas de resumen (Ganadores, Premios, Recaudación y Tasa de Devolución) en el encabezado, alineando su estética con la de Quiniela.
- **Estándar Visual**: Todos los reportes de control posterior ahora incluyen la comparación "Control Previo vs Escrutinio" para auditoría de tickets, apuestas y montos.

**Interfaz de Usuario (Frontend):**
- **Tarjetas de Recaudación**: Se añadieron indicadores dinámicos para Recaudación Total, Válida y Anulada en el panel de resultados de Tombolina.
- **Listado de Ganadores**: Nueva tabla detallada ticket por ticket con información de agencia, tipo de apuesta, números jugados y monto ganado.
- **Exportación CSV**: Botón de descarga de listado de ganadores en formato compatible con Excel para facilitar la gestión administrativa.

**OCR de Extractos (Groq Vision):**
- **Extracción Inteligente**: Implementado módulo de OCR basado en IA (Groq Llama 3.2 Vision) que permite extraer números y letras de extractos desde capturas de pantalla, fotos o archivos PDF.
- **Flujo de Trabajo**: El sistema pre-procesa la imagen, consulta a la IA y carga automáticamente los resultados en la interfaz para su previsualización y guardado definitivo en la tabla de extractos.
- **Integración**: Los extractos cargados por OCR quedan inmediatamente disponibles para ser utilizados en el proceso de Control Posterior.
---

### Actualizaciones 31 de Enero y 1 de Febrero 2026 (Versión 2.6)

**Segmentación Detallada de Recaudación:**
- **Triple Discriminación**: Implementada la lógica para separar la recaudación en tres categorías críticas para la facturación:
    - **Venta Web**: Recaudación proveniente de la agencia **88880** (Cuenta Corriente).
    - **CABA Propia**: Recaudación de la provincia **51**, excluyendo la venta web.
    - **Provincias (Interior)**: Recaudación consolidada de todas las jurisdicciones fuera de CABA.
- **Base de Datos**: Se añadieron las columnas `recaudacion_caba`, `recaudacion_provincias` y `recaudacion_web` a las tablas `control_previo_quiniela`, `control_previo_poceada` y `control_previo_tombolina`.
- **Automatización**: Los controladores de Quiniela, Poceada y Tombolina ahora calculan estos valores automáticamente durante el procesamiento del archivo NTF v2.

**Actualización de Tabla de Juegos:**
- **Nuevos Juegos en Sistema**: Se agregaron formalmente **BRINCO** y **TOMBOLINA** a la tabla maestra `juegos`.
    - **Brinco**: Configuración nacional de 6 números (00-39).
    - **Tombolina**: Configuración local de 20 números con soporte para letras.
- **Configuración Dinámica**: Se definió el JSON de configuración para premios y rangos numéricos de cada juego para su uso en validaciones de frontend y backend.

**Estabilidad y Corrección de Errores:**
- **SQL Parameter Count**: Se corrigió el error `ER_WRONG_VALUE_COUNT_ON_ROW` en el helper de control previo, asegurando que el número de marcadores de posición (`?`) coincida exactamente con las nuevas columnas agregadas.
- **Robustez en Tombolina**: Mejora en el parseo de agencias para asegurar que el código de provincia siempre se concatene correctamente al número de agencia (formato de 8 dígitos).

---

## 🆕 Actualizaciones 2 de Febrero 2026 (Versión 2.7)

### Fix Filtro de Mes en Programación

**Problema:** Al filtrar programación por mes, "enero" mostraba enero + febrero, y "febrero" no mostraba nada.

**Causa raíz:** La variable `mesCarga` se calculaba como `meses[0]` (el primer mes ordenado del Excel) y se asignaba a TODOS los registros del archivo. Si el Excel contenía sorteos de enero y febrero, todos quedaban con `mes_carga = "2026-01"`.

**Solución (2 partes):**
1. **Importación**: Cada registro ahora calcula su propio `mes_carga` basado en su `fecha_sorteo` individual
2. **Filtro SQL**: Se cambió de `mes_carga = ?` a `fecha_sorteo >= ? AND fecha_sorteo < ?` (rango de fechas por mes)

**Intentos fallidos documentados:**
- `DATE_FORMAT(fecha_sorteo, '%Y-%m') = ?` → Error de collation (`utf8mb4_unicode_ci` vs `utf8mb4_general_ci`)
- `LEFT(fecha_sorteo, 7) = ? COLLATE utf8mb4_general_ci` → Error "COLLATION not valid for CHARACTER SET binary"
- `DATE_FORMAT` con comillas simples dentro de string JS → Error de sintaxis que crasheaba el servidor

**Archivos modificados:**
- `src/modules/programacion/programacion.controller.js`: Filtro por rango de fechas, mes_carga individual por registro

### Fix hora_sorteo en Programación (ExcelJS)

**Problema:** Las horas de sorteo se mostraban incorrectas (ej: 05:58 en vez de 10:15) por desfasaje de timezone.

**Causa raíz:** `value.toTimeString().split(' ')[0]` convierte usando timezone local (UTC-3 para Argentina).

**Solución:** Se cambió a `getUTCHours/Minutes/Seconds` para fechas y manejo de formato decimal de Excel.

**Archivos modificados:**
- `src/modules/programacion/programacion.controller.js`: Ambas funciones de carga de Excel

### Sincronización de Ramas Git (main ↔ principal)

**Problema:** Los commits iban a `main` pero Hostinger desplegaba desde `principal`.

**Solución:** Se estableció flujo de sincronización: commit en `main` → merge en `principal` → push ambas.

### Mejora en Reporte de Errores de Carga

**Problema:** Al cargar Excel en producción, decía "0 nuevos, 0 actualizados" con 250 registros procesados, sin mostrar errores.

**Causa raíz:** La función genérica `cargarProgramacionExcelGenerico` usa columnas `codigo_juego` y `tipo_juego` que no existían en la tabla de producción.

**Solución:**
- Se mejoró el conteo usando `result.affectedRows` (1 = nuevo, 2 = actualizado)
- Se agregó captura y reporte de errores en la respuesta (máximo 5 errores mostrados)
- Se debe ejecutar en producción:
```sql
ALTER TABLE programacion_sorteos
ADD COLUMN codigo_juego varchar(10) NULL AFTER juego,
ADD COLUMN tipo_juego varchar(50) NULL AFTER codigo_juego;
```

### Cache Busters Actualizados

Todos los assets actualizados a `v=20260202a`:
- `css/styles.css`
- `js/api.js`
- `js/ocr-extractos.js`
- `js/app.js`

**Archivos modificados:**
- `public/index.html`

---

## Actualizaciones 2 de Febrero 2026 - Parte 2 (Versión 2.8)

### Nuevo Módulo: Juegos Offline - Hipicas (Turfito)

**Descripción:** Sección completa para procesar archivos TXT de facturación de carreras de caballos (formato Turfito).

**Hipódromos soportados:**
| Código | Nombre | Abreviatura |
|--------|---------|-------------|
| 0099 | Palermo | HP |
| 0021 | La Plata | LP |
| 0020 | San Isidro | SI |

**Backend:**
- `src/modules/juegos-offline/hipicas.controller.js` - Parser TXT posicional (port de Python TurfitoLoader)
  - Campos: codigo_juego(0-4), provincia_agencia(4-11), reunion(19-22), fecha(22-30), ventas(30-42), cancelaciones(42-54), devoluciones(53-66), premios(64-78)
  - Agrupa por sorteo+agencia, acumula montos
  - UPSERT con ON DUPLICATE KEY UPDATE
- `src/modules/juegos-offline/juegos-offline.routes.js` - Rutas con multer (memory storage, 10MB, solo TXT)
- Registrado en `src/app.js` como `/api/juegos-offline`

**Endpoints:**
- `POST /api/juegos-offline/hipicas/procesar-txt` - Subir y procesar archivo TXT
- `GET /api/juegos-offline/hipicas/facturacion` - Consultar facturación con filtros (fecha, hipodromo, sorteo)
- `DELETE /api/juegos-offline/hipicas/facturacion/:id` - Eliminar registro

**Frontend:**
- Menú: Nuevo ítem "Juegos Offline" con icono `fa-horse-head` bajo sección "Facturación"
- Sección HTML: Selector de juego (Hipicas activo, Telekino/Money deshabilitados), upload drag&drop, stats grid, tabla resultados con footer totales, historial con filtros
- Funciones JS: `initJuegosOffline()`, `seleccionarJuegoOffline()`, `setupHipicasUpload()`, `procesarArchivoHipicas()`, `mostrarResultadosHipicas()`, `cargarHistorialHipicas()`, `eliminarRegistroHipicas()`, `exportarHipicasExcel()`
- API client: `juegosOfflineAPI.hipicas` en api.js

**Tabla BD: `facturacion_turfito`**
```sql
CREATE TABLE facturacion_turfito (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sorteo VARCHAR(50) NOT NULL,
  fecha_sorteo DATE NOT NULL,
  hipodromo_codigo VARCHAR(10) NOT NULL,
  hipodromo_nombre VARCHAR(50) NOT NULL,
  reunion VARCHAR(10),
  agency VARCHAR(20) NOT NULL,
  recaudacion_total DECIMAL(14,2) DEFAULT 0.00,
  importe_cancelaciones DECIMAL(14,2) DEFAULT 0.00,
  devoluciones DECIMAL(14,2) DEFAULT 0.00,
  total_premios DECIMAL(14,2) DEFAULT 0.00,
  archivo_origen VARCHAR(255),
  usuario_id INT,
  UNIQUE KEY uq_sorteo_agency (sorteo, agency),
  KEY idx_fecha (fecha_sorteo),
  KEY idx_hipodromo (hipodromo_codigo)
);
```

### Integración de Hipicas en Reportes Dashboard

**Problema:** Los datos de Hipicas no aparecían en los reportes y faltaban columnas de Cancelaciones/Devoluciones.

**Cambios en `historial.controller.js`:**
- `obtenerDatosDashboard()`: Agregado bloque hipicas en las 4 vistas (detallado, totalizado, agencias_venta, comparativo)
- `obtenerStatsDashboard()`: Suma recaudación, premios, cancelaciones y devoluciones de hipicas

**Cambios en frontend:**
- Agregado checkbox "HIPICAS" al selector de juegos del dashboard
- Vistas detallado y comparativo ahora muestran columnas Cancelaciones y Devoluciones
- Historial de Hipicas muestra todas las columnas: Fecha, Sorteo, Hipódromo, Agencia, Recaudación, Cancelaciones, Devoluciones, Premios
- Modalidad "H" = Hipicas en `getModalidadNombre()`

### Cache Busters Actualizados

Todos los assets actualizados a `v=20260202b`.

**Archivos modificados:**
- `public/index.html` - Menú, sección hipicas, historial con cancelaciones, checkbox reportes
- `public/js/app.js` - Funciones juegos offline + columnas cancelaciones en reportes
- `public/js/api.js` - API client juegosOfflineAPI
- `src/app.js` - Registro ruta juegos-offline
- `src/modules/juegos-offline/hipicas.controller.js` - NUEVO
- `src/modules/juegos-offline/juegos-offline.routes.js` - NUEVO
- `src/modules/historial/historial.controller.js` - Integración hipicas en dashboard

---

**Versión del Documento**: 2.8
**Última actualización**: 2 de Febrero, 2026
**Estado**:
- ✅ Quiniela: Completo y Optimizado
- ✅ Poceada: Control Previo completo, Escrutinio completo, Modal 4 Pozos de Arrastre
- ✅ Tombolina: Control Previo y Escrutinio Profesional
- ✅ Programación: Filtro por mes corregido, horas UTC, mes_carga individual
- ✅ Deploy: Sincronización main ↔ principal para Hostinger
- ✅ Juegos Offline - Hipicas: Parser TXT Turfito, facturación por agencia, integrado en reportes
- 📋 Pendiente: Telekino y Money Las Vegas (placeholder creado)
- 📋 Pendiente en producción: CREATE TABLE facturacion_turfito + ALTER TABLE programacion_sorteos
