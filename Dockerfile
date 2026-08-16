# --- Production Runner Stage ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

# Copiar el código fuente
COPY src/ ./src/

# Exponer el puerto configurado (Dokploy se conectará a este puerto)
EXPOSE 3000

CMD ["node", "src/app.js"]
