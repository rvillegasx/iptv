// Content script para extraer y sincronizar los usuarios del panel de FLIX

// Helper para normalizar texto (quitar acentos, pasar a minúsculas, limpiar espacios)
function normalizeText(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quita acentos
    .replace(/[^a-z0-9]/g, "") // Quita caracteres especiales como #, ., etc.
    .trim();
}

// Función para buscar e identificar la tabla de FLIX basada en cabeceras
function scrapeFlixUsers() {
  const tables = document.querySelectorAll('table');
  for (const table of tables) {
    // Buscar en th y td de la cabecera (primera fila, thead, etc.)
    const headerCells = table.querySelectorAll('th, tr:first-child td, thead td');
    const headers = Array.from(headerCells).map(cell => cell.textContent.trim());
    const headersNormalized = headers.map(normalizeText);

    // Validar si es la tabla correcta buscando cabeceras representativas
    const hasCodigo = headersNormalized.some(h => h.includes('codigo'));
    const hasVencimiento = headersNormalized.some(h => h.includes('vencimiento'));

    if (hasCodigo && hasVencimiento) {
      const rows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
      const users = [];

      // Mapear los índices dinámicamente usando coincidencia parcial
      const codeIndex = headersNormalized.findIndex(h => h.includes('codigo'));
      const nameIndex = headersNormalized.findIndex(h => h.includes('nombre'));
      const emailIndex = headersNormalized.findIndex(h => h.includes('correo') || h.includes('mail'));
      const macIndex = headersNormalized.findIndex(h => h.includes('serie') || h.includes('mac'));
      const connectionsIndex = headersNormalized.findIndex(h => h.includes('eq') || h.includes('conex'));
      const activationIndex = headersNormalized.findIndex(h => h.includes('alta') || h.includes('registro') || h.includes('creado'));
      const expirationIndex = headersNormalized.findIndex(h => h.includes('vencimiento') || h.includes('caducidad'));

      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < headers.length) continue;

        // Saltar si la fila es de cabecera
        if (row.querySelector('th')) continue;

        const getCellText = (cell) => {
          if (!cell) return null;
          // Buscar si hay enlaces, spans u otros elementos dentro de la celda
          const innerElement = cell.querySelector('a, span, button');
          return (innerElement ? innerElement.textContent : cell.textContent).trim();
        };

        const username = getCellText(cells[codeIndex]);
        if (!username || normalizeText(username) === 'codigo') continue; // Evitar cabecera duplicada

        const expiration_date = getCellText(cells[expirationIndex]);
        const name = nameIndex !== -1 ? getCellText(cells[nameIndex]) : null;
        const email = emailIndex !== -1 ? getCellText(cells[emailIndex]) : null;
        const mac_address = macIndex !== -1 ? getCellText(cells[macIndex]) : null;
        const max_connections = connectionsIndex !== -1 ? parseInt(getCellText(cells[connectionsIndex]), 10) : 1;
        const activation_date = activationIndex !== -1 ? getCellText(cells[activationIndex]) : null;

        users.push({
          platform: 'FLIX',
          username,
          name,
          email: email || null,
          mac_address,
          max_connections: isNaN(max_connections) ? 1 : max_connections,
          activation_date,
          expiration_date
        });
      }
      return users;
    }
  }
  return [];
}

// Inyectar el botón flotante si se encuentra la tabla de FLIX
function initExtensionWidget() {
  const users = scrapeFlixUsers();
  if (users.length === 0) {
    return;
  }

  // Prevenir inyecciones duplicadas
  if (document.getElementById('flix-sync-widget')) return;

  console.log(`FLIX IPTV Exporter: ¡Tabla detectada con ${users.length} usuarios! Creando widget flotante.`);

  // Crear contenedor del widget flotante con estilos modernos (glassmorphism)
  const widget = document.createElement('div');
  widget.id = 'flix-sync-widget';
  Object.assign(widget.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: '999999',
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    padding: '16px',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
    color: '#f8fafc',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    fontSize: '14px',
    width: '260px',
    transition: 'all 0.3s ease'
  });

  // Estructura interna HTML del widget
  widget.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
      <div style="display: flex; align-items: center; gap: 6px; font-weight: bold; color: #38bdf8;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
        FLIX IPTV Sync
      </div>
      <span style="font-size: 11px; background-color: #1e293b; padding: 2px 6px; border-radius: 20px; color: #94a3b8;">
        ${users.length} filas
      </span>
    </div>
    
    <button id="flix-sync-btn" style="
      width: 100%;
      padding: 10px;
      background-color: #0284c7;
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      font-size: 13px;
      transition: background-color 0.2s, transform 0.1s;
    ">
      Sincronizar a BD
    </button>
    
    <div id="flix-sync-status" style="
      margin-top: 10px;
      font-size: 12px;
      color: #94a3b8;
      display: none;
      line-height: 1.4;
      padding: 8px;
      border-radius: 6px;
    "></div>
  `;

  document.body.appendChild(widget);

  const syncBtn = document.getElementById('flix-sync-btn');
  const statusDiv = document.getElementById('flix-sync-status');

  // Agregar efectos hover al botón
  syncBtn.addEventListener('mouseenter', () => syncBtn.style.backgroundColor = '#0369a1');
  syncBtn.addEventListener('mouseleave', () => syncBtn.style.backgroundColor = '#0284c7');
  syncBtn.addEventListener('mousedown', () => syncBtn.style.transform = 'scale(0.98)');
  syncBtn.addEventListener('mouseup', () => syncBtn.style.transform = 'scale(1)');

  // Acción de sincronizar
  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    syncBtn.style.opacity = '0.6';
    syncBtn.style.cursor = 'not-allowed';
    
    statusDiv.style.display = 'block';
    statusDiv.style.backgroundColor = 'rgba(56, 189, 248, 0.15)';
    statusDiv.style.color = '#38bdf8';
    statusDiv.textContent = 'Obteniendo configuración...';

    // Obtener configuración guardada de la extensión
    chrome.storage.local.get(['apiUrl', 'apiKey'], async (config) => {
      const { apiUrl, apiKey } = config;

      if (!apiUrl) {
        statusDiv.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
        statusDiv.style.color = '#ef4444';
        statusDiv.innerHTML = '❌ Configura la URL de la API abriendo la ventana emergente de la extensión en la barra de herramientas.';
        syncBtn.disabled = false;
        syncBtn.style.opacity = '1';
        syncBtn.style.cursor = 'pointer';
        return;
      }

      statusDiv.textContent = 'Enviando datos al servidor...';

      // Scrapear nuevamente para capturar los datos actuales en pantalla
      const currentUsers = scrapeFlixUsers();

      try {
        const response = await fetch(`${apiUrl}/api/users/bulk-sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey || ''
          },
          body: JSON.stringify({ users: currentUsers })
        });

        if (response.ok) {
          const resData = await response.json();
          const stats = resData.stats;
          
          statusDiv.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
          statusDiv.style.color = '#10b981';
          statusDiv.innerHTML = `
            <strong>✅ ¡Sincronizado!</strong><br>
            • Recibidos: ${stats.totalReceived}<br>
            • Insertados: ${stats.insertedCount}<br>
            • Actualizados: ${stats.updatedCount}
          `;
        } else {
          const errData = await response.json().catch(() => ({}));
          statusDiv.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
          statusDiv.style.color = '#ef4444';
          statusDiv.innerHTML = `❌ Error en el servidor (${response.status}):<br>${errData.error || 'No autorizado'}`;
        }
      } catch (err) {
        console.error(err);
        statusDiv.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
        statusDiv.style.color = '#ef4444';
        statusDiv.innerHTML = '❌ No se pudo conectar al servidor. Revisa si está encendido y la URL.';
      } finally {
        syncBtn.disabled = false;
        syncBtn.style.opacity = '1';
        syncBtn.style.cursor = 'pointer';
      }
    });
  });
}

// Iniciar monitoreo del DOM
function observeDOM() {
  const table = document.querySelector('table');
  if (table) {
    initExtensionWidget();
  }

  const observer = new MutationObserver(() => {
    const table = document.querySelector('table');
    if (table) {
      initExtensionWidget();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Ejecutar cuando esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', observeDOM);
} else {
  observeDOM();
}
