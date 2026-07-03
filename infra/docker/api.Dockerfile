FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --include-workspace-root

COPY apps/api/prisma apps/api/prisma
RUN npm --workspace @site-management/api run prisma:generate

COPY apps/api apps/api
RUN npm --workspace @site-management/api run build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/api/prisma apps/api/prisma
RUN npm ci --workspace @site-management/api --include-workspace-root --omit=dev --ignore-scripts \
  && npm --workspace @site-management/api run prisma:generate \
  && npm cache clean --force

COPY --from=build /app/apps/api/dist apps/api/dist

EXPOSE 4000
CMD ["npm", "--workspace", "@site-management/api", "run", "start"]
