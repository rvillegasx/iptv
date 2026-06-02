import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase } from './config/db.js';
import userRoutes from './routes/userRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- MIDDLEWARES GLOBALES ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- RUTA DE MONITOREO (HEALTH CHECK) ---
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// --- RUTAS DE LA API ---
app.use('/api', userRoutes);

// --- CONTROLADOR GLOBAL DE ERRORES (MULTER, ETC.) ---
app.use((err, req, res, next) => {
  if (err instanceof Error) {
    return res.status(400).json({ error: err.message });
  }
  return res.status(500).json({ error: 'Error interno del servidor' });
});

// --- INICIALIZACIÓN ---
async function startServer() {
  try {
    // 1. Inicializar la Base de Datos (crear tabla si no existe)
    await initializeDatabase();

    // 2. Iniciar el servidor Express
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`=================================================`);
      console.log(`   Servidor IPTV Backend corriendo exitosamente`);
      console.log(`   Puerto: ${PORT}`);
      console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}`);
      console.log(`=================================================`);
    });
  } catch (error) {
    console.error('Fallo crítico al iniciar el servidor:', error);
    process.exit(1);
  }
}

startServer();
