FROM node:22-alpine@sha256:968df39aedcea65eeb078fb336ed7191baf48f972b4479711397108be0966920 AS builder

ARG RFS_COMMIT_SHA=unknown
ARG RFS_IMAGE_REF=unknown
ARG RFS_IMAGE_DIGEST=unknown
ARG RFS_VERSION=0.0.0

# Clone RFMS for shared/ types (needed by RFS @shared imports) at the audited RFMC/RFMS commit.
RUN apk add --no-cache git
WORKDIR /
RUN git init RFMS \
  && git -C RFMS remote add origin https://github.com/Reedtrullz/RFMC.git \
  && git -C RFMS fetch --depth 1 origin 810fc9652da431eaf8978b85bf4af131605559b5 \
  && git -C RFMS checkout --detach FETCH_HEAD

# Build RFS
WORKDIR /app
# Install deps first (file:../RFMS/shared resolves to /RFMS/shared)
COPY package*.json ./
RUN npm ci --legacy-peer-deps
# Copy source and build
COPY . .
ENV RFS_COMMIT_SHA=${RFS_COMMIT_SHA} \
  RFS_IMAGE_REF=${RFS_IMAGE_REF} \
  RFS_IMAGE_DIGEST=${RFS_IMAGE_DIGEST} \
  RFS_VERSION=${RFS_VERSION}
RUN npm run build

FROM nginx:alpine@sha256:8b1e78743a03dbb2c95171cc58639fef29abc8816598e27fb910ed2e621e589a
ARG RFS_COMMIT_SHA=unknown
ARG RFS_IMAGE_REF=unknown
ARG RFS_VERSION=0.0.0
LABEL org.opencontainers.image.title="RFS" \
  org.opencontainers.image.description="Reidar Flight Simulator web app" \
  org.opencontainers.image.revision="${RFS_COMMIT_SHA}" \
  org.opencontainers.image.version="${RFS_VERSION}" \
  org.opencontainers.image.source="https://github.com/Reedtrullz/ReedFS" \
  org.opencontainers.image.ref.name="${RFS_IMAGE_REF}"
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:80/ || exit 1
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
