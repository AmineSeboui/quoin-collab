# The server is bundled to one file, so the image carries no workspace layout and no build tooling.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
RUN npm ci --no-audit --no-fund \
  && npm run build:bundle --workspace quoin-collab-server

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=1234
# Left out of the bundle: ws is CommonJS, and the two stores are loaded by name only when a URL asks for them.
RUN npm install --no-save --omit=dev --no-audit --no-fund ws@8 pg@8 ioredis@5
COPY --from=build /app/packages/server/bundle/cli.js ./cli.js
COPY LICENSE THIRD_PARTY_NOTICES.md ./
USER node
EXPOSE 1234
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||1234)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "cli.js"]
