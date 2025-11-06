import punycode from "punycode";

export function normalizeHost(host: string) {
  let h = host.trim().toLowerCase();
  if (h.startsWith("www.")) h = h.slice(4);
  try { 
    h = punycode.toASCII(h); 
  } catch {
    // Hvis punycode feiler, bruk original
  }
  return h;
}

export function isIpLike(host: string) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true; // IPv4
  if (host === "localhost") return true;
  if (host.includes(":")) return true; // mulig IPv6
  return false;
}

export function isAllowedUrl(urlStr: string, allowList: string[]) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:") return false; // lås til HTTPS
    const host = normalizeHost(u.hostname);
    if (isIpLike(host)) return false;
    if (!allowList.includes(host)) return false; // eksakt host-match
    
    // Additional validation: Block series pages (not specific episodes)
    // For tv.nrk.no and radio.nrk.no, check if it's a series page
    if (host === 'tv.nrk.no' || host === 'radio.nrk.no') {
      const path = u.pathname.toLowerCase();
      if (path.startsWith('/serie/')) {
        const pathParts = path.split('/').filter(p => p.length > 0);
        // If it's just /serie/serie-name (2 parts), it's a series page, not an episode
        if (pathParts.length === 2) {
          return false; // Block series pages, require specific episode
        }
      }
    }
    
    // For nrk.no and www.nrk.no, require a path that looks like a video URL
    if (host === 'nrk.no' || host === 'www.nrk.no') {
      const path = u.pathname.toLowerCase();
      
      // Block root path (front page)
      if (path === '/' || path === '') {
        return false;
      }
      
      // Allow paths that look like video URLs
      const videoPathPatterns = [
        /^\/video\//,
        /^\/serie\//,
        /^\/program\//,
        /^\/podkast\//,
        /^\/radio\//,
        /^\/tv\//,
        /^\/super\//,
        /^\/p3\//,
      ];
      
      return videoPathPatterns.some(pattern => pattern.test(path));
    }
    
    return true;
  } catch {
    return false;
  }
}

