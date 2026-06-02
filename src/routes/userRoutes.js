import { Router } from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import {
  uploadScreenshot,
  uploadCSV,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  getDashboardStats
} from '../controllers/userController.js';

dotenv.config();

const router = Router();

// --- MIDDLEWARE DE AUTENTICACIÓN POR API KEY ---
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const expectedApiKey = process.env.API_KEY;

  // Si en el entorno local no se ha definido API_KEY, permitimos el paso temporalmente con advertencia
  if (!expectedApiKey) {
    console.warn('ADVERTENCIA: API_KEY no está configurada en las variables de entorno. La API está abierta temporalmente.');
    return next();
  }

  if (!apiKey || apiKey !== expectedApiKey) {
    return res.status(401).json({ error: 'No autorizado. Se requiere un X-API-Key válido.' });
  }

  next();
}

// Aplicar autenticación a todas las rutas
router.use(authenticateApiKey);

// --- CONFIGURACIÓN DE MULTER PARA SUBIDA DE ARCHIVOS ---
// Guardamos los archivos en memoria para no saturar el almacenamiento del VPS y mandarlos directamente a Gemini
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // Limite de 15MB por captura de pantalla
    files: 10 // Permitir hasta 10 archivos por lote
  },
  fileFilter: (req, file, cb) => {
    // Validar tipo de archivo (solo imágenes)
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen (.png, .jpg, .jpeg)'), false);
    }
  }
});

const uploadCsvMulter = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // Limite de 5MB para archivos CSV
  },
  fileFilter: (req, file, cb) => {
    // Validar tipo de archivo (mimetype text/csv o terminación .csv)
    const isCsv = file.mimetype === 'text/csv' || 
                  file.mimetype === 'application/vnd.ms-excel' || 
                  file.originalname.endsWith('.csv');
    if (isCsv) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos CSV (.csv)'), false);
    }
  }
});

// --- ENRUTAMIENTO ---

// Carga de capturas (OCR con Gemini) para FLIX
router.post('/upload-screenshot', upload.array('screenshots', 10), uploadScreenshot);

// Carga de archivo CSV para FUTVRE
router.post('/upload-csv', uploadCsvMulter.single('csv'), uploadCSV);


// CRUD de usuarios
router.get('/users', getUsers);
router.get('/users/:id', getUserById);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

// Estadísticas para Flutter Dashboard
router.get('/dashboard/stats', getDashboardStats);

export default router;
