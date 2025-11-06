# Multi-stage: mindre image, non-root, tini, ffmpeg + yt-dlp
FROM node:20-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg ca-certificates git tini \
  && rm -rf /var/lib/apt/lists/*
RUN pip3 install --no-cache-dir yt-dlp
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN useradd -m -u 10001 appuser
USER appuser
COPY --chown=appuser:appuser --from=build /app/.next ./.next
COPY --chown=appuser:appuser --from=build /app/node_modules ./node_modules
COPY --chown=appuser:appuser --from=build /app/package*.json ./
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["npm","start"]
