# Same browser/Linux image that passed the isolated Cloud Build diagnostics.
FROM ghcr.io/puppeteer/puppeteer:24.17.1@sha256:5b0f649b32a2fc53bc441cf72a986e3a9bc94d09078a1fc046be53dbbd0d6240 AS build
USER root
ENV PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer
WORKDIR /app/pdf-service
COPY pdf-service/package*.json ./
RUN npm ci
COPY backend/src/documents/pdf/document-pdf.template.ts /app/backend/src/documents/pdf/document-pdf.template.ts
COPY pdf-service/ ./
RUN npm run build && npm test
RUN npm ci --omit=dev

FROM ghcr.io/puppeteer/puppeteer:24.17.1@sha256:5b0f649b32a2fc53bc441cf72a986e3a9bc94d09078a1fc046be53dbbd0d6240
USER root
ENV NODE_ENV=production PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer
RUN node -e "const fs=require('fs');const p=require('/home/pptruser/node_modules/puppeteer').executablePath();fs.accessSync(p,fs.constants.X_OK);fs.symlinkSync(p,'/usr/bin/chromium');if(process.versions.node.split('.')[0]!=='22')process.exit(1)"
WORKDIR /app/pdf-service
COPY --from=build /app/pdf-service/node_modules ./node_modules
COPY --from=build /app/pdf-service/dist ./dist
COPY pdf-service/package.json ./package.json
COPY pdf-service/src/ ./src/
COPY pdf-service/scripts/ ./scripts/
COPY backend/src/assets/document-fonts/ ./fonts/
EXPOSE 8080
CMD ["node", "src/server.cjs"]
