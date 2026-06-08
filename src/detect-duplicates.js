import pool from './config/db.js';

// Algoritmo Levenshtein para medir similitud
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
          matrix[i - 1][j - 1] + 1,
          Math.min(
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function isSimilar(u1, u2) {
  u1 = u1.toLowerCase();
  u2 = u2.toLowerCase();
  if (u1 === u2) return true;
  
  const clean = (s) => s
    .replace(/[z2]/g, 'z')
    .replace(/[s5]/g, 's')
    .replace(/[o0]/g, 'o')
    .replace(/[il1]/g, 'i');

  if (clean(u1) === clean(u2)) return true;
  return getLevenshteinDistance(u1, u2) <= 2;
}

async function detectDuplicates() {
  try {
    console.log('=== INICIANDO DETECCION DE DUPLICADOS EN LA BASE DE DATOS ===\n');

    // 1. Verificar si hay duplicados exactos (mismo platform y username)
    console.log('1. Buscando duplicados exactos (mismo usuario y plataforma)...');
    const [exactDupes] = await pool.query(`
      SELECT username, platform, COUNT(*) as cantidad, GROUP_CONCAT(id) as ids
      FROM iptv_users
      GROUP BY username, platform
      HAVING cantidad > 1
    `);
    
    if (exactDupes.length > 0) {
      console.log(`❌ ¡ATENCIÓN! Se encontraron ${exactDupes.length} duplicados exactos:`);
      console.table(exactDupes);
    } else {
      console.log('✅ No hay duplicados exactos (el índice UNIQUE funciona correctamente).\n');
    }

    // 2. Verificar si hay el mismo username en plataformas distintas
    console.log('2. Buscando mismos usernames en plataformas cruzadas (FLIX y FUTVRE)...');
    const [crossPlatformDupes] = await pool.query(`
      SELECT username, COUNT(DISTINCT platform) as plataformas_distintas, GROUP_CONCAT(platform) as plataformas
      FROM iptv_users
      GROUP BY username
      HAVING plataformas_distintas > 1
    `);
    
    if (crossPlatformDupes.length > 0) {
      console.log(`⚠️ Se encontraron ${crossPlatformDupes.length} nombres de usuario repetidos en distintas plataformas:`);
      console.table(crossPlatformDupes);
    } else {
      console.log('✅ No hay nombres de usuario repetidos en distintas plataformas.\n');
    }

    // 3. Buscar duplicados por OCR (Mismo nombre o misma MAC, pero usernames similares)
    console.log('3. Buscando duplicados por errores de OCR (mismo nombre/MAC con usernames parecidos)...');
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

        // Solo comparar si son de la misma plataforma
        if (u1.platform !== u2.platform) continue;

        let matchReason = '';

        // Coincidencia por MAC address
        if (u1.mac_address && u2.mac_address && u1.mac_address === u2.mac_address && u1.username !== u2.username) {
          matchReason = 'Misma Dirección MAC';
        }
        // Coincidencia por nombre idéntico y username similar
        else if (u1.name && u2.name && u1.name === u2.name && u1.username !== u2.username && isSimilar(u1.username, u2.username)) {
          matchReason = 'Mismo nombre + código similar (Posible error OCR)';
        }

        if (matchReason) {
          fuzzyDupes.push({
            motivo: matchReason,
            plataforma: u1.platform,
            nombre: u1.name || 'Sin nombre',
            mac: u1.mac_address || 'Sin MAC',
            usuario_1: `${u1.username} (ID: ${u1.id}, Vence: ${u1.expiration_date ? u1.expiration_date.toISOString().split('T')[0] : 'N/A'})`,
            usuario_2: `${u2.username} (ID: ${u2.id}, Vence: ${u2.expiration_date ? u2.expiration_date.toISOString().split('T')[0] : 'N/A'})`
          });
        }
      }
    }

    if (fuzzyDupes.length > 0) {
      console.log(`❌ Se detectaron ${fuzzyDupes.length} posibles duplicados por errores de OCR:`);
      console.table(fuzzyDupes);
    } else {
      console.log('✅ No se detectaron posibles duplicados por similitud de OCR.\n');
    }

  } catch (error) {
    console.error('Error al detectar duplicados:', error);
  } finally {
    await pool.end();
  }
}

detectDuplicates();
