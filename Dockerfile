# --- Build Stage ---
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci

# --- Production Runner Stage ---
FROM node:18-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --only=production

# Copiar el código fuente
COPY src/ ./src/

# Exponer el puerto configurado (Dokploy se conectará a este puerto)
EXPOSE 3000

CMD ["node", "src/app.js"]
