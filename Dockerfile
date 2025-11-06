# --- deps: verktøy + npm ci + hent statisk yt-dlp ---
FROM node:20-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
  curl ffmpeg ca-certificates git tini \
  && rm -rf /var/lib/apt/lists/*

# Hent siste yt-dlp som statisk binær (ingen pip/PEP 668)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/download/2024.10.07/yt-dlp \
  -o /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app
COPY package*.json ./
RUN npm ci

# --- build: bygg Next ---
FROM deps AS build
COPY . .
# Hvis du ikke har /public i repoet, er dette fint. Hvis du vil være sikker, kan du:
# RUN mkdir -p public
RUN npm run build

# --- runner: slankt runtime-image, non-root, tini ---
FROM node:20-bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends \
  ffmpeg ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*

# Kopier yt-dlp-binæren fra deps
COPY --from=deps /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

# Kjør som non-root
RUN useradd -m -u 10001 appuser
USER appuser

# Kopier nødvendige runtime-artefakter
COPY --chown=appuser:appuser --from=build /app/.next ./.next
# COPY --chown=appuser:appuser --from=build /app/public ./public   # uncomment hvis du faktisk har /public
COPY --chown=appuser:appuser --from=build /app/node_modules ./node_modules
COPY --chown=appuser:appuser --from=build /app/package*.json ./

EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["npm","start"]
