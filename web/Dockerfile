FROM oven/bun:1.4 AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.json ./
COPY patches patches
COPY apps/web/package.json apps/web/
COPY packages/jsx/package.json packages/jsx/
RUN bun install --frozen-lockfile --ignore-scripts
COPY apps apps
COPY packages packages
RUN cd apps/web && bun run build

FROM oven/bun:1.4-slim
WORKDIR /app/apps/web
COPY --from=build /app /app
ENV NODE_ENV=production DATABASE_PATH=/data/app.db PORT=3123 BACKUP_ENABLED=true
EXPOSE 3123
CMD ["bun", "run", "src/server.ts"]
