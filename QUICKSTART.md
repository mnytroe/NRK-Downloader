# 🚀 Quick Start Guide

## Installer forutsetninger

### Windows (PowerShell som Administrator):
```powershell
# Installer Node.js, yt-dlp og ffmpeg
winget install OpenJS.NodeJS
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg

# Restart PowerShell etter installasjon
```

### macOS:
```bash
# Installer Homebrew hvis ikke allerede installert
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Installer avhengigheter
brew install node yt-dlp ffmpeg
```

### Linux (Ubuntu/Debian):
```bash
# Installer Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Installer ffmpeg
sudo apt update
sudo apt install ffmpeg

# Installer yt-dlp
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

## Verifiser installasjon

```bash
node --version    # Skal vise v18.x.x eller nyere
yt-dlp --version  # Skal vise versjonsnummer
ffmpeg -version   # Skal vise versjonsinformasjon
```

## Kjør applikasjonen

```bash
# 1. Installer Node-pakker
npm install

# 2. Start utviklingsserver
npm run dev

# 3. Åpne http://localhost:3000 i nettleseren
```

## Test nedlasting

Prøv en av disse NRK-linkene:
- https://tv.nrk.no/serie/dagsrevyen
- https://radio.nrk.no/

## Produksjonskjøring (Docker)

```bash
# Bygg Docker image
docker build -t nrk-downloader .

# Kjør container
docker run -p 3000:3000 nrk-downloader

# Åpne http://localhost:3000
```

## Trenger du hjelp?

Se [README.md](./README.md) for detaljert dokumentasjon og feilsøking.

