export type NormalizedError = {
  code: string;
  title: string;
  message: string;
  hint?: string;
  details?: string;
  retryAfterMs?: number;
};

type MapCodeArgs = {
  code: string;
  status: number;
  raw: string;
  j?: Record<string, unknown>;
};

export async function normalizeResponseError(res: Response): Promise<NormalizedError> {
  const ct = res.headers.get('content-type') || '';
  let raw = '';

  try {
    raw = await res.text();
  } catch {
    raw = '';
  }

  if (ct.includes('application/json')) {
    try {
      const j = JSON.parse(raw);
      const code = (j.code || j.error || res.statusText || 'UNKNOWN').toString().toUpperCase();
      return mapCode({ code, status: res.status, raw, j });
    } catch {
      // fallthrough if JSON parsing fails
    }
  }

  if (ct.includes('text/html')) {
    const base: NormalizedError = {
      code: `HTTP_${res.status}`,
      title: 'Ukjent feil',
      message: 'Noe gikk galt under nedlasting.',
      hint: 'Prøv igjen. Vedvarende feil? Send feilkoden til utvikler.',
      details: raw.slice(0, 4000),
    };

    if (res.status === 504) {
      return {
        code: 'GATEWAY_TIMEOUT',
        title: 'Tidsavbrudd',
        message: 'Tjenesten brukte for lang tid på å hente videostrømmen.',
        hint: 'Prøv igjen, eller velg lavere kvalitet. Kan være midlertidig tregt hos NRK.',
        details: raw.slice(0, 4000),
      };
    }

    if (res.status === 502 || res.status === 503) {
      return {
        code: 'UPSTREAM_UNAVAILABLE',
        title: 'Tjenesten er utilgjengelig',
        message: 'Mellomtjeneren svarte ikke som forventet.',
        hint: 'Prøv igjen om litt.',
        details: raw.slice(0, 4000),
      };
    }

    return base;
  }

  return {
    code: `HTTP_${res.status}`,
    title: 'Ukjent feil',
    message: 'Noe gikk galt under nedlasting.',
    hint: 'Prøv igjen. Vedvarende feil? Send feilkoden til utvikler.',
    details: raw.slice(0, 4000),
  };
}

function mapCode({ code, status, raw, j }: MapCodeArgs): NormalizedError {
  const normalizedCode = code.toUpperCase();
  const jsonHint = typeof j?.hint === 'string' ? j.hint : undefined;
  const jsonMessage = typeof j?.message === 'string' ? j.message.trim() : '';
  const jsonDetails = typeof j?.details === 'string' ? j.details : raw;
  const jsonRetry = typeof j?.retryAfterMs === 'number' ? Number(j.retryAfterMs) : undefined;

  switch (normalizedCode) {
    case 'DOMAIN_NOT_ALLOWED':
      return {
        code: normalizedCode,
        title: 'Ugyldig domene',
        message: jsonMessage || 'Denne URL-en er ikke fra en støttet NRK-adresse.',
        hint: jsonHint || 'Bruk en URL fra tv.nrk.no eller radio.nrk.no.',
      };
    case 'INVALID_URL':
      return {
        code: normalizedCode,
        title: 'Ugyldig URL',
        message: jsonMessage || 'Kunne ikke tolke adressen du limte inn.',
        hint: jsonHint || 'Sjekk at URL-en er komplett og uten mellomrom.',
      };
    case 'MISSING_URL':
      return {
        code: normalizedCode,
        title: 'URL mangler',
        message: jsonMessage || 'Vennligst oppgi en NRK-adresse.',
        hint: jsonHint,
      };
    case 'NOT_VIDEO_PAGE':
      return {
        code: normalizedCode,
        title: 'Fant ingen video',
        message: jsonMessage || 'Forsiden er ikke en video. Lim inn en direkte videolenke.',
        hint: jsonHint || 'Åpne videoen du ønsker, og kopier lenken fra adresselinjen.',
      };
    case 'SERIES_PAGE':
      return {
        code: normalizedCode,
        title: 'Serie uten episode',
        message: jsonMessage || 'Dette er en serie-side uten konkret episode.',
        hint: jsonHint || 'Velg en spesifikk episode før du kopierer lenken.',
      };
    case 'RATE_LIMITED':
    case 'TOO_MANY_REQUESTS':
      return {
        code: normalizedCode,
        title: 'For mange forsøk',
        message: jsonMessage || 'Du har nådd grensen for nedlastinger per minutt.',
        hint: jsonHint || 'Vent litt og prøv igjen.',
        retryAfterMs: jsonRetry ?? 60_000,
      };
    case 'YTDLP_START_TIMEOUT':
      return {
        code: normalizedCode,
        title: 'Tidsavbrudd ved oppstart',
        message: jsonMessage || 'Kunne ikke starte nedlastingen i tide.',
        hint: jsonHint || 'Prøv igjen eller velg lavere kvalitet.',
        details: jsonDetails.slice(0, 4000),
      };
    case 'YTDLP_FAILED':
      return {
        code: normalizedCode,
        title: 'Nedlasting feilet',
        message: jsonMessage || 'yt-dlp rapporterte en feil under nedlastingen.',
        hint: jsonHint || 'Prøv igjen, eller forsøk en annen kvalitet.',
        details: jsonDetails.slice(0, 4000),
      };
    case 'EMPTY_DOWNLOAD':
      return {
        code: normalizedCode,
        title: 'Tom fil mottatt',
        message: jsonMessage || 'Serveren returnerte en tom videofil.',
        hint: jsonHint || 'Prøv igjen, eller kontroller at videoen er tilgjengelig.',
      };
    default:
      return {
        code: normalizedCode,
        title: 'Feil',
        message: jsonMessage || `Noe gikk galt. (HTTP ${status})`,
        hint: jsonHint,
        details: jsonDetails.slice(0, 4000),
        retryAfterMs: jsonRetry,
      };
  }
}

