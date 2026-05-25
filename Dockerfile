FROM node:22-alpine AS builder

# Clone RFMS for shared/ types (needed by RFS @shared imports)
RUN apk add --no-cache git
WORKDIR /
RUN git clone --depth 1 https://github.com/Reedtrullz/RFMC.git RFMS

# Build RFS
WORKDIR /app
# Install deps first (file:../RFMS/shared resolves to /RFMS/shared)
COPY package*.json ./
RUN npm install --legacy-peer-deps
# Copy source and build
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:80/ || exit 1
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
