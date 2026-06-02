import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn('ADVERTENCIA: GEMINI_API_KEY no está configurada en las variables de entorno. La funcionalidad de OCR no funcionará.');
}

const ai = new GoogleGenAI({ apiKey });

export default ai;
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
