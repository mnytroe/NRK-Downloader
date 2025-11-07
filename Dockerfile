# --- deps: verktøy + hent statisk yt-dlp + npm ci ---
FROM node:20-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
  curl ffmpeg ca-certificates git tini \
  && rm -rf /var/lib/apt/lists/*
# (pin evt. versjon med ARG YTDLP_VERSION=YYYY.MM.DD)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  -o /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp
WORKDIR /app
COPY package*.json ./
RUN npm ci

# --- build ---
FROM deps AS build
COPY . .
RUN npm run build

# --- runner: IKKE apt install yt-dlp her ---
FROM node:20-bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends \
  ffmpeg ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
# sørg for at ingen gammel /usr/bin/yt-dlp blir brukt
RUN rm -f /usr/bin/yt-dlp || true
# bruk binæren fra deps
COPY --from=deps /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1
RUN useradd -m -u 10001 appuser
USER appuser
COPY --chown=appuser:appuser --from=build /app/.next ./.next
COPY --chown=appuser:appuser --from=build /app/node_modules ./node_modules
COPY --chown=appuser:appuser --from=build /app/package*.json ./
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["npm","start"]
