FROM node:22-alpine

WORKDIR /app

# Copy package files first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Expose web UI port
EXPOSE 3000

# Default: run the web server
CMD ["node", "bin/start-server.mjs", "--port", "3000"]
