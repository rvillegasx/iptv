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
    *   `search`: Palabra clave para buscar por usuario, nombre, serie (MAC) o notas.
    *   `status`: Filtra por estado de expiración:
        *   `active`: No vencidos y no bloqueados.
        *   `expired`: Vencidos.
        *   `expiring_soon`: Vencerán dentro de los próximos 7 días.
        *   `banned`: Bloqueados.
    *   `limit`: Cantidad de registros a devolver (por defecto 20).
    *   `offset`: Salto de paginación (por defecto 0).

### D. Obtener Detalle de Usuario
*   **Ruta:** `GET /api/users/:id`

### E. Actualizar/Corregir Usuario
*   **Ruta:** `PUT /api/users/:id`
*   **Body (JSON):** Admite cualquier propiedad a modificar (nombre, correo, fecha de expiración, notas, etc.).

### F. Eliminar Usuario
*   **Ruta:** `DELETE /api/users/:id`

### G. Estadísticas Consolidadas (Dashboard)
*   **Ruta:** `GET /api/dashboard/stats`
*   **Ejemplo de Respuesta:**
    ```json
    {
      "summary": {
        "total": 120,
        "banned": 3,
        "expiringSoon": 5
      },
      "flix": {
        "total": 45,
        "active": 40,
        "expired": 5
      },
      "futvre": {
        "total": 75,
        "active": 65,
        "expired": 10
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

---

## 6. Despliegue en Dokploy

El repositorio está listo para ser desplegado directamente en tu VPS con Dokploy:

1.  Crea un nuevo servicio de tipo **Application** en Dokploy.
2.  Conecta tu repositorio de GitHub.
3.  Establece el método de construcción a **Dockerfile** (el sistema leerá el `Dockerfile` del directorio raíz automáticamente).
4.  Agrega las **Variables de Entorno** del backend en Dokploy:
    *   `NODE_ENV`: `production`
    *   `PORT`: `3000` (o el puerto interno que use Dokploy)
    *   `API_KEY`: Clave para que tu app Flutter autentique sus llamados.
    *   `DB_HOST`: IP/Host de tu MySQL en Dokploy.
    *   `DB_USER`: Nombre del usuario de la base de datos MySQL.
    *   `DB_PASSWORD`: Contraseña del usuario MySQL.
    *   `DB_NAME`: Nombre de la base de datos.
    *   `DB_PORT`: Puerto (generalmente `3306`).
    *   `GEMINI_API_KEY`: Tu clave de Google AI Studio.
5.  Despliega la aplicación. ¡Listo!

