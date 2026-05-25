FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY dist/ ./dist/

ENV PORT=8080
ENV DB_PATH=/data/relay.db

RUN mkdir -p /data

EXPOSE 8080

CMD ["node", "dist/index.js"]
