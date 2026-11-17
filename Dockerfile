FROM node:22-slim

WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY config ./config
COPY src ./src
RUN npx tsc

EXPOSE 8000
CMD ["node", "dist/server.js"]
