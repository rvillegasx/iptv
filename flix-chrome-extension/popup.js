document.addEventListener('DOMContentLoaded', () => {
  const apiUrlInput = document.getElementById('apiUrl');
  const apiKeyInput = document.getElementById('apiKey');
  const btnSave = document.getElementById('btnSave');
  const btnTest = document.getElementById('btnTest');
  const statusDiv = document.getElementById('status');

  // Cargar configuraciones guardadas
  chrome.storage.local.get(['apiUrl', 'apiKey'], (result) => {
    if (result.apiUrl) apiUrlInput.value = result.apiUrl;
    if (result.apiKey) apiKeyInput.value = result.apiKey;
  });

  // Mostrar mensaje de estado
  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status-${type}`;
    statusDiv.style.display = 'block';
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 4000);
  }

  // Guardar configuración
  btnSave.addEventListener('click', () => {
    let url = apiUrlInput.value.trim();
    const key = apiKeyInput.value.trim();

    if (!url) {
      showStatus('La URL de la API es requerida.', 'error');
      return;
    }

    // Quitar diagonal final si existe
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }

    chrome.storage.local.set({ apiUrl: url, apiKey: key }, () => {
      showStatus('Configuración guardada correctamente.', 'success');
    });
  });

  // Probar conexión
  btnTest.addEventListener('click', async () => {
    let url = apiUrlInput.value.trim();
    const key = apiKeyInput.value.trim();

    if (!url) {
      showStatus('Configura primero la URL de la API.', 'error');
      return;
    }

    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }

    showStatus('Probando conexión...', 'info');

    try {
      const response = await fetch(`${url}/api/dashboard/stats`, {
        method: 'GET',
        headers: {
          'x-api-key': key
        }
      });

      if (response.ok) {
        showStatus('¡Conexión exitosa con el servidor!', 'success');
      } else {
        const errData = await response.json().catch(() => ({}));
        showStatus(`Error (${response.status}): ${errData.error || 'No autorizado'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      showStatus('Error al conectar. Verifica la URL y que el servidor esté activo.', 'error');
    }
  });
});
