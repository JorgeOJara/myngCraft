FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

COPY --chown=bun:bun server.js ./
COPY --chown=bun:bun lib ./lib
COPY --chown=bun:bun views ./views
COPY --chown=bun:bun public ./public

RUN mkdir -p /app/data /app/public/uploads && chown -R bun:bun /app/data /app/public/uploads

USER bun
EXPOSE 1010

CMD ["bun", "run", "start"]
