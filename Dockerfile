# Build frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# Production: Express serves API + static frontend
FROM node:22-alpine
WORKDIR /app

COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev

COPY server/ ./
COPY --from=frontend-builder /app/dist ./public

ENV PORT=80
ENV NODE_ENV=production

EXPOSE 80

CMD ["node", "index.js"]
