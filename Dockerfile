FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY prepare-model.sh ./
RUN sh prepare-model.sh

COPY faq-rag-v1-http-server.mjs faq-rag-v2-telegram-bot.mjs ./

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
