import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ADMIN_COOKIE_NAME = "myng_admin";
const CUSTOMER_COOKIE_NAME = "myng_customer";
const ADMIN_SESSION_HOURS = 8;
const CUSTOMER_SESSION_DAYS = 30;

function sessionSecret() {
  return process.env.SESSION_SECRET || "local-development-secret-change-before-sharing";
}

function signature(value) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function constantTimeEqual(left, right) {
  const first = createHash("sha256").update(String(left)).digest();
  const second = createHash("sha256").update(String(right)).digest();
  return timingSafeEqual(first, second);
}

function parseCookies(header = "") {
  return header.split(";").reduce((cookies, part) => {
    const index = part.indexOf("=");
    if (index === -1) return cookies;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) return cookies;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
    return cookies;
  }, {});
}

function readAdminSession(req) {
  const token = parseCookies(req.headers.cookie)[ADMIN_COOKIE_NAME];
  if (!token) return null;
  const pieces = token.split(".");
  if (pieces.length !== 3) return null;
  const [expires, nonce, suppliedSignature] = pieces;
  const unsigned = `${expires}.${nonce}`;
  if (!constantTimeEqual(signature(unsigned), suppliedSignature)) return null;
  if (!Number.isFinite(Number(expires)) || Number(expires) < Date.now()) return null;
  return { token, expires: Number(expires) };
}

function readCustomerSession(req) {
  const token = parseCookies(req.headers.cookie)[CUSTOMER_COOKIE_NAME];
  if (!token) return null;
  const pieces = token.split(".");
  if (pieces.length !== 5) return null;
  const [customerId, sessionVersion, expires, nonce, suppliedSignature] = pieces;
  const unsigned = `${customerId}.${sessionVersion}.${expires}.${nonce}`;
  if (!constantTimeEqual(signature(unsigned), suppliedSignature)) return null;
  if (!Number.isInteger(Number(customerId)) || Number(customerId) <= 0) return null;
  if (!Number.isInteger(Number(sessionVersion)) || Number(sessionVersion) <= 0) return null;
  if (!Number.isFinite(Number(expires)) || Number(expires) < Date.now()) return null;
  return {
    token,
    customerId: Number(customerId),
    sessionVersion: Number(sessionVersion),
    expires: Number(expires),
  };
}

export function attachAdmin(req, res, next) {
  const session = readAdminSession(req);
  req.adminSession = session;
  res.locals.isAdmin = Boolean(session);
  res.locals.csrf = session ? signature(`csrf.${session.token}`) : "";
  next();
}

export function attachCustomer(req, res, next) {
  const session = readCustomerSession(req);
  req.customerSession = session;
  res.locals.isCustomer = Boolean(session);
  res.locals.customerCsrf = session ? signature(`customer-csrf.${session.token}`) : "";
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.adminSession) {
    return res.redirect(303, "/admin/login?expired=1");
  }
  next();
}

export function requireCsrf(req, res, next) {
  const supplied = req.body?._csrf || req.get("x-csrf-token") || "";
  const expected = req.adminSession ? signature(`csrf.${req.adminSession.token}`) : "";
  if (!expected || !constantTimeEqual(expected, supplied)) {
    return res.status(403).render("error", {
      pageTitle: "Please try again",
      message: "This page was open for too long. Go back to the owner area and try again.",
    });
  }
  next();
}

export function requireCustomer(req, res, next) {
  if (!req.customerSession || !req.customer) {
    const returnTo = encodeURIComponent(req.originalUrl.startsWith("/") ? req.originalUrl : "/account");
    return res.redirect(303, `/account/sign-in?return=${returnTo}`);
  }
  next();
}

export function requireCustomerCsrf(req, res, next) {
  const supplied = req.body?._csrf || req.get("x-csrf-token") || "";
  const expected = req.customerSession ? signature(`customer-csrf.${req.customerSession.token}`) : "";
  if (!expected || !constantTimeEqual(expected, supplied)) {
    return res.status(403).render("error", {
      pageTitle: "Please try again",
      message: "For your security, this page needs to be refreshed before you continue.",
    });
  }
  next();
}

export function issueAdminSession(res) {
  const expires = Date.now() + ADMIN_SESSION_HOURS * 60 * 60 * 1000;
  const nonce = randomBytes(24).toString("hex");
  const unsigned = `${expires}.${nonce}`;
  const token = `${unsigned}.${signature(unsigned)}`;
  res.cookie(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: String(process.env.COOKIE_SECURE).toLowerCase() === "true",
    maxAge: ADMIN_SESSION_HOURS * 60 * 60 * 1000,
    path: "/admin",
    priority: "high",
  });
}

export function clearAdminSession(res) {
  res.clearCookie(ADMIN_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "strict",
    secure: String(process.env.COOKIE_SECURE).toLowerCase() === "true",
    path: "/admin",
    priority: "high",
  });
}

export function issueCustomerSession(res, customerId, sessionVersion = 1) {
  const expires = Date.now() + CUSTOMER_SESSION_DAYS * 24 * 60 * 60 * 1000;
  const nonce = randomBytes(24).toString("hex");
  const unsigned = `${Number(customerId)}.${Number(sessionVersion)}.${expires}.${nonce}`;
  const token = `${unsigned}.${signature(unsigned)}`;
  res.cookie(CUSTOMER_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: String(process.env.COOKIE_SECURE).toLowerCase() === "true",
    maxAge: CUSTOMER_SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
    priority: "high",
  });
}

export function clearCustomerSession(res) {
  res.clearCookie(CUSTOMER_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: String(process.env.COOKIE_SECURE).toLowerCase() === "true",
    path: "/",
    priority: "high",
  });
}

export async function passwordMatches(value) {
  const passwordHash = String(process.env.ADMIN_PASSWORD_HASH || "");
  if (passwordHash) {
    try {
      return await Bun.password.verify(String(value || ""), passwordHash);
    } catch {
      return false;
    }
  }
  const expected = process.env.ADMIN_PASSWORD || "change-me-now";
  return constantTimeEqual(String(value || ""), expected);
}
