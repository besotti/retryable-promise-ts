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

  // nested (e.g., cause.response)
  cause?: { response?: HttpResponseLike };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isHeadersLike = (h: unknown): h is Headers =>
  isObject(h) && typeof (h as unknown as Headers).get === 'function';

const toFiniteNumber = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

const getHeader = (headers: HeaderContainer, key: string): string | undefined => {
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
};

const pickHeaders = (err: ErrorWithResponseLike): HeaderContainer | undefined =>
  err.response?.headers ?? err.headers ?? err.cause?.response?.headers;

const pickStatus = (err: ErrorWithResponseLike): number | undefined =>
  err.response?.status ?? err.status ?? err.cause?.response?.status;

export const extractRetryAfterMs = (err: unknown): number | undefined => {
  if (isObject(err)) {
    const e = err as ErrorWithResponseLike;

    const raMs = toFiniteNumber(e.retryAfterMs);
    if (typeof raMs === 'number') return raMs;

    const headers = pickHeaders(e);
    const status = pickStatus(e);

    if (headers) {
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

      const reset =
        getHeader(headers, 'x-ratelimit-reset') ??
        getHeader(headers, 'x-rate-limit-reset') ??
        getHeader(headers, 'rate-limit-reset');

      const ts = toFiniteNumber(reset);
      if (ts !== undefined) {
        const epochMs = ts > 10_000_000_000 ? ts : ts * 1000;
        const ms = epochMs - Date.now();
        if (ms > 0) return ms;
      }
    }

    if (status === 429 || status === 503) return 1000;
  }

  return undefined;
};
