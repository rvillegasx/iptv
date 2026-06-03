import ai, { GEMINI_MODEL } from '../config/gemini.js';
import { Type } from '@google/genai';

/**
 * Procesa una imagen de captura de pantalla de un panel de IPTV y extrae la lista de usuarios.
 * 
 * @param {Buffer} fileBuffer - El buffer de la imagen subida.
 * @param {string} mimeType - El tipo MIME de la imagen (ej: 'image/png', 'image/jpeg').
 * @param {'FLIX' | 'FUTVRE'} platform - La plataforma a la que pertenece la captura.
 * @returns {Promise<Array<Object>>} - Lista de usuarios estructurados.
 */
export async function parseIPTVImage(fileBuffer, mimeType, platform) {
  // Convertir la imagen a base64 para la API
  const base64Data = fileBuffer.toString('base64');
  
  // Obtener la fecha actual para que Gemini calcule correctamente fechas relativas (ej. "in 3 months")
  const currentDateStr = new Date().toISOString().split('T')[0];
  const currentDateTimeStr = new Date().toLocaleString();

  let prompt = '';
  if (platform === 'FLIX') {
    prompt = `
      Eres un asistente experto en extracción de datos. Analiza la captura de pantalla adjunta que corresponde al panel de administración de IPTV "FLIX".
      Tu tarea es extraer todas las filas de la tabla de usuarios visible.
      
      Reglas de extracción para FLIX:
      - platform: Debe ser exactamente 'FLIX'.
      - username: Extrae el valor de la columna 'Código' (ej: VWJRTL, MRLG8G). Este campo es obligatorio y único.
      - name: Extrae el valor de la columna 'Nombre' (ej: Dervil Chalup).
      - email: Extrae la columna 'Correo' si tiene un correo válido, de lo contrario deja nulo.
      - mac_address: Extrae el valor completo de la columna 'Serie' (ej: a652e1ab4f7663a5com.flix.tv).
      - max_connections: Extrae el valor numérico entero de la columna '#Eq.' (ej: 1 o 2).
      - activation_date: Extrae la fecha de 'Fecha Alta' en formato 'YYYY-MM-DD'.
      - expiration_date: Extrae la fecha de 'Vencimiento' en formato 'YYYY-MM-DD'. Si está vencida o es pasada, igual pon la fecha correcta en formato ISO 'YYYY-MM-DD 23:59:59'.
      
      La fecha de hoy es: ${currentDateStr}.
      Retorna los datos estructurados en formato JSON que cumpla exactamente con el esquema especificado.
    `;
  } else if (platform === 'FUTVRE') {
    prompt = `
      Eres un asistente experto en extracción de datos. Analiza la captura de pantalla adjunta que corresponde al panel de administración de IPTV "FUTVRE" / "FUTURE".
      Tu tarea es extraer todas las filas de la tabla de usuarios de la sección "Gestionar Líneas".
      
      Reglas de extracción para FUTVRE:
      - platform: Debe ser exactamente 'FUTVRE'.
      - username: Extrae el valor de la columna 'Nombre de Usuario' (ej: victor5382, cristinaCordero). Este campo es obligatorio.
      - password: Extrae el valor de la columna 'Contraseña' (ej: Ez6nYvuVcGvx, VqfxrjUepPTX).
      - expiration_date: Extrae y calcula el valor de la columna 'Caducidad'. 
        * La columna tiene una fecha/hora absoluta y a veces un tiempo relativo, por ejemplo:
          - "28.06.2026 10:55 (in 3 months)" -> calcula/convierte a formato 'YYYY-MM-DD HH:mm:ss' (ej: '2026-06-28 10:55:00').
          - "08.05.2026 12:24 (25 days ago)" -> calcula/convierte a formato 'YYYY-MM-DD HH:mm:ss' (ej: '2026-05-08 12:24:00').
          - "08.06.2026 14:28 (in 6 days)" -> calcula/convierte a formato 'YYYY-MM-DD HH:mm:ss' (ej: '2026-06-08 14:28:00').
        * Usa la fecha de referencia actual: ${currentDateTimeStr} (año 2026) para realizar los cálculos relativos en caso de duda.
      - is_banned: Si la columna 'Prohibir' dice 'NO', pon false. Si dice 'SI', pon true.
      - package_name: Extrae el texto de la columna 'Paquete' (ej: "1 mes / 2 conexiones + X").
      - is_trial: Si la columna 'Prueba' es 'NO', pon false. Si es 'SI', pon true.
      - active_connections: De la columna 'Conexiones', extrae el primer número antes de la diagonal. Ej: si dice '0/2', active_connections es 0. Si dice '1/1', active_connections es 1.
      - max_connections: De la columna 'Conexiones', extrae el segundo número después de la diagonal. Ej: si dice '0/2', max_connections es 2. Si dice '1/1', max_connections es 1.
      - last_seen_info: Extrae los datos de 'Última Vista', concatenando los detalles que aparezcan (ej: "Propeller One-Way Night Coach | 2806:2f0... | 3 days ago").
      - notes: Extrae las notas de la columna 'Notas'. Si dice 'Revendedor: NO NOTE' o está vacío, pon null.
      
      La fecha/hora actual de referencia es: ${currentDateTimeStr}.
      Retorna los datos estructurados en formato JSON que cumpla exactamente con el esquema especificado.
    `;
  }

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          description: 'Lista de usuarios extraídos de la captura del panel de IPTV',
          items: {
            type: Type.OBJECT,
            properties: {
              platform: { type: Type.STRING, enum: ['FLIX', 'FUTVRE'] },
              username: { type: Type.STRING },
              password: { type: Type.STRING, nullable: true },
              name: { type: Type.STRING, nullable: true },
              email: { type: Type.STRING, nullable: true },
              mac_address: { type: Type.STRING, nullable: true },
              expiration_date: { type: Type.STRING, description: 'Fecha en formato YYYY-MM-DD HH:mm:ss o YYYY-MM-DD', nullable: true },
              active_connections: { type: Type.INTEGER, nullable: true },
              max_connections: { type: Type.INTEGER, nullable: true },
              package_name: { type: Type.STRING, nullable: true },
              is_trial: { type: Type.BOOLEAN, nullable: true },
              activation_date: { type: Type.STRING, description: 'Fecha en formato YYYY-MM-DD', nullable: true },
              is_banned: { type: Type.BOOLEAN, nullable: true },
              last_seen_info: { type: Type.STRING, nullable: true },
              notes: { type: Type.STRING, nullable: true }
            },
            required: [
              'platform',
              'username',
              'password',
              'name',
              'email',
              'mac_address',
              'expiration_date',
              'active_connections',
              'max_connections',
              'package_name',
              'is_trial',
              'activation_date',
              'is_banned',
              'last_seen_info',
              'notes'
            ]
          }
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error('La respuesta de Gemini está vacía');
    }

    const parsedUsers = JSON.parse(resultText);
    return parsedUsers;
  } catch (error) {
    console.error('Error al procesar la imagen con Gemini:', error);
    throw error;
  }
}
