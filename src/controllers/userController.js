import pool from '../config/db.js';
import { parseIPTVImage } from '../services/ocrService.js';

// --- CONTROLLER DE OCR / PROCESAMIENTO DE CAPTURAS ---
export async function uploadScreenshot(req, res) {
  const { platform } = req.body;

  if (!platform || (platform !== 'FLIX' && platform !== 'FUTVRE')) {
    return res.status(400).json({ error: 'La plataforma debe ser "FLIX" o "FUTVRE"' });
  }

  // Verificar si hay archivos en la solicitud
  const files = req.files || (req.file ? [req.file] : []);
  if (files.length === 0) {
    return res.status(400).json({ error: 'Debes subir al menos una imagen (captura de pantalla)' });
  }

  const stats = {
    totalImages: files.length,
    processedUsers: 0,
    insertedCount: 0,
    updatedCount: 0,
    errors: []
  };

  try {
    for (const file of files) {
      try {
        console.log(`Iniciando OCR para imagen: ${file.originalname} en plataforma ${platform}`);
        
        // 1. Procesar la imagen con Gemini
        const users = await parseIPTVImage(file.buffer, file.mimetype, platform);
        console.log(`Gemini extrajo ${users.length} usuarios de la imagen ${file.originalname}`);

        if (!Array.isArray(users) || users.length === 0) {
          console.warn(`No se encontraron usuarios estructurados en la imagen ${file.originalname}`);
          continue;
        }

        // 2. Insertar/Actualizar en la base de datos (Upsert inteligente para evitar duplicados por OCR)
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();

          for (const user of users) {
            // Asegurarnos de que pertenezca a la plataforma correcta y tenga username
            const finalUsername = (user.username || '').trim();
            if (!finalUsername) continue;

            const finalPlatform = platform;
            
            // Si la fecha viene vacía o es inválida, se guarda como null
            const expirationDate = user.expiration_date ? user.expiration_date : null;
            const activationDate = user.activation_date ? user.activation_date : null;

            const rawOcr = JSON.stringify(user);

            // Búsqueda inteligente de duplicados antes de insertar
            let existingId = null;

            // Paso A: Buscar por dirección MAC (Serie) si está disponible
            const finalMacAddress = (user.mac_address || '').trim();
            if (finalMacAddress) {
              const [macRows] = await connection.query(
                'SELECT id FROM iptv_users WHERE platform = ? AND mac_address = ? LIMIT 1',
                [finalPlatform, finalMacAddress]
              );
              if (macRows.length > 0) {
                existingId = macRows[0].id;
              }
            }

            // Paso B: Buscar por nombre idéntico y validar similitud de username (evitar falsos positivos)
            const finalName = (user.name || '').trim();
            if (!existingId && finalName) {
              const [nameRows] = await connection.query(
                'SELECT id, username FROM iptv_users WHERE platform = ? AND name = ?',
                [finalPlatform, finalName]
              );
              
              for (const row of nameRows) {
                if (isSimilarUsername(row.username, finalUsername)) {
                  existingId = row.id;
                  break;
                }
              }
            }

            let query;
            let queryParams;

            if (existingId) {
              // Ya existe el usuario (por MAC o nombre + similitud de username), actualizamos por ID
              query = `
                UPDATE iptv_users SET
                  password = IFNULL(?, password),
                  name = IFNULL(?, name),
                  email = IFNULL(?, email),
                  mac_address = IFNULL(?, mac_address),
                  expiration_date = IFNULL(?, expiration_date),
                  active_connections = COALESCE(?, active_connections),
                  max_connections = COALESCE(?, max_connections),
                  package_name = IFNULL(?, package_name),
                  is_trial = COALESCE(?, is_trial),
                  activation_date = IFNULL(?, activation_date),
                  is_banned = COALESCE(?, is_banned),
                  last_seen_info = IFNULL(?, last_seen_info),
                  notes = IFNULL(?, notes),
                  raw_ocr_metadata = IFNULL(?, raw_ocr_metadata)
                WHERE id = ?
              `;
              queryParams = [
                user.password || null,
                user.name || null,
                finalMacAddress || null,
                expirationDate,
                user.active_connections !== undefined ? user.active_connections : null,
                user.max_connections !== undefined ? user.max_connections : null,
                user.package_name || null,
                user.is_trial !== undefined ? user.is_trial : null,
                activationDate,
                user.is_banned !== undefined ? user.is_banned : null,
                user.last_seen_info || null,
                user.notes || null,
                rawOcr,
                existingId
              ];
            } else {
              // No existe, procedemos con el INSERT normal
              query = `
                INSERT INTO iptv_users (
                  platform, username, password, name, email, mac_address, 
                  expiration_date, active_connections, max_connections, 
                  package_name, is_trial, activation_date, is_banned, 
                  last_seen_info, notes, raw_ocr_metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                  password = IFNULL(VALUES(password), password),
                  name = IFNULL(VALUES(name), name),
                  email = IFNULL(VALUES(email), email),
                  mac_address = IFNULL(VALUES(mac_address), mac_address),
                  expiration_date = IFNULL(VALUES(expiration_date), expiration_date),
                  active_connections = IFNULL(VALUES(active_connections), active_connections),
                  max_connections = IFNULL(VALUES(max_connections), max_connections),
                  package_name = IFNULL(VALUES(package_name), package_name),
                  is_trial = IFNULL(VALUES(is_trial), is_trial),
                  activation_date = IFNULL(VALUES(activation_date), activation_date),
                  is_banned = IFNULL(VALUES(is_banned), is_banned),
                  last_seen_info = IFNULL(VALUES(last_seen_info), last_seen_info),
                  notes = IFNULL(VALUES(notes), notes),
                  raw_ocr_metadata = IFNULL(VALUES(raw_ocr_metadata), raw_ocr_metadata);
              `;
              queryParams = [
                finalPlatform,
                finalUsername,
                user.password || null,
                user.name || null,
                user.email || null,
                finalMacAddress || null,
                expirationDate,
                user.active_connections !== undefined ? user.active_connections : 0,
                user.max_connections !== undefined ? user.max_connections : 1,
                user.package_name || null,
                user.is_trial !== undefined ? user.is_trial : false,
                activationDate,
                user.is_banned !== undefined ? user.is_banned : false,
                user.last_seen_info || null,
                user.notes || null,
                rawOcr
              ];
            }

            const [result] = await connection.query(query, queryParams);

            stats.processedUsers++;
            if (existingId) {
              stats.updatedCount++;
            } else if (result.affectedRows === 1) {
              stats.insertedCount++;
            } else if (result.affectedRows === 2) {
              stats.updatedCount++;
            }
          }

          await connection.commit();
        } catch (dbErr) {
          await connection.rollback();
          console.error(`Error de base de datos para la imagen ${file.originalname}:`, dbErr);
          stats.errors.push({ file: file.originalname, error: dbErr.message });
        } finally {
          connection.release();
        }

      } catch (ocrErr) {
        console.error(`Error procesando OCR para la imagen ${file.originalname}:`, ocrErr);
        stats.errors.push({ file: file.originalname, error: ocrErr.message });
      }
    }

    return res.status(200).json({
      message: 'Procesamiento de capturas completado.',
      stats
    });

  } catch (error) {
    console.error('Error general en uploadScreenshot:', error);
    return res.status(500).json({ error: 'Error interno del servidor al procesar las capturas' });
  }
}

// --- CONTROLLER DE PROCESAMIENTO DE CSV ---
export async function uploadCSV(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'Debes subir un archivo CSV' });
  }

  const csvText = req.file.buffer.toString('utf-8');
  const stats = {
    totalRecords: 0,
    insertedCount: 0,
    updatedCount: 0,
    errors: []
  };

  try {
    // 1. Parsear CSV con soporte básico de comillas
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) {
      return res.status(400).json({ error: 'El archivo CSV está vacío' });
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
    
    // Validar cabeceras mínimas para FUTVRE
    const requiredHeaders = ['Username', 'Expiration'];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
      return res.status(400).json({ 
        error: `El CSV no tiene las cabeceras requeridas de FUTVRE: ${missingHeaders.join(', ')}` 
      });
    }

    const records = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const row = [];
      let insideQuote = false;
      let entry = '';
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"' || char === "'") {
          insideQuote = !insideQuote;
        } else if (char === ',' && !insideQuote) {
          row.push(entry.trim());
          entry = '';
        } else {
          entry += char;
        }
      }
      row.push(entry.trim());

      if (row.length >= headers.length) {
        const record = {};
        headers.forEach((header, index) => {
          record[header] = row[index] ? row[index].replace(/^["']|["']$/g, '') : null;
        });
        records.push(record);
      }
    }

    // 2. Procesar e insertar en base de datos
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      for (const record of records) {
        const username = (record.Username || '').trim();
        if (!username) continue;

        stats.totalRecords++;

        // Mapear campos
        const platform = 'FUTVRE';
        const password = record.Password || null;
        const isBanned = record.Banned === '1' || record.Banned === 1 || String(record.Banned).toLowerCase() === 'true';
        const isTrial = record.Trial === '1' || record.Trial === 1 || String(record.Trial).toLowerCase() === 'true';
        const maxConnections = parseInt(record["Max Connections"] || '1', 10);
        
        // Expiration format: "2026-09-01 18:46" -> direct SQL datetime format
        const expirationDate = record.Expiration || null;
        // Created format: "2026-06-01 18:46" -> split to date "2026-06-01"
        const activationDate = record.Created ? record.Created.split(' ')[0] : null;
        const notes = record["Reseller Notes"] || null;

        const query = `
          INSERT INTO iptv_users (
            platform, username, password, name, email, mac_address, 
            expiration_date, active_connections, max_connections, 
            package_name, is_trial, activation_date, is_banned, 
            last_seen_info, notes, raw_ocr_metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            password = IFNULL(VALUES(password), password),
            name = IFNULL(VALUES(name), name),
            email = IFNULL(VALUES(email), email),
            mac_address = IFNULL(VALUES(mac_address), mac_address),
            expiration_date = IFNULL(VALUES(expiration_date), expiration_date),
            active_connections = IFNULL(VALUES(active_connections), active_connections),
            max_connections = IFNULL(VALUES(max_connections), max_connections),
            package_name = IFNULL(VALUES(package_name), package_name),
            is_trial = IFNULL(VALUES(is_trial), is_trial),
            activation_date = IFNULL(VALUES(activation_date), activation_date),
            is_banned = IFNULL(VALUES(is_banned), is_banned),
            last_seen_info = IFNULL(VALUES(last_seen_info), last_seen_info),
            notes = IFNULL(VALUES(notes), notes),
            raw_ocr_metadata = IFNULL(VALUES(raw_ocr_metadata), raw_ocr_metadata);
        `;

        const rawCsv = JSON.stringify(record);

        const [result] = await connection.query(query, [
          platform,
          username,
          password,
          null, // name
          null, // email
          null, // mac_address
          expirationDate,
          0, // active_connections
          maxConnections,
          null, // package_name
          isTrial,
          activationDate,
          isBanned,
          null, // last_seen_info
          notes,
          rawCsv
        ]);

        if (result.affectedRows === 1) {
          stats.insertedCount++;
        } else if (result.affectedRows === 2) {
          stats.updatedCount++;
        }
      }

      await connection.commit();
    } catch (dbErr) {
      await connection.rollback();
      console.error('Error de base de datos en procesamiento de CSV:', dbErr);
      throw dbErr;
    } finally {
      connection.release();
    }

    return res.status(200).json({
      message: 'Procesamiento de CSV completado.',
      stats
    });

  } catch (error) {
    console.error('Error general en uploadCSV:', error);
    return res.status(500).json({ error: 'Error al procesar el archivo CSV' });
  }
}

// --- CONTROLLER DE USUARIOS (CRUD Y BÚSQUEDA) ---

export async function getUsers(req, res) {
  const { platform, search, status, limit = 20, offset = 0 } = req.query;

  const parsedLimit = parseInt(limit, 10);
  const parsedOffset = parseInt(offset, 10);

  try {
    let query = 'SELECT * FROM iptv_users WHERE 1=1';
    const params = [];

    if (platform && (platform === 'FLIX' || platform === 'FUTVRE')) {
      query += ' AND platform = ?';
      params.push(platform);
    }

    if (search) {
      query += ' AND (username LIKE ? OR name LIKE ? OR mac_address LIKE ? OR notes LIKE ?)';
      const searchWildcard = `%${search}%`;
      params.push(searchWildcard, searchWildcard, searchWildcard, searchWildcard);
    }

    if (status) {
      const now = new Date();
      if (status === 'active') {
        // No vencido y no baneado
        query += ' AND (expiration_date IS NULL OR expiration_date > ?) AND is_banned = 0';
        params.push(now);
      } else if (status === 'expired') {
        // Ya vencido
        query += ' AND expiration_date <= ?';
        params.push(now);
      } else if (status === 'expiring_soon') {
        // Vence en los próximos 7 días
        const inSevenDays = new Date();
        inSevenDays.setDate(now.getDate() + 7);
        query += ' AND expiration_date > ? AND expiration_date <= ?';
        params.push(now, inSevenDays);
      } else if (status === 'banned') {
        query += ' AND is_banned = 1';
      }
    }

    // Obtener total para paginación
    let countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0].total;

    // Agregar orden y paginación
    query += ' ORDER BY expiration_date ASC, created_at DESC LIMIT ? OFFSET ?';
    params.push(parsedLimit, parsedOffset);

    const [rows] = await pool.query(query, params);

    return res.status(200).json({
      data: rows,
      pagination: {
        total,
        limit: parsedLimit,
        offset: parsedOffset
      }
    });

  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    return res.status(500).json({ error: 'Error al obtener usuarios de la base de datos' });
  }
}

export async function getUserById(req, res) {
  const { id } = req.params;
  try {
    const [rows] = await pool.query('SELECT * FROM iptv_users WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    return res.status(200).json(rows[0]);
  } catch (error) {
    console.error('Error al obtener usuario por ID:', error);
    return res.status(500).json({ error: 'Error al consultar el usuario' });
  }
}

export async function updateUser(req, res) {
  const { id } = req.params;
  const {
    username,
    password,
    name,
    email,
    mac_address,
    expiration_date,
    active_connections,
    max_connections,
    package_name,
    is_trial,
    activation_date,
    is_banned,
    notes
  } = req.body;

  try {
    // Verificar que exista
    const [check] = await pool.query('SELECT id, platform FROM iptv_users WHERE id = ?', [id]);
    if (check.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const query = `
      UPDATE iptv_users SET
        username = COALESCE(?, username),
        password = ?,
        name = ?,
        email = ?,
        mac_address = ?,
        expiration_date = ?,
        active_connections = COALESCE(?, active_connections),
        max_connections = COALESCE(?, max_connections),
        package_name = ?,
        is_trial = COALESCE(?, is_trial),
        activation_date = ?,
        is_banned = COALESCE(?, is_banned),
        notes = ?
      WHERE id = ?
    `;

    const expDate = expiration_date ? new Date(expiration_date) : null;
    const actDate = activation_date ? new Date(activation_date) : null;

    await pool.query(query, [
      username || null,
      password || null,
      name || null,
      email || null,
      mac_address || null,
      expDate,
      active_connections !== undefined ? parseInt(active_connections, 10) : null,
      max_connections !== undefined ? parseInt(max_connections, 10) : null,
      package_name || null,
      is_trial !== undefined ? (is_trial === true || is_trial === 'true' || is_trial === 1) : null,
      actDate,
      is_banned !== undefined ? (is_banned === true || is_banned === 'true' || is_banned === 1) : null,
      notes || null,
      id
    ]);

    return res.status(200).json({ message: 'Usuario actualizado correctamente' });
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Ya existe un usuario con este nombre/código en esa plataforma' });
    }
    return res.status(500).json({ error: 'Error al actualizar el usuario' });
  }
}

export async function deleteUser(req, res) {
  const { id } = req.params;
  try {
    const [result] = await pool.query('DELETE FROM iptv_users WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    return res.status(200).json({ message: 'Usuario eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    return res.status(500).json({ error: 'Error al eliminar el usuario' });
  }
}

// --- CONTROLLER DE DEPURACIÓN DE DUPLICADOS ---
export async function getDuplicatesDebug(req, res) {
  try {
    const [allUsers] = await pool.query(`
      SELECT id, platform, username, name, mac_address, expiration_date 
      FROM iptv_users 
      ORDER BY name ASC, id ASC
    `);

    const fuzzyDupes = [];
    for (let i = 0; i < allUsers.length; i++) {
      for (let j = i + 1; j < allUsers.length; j++) {
        const u1 = allUsers[i];
        const u2 = allUsers[j];

        if (u1.platform !== u2.platform) continue;

        let matchReason = '';

        if (u1.mac_address && u2.mac_address && u1.mac_address === u2.mac_address && u1.username !== u2.username) {
          matchReason = 'Misma Dirección MAC';
        }
        else if (u1.name && u2.name && u1.name === u2.name && u1.username !== u2.username && isSimilarUsername(u1.username, u2.username)) {
          matchReason = 'Mismo nombre + código similar (Posible error OCR)';
        }

        if (matchReason) {
          fuzzyDupes.push({
            reason: matchReason,
            platform: u1.platform,
            name: u1.name || 'Sin nombre',
            mac_address: u1.mac_address || 'Sin MAC',
            user1: { id: u1.id, username: u1.username, expiration_date: u1.expiration_date },
            user2: { id: u2.id, username: u2.username, expiration_date: u2.expiration_date }
          });
        }
      }
    }

    return res.status(200).json({
      total_potential_duplicates: fuzzyDupes.length,
      duplicates: fuzzyDupes
    });
  } catch (error) {
    console.error('Error al detectar duplicados:', error);
    return res.status(500).json({ error: 'Error al detectar duplicados' });
  }
}

// --- CONTROLLER DE DASHBOARD / ESTADÍSTICAS ---

export async function getDashboardStats(req, res) {
  try {
    const now = new Date();
    const inSevenDays = new Date();
    inSevenDays.setDate(now.getDate() + 7);

    // Queries consolidadas
    const [totalRows] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN platform = 'FLIX' THEN 1 ELSE 0 END) as total_flix,
        SUM(CASE WHEN platform = 'FUTVRE' THEN 1 ELSE 0 END) as total_futvre,
        SUM(CASE WHEN is_banned = 1 THEN 1 ELSE 0 END) as total_banned
      FROM iptv_users
    `);

    const [activeRows] = await pool.query(`
      SELECT 
        SUM(CASE WHEN platform = 'FLIX' THEN 1 ELSE 0 END) as active_flix,
        SUM(CASE WHEN platform = 'FUTVRE' THEN 1 ELSE 0 END) as active_futvre
      FROM iptv_users
      WHERE (expiration_date IS NULL OR expiration_date > ?) AND is_banned = 0
    `, [now]);

    const [expiredRows] = await pool.query(`
      SELECT 
        SUM(CASE WHEN platform = 'FLIX' THEN 1 ELSE 0 END) as expired_flix,
        SUM(CASE WHEN platform = 'FUTVRE' THEN 1 ELSE 0 END) as expired_futvre
      FROM iptv_users
      WHERE expiration_date <= ?
    `, [now]);

    const [expiringSoonRows] = await pool.query(`
      SELECT COUNT(*) as expiring_soon
      FROM iptv_users
      WHERE expiration_date > ? AND expiration_date <= ? AND is_banned = 0
    `, [now, inSevenDays]);

    const totals = totalRows[0];
    const active = activeRows[0];
    const expired = expiredRows[0];

    return res.status(200).json({
      summary: {
        total: totals.total || 0,
        banned: totals.total_banned || 0,
        expiringSoon: expiringSoonRows[0].expiring_soon || 0
      },
      flix: {
        total: totals.total_flix || 0,
        active: active.active_flix || 0,
        expired: expired.expired_flix || 0
      },
      futvre: {
        total: totals.total_futvre || 0,
        active: active.active_futvre || 0,
        expired: expired.expired_futvre || 0
      }
    });

  } catch (error) {
    console.error('Error al obtener estadísticas del dashboard:', error);
    return res.status(500).json({ error: 'Error al consultar las estadísticas' });
  }
}

// --- FUNCIONES AUXILIARES PARA EVITAR DUPLICADOS POR OCR ---

/**
 * Calcula la distancia Levenshtein entre dos cadenas.
 */
function getLevenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // Sustitución
          Math.min(
            matrix[i][j - 1] + 1, // Inserción
            matrix[i - 1][j] + 1  // Eliminación
          )
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Compara dos usernames para ver si son lo suficientemente similares 
 * (ignorando mayúsculas/minúsculas, espacios y errores comunes del OCR como z/2 o s/5).
 */
function isSimilarUsername(username1, username2) {
  const u1 = (username1 || '').trim().toLowerCase();
  const u2 = (username2 || '').trim().toLowerCase();
  if (u1 === u2) return true;
  
  // Normalizar caracteres comunes que el OCR confunde
  const clean = (s) => s
    .replace(/[z2]/g, 'z')
    .replace(/[s5]/g, 's')
    .replace(/[o0]/g, 'o')
    .replace(/[il1]/g, 'i');

  if (clean(u1) === clean(u2)) return true;

  // Si tienen longitudes parecidas y una distancia Levenshtein menor o igual a 2
  const dist = getLevenshteinDistance(u1, u2);
  return dist <= 2;
}
