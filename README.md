# NRK Nedlaster

En Next.js-applikasjon for å laste ned videoer fra NRK ved hjelp av yt-dlp og ffmpeg.

## 📋 Oversikt

Dette prosjektet lar brukere laste ned videoinnhold fra NRK sine offisielle plattformer. Applikasjonen:
- Støtter kun NRK-domener (sikkerhet)
- Viser metadata (tittel, beskrivelse, kvaliteter) før nedlasting
- Lar brukeren velge ønsket videokvalitet (`format_id`)
- Streamer video direkte til brukerens enhet
- Håndterer avbrutt nedlasting
- Har innebygd rate limiting

## ⚙️ Forutsetninger (uten Docker)

Du må ha følgende installert dersom du kjører lokalt:

### 1. Node.js
- Versjon 18.0.0 eller nyere
- Last ned fra [nodejs.org](https://nodejs.org/)

### 2. yt-dlp
Installer via en av følgende metoder:

```bash
# Windows (winget)
winget install yt-dlp

# macOS (Homebrew)
brew install yt-dlp

# Linux
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

### 3. ffmpeg
```bash
# Windows (winget)
winget install Gyan.FFmpeg

# macOS (Homebrew)
brew install ffmpeg

# Linux
sudo apt update
sudo apt install ffmpeg
```

### Verifiser installasjon
```bash
node --version    # v18.x.x eller nyere
yt-dlp --version
ffmpeg -version
```

## 🚀 Installasjon og kjøring (lokalt)

```bash
npm install
npm run dev   # utviklingsmodus på http://localhost:3000

npm run build
npm start     # produksjonsbuild
```

**Merk:** Se `.env.example` for miljøvariabler (`ALLOW_DOMAINS`, `RATE_LIMIT_PER_MINUTE`, `REDIS_URL`, `TMP_DIR`, `LOG_LEVEL`, ...).

## 📁 Prosjektstruktur

```
nrk-downloader/
├── app/
│   ├── api/
│   │   ├── download/route.ts      # Nedlasting
│   │   └── inspect/route.ts       # Metadata (yt-dlp --dump-single-json)
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── env.ts
│   ├── filename.ts
│   ├── host.ts
│   ├── rateLimit.ts
│   └── redis.ts
├── nginx/example.conf
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## 🔒 Sikkerhet

### Domenebegrensning
`ALLOW_DOMAINS` (kommaseparert) styrer hvilke domener som tillates.
Standard:
- `tv.nrk.no`
- `www.nrk.no`
- `nrk.no`
- `radio.nrk.no`
- `nrkbeta.no`

### Rate limiting
- `RATE_LIMIT_PER_MINUTE` (standard 30/min)
- Redis-støtte for distribuert rate limiting
- Fallback til in-memory (sliding window)

### Filnavn
- Sanitiseres for farlige tegn
- Maks 120 tegn
- Ingen path-separatorer

## 🐋 Produksjon med Docker

Multi-stage Dockerfile installerer verktøy, henter statisk `yt-dlp_linux` og bygger Next.

```dockerfile
# deps: verktøy + yt-dlp + npm ci
FROM node:20-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
  curl ffmpeg ca-certificates git tini \
  && rm -rf /var/lib/apt/lists/*
ARG YTDLP_VERSION=2025.10.22
RUN curl -L "https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp_linux" \
  -o /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp
WORKDIR /app
COPY package*.json ./
RUN npm ci

# build Next
FROM deps AS build
COPY . .
RUN npm run build

# runtime: non-root, tini
FROM node:20-bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends \
  ffmpeg ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
RUN rm -f /usr/bin/yt-dlp || true
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
```

```bash
docker build -t nrk-downloader .
docker run -p 3000:3000 nrk-downloader
# eller
docker compose up -d --build
```

### Nginx + TLS (hurtigoppsett)
```bash
sudo cp nginx/example.conf /etc/nginx/sites-available/your-domain.conf
sudo ln -s /etc/nginx/sites-available/your-domain.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example.com --redirect
```

## 🛠️ Teknisk

### Metadata-inspeksjon
- Frontend kaller `/api/inspect` (yt-dlp `--dump-single-json`).
- Viser tittel, beskrivelser, varighet, thumbnail og alle tilgjengelige formater.
- Bruker kan velge `format_id` før nedlasting.
- Sendes videre til `/api/download` som bruker `-f <format>`.

### Streaming
- **Primær:** yt-dlp -> stdout -> abort-sikker `ReadableStream`.
- **Fallback:** nedlasting til temp-katalog og streaming via `createReadStream` (auto-opprydding).

### Abort-håndtering
- Klient: `AbortController` oppdaterer UI og sender abort-signal.
- Server: lytter på `req.signal`, sender `SIGTERM`/`SIGKILL`, rydder tmp-filer.

## ⚖️ Juridisk

Dette verktøyet er kun for personlig bruk av innhold du har lov til å laste ned. Brukeren er ansvarlig for å følge NRKs retningslinjer og gjeldende lovverk.

## 🐛 Feilsøking

| Problem               | Løsning |
| --------------------- | ------- |
| `yt-dlp not found`    | Sjekk PATH, restart terminal, sørg for installasjon |
| `ffmpeg not found`    | Installer ffmpeg, legg i PATH |
| `Rate limit exceeded` | Vent litt, eller restart server (resetter in-memory) |
| Nedlasting feiler     | Kontroller URL, nettverk og server-logs |
| Timeout på store filer| Øk `maxDuration`, vurder annen hosting enn serverless |

## ✨ Nye funksjoner

### v1.2.0
- Metadata-inspeksjon før nedlasting
- Kvalitetsvalg (`format_id`)
- Abort-sikker yt-dlp-håndtering
- Oppdatert Dockerfile (statisk yt-dlp, non-root runtime)
- Forbedret dark mode

### v1.1.0
- Strukturert logging & monitoring
- Fremdriftsindikator
- Drag & Drop
- Forbedrede loading-animasjoner
- Clipboard-støtte

## 📝 Fremtidige forbedringer
- [ ] Støtte for undertekster
- [ ] Historikk over nedlastinger
- [ ] Queue for samtidige nedlastinger
- [ ] Administratorpanel/statistikk

## 📄 Lisens
Prosjektet er laget for personlig bruk. Benytt med ansvar og i tråd med NRKs retningslinjer.

---
Laget med ❤️ og Next.js
