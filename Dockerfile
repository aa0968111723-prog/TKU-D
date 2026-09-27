FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build \
  && mkdir -p .next/standalone/.next \
  && cp -r .next/static .next/standalone/.next/static \
  && cp -r db .next/standalone/db
ENV NODE_ENV=production
ENV DATA_DIR=/data
EXPOSE 3000
WORKDIR /app/.next/standalone
CMD ["node", "server.js"]
