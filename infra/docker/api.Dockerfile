FROM node:22-alpine AS build

WORKDIR /app
ARG NPM_CONFIG_REGISTRY=https://registry.npmmirror.com/
ENV NPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY}
ENV NPM_CONFIG_REPLACE_REGISTRY_HOST=always
ENV NPM_CONFIG_FETCH_RETRIES=5
ENV NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000
ENV NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm config get registry \
  && npm ci --include-workspace-root

COPY apps/api/prisma.config.ts apps/api/prisma.config.ts
COPY apps/api/prisma apps/api/prisma
RUN npm --workspace @site-management/api run prisma:generate

COPY apps/api apps/api
RUN npm --workspace @site-management/api run build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app
ARG NPM_CONFIG_REGISTRY=https://registry.npmmirror.com/
ENV NPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY}
ENV NPM_CONFIG_REPLACE_REGISTRY_HOST=always
ENV NPM_CONFIG_FETCH_RETRIES=5
ENV NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000
ENV NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/api/prisma.config.ts apps/api/prisma.config.ts
COPY apps/api/prisma apps/api/prisma
RUN npm config get registry \
  && npm ci --workspace @site-management/api --include-workspace-root --omit=dev --ignore-scripts \
  && npm --workspace @site-management/api run prisma:generate \
  && npm cache clean --force

COPY --from=build /app/apps/api/dist apps/api/dist

EXPOSE 4000
CMD ["npm", "--workspace", "@site-management/api", "run", "start"]
