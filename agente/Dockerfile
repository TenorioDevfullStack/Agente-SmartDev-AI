FROM node:22-alpine

WORKDIR /app

# Instala dependências primeiro (melhora o cache de build)
COPY package.json package-lock.json ./
RUN npm ci

# Copia o restante do código
COPY . .

# Sobe o agente
CMD ["node", "--import", "tsx", "server.ts"]
