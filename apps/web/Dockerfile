FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter shared build && pnpm --filter web build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf.template /etc/nginx/templates-src/default.conf.template
COPY apps/web/docker-entrypoint.sh /docker-entrypoint.sh
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
RUN chmod +x /docker-entrypoint.sh
ENV API_UPSTREAM=http://api:3000
EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
