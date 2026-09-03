# 📡 IPTV REST API - Guía de Integración Externa

Esta API permite consultar, vincular y administrar la información consolidada de usuarios de los paneles **FLIX** y **FUTVRE**, así como verificar en tiempo real si un número de teléfono pertenece a un cliente activo (ideal para bots de WhatsApp, CRM, pasarelas de pago o aplicaciones móviles).

---

## 1. 🔐 Autenticación

Todas las peticiones a los endpoints `/api/*` requieren incluir la siguiente cabecera HTTP:

| Cabecera | Tipo | Descripción |
| :--- | :--- | :--- |
| **`X-API-Key`** | `String` | Token secreto configurado en el servidor (`API_KEY`). |

* **Host Base (Producción):** `https://iptv.appsmx.tech`
* **Host Base (Desarrollo):** `http://localhost:3000`

---

## 2. 📱 Endpoints de Teléfono y Clientes

### A. Consultar si un Teléfono es Cliente
Permite saber si un número telefónico tiene cuentas asociadas en FLIX o FUTVRE, si son cuentas demo o de pago, y su estado de vencimiento.

* **Método:** `GET`
* **Ruta:** `/api/users/by-phone/:phone`
* **Parámetro URL:** `:phone` (admite formato internacional `+525512345678`, con espacios, guiones o los 10 dígitos locales).

#### ✅ Respuesta cuando SÍ existe (Cliente encontrado - HTTP 200):
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
      "password": "miPassword123",
      "name": "Alberto López",
      "email": null,
      "phone_number": "+525512345678",
      "mac_address": null,
      "expiration_date": "2026-08-31 23:59:59",
      "is_trial": false,
      "is_banned": false,
      "package_name": "1 Mes / 2 Conexiones",
      "active_connections": 0,
      "max_connections": 2,
      "notes": "Renovación pagada",
      "status": "active",
      "created_at": "2026-08-01T12:00:00.000Z",
      "updated_at": "2026-08-16T18:00:00.000Z"
    }
  ]
}
```

#### ❌ Respuesta cuando NO existe (No es cliente - HTTP 200):
```json
{
  "exists": false,
  "is_client": false,
  "phone_number": "+525512345678",
  "total_accounts": 0,
  "accounts": []
}
```

---

### B. Vincular Teléfono por Plataforma y Usuario
Asocia un número de teléfono a un usuario conociendo su plataforma (`FLIX` o `FUTVRE`) y su nombre de usuario o código del panel (sin requerir el ID de base de datos).

* **Método:** `POST`
* **Ruta:** `/api/users/link-phone`
* **Headers:** `Content-Type: application/json`
* **Body:**
```json
{
  "platform": "FUTVRE",
  "username": "albertoLopez",
  "phone_number": "+525512345678"
}
```

#### Respuesta Exitosa (HTTP 200):
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

---

### C. Actualizar Teléfono por ID
* **Método:** `PATCH`
* **Ruta:** `/api/users/:id/phone`
* **Body:**
```json
{
  "phone_number": "+525512345678"
}
```

---

## 3. 👥 Gestión y Consulta General de Usuarios

### A. Listar y Filtrar Usuarios
* **Método:** `GET`
* **Ruta:** `/api/users`
* **Query Params:**
  * `platform`: `'FLIX'` o `'FUTVRE'`.
  * `search`: Búsqueda por coincidencia en `username`, `name`, `mac_address`, `phone_number` o `notes`.
  * `phone`: Búsqueda flexible por número telefónico.
  * `status`:
    * `active`: No vencidos y no bloqueados.
    * `expired`: Ya vencidos.
    * `expiring_today` o `today`: Vencen o vencieron durante el día de hoy (incluye demos de pocas horas).
    * `expiring_soon`: Vencerán en los próximos 7 días.
    * `trials` o `demo`: Cuentas demo/prueba.
    * `banned`: Bloqueados.
  * `is_trial`: `true` o `false` para filtrar demos en combinación con cualquier estado.
  * `limit`: Registros por página (por defecto `20`).
  * `offset`: Salto de paginación (por defecto `0`).

---

### B. Obtener Detalle de un Usuario por ID
* **Método:** `GET`
* **Ruta:** `/api/users/:id`

---

### C. Actualizar Usuario Completo
* **Método:** `PUT`
* **Ruta:** `/api/users/:id`
* **Body:**
```json
{
  "name": "Alberto López Actualizado",
  "phone_number": "+525512345678",
  "expiration_date": "2026-09-30 23:59:59",
  "notes": "Cliente VIP"
}
```

---

### D. Eliminar Usuario
* **Método:** `DELETE`
* **Ruta:** `/api/users/:id`

---

### E. Purgar Cuentas Demo/Prueba
Elimina manualmente todos los registros de demostración existentes en la base de datos (también se ejecuta automáticamente al reiniciar el servidor).

* **Método:** `POST` o `DELETE`
* **Ruta:** `/api/users/cleanup-trials`
* **Respuesta Exitosa (HTTP 200):**
```json
{
  "message": "Limpieza de cuentas demo/prueba completada con éxito.",
  "deletedCount": 42
}
```

---

## 4. 📊 Estadísticas del Dashboard

* **Método:** `GET`
* **Ruta:** `/api/dashboard/stats`

#### Ejemplo de Respuesta (HTTP 200):
```json
{
  "summary": {
    "total": 133,
    "banned": 3,
    "expiringSoon": 8,
    "expiringToday": 4
  },
  "flix": {
    "total": 45,
    "active": 40,
    "expired": 5,
    "expiringToday": 1
  },
  "futvre": {
    "total": 88,
    "active": 76,
    "expired": 12,
    "expiringToday": 3
  }
}
```

---

## 5. 🛡️ Garantía de Persistencia de Teléfonos

Cuando la **Extensión de Google Chrome**, una carga masiva de CSV o el OCR escanean y sincronizan los paneles de administración hacia la base de datos:
* La base de datos ejecuta una regla **`phone_number = IFNULL(VALUES(phone_number), phone_number)`**.
* **Resultado:** Si un usuario ya tenía asignado un número de teléfono en la base de datos, las sincronizaciones de la extensión **NUNCA borrarán ni sobreescribirán su teléfono**.
