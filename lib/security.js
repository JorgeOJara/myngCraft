const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DEFAULT_MAX_KEYS = 5000;

export function assertSecureProductionConfig() {
  if (process.env.NODE_ENV !== "production") return;

  const problems = [];
  const sessionSecret = String(process.env.SESSION_SECRET || "");
  const adminPassword = String(process.env.ADMIN_PASSWORD || "");
  const adminPasswordHash = String(process.env.ADMIN_PASSWORD_HASH || "");

  if (sessionSecret.length < 32 || sessionSecret === "local-development-secret-change-before-sharing") {
    problems.push("SESSION_SECRET must contain at least 32 private characters");
  }
  if (!adminPasswordHash && (adminPassword.length < 14 || adminPassword === "change-me-now")) {
    problems.push("ADMIN_PASSWORD must contain at least 14 characters");
  }
  if (adminPasswordHash && (!/^\$(?:argon2(?:id|i|d)|2[aby])\$/.test(adminPasswordHash) || adminPasswordHash.length < 40)) {
    problems.push("ADMIN_PASSWORD_HASH is not a valid password hash");
  }
  if (String(process.env.COOKIE_SECURE).toLowerCase() !== "true") {
    problems.push("COOKIE_SECURE must be true");
  }

  if (problems.length) {
    throw new Error(`Refusing to start with unsafe production settings: ${problems.join("; ")}`);
  }
}

export function applySecurityHeaders(req, res, next) {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self' https://fonts.gstatic.com",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "worker-src 'none'",
  ];
  if (process.env.NODE_ENV === "production") directives.push("upgrade-insecure-requests");

  res.setHeader("Content-Security-Policy", directives.join("; "));
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Origin-Agent-Cluster", "?1");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("X-Download-Options", "noopen");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader("X-XSS-Protection", "0");
  next();
}

export function protectPrivateResponses(req, res, next) {
  const privatePath = req.path === "/checkout"
    || req.path.startsWith("/account")
    || req.path.startsWith("/admin")
    || req.path.startsWith("/api/account")
    || req.path.startsWith("/api/orders")
    || req.path.startsWith("/order/");

  if (privatePath) {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
  }
  next();
}

export function requireSameOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const fetchSite = String(req.get("sec-fetch-site") || "").toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return res.status(403).type("text/plain").send("This request was blocked for your security.");
  }

  const origin = req.get("origin");
  if (!origin) return next();

  try {
    const expected = new URL(`${req.protocol}://${req.get("host")}`).origin;
    if (new URL(origin).origin !== expected) {
      return res.status(403).type("text/plain").send("This request was blocked for your security.");
    }
  } catch {
    return res.status(403).type("text/plain").send("This request was blocked for your security.");
  }

  next();
}

export function createRateLimiter({ limit, windowMs, maxKeys = DEFAULT_MAX_KEYS }) {
  if (!Number.isInteger(limit) || limit < 1 || !Number.isFinite(windowMs) || windowMs < 1000 || !Number.isInteger(maxKeys) || maxKeys < 2) {
    throw new Error("Invalid rate limiter settings");
  }

  const buckets = new Map();
  let operations = 0;

  function prune(now) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
    while (buckets.size >= maxKeys) {
      buckets.delete(buckets.keys().next().value);
    }
  }

  return {
    consume(rawKey, now = Date.now()) {
      const key = String(rawKey || "unknown").slice(0, 256);
      operations += 1;
      if (operations % 128 === 0 || buckets.size >= maxKeys) prune(now);

      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + windowMs };
        buckets.set(key, bucket);
      }

      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      if (bucket.count >= limit) return { allowed: false, retryAfter };
      bucket.count += 1;
      return { allowed: true, retryAfter, remaining: Math.max(0, limit - bucket.count) };
    },
    reset(rawKey) {
      buckets.delete(String(rawKey || "unknown").slice(0, 256));
    },
    size() {
      return buckets.size;
    },
  };
}
