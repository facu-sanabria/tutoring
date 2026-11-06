# Imagen de Tutoring. Las keys no entran acá: llegan como variables de entorno al arrancar.
FROM node:22.18.0-slim

ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data CUENTAS_DEMO=off

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY backend ./backend
COPY public ./public
COPY scripts ./scripts

# data/ es lo único que escribe la app. Sin un volumen montado, se pierde al reemplazar la tarea.
RUN mkdir -p /app/data && chown node:node /app/data
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "backend/server.js"]
