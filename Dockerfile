FROM node:24 AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

RUN npm ci --only=production

FROM node:24
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production

ENV PORT=7860
EXPOSE 7860
CMD ["node", "dist/index.js"]
