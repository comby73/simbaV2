# 🚀 Instrucciones para Desplegar en Producción

## ✅ Cambios de Seguridad Implementados

Se eliminó el hardcodeo del `JWT_SECRET`. Ahora la aplicación **requiere obligatoriamente** que esta variable esté configurada en el archivo `.env`.

## 📋 Pasos para Configurar Producción

### 1. Generar un JWT_SECRET seguro

En tu servidor de producción, ejecutá este comando para generar un secreto aleatorio:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Este comando generará algo como:
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3h4i5j6k7l8m9n0o1p2q3r4s5t6u7v8w9x0y1z2
```

### 2. Crear el archivo .env en producción

En el servidor de producción, creá un archivo `.env` basado en `.env.example`:

```bash
cp .env.example .env
nano .env  # o usá el editor que prefieras
```

### 3. Configurar las variables de entorno

Editá el archivo `.env` y configurá los valores reales:

```env
# Aplicación
APP_NAME=Control de Loterías
APP_VERSION=2.0.0
NODE_ENV=production
PORT=3000

# Base de datos MySQL (configurar según tu servidor)
DB_HOST=localhost
DB_PORT=3306
DB_USER=tu_usuario_mysql
DB_PASSWORD=tu_password_mysql_seguro
DB_NAME=control_loterias

# JWT - Autenticación
# PEGAR ACÁ EL SECRETO GENERADO EN EL PASO 1
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3h4i5j6k7l8m9n0o1p2q3r4s5t6u7v8w9x0y1z2
JWT_EXPIRES_IN=24h
```

### 4. Verificar que .env NO esté en el repositorio

El archivo `.env` **NUNCA** debe subirse a Git. Verificá que esté en `.gitignore`:

```bash
cat .gitignore | grep .env
```

Deberías ver: `.env`

### 5. Iniciar la aplicación

```bash
npm start
```

Si `JWT_SECRET` no está configurado, la aplicación **se detendrá inmediatamente** con este error:

```
❌ FATAL: JWT_SECRET no está definido en las variables de entorno
   Por favor configurá JWT_SECRET en el archivo .env
```

## 🔒 Seguridad

### ✅ Qué se corrigió:
- ❌ **ANTES**: El JWT_SECRET estaba hardcodeado en el código fuente
- ✅ **AHORA**: El JWT_SECRET debe estar en `.env` (que está ignorado por Git)
- ✅ **AHORA**: La app no arranca si JWT_SECRET no está configurado

### 🔐 Buenas prácticas:
1. **NUNCA** compartas el contenido del archivo `.env`
2. Cada ambiente (local, staging, producción) debe tener su propio JWT_SECRET único
3. El JWT_SECRET de producción debe ser diferente al de desarrollo
4. Si creés que el secreto fue comprometido, generá uno nuevo inmediatamente

## 📝 Configuración Local (Desarrollo)

Para desarrollo local, copiá `.env.example` a `.env`:

```bash
cp .env.example .env
```

Y generá un secreto diferente al de producción:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Pegá ese secreto en tu `.env` local.

## ❓ Solución de Problemas

### Error: "JWT_SECRET no está definido"
- Verificá que el archivo `.env` existe en la raíz del proyecto
- Verificá que la variable `JWT_SECRET` está definida en `.env`
- Verificá que no haya espacios extra alrededor del `=`

### Los tokens no funcionan después del cambio
- Esto es normal. Al cambiar el JWT_SECRET, todos los tokens anteriores se invalidan
- Los usuarios deben hacer login nuevamente
- Esto es una medida de seguridad

## 🎯 Resumen

✅ Hardcodeo eliminado
✅ JWT_SECRET ahora es obligatorio en `.env`
✅ La app no arranca si falta JWT_SECRET
✅ `.env` está ignorado por Git
✅ `.env.example` sirve como plantilla

**¡Tu aplicación ahora es mucho más segura!** 🎉
