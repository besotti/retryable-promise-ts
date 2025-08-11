type HeaderValue = string | number | undefined;
type HeaderRecord = Record<string, HeaderValue>;
type HeaderContainer = Headers | HeaderRecord;

interface HttpResponseLike {
  status?: number;
  headers?: HeaderContainer;
}

interface ErrorWithResponseLike {
  // Custom fast-path
  retryAfterMs?: unknown;

  // Axios-/custom-Style
  response?: HttpResponseLike;
  headers?: HeaderContainer;
  status?: number;

  // verschachtelt (z. B. cause.response)
  cause?: { response?: HttpResponseLike };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isHeadersLike(h: unknown): h is Headers {
  return isObject(h) && typeof (h as unknown as Headers).get === 'function';
}

function toFiniteNumber(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function getHeader(headers: HeaderContainer, key: string): string | undefined {
  try {
    if (isHeadersLike(headers)) {
      const v = headers.get(key);
      return v ?? undefined;
    }
    const low = key.toLowerCase();
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === low) {
        const val = headers[k];
        return typeof val === 'string' || typeof val === 'number' ? String(val) : undefined;
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

function pickHeaders(err: ErrorWithResponseLike): HeaderContainer | undefined {
  return err.response?.headers ?? err.headers ?? err.cause?.response?.headers;
}

function pickStatus(err: ErrorWithResponseLike): number | undefined {
  return err.response?.status ?? err.status ?? err.cause?.response?.status;
}

export const extractRetryAfterMs = (err: unknown): number | undefined => {
  if (isObject(err)) {
    const e = err as ErrorWithResponseLike;

    // direct custom field
    const raMs = toFiniteNumber(e.retryAfterMs);
    if (typeof raMs === 'number') return raMs;

    const headers = pickHeaders(e);
    const status = pickStatus(e);

    if (headers) {
      // Retry-After: seconds or HTTP-date
      const ra = getHeader(headers, 'Retry-After') ?? getHeader(headers, 'retry-after');
      if (ra !== undefined) {
        const secs = toFiniteNumber(ra);
        if (secs !== undefined) return Math.max(0, secs * 1000);

        const date = Date.parse(ra);
        if (!Number.isNaN(date)) {
          const ms = date - Date.now();
          if (ms > 0) return ms;
        }
      }

      // X-RateLimit-Reset variants: epoch seconds or ms
      const reset =
        getHeader(headers, 'x-ratelimit-reset') ??
        getHeader(headers, 'x-rate-limit-reset') ??
        getHeader(headers, 'rate-limit-reset');

      const ts = toFiniteNumber(reset);
      if (ts !== undefined) {
        // Heuristic: values > 10_000_000_000 ms, otherwise seconds
        const epochMs = ts > 10_000_000_000 ? ts : ts * 1000;
        const ms = epochMs - Date.now();
        if (ms > 0) return ms;
      }
    }

    if (status === 429 || status === 503) return 1000; // softer Default
  }

  return undefined;
};
