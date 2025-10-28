# NRK Nedlaster

En Next.js-applikasjon for å laste ned videoer fra NRK ved hjelp av yt-dlp og ffmpeg.

## 📋 Oversikt

Dette prosjektet lar brukere laste ned videoinnhold fra NRK sine offisielle plattformer. Applikasjonen:
- Støtter kun NRK-domener (sikkerhet)
- Streamer video direkte til brukerens enhet
- Håndterer avbrutt nedlasting
- Har innebygd rate limiting

## ⚙️ Forutsetninger

Du må ha følgende installert på systemet:

### 1. Node.js
- Versjon 18.0.0 eller nyere
- Last ned fra [nodejs.org](https://nodejs.org/)

### 2. yt-dlp
Installér via en av følgende metoder:

**Windows (med winget):**
```bash
winget install yt-dlp
```

**macOS (med Homebrew):**
```bash
brew install yt-dlp
```

**Linux:**
```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

### 3. ffmpeg
Installér via en av følgende metoder:

**Windows (med winget):**
```bash
winget install Gyan.FFmpeg
```

**macOS (med Homebrew):**
```bash
brew install ffmpeg
```

**Linux:**
```bash
sudo apt update
sudo apt install ffmpeg
```

### Verifiser installasjon
Sjekk at alt er installert korrekt:
```bash
node --version    # Skal vise v18.x.x eller nyere
yt-dlp --version  # Skal vise versjonsnummer
ffmpeg -version   # Skal vise versjonsinformasjon
```

## 🚀 Installasjon og kjøring

### 1. Installer avhengigheter
```bash
npm install
```

### 2. Kjør i utviklingsmodus
```bash
npm run dev
```

Åpne [http://localhost:3000](http://localhost:3000) i nettleseren.

### 3. Bygg for produksjon
```bash
npm run build
npm start
```

## 📁 Prosjektstruktur

```
nrk-downloader/
├── app/
│   ├── api/
│   │   └── download/
│   │       └── route.ts          # API route handler
│   ├── globals.css               # Global styles
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Main page (client component)
├── lib/
│   ├── filename.ts               # Filename sanitization
│   └── rateLimit.ts              # Rate limiting
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
└── README.md
```

## 🔒 Sikkerhet

### Domenebegrensning
Kun følgende NRK-domener er tillatt:
- `tv.nrk.no`
- `www.nrk.no`
- `nrk.no`
- `radio.nrk.no`

### Rate Limiting
- Maksimalt 5 forespørsler per minutt per IP-adresse
- In-memory implementation (for MVP)
- For produksjon: bruk Redis eller lignende distribuert cache

### Filnavn
- Alle filnavn saniteres for å fjerne farlige tegn
- Maksimal lengde: 120 tegn
- Path separators og spesialtegn fjernes

## 🐋 Produksjonskjøring (Anbefalt: Docker)

**VIKTIG:** For produksjonskjøring anbefales det sterkt å kjøre applikasjonen i en Docker-container eller dedikert VM, **IKKE** på serverless plattformer som Vercel.

### Hvorfor ikke serverless?

1. **Lange streams**: Videoer kan ta flere minutter å laste ned
2. **CPU-intensivt**: ffmpeg remuxing krever betydelig CPU
3. **Timeout-begrensninger**: Serverless har typisk 10-30s timeout
4. **Memory-begrensninger**: Store videofiler krever mer minne

### Docker-oppsett (eksempel)

Lag en `Dockerfile`:

```dockerfile
FROM node:18-alpine

# Installer ffmpeg og yt-dlp
RUN apk add --no-cache ffmpeg python3 py3-pip
RUN pip3 install yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

Bygg og kjør:
```bash
docker build -t nrk-downloader .
docker run -p 3000:3000 nrk-downloader
```

## 🛠️ Teknisk implementasjon

### Streaming-strategi

**Primær:** stdout streaming
- yt-dlp skriver direkte til stdout (`-o -`)
- Piped til NextResponse via Web ReadableStream
- Raskest og mest minneeffektiv

**Fallback:** Temp file
- Hvis stdout feiler (fragmenterte streams)
- Last ned til midlertidig fil
- Stream med `fs.createReadStream`
- Automatisk opprydding etter nedlasting

### Format-håndtering

Applikasjonen prøver å levere MP4 når mulig:
```
-f "bv*[ext=mp4][vcodec*=avc1]+ba[ext=m4a]/b[ext=mp4]/best"
--remux-video mp4
```

Hvis MP4 ikke er mulig, fall tilbake til original container med korrekt Content-Type.

### Abort-håndtering

**Klient:**
- `AbortController` stopper fetch-request
- UI oppdateres umiddelbart

**Server:**
- Lytter på `req.signal.addEventListener('abort')`
- Sender `SIGKILL` til yt-dlp child process
- Rydder opp midlertidige filer

## ⚖️ Juridisk

**VIKTIG:** Dette verktøyet er kun for personlig bruk av innhold du har lov til å laste ned.

- Brukeren er ansvarlig for å overholde NRKs retningslinjer
- Last kun ned innhold du har rettigheter til
- Respektér opphavsrett og lisensvilkår

## 🐛 Feilsøking

### "yt-dlp not found"
- Sjekk at yt-dlp er i PATH: `yt-dlp --version`
- På Windows: restart terminal etter installasjon

### "ffmpeg not found"
- Sjekk at ffmpeg er i PATH: `ffmpeg -version`
- På Windows: legg til i System Environment Variables

### "Rate limit exceeded"
- Vent 1 minutt og prøv igjen
- Eller restart serveren for å resette in-memory teller

### Nedlasting feiler
- Sjekk at URL-en er gyldig og tilgjengelig på NRK
- Sjekk at du har internettforbindelse
- Se server-logs for detaljert feilmelding

### Timeout på store filer
- Øk `maxDuration` i `app/api/download/route.ts`
- For Vercel: vurder annen hosting-løsning

## ✨ Nye funksjoner

### v1.2.0 (Aktuell)
- ✅ **Klassisk minimalistisk design** - Rent, enkelt UI uten unødvendige effekter
- ✅ **Optimalisert layout** - Ingen scrolling nødvendig, alt synlig på skjermen
- ✅ **Forbedret dark mode** - Mørkere bakgrunn for bedre kontrast
- ✅ **Fjernet "NRK URL"-label** - Mer kompakt design

### v1.1.0
- ✅ **Strukturert logging og monitoring** - Bedre feilsøking og overvåking
- ✅ **Fremdriftsindikator** - Viser prosent, nedlastede/totale bytes og gjenstående tid
- ✅ **Drag & Drop** - Dra og slipp NRK URL-er direkte fra nettleseren
- ✅ **Forbedrede loading-animasjoner** - Moderne spinner og animert progress bar
- ✅ **Clipboard-støtte** - Lim inn URL-er med Ctrl+V

## 📝 Fremtidige forbedringer

- [ ] Støtte for undertekster
- [ ] Valg av videokvalitet (720p, 1080p, etc.)
- [ ] Historikk over nedlastede videoer
- [ ] HEAD-request for å hente metadata før nedlasting
- [ ] Redis-basert rate limiting for skalerbarhet
- [ ] Queue-system for samtidige nedlastinger
- [ ] Administratorpanel med statistikk

## 📄 Lisens

Dette prosjektet er laget for personlig bruk. Vennligst bruk ansvarlig og i henhold til gjeldende lover og NRKs retningslinjer.

---

**Laget med ❤️ og Next.js**

