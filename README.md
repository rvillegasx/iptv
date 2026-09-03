# IPTV Backend & OCR Management

Este backend en Node.js (Express) permite consolidar y gestionar la información de usuarios de dos plataformas distintas de IPTV (FLIX y FUTVRE) que no disponen de API.

La alimentación del sistema se realiza mediante **capturas de pantalla de los paneles de administración**, las cuales son procesadas utilizando **Google Gemini API** (procesamiento OCR estructurado multimodal) para evitar duplicados mediante operaciones **Upsert** en la base de datos MySQL compartida.

---

## 1. Requisitos Previos

*   **Node.js** (Versión `>= 18.0.0`)
*   **Docker & Docker Compose** (Para levantar MySQL en desarrollo local)
*   **Google Gemini API Key** (Obtenible de forma gratuita en [Google AI Studio](https://aistudio.google.com/))
*   **VPS con Dokploy** (Para despliegue en producción)

---

## 2. Estructura del Proyecto

```text
├── docs/                      # Capturas de pantalla de muestra de ambos paneles
├── flix-chrome-extension/     # Extensión de Chrome para extracción y sincronización directa de paneles FLIX/FUTVRE
├── src/
│   ├── config/
│   │   ├── db.js              # Pool de conexiones a MySQL e inicialización de tablas
│   │   └── gemini.js          # Inicialización del SDK oficial de GoogleGenAI
│   ├── controllers/
│   │   └── userController.js  # Lógica del CRUD, estadísticas y procesamiento de imágenes
│   ├── routes/
│   │   └── userRoutes.js      # Enrutador Express y middleware de autenticación (API Key)
│   ├── services/
│   │   └── ocrService.js      # Prompt y configuración del OCR de Gemini con Structured Outputs
│   └── app.js                 # Servidor Express de punto de entrada principal
├── Dockerfile                 # Configuración de Docker optimizada para producción (Dokploy)
├── docker-compose.yml         # MySQL preconfigurado para desarrollo local
├── package.json               # Dependencias del proyecto (ESM "type": "module")
├── .env.example               # Plantilla de variables de entorno
└── README.md                  # Este documento
```

---

## 3. Configuración del Entorno de Desarrollo Local

Sigue estos pasos para arrancar el proyecto localmente en tu máquina:

1.  **Instalar dependencias del proyecto:**
    ```bash
    npm install
    ```

2.  **Configurar variables de entorno:**
    Copia el archivo de ejemplo a tu archivo de configuración:
    ```bash
    cp .env.example .env
    ```
    Abre `.env` y coloca tu **API Key de Gemini** en `GEMINI_API_KEY`, así como tu clave secreta de comunicación en `API_KEY` (por ejemplo, `mi-super-token-secreto`).

3.  **Iniciar base de datos de desarrollo (MySQL):**
    Mediante Docker Compose levantamos una base de datos local preconfigurada:
    ```bash
    docker compose up -d
    ```

4.  **Ejecutar el backend en modo desarrollo:**
    ```bash
    npm run dev
    ```
    El servidor se iniciará en `http://localhost:3000`. Al arrancar, verificará e inicializará automáticamente la tabla `iptv_users` en tu base de datos local.

---

## 4. API REST Endpoints

> [!IMPORTANT]
> Todas las peticiones a la API (excepto `/health`) requieren la cabecera de autenticación:
> **`X-API-Key: <tu_api_key_de_env>`**

### A. Procesamiento de Capturas (OCR) - Para FLIX
*   **Ruta:** `POST /api/upload-screenshot`
*   **Body (Form-Data):**
    *   `platform`: `'FLIX'` (Valor obligatorio).
    *   `screenshots`: Uno o varios archivos de imagen (Formatos: `.png`, `.jpg`, `.jpeg`).
*   **Ejemplo de Respuesta:**
    ```json
    {
      "message": "Procesamiento de capturas completado.",
      "stats": {
        "totalImages": 1,
        "processedUsers": 24,
        "insertedCount": 2,
        "updatedCount": 22,
        "errors": []
      }
    }
    ```

### B. Carga de Archivo CSV - Para FUTVRE
*   **Ruta:** `POST /api/upload-csv`
*   **Body (Form-Data):**
    *   `csv`: Archivo CSV exportado directamente de FutureTV (ej: `.csv`).
*   **Ejemplo de Respuesta:**
    ```json
    {
      "message": "Procesamiento de CSV completado.",
      "stats": {
        "totalRecords": 41,
        "insertedCount": 5,
        "updatedCount": 36,
        "errors": []
      }
    }
    ```


### C. Listar y Buscar Usuarios
*   **Ruta:** `GET /api/users`
*   **Query Params (Opcionales):**
    *   `platform`: `'FLIX'` o `'FUTVRE'`
    *   `search`: Palabra clave para buscar por usuario, nombre, serie (MAC), teléfono o notas.
    *   `phone`: Filtra usuarios que coincidan con un número telefónico (búsqueda inteligente flexible).
    *   `status`: Filtra por estado de expiración o tipo:
        *   `active`: No vencidos y no bloqueados.
        *   `expired`: Vencidos.
        *   `expiring_today` o `today`: Vencen o vencieron en el transcurso del día de hoy (incluye demos de horas).
        *   `expiring_soon`: Vencerán dentro de los próximos 7 días.
        *   `trials` o `demo`: Cuentas demo/prueba.
        *   `banned`: Bloqueados.
    *   `is_trial`: `true` o `false` para filtrar específicamente demos en combinación con otros filtros.
    *   `limit`: Cantidad de registros a devolver (por defecto 20).
    *   `offset`: Salto de paginación (por defecto 0).

### D. Consultar si un Teléfono Existe (Lookup de Cliente / WhatsApp / Bots)
*   **Ruta:** `GET /api/users/by-phone/:phone`
*   **Ejemplo:** `GET /api/users/by-phone/+525512345678` o `GET /api/users/by-phone/5512345678`
*   **Ejemplo de Respuesta (Cliente Encontrado):**
    ```json
    {
      "exists": true,
      "is_client": true,
      "phone_number": "+525512345678",
      "total_accounts": 1,
      "accounts": [
        {
          "id": 45,
          "platform": "FUTVRE",
          "username": "albertoLopez",
          "name": "Alberto López",
          "email": null,
          "phone_number": "+525512345678",
          "mac_address": null,
          "expiration_date": "2026-08-31 23:59:59",
          "is_trial": false,
          "is_banned": false,
          "package_name": "1 Mes",
          "active_connections": 0,
          "max_connections": 1,
          "notes": null,
          "status": "active"
        }
      ]
    }
    ```
*   **Ejemplo de Respuesta (No Encontrado):**
    ```json
    {
      "exists": false,
      "is_client": false,
      "phone_number": "+525512345678",
      "total_accounts": 0,
      "accounts": []
    }
    ```

### E. Vincular Teléfono por Plataforma y Username (Desde otra App)
*   **Ruta:** `POST /api/users/link-phone`
*   **Body (JSON):**
    ```json
    {
      "platform": "FUTVRE",
      "username": "albertoLopez",
      "phone_number": "+525512345678"
    }
    ```
*   **Respuesta Exitosa (HTTP 200):**
    ```json
    {
      "message": "Teléfono vinculado exitosamente al usuario",
      "user": {
        "id": 45,
        "platform": "FUTVRE",
        "username": "albertoLopez",
        "name": "Alberto López",
        "phone_number": "+525512345678",
        "expiration_date": "2026-08-31 23:59:59",
        "is_trial": false
      }
    }
    ```

### F. Actualizar Teléfono por ID
*   **Ruta:** `PATCH /api/users/:id/phone`
*   **Body (JSON):**
    ```json
    {
      "phone_number": "+525512345678"
    }
    ```

### G. Obtener Detalle de Usuario
*   **Ruta:** `GET /api/users/:id`

### H. Actualizar/Corregir Usuario Completo
*   **Ruta:** `PUT /api/users/:id`
*   **Body (JSON):** Admite cualquier propiedad a modificar (nombre, correo, teléfono `phone_number`, fecha de expiración, notas, etc.).

### I. Eliminar Usuario
*   **Ruta:** `DELETE /api/users/:id`

### J. Purgar Cuentas Demo/Prueba
*   **Ruta:** `POST /api/users/cleanup-trials` o `DELETE /api/users/cleanup-trials`
*   **Ejemplo de Respuesta:**
    ```json
    {
      "message": "Limpieza de cuentas demo/prueba completada con éxito.",
      "deletedCount": 42
    }
    ```

### K. Estadísticas Consolidadas (Dashboard)
*   **Ruta:** `GET /api/dashboard/stats`
*   **Ejemplo de Respuesta:**
    ```json
    {
      "summary": {
        "total": 120,
        "banned": 3,
        "expiringSoon": 5,
        "expiringToday": 2
      },
      "flix": {
        "total": 45,
        "active": 40,
        "expired": 5,
        "expiringToday": 1
      },
      "futvre": {
        "total": 75,
        "active": 65,
        "expired": 10,
        "expiringToday": 1
      }
    }
    ```

### L. Sincronización Masiva desde Extensión (Bulk Sync)
*   **Ruta:** `POST /api/users/bulk-sync`
*   **Body (JSON):**
    ```json
    {
      "users": [
        {
          "platform": "FLIX",
          "username": "usuario123",
          "name": "Cliente Ejemplar",
          "email": "correo@ejemplo.com",
          "phone_number": "+525512345678",
          "mac_address": "00:1A:2B:3C:4D:5E",
          "max_connections": 2,
          "activation_date": "2026-01-01",
          "expiration_date": "2026-12-31"
        }
      ]
    }
    ```
*   **Ejemplo de Respuesta:**
    ```json
    {
      "message": "Sincronización masiva completada.",
      "stats": {
        "totalReceived": 1,
        "insertedCount": 1,
        "updatedCount": 0,
        "errors": []
      }
    }
    ```

---

## 5. Pruebas de Funcionamiento con cURL

Puedes probar el procesamiento de datos localmente desde tu terminal utilizando comandos `curl`. Asegúrate de que el servidor esté corriendo (`npm run dev`) antes de ejecutar estos comandos en otra ventana.

### A. Probar carga de archivo CSV (FUTVRE)
Este comando subirá el CSV de prueba provisto y lo procesará en el servidor:
```bash
curl -X POST http://localhost:3000/api/upload-csv \
  -H "X-API-Key: dev-api-key-12345" \
  -F "csv=@/Users/rvillegas/development/iptv/docs/a5997afac356124dc8eeef5d037fd783.csv"
```

### B. Probar carga de captura de pantalla (FLIX OCR con Gemini)
> [!NOTE]
> Para esta prueba necesitas configurar tu API key de Gemini en el archivo `.env` (`GEMINI_API_KEY=tu_clave_aqui`).

```bash
curl -X POST http://localhost:3000/api/upload-screenshot \
  -H "X-API-Key: dev-api-key-12345" \
  -F "platform=FLIX" \
  -F "screenshots=@/Users/rvillegas/development/iptv/docs/Screenshot 2026-06-02 at 12.28.47 p.m..png"
```

### C. Probar consultar si un número telefónico existe (Cliente)
```bash
curl -X GET http://localhost:3000/api/users/by-phone/+525512345678 \
  -H "X-API-Key: dev-api-key-12345"
```

### D. Probar vincular un número telefónico a un usuario
```bash
curl -X POST http://localhost:3000/api/users/link-phone \
  -H "X-API-Key: dev-api-key-12345" \
  -H "Content-Type: application/json" \
  -d '{"platform":"FUTVRE","username":"albertoLopez","phone_number":"+525512345678"}'
```

### E. Probar leer usuarios
```bash
curl -X GET https://iptv.appsmx.tech/api/users \
  -H "X-API-Key: dev-api-key-12345" 
```

---

## 6. Despliegue en Dokploy

Sigue estos pasos detallados para realizar el despliegue en tu VPS administrado por Dokploy.

### A. Configuración previa de la Base de Datos (MySQL)
Antes de desplegar el backend, debes crear la base de datos y el usuario en tu servidor MySQL. Ejecuta las siguientes sentencias SQL en tu gestor de base de datos de producción:

```sql
-- 1. Crear la base de datos con codificación moderna
CREATE DATABASE IF NOT EXISTS `iptv` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Crear el usuario (reemplaza 'tu_contraseña_segura' por una real)
-- El '%' permite conexiones externas provenientes de la red interna de Dokploy
CREATE USER 'iptvUser'@'%' IDENTIFIED BY 'tu_contraseña_segura';

-- 3. Otorgar permisos para DDL (crear tablas) y DML (lectura/escritura)
GRANT ALL PRIVILEGES ON `iptv`.* TO 'iptvUser'@'%';

-- 4. Recargar privilegios
FLUSH PRIVILEGES;
```

### B. Configuración del Subdominio (DNS)
Para exponer el backend a internet bajo una URL limpia como `iptv.appsmx.tech`:
1. Ve al panel de tu proveedor de DNS (ej: Cloudflare).
2. Crea un registro de tipo **`A`**:
   * **Nombre/Host:** `iptv`
   * **Destino/IP:** La dirección IP pública de tu VPS de Dokploy (la misma de `alpha.appsmx.tech`).

### C. Creación del Servicio en Dokploy
1. Ve al panel de Dokploy y crea una nueva **Application** (Aplicación).
2. Conecta tu repositorio de GitHub `rvillegasx/iptv`.
3. Selecciona la rama principal (ej: `main`).
4. Establece el método de construcción a **Dockerfile** (Dokploy detectará el `Dockerfile` en el directorio raíz).
5. En la pestaña de **Environment Variables** (Variables de Entorno), agrega:
   * `NODE_ENV`: `production`
   * `PORT`: `3000`
   * `API_KEY`: Tu clave secreta compartida con Flutter (para validar en `X-API-Key`).
   * `DB_HOST`: Host/IP de tu base de datos MySQL (producción).
   * `DB_USER`: `iptvUser`
   * `DB_PASSWORD`: `tu_contraseña_segura`
   * `DB_NAME`: `iptv`
   * `DB_PORT`: `3306`
   * `GEMINI_API_KEY`: Clave de API creada en Google AI Studio.

### D. Configuración del Dominio y SSL en Dokploy
1. En la aplicación de IPTV en Dokploy, ve a la pestaña **Domains** (Dominios).
2. Haz clic en **Add Domain** (Agregar Dominio).
3. Introduce los siguientes valores:
   * **Host:** `iptv.appsmx.tech`
   * **Path:** `/`
   * **Port:** `3000` (puerto expuesto por el contenedor Docker).
4. Asegúrate de marcar la casilla para habilitar **SSL/HTTPS** (para que Dokploy autogenere el certificado Let's Encrypt).
5. Guarda los cambios y haz clic en **Deploy** (Desplegar).

Tu API estará lista y accesible en: `https://iptv.appsmx.tech/api`

---

## 7. Monitoreo de Salud con Uptime Kuma

El servidor incluye un endpoint público de monitoreo de salud (`/health`) para integrarse de forma sencilla con herramientas como **Uptime Kuma**.

### Detalles del Endpoint:
*   **URL:** `https://iptv.appsmx.tech/health`
*   **Método:** `GET`
*   **Autenticación:** **Ninguna**. Este endpoint es público y está fuera de las rutas protegidas `/api`, por lo que **no** requiere la cabecera `X-API-Key`.
*   **Respuesta Exitosa (HTTP 200):**
    ```json
    {
      "status": "OK",
      "timestamp": "2026-06-02T19:48:11.737Z"
    }
    ```

### Configuración en Uptime Kuma:
1.  En tu panel de Uptime Kuma, haz clic en **Add New Monitor** (Añadir Nuevo Monitor).
2.  Configura los siguientes valores:
    *   **Monitor Type:** `HTTP(s)`
    *   **Friendly Name:** `IPTV Backend`
    *   **URL:** `https://iptv.appsmx.tech/health`
    *   **Heartbeat Interval:** `60` (segundos entre chequeos).
    *   **Accepted Status Codes:** `200` (el servidor devuelve 200 OK cuando está en línea y conectado a la base de datos).
3.  Haz clic en **Save** (Guardar).

---

## 8. Solución de Problemas (Troubleshooting) y Notas de Desarrollo

### A. ¿Cómo ver los logs de la aplicación en producción?
La aplicación está configurada para enviar logs a la salida estándar (`stdout`/`stderr`). Para consultarlos en Dokploy:
1. Entra a tu panel de **Dokploy**.
2. Ve a la sección **Applications** y selecciona el servicio `iptv-backend`.
3. Haz clic en la pestaña **Logs** para ver en tiempo real el registro de peticiones, procesamiento OCR de Gemini e interacciones con MySQL.

### B. Campos omitidos por Gemini (Structured Outputs)
Al procesar capturas con muchos usuarios (por ejemplo, listas de más de 20 registros), Gemini puede omitir campos opcionales del JSON para optimizar la cantidad de tokens devueltos. 

Si un campo (como `expiration_date` o `mac_address`) es omitido del objeto JSON, el backend procesará el campo como `null`. Debido a la lógica `IFNULL` en los queries de MySQL (`expiration_date = IFNULL(VALUES(expiration_date), expiration_date)`), un valor nulo provocará que la base de datos **no actualice** el valor existente.

*   **Solución implementada:** En el archivo `src/services/ocrService.js`, todos los campos del esquema de respuesta de la API de Gemini están definidos en la lista de campos requeridos (`required`). Esto obliga a Gemini a incluir cada propiedad en todos los objetos del arreglo (colocándola como `null` si no está visible en la imagen), garantizando que las actualizaciones en la base de datos se ejecuten correctamente sin omitir datos.

### C. Detección y Prevención de Duplicados por Errores de OCR
Para mitigar la duplicación de usuarios cuando la API de Gemini confunde caracteres similares en la lectura de imágenes (por ejemplo, confundir `Z` con `2`, o `S` con `5`), el backend incluye:
1. **Validación Inteligente (Upsert por similitud)**: En la carga de capturas de FLIX, el backend busca coincidencias por misma dirección MAC, o por mismo nombre y similitud del código de usuario (utilizando distancia Levenshtein). Si encuentra una coincidencia lógica, actualiza el usuario existente en vez de crear uno nuevo.
2. **Script de Diagnóstico**: Un script en `src/detect-duplicates.js` que audita la base de datos y localiza registros duplicados exactos, duplicados cruzados entre plataformas y posibles duplicados por errores del OCR. Puedes ejecutarlo localmente o en el contenedor de Dokploy con:
   ```bash
   node src/detect-duplicates.js
   ```
3. **Endpoint de Auditoría**: La ruta protegida `GET /api/debug-duplicates` (requiere cabecera `X-API-Key`) que devuelve los duplicados potenciales encontrados en formato JSON.

### D. Validación y Limpieza de Datos Basura de Web Scraping
Para evitar la sincronización accidental de datos inválidos (como ítems de menús laterales, direcciones IP de servidores, contadores de filas o etiquetas de cabecera de los paneles de administración), el backend implementa una protección de doble capa:
1. **Validación en Tiempo Real (Filtro Activo)**: El endpoint `/api/users/bulk-sync` evalúa cada registro entrante. Omite automáticamente aquellos cuyo nombre de usuario contenga espacios, sea una IP (v4 con o sin CIDR), sea un número puro menor a 4 dígitos (contadores de filas de la UI), o coincida con una lista negra de palabras de interfaz (ej. `Acciones`, `Suscripciones`, `Subrevendedores`, `Tickets`, `Notas`, etc.).
2. **Limpieza Automática al Iniciar (Database Pruning)**: Al arrancar la aplicación, el proceso de inicialización de la base de datos ejecuta una consulta DML `DELETE` que busca y purga cualquier registro basura legacy en la tabla `iptv_users` que coincida con los criterios inválidos arriba descritos. Esto garantiza que la base de datos se mantenga limpia tras despliegues en Dokploy.

---

## 9. Extensión de Chrome (FLIX & FUTVRE Exporter)

El proyecto cuenta con una extensión de Chrome ubicada en la carpeta [`flix-chrome-extension`](file:///Users/rvillegas/development/iptv/flix-chrome-extension), la cual permite extraer usuarios en tiempo real directamente desde los paneles de administración web de **FLIX** y **FUTVRE** mediante Web Scraping y sincronizarlos automáticamente con la base de datos del backend.

### A. Características Principales
* **Detección Dinámica Multiplataforma**: Detecta automáticamente las tablas de usuarios en los paneles de **FLIX** y **FUTVRE** inspeccionando los elementos visuales del DOM.
* **Extracción Inteligente de Datos**: Mapea dinámicamente campos como usuario/código, contraseña, revendedor/propietario, fecha de caducidad/vencimiento, conexiones activas y máximas (ej: `0/2`), paquete, estado de prohibición/bloqueo, pruebas y notas.
* **Widget Flotante Inyectado**: Inyecta un widget discreto en la esquina de la pantalla que muestra el total de usuarios detectados en la página actual y ofrece el botón **"Sincronizar a BD"**.
* **Integración Directa con la API**: Envía los registros escaneados al endpoint `/api/users/bulk-sync` utilizando la clave `X-API-Key` guardada.

### B. Instalación en Google Chrome
1. Abre tu navegador Google Chrome y ve a `chrome://extensions/`.
2. Activa el **Modo de desarrollador** (*Developer mode*) en la esquina superior derecha.
3. Haz clic en el botón **Cargar descomprimida** (*Load unpacked*).
4. Selecciona el directorio [`flix-chrome-extension`](file:///Users/rvillegas/development/iptv/flix-chrome-extension) dentro de este repositorio.

### C. Configuración Inicial (Popup)
1. Haz clic en el icono de la extensión **FLIX IPTV Exporter** en la barra de extensiones de Chrome.
2. Llena los campos del formulario:
   * **URL de la API del Servidor**: La dirección del backend (ej: `http://localhost:3000` en desarrollo o `https://iptv.appsmx.tech` en producción).
   * **API Key (X-API-Key)**: Tu clave secreta de autenticación (la configurada en `API_KEY` en tu `.env`).
3. Presiona **Guardar**.
4. Puedes validar la comunicación con el servidor haciendo clic en **Probar Conexión**.

### D. Modo de Uso
1. Navega al panel de administración web de **FLIX** o **FUTVRE** e inicia sesión.
2. Ve a la vista de tabla donde se muestran los usuarios.
3. El widget **IPTV Sync** se inyectará automáticamente en la parte inferior de la pantalla (derecha para FLIX, izquierda para FUTVRE) indicando el número de filas encontradas (ej: `45 filas`).
4. Haz clic en **Sincronizar a BD**. El widget mostrará el progreso y desplegará un resumen visual con el resultado (usuarios recibidos, insertados y actualizados).



