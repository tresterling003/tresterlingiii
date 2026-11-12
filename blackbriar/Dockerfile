FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=8080 ROOMS_DIR=/data/rooms
EXPOSE 8080
CMD ["node", "server.js"]
