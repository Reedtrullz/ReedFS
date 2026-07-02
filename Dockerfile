FROM node:22-alpine@sha256:ab07539e0988b63558ff621f5fbe1077054c39d9809112974fb79993949d41cd AS builder

ARG RFS_COMMIT_SHA=unknown
ARG RFS_IMAGE_REF=unknown
ARG RFS_IMAGE_DIGEST=unknown
ARG RFS_VERSION=0.0.0
ARG VITE_CESIUM_ION_TOKEN=

# Build RFS
RUN apk add --no-cache git
WORKDIR /app
# Install deps first (file:../RFMS/shared resolves to /RFMS/shared)
COPY package*.json ./
COPY scripts/bootstrap-rfms-shared.mjs scripts/bootstrap-rfms-shared.mjs
RUN node scripts/bootstrap-rfms-shared.mjs
RUN npm ci --legacy-peer-deps
# Copy source and build
COPY . .
ENV RFS_COMMIT_SHA=${RFS_COMMIT_SHA} \
  RFS_IMAGE_REF=${RFS_IMAGE_REF} \
  RFS_IMAGE_DIGEST=${RFS_IMAGE_DIGEST} \
  RFS_VERSION=${RFS_VERSION} \
  VITE_CESIUM_ION_TOKEN=${VITE_CESIUM_ION_TOKEN}
RUN npm run build

FROM nginx:alpine@sha256:20316569d8f81a160065d7d2a5eeffc7ca97d79022462ee255fd23fa103a6b5c
RUN apk upgrade --no-cache libcrypto3 libssl3 libxml2 libexpat
ARG RFS_COMMIT_SHA=unknown
ARG RFS_IMAGE_REF=unknown
ARG RFS_VERSION=0.0.0
LABEL org.opencontainers.image.title="RFS" \
  org.opencontainers.image.description="Reidar Flight Simulator web app" \
  org.opencontainers.image.revision="${RFS_COMMIT_SHA}" \
  org.opencontainers.image.version="${RFS_VERSION}" \
  org.opencontainers.image.source="https://github.com/Reedtrullz/ReedFS" \
  org.opencontainers.image.ref.name="${RFS_IMAGE_REF}"
COPY --from=builder --chown=101:101 /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
EXPOSE 8080
USER 101:101
CMD ["nginx", "-g", "daemon off;"]
