# Changelog

Alle notable endringer i dette prosjektet vil bli dokumentert i denne filen.

Formatet er basert på [Keep a Changelog](https://keepachangelog.com/no/1.0.0/),
og dette prosjektet følger [Semantic Versioning](https://semver.org/lang/no/).

## [1.2.0] - 2024-12-XX

### 🎨 Design
- **BREAKING**: Nytt klassisk minimalistisk design
  - Ren hvit bakgrunn i light mode
  - Mørk grå bakgrunn i dark mode
  - Fjernet alle gradients, glassmorphism og fancy-effekter
  - Enkle borders og subtile hover-effekter

### 📐 Layout
- Optimalisert spacing for å unngå scrolling
- Redusert padding fra `p-8` til `p-6`
- Redusert spacing fra `space-y-6` til `space-y-4`
- Fjernet "NRK URL"-label for mer kompakt design
- Mindre padding i alle komponenter

### 🎨 UI-forbedringer
- Forbedret kontrast i dark mode
- Renere fargepalett (grayscale-basert)
- Mindre avrundede hjørner (`rounded-lg` i stedet for `rounded-xl`)
- Subtilere skygger

### 🐛 Bugfixes
- Fikset fargeproblemer i nederste del av siden
- Info-cards har nå riktig glassmorphism-effekt

## [1.1.0] - 2024-XX-XX

### 🆕 Nye funksjoner
- Strukturert logging og monitoring
  - Bedre feilsøking og overvåking
  - Request ID tracking
  - Debug-modus i development

- Drag & Drop støtte
  - Dra og slipp NRK URL-er fra nettleseren
  - Visuell feedback ved drag over
  - Automatisk URL-rensning

- Clipboard-integrasjon
  - Lim inn URL-er med Ctrl+V
  - Automatisk detektering av NRK URL-er

- Forbedrede loading-animasjoner
  - Moderne spinner
  - Animated progress bar
  - Bedre UX under nedlasting

### 🔧 Forbedringer
- Forbedret error handling
- Bedre rate limiting
- Optimalisert filename sanitization
- Forbedret abort-håndtering

### 🔒 Sikkerhet
- Strengere URL-validering
- Bedre domain whitelisting
- Forbedret rate limiting per IP

## [1.0.0] - 2024-XX-XX

### 🎉 Første release
- NRK video nedlasting via yt-dlp
- Streaming-støtte
- Dark/light mode toggle
- Rate limiting
- Filename sanitization
- Abort-håndtering

[1.2.0]: https://github.com/mnytroe/NRK-Downloader/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/mnytroe/NRK-Downloader/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/mnytroe/NRK-Downloader/releases/tag/v1.0.0

