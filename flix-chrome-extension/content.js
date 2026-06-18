// Content script para extraer y sincronizar los usuarios del panel de FLIX
console.log("FLIX IPTV Exporter: script cargado con éxito en: " + window.location.href);

let domObserver = null;

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

// Función universal para buscar e identificar los datos de la tabla (soporta table y divs)
function scrapeFlixUsers() {
  const allElements = document.querySelectorAll('div, tr, thead, ul, header, section');
  let headerRow = null;
  let headersNormalized = [];
  let headerTexts = [];

  // 1. Buscar la fila de cabecera más específica
  for (const el of allElements) {
    const children = Array.from(el.children);
    if (children.length < 2) continue;

    const childTexts = children.map(c => c.textContent.trim());
    const childTextsNorm = childTexts.map(normalizeText);

    // Validar si el elemento contiene palabras clave de FLIX
    const hasCodigo = childTextsNorm.some(t => t === 'codigo');
    const hasVencimiento = childTextsNorm.some(t => t === 'vencimiento');

    if (hasCodigo && hasVencimiento) {
      headerRow = el;
      headersNormalized = childTextsNorm;
      headerTexts = childTexts;
      break;
    }
  }

  if (!headerRow) {
    return [];
  }

  // Mapear los índices dinámicamente usando coincidencia parcial
  const codeIndex = headersNormalized.findIndex(h => h.includes('codigo'));
  const nameIndex = headersNormalized.findIndex(h => h.includes('nombre'));
  const emailIndex = headersNormalized.findIndex(h => h.includes('correo') || h.includes('mail'));
  const macIndex = headersNormalized.findIndex(h => h.includes('serie') || h.includes('mac'));
  const connectionsIndex = headersNormalized.findIndex(h => h.includes('eq') || h.includes('conex'));
  const activationIndex = headersNormalized.findIndex(h => h.includes('alta') || h.includes('registro') || h.includes('creado'));
  const expirationIndex = headersNormalized.findIndex(h => h.includes('vencimiento') || h.includes('caducidad'));

  const headerLength = headersNormalized.length;

  // 2. Buscar las filas de datos con un algoritmo universal basado en la estructura de celdas
  const possibleRows = document.querySelectorAll('div, tr, li');
  const rows = [];
  const dateRegex = /^\d{4}-\d{2}-\d{2}/; // Empieza con YYYY-MM-DD

  for (const el of possibleRows) {
    const cells = Array.from(el.children);
    if (cells.length !== headerLength) continue;

    // Evitar que sea la cabecera misma o elementos que no son filas de datos
    if (el === headerRow || el.textContent.includes('Vencimiento') && el.textContent.includes('Código')) continue;

    const getCellText = (cell) => {
      if (!cell) return '';
      const innerElement = cell.querySelector('a, span, button');
      return (innerElement ? innerElement.textContent : cell.textContent).trim();
    };

    // Validar que la celda del código no esté vacía, no contenga espacios y sea corta
    const codeVal = getCellText(cells[codeIndex]);
    if (!codeVal || codeVal.includes(' ') || codeVal.length > 20 || normalizeText(codeVal) === 'codigo') continue;

    // Validar que la celda de vencimiento comience con formato de fecha (YYYY-MM-DD)
    const expVal = getCellText(cells[expirationIndex]);
    if (expVal && !dateRegex.test(expVal)) continue;

    rows.push(el);
  }

  // 3. Procesar las filas validadas
  const users = [];
  for (const row of rows) {
    const cells = Array.from(row.children);

    const getCellText = (cell) => {
      if (!cell) return null;
      const innerElement = cell.querySelector('a, span, button');
      return (innerElement ? innerElement.textContent : cell.textContent).trim();
    };

    const username = getCellText(cells[codeIndex]);
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

// Inyectar el botón flotante si se encuentra la tabla de FLIX
function initExtensionWidget() {
  // Pausar observación para evitar bucles infinitos al mutar el DOM desde aquí
  if (domObserver) {
    domObserver.disconnect();
  }

  const users = scrapeFlixUsers();
  if (users.length === 0) {
    // Reactivar observación
    if (domObserver) {
      domObserver.observe(document.body, { childList: true, subtree: true });
    }
    return;
  }

  // Prevenir inyecciones duplicadas
  const existingWidget = document.getElementById('flix-sync-widget');
  if (existingWidget) {
    const countBadge = document.querySelector('#flix-sync-widget span');
    const expectedText = `${users.length} filas`;
    if (countBadge && countBadge.textContent !== expectedText) {
      countBadge.textContent = expectedText;
    }
    
    // Reactivar observación y salir
    if (domObserver) {
      domObserver.observe(document.body, { childList: true, subtree: true });
    }
    return;
  }

  console.log(`FLIX IPTV Exporter: ¡Datos detectados correctamente! Creando widget flotante.`);

  // Crear contenedor del widget flotante con estilos modernos
  const widget = document.createElement('div');
  widget.id = 'flix-sync-widget';
  Object.assign(widget.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: '999999',
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    padding: '16px',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
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
      <span style="font-size: 11px; background-color: #1e293b; padding: 2px 6px; border-radius: 20px; color: #94a3b8; font-weight: 600;">
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

  // Hover y animación del botón
  syncBtn.addEventListener('mouseenter', () => syncBtn.style.backgroundColor = '#0369a1');
  syncBtn.addEventListener('mouseleave', () => syncBtn.style.backgroundColor = '#0284c7');
  syncBtn.addEventListener('mousedown', () => syncBtn.style.transform = 'scale(0.98)');
  syncBtn.addEventListener('mouseup', () => syncBtn.style.transform = 'scale(1)');

  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    syncBtn.style.opacity = '0.6';
    syncBtn.style.cursor = 'not-allowed';
    
    statusDiv.style.display = 'block';
    statusDiv.style.backgroundColor = 'rgba(56, 189, 248, 0.15)';
    statusDiv.style.color = '#38bdf8';
    statusDiv.textContent = 'Obteniendo configuración...';

    chrome.storage.local.get(['apiUrl', 'apiKey'], async (config) => {
      const { apiUrl, apiKey } = config;

      if (!apiUrl) {
        statusDiv.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
        statusDiv.style.color = '#ef4444';
        statusDiv.innerHTML = '❌ Configura la URL de la API abriendo el popup de la extensión.';
        syncBtn.disabled = false;
        syncBtn.style.opacity = '1';
        syncBtn.style.cursor = 'pointer';
        return;
      }

      statusDiv.textContent = 'Enviando datos al servidor...';
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
          statusDiv.innerHTML = `❌ Error del servidor (${response.status}):<br>${errData.error || 'No autorizado'}`;
        }
      } catch (err) {
        console.error(err);
        statusDiv.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
        statusDiv.style.color = '#ef4444';
        statusDiv.innerHTML = '❌ Error de red al conectar al servidor.';
      } finally {
        syncBtn.disabled = false;
        syncBtn.style.opacity = '1';
        syncBtn.style.cursor = 'pointer';
      }
    });
  });

  // Reactivar el observer después de agregar el widget
  if (domObserver) {
    domObserver.observe(document.body, { childList: true, subtree: true });
  }
}

// Observar dinámicamente cambios en el DOM para SPA y renderizado AJAX
function observeDOM() {
  domObserver = new MutationObserver(() => {
    initExtensionWidget();
  });

  initExtensionWidget();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', observeDOM);
} else {
  observeDOM();
}
