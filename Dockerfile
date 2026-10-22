# Dhee SMS — container image (optional; see DEPLOY.md → Docker).
#   docker build -t dhee-sms .
#   docker run -d -p 3000:3000 -v dhee-data:/app/data -v dhee-backups:/app/backups dhee-sms
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    SQLITE_PATH=/app/data/dhee.sqlite \
    BACKUP_DIR=/app/backups \
    LOG_DIR=/app/logs

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY index.html ./
COPY css ./css
COPY js ./js
COPY server ./server

RUN mkdir -p /app/data /app/backups /app/logs && chown -R node:node /app/data /app/backups /app/logs
USER node
EXPOSE 3000
VOLUME ["/app/data", "/app/backups", "/app/logs"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# exec form: Node receives SIGTERM directly and shuts down gracefully
CMD ["node", "server/index.js"]
