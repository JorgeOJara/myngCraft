import express from "express";
import multer from "multer";
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import {
  addContactMessage,
  addOrderMessage,
  addSubscriber,
  categories,
  createCustomer,
  createOrder,
  createProduct,
  formatMoney,
  getCustomerAccountStats,
  getCustomerByEmail,
  getCustomerById,
  getCustomerOrder,
  getDashboardStats,
  getOrderById,
  getProductById,
  getProductBySlug,
  getSavedBag,
  getSettings,
  listContactMessages,
  listCustomerFavoriteIds,
  listCustomerFavorites,
  listCustomerOrders,
  listCustomers,
  listOrderMessages,
  listOrderThreads,
  listOrders,
  listProducts,
  invalidateCustomerSessions,
  markMessageRead,
  markOrderMessagesRead,
  replaceSavedBag,
  setProductStatus,
  toggleCustomerFavorite,
  uniqueProductSlug,
  updateCustomerPassword,
  updateCustomerProfile,
  updateOrderStatus,
  updateProduct,
  updateSettings,
} from "./lib/db.js";
import {
  attachAdmin,
  attachCustomer,
  clearAdminSession,
  clearCustomerSession,
  issueAdminSession,
  issueCustomerSession,
  passwordMatches,
  requireAdmin,
  requireCsrf,
  requireCustomer,
  requireCustomerCsrf,
} from "./lib/auth.js";
import {
  applySecurityHeaders,
  assertSecureProductionConfig,
  createRateLimiter,
  protectPrivateResponses,
  requireSameOrigin,
} from "./lib/security.js";

const rootDir = dirname(fileURLToPath(import.meta.url));
const publicDir = join(rootDir, "public");
const uploadsDir = join(publicDir, "uploads");
mkdirSync(uploadsDir, { recursive: true });

const app = express();
let runningServer;
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.set("query parser", "simple");
app.set("view engine", "ejs");
app.set("views", join(rootDir, "views"));

app.use(applySecurityHeaders);
app.use(protectPrivateResponses);
app.use(requireSameOrigin);
app.use(express.urlencoded({ extended: false, limit: "64kb", parameterLimit: 60 }));
app.use(express.json({ limit: "100kb", strict: true }));
app.use(express.static(publicDir, {
  dotfiles: "deny",
  index: false,
  maxAge: process.env.NODE_ENV === "production" ? "1d" : 0,
}));
app.use(attachAdmin);
app.use(attachCustomer);
app.use((req, res, next) => {
  const customer = req.customerSession ? getCustomerById(req.customerSession.customerId) : null;
  const validCustomer = customer && customer.session_version === req.customerSession?.sessionVersion ? customer : null;
  if (req.customerSession && !validCustomer) {
    clearCustomerSession(res);
    req.customerSession = null;
    res.locals.customerCsrf = "";
  }
  req.customer = validCustomer;
  res.locals.customer = validCustomer;
  res.locals.isCustomer = Boolean(validCustomer);
  res.locals.favoriteIds = new Set(validCustomer ? listCustomerFavoriteIds(validCustomer.id) : []);
  next();
});

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const contactLimiter = createRateLimiter({ limit: 6, windowMs: HOUR });
const newsletterLimiter = createRateLimiter({ limit: 10, windowMs: HOUR });
const accountCreationLimiter = createRateLimiter({ limit: 5, windowMs: HOUR });
const customerLoginIpLimiter = createRateLimiter({ limit: 20, windowMs: 15 * MINUTE });
const customerLoginAccountLimiter = createRateLimiter({ limit: 8, windowMs: 15 * MINUTE });
const adminLoginLimiter = createRateLimiter({ limit: 8, windowMs: 15 * MINUTE });
const orderLimiter = createRateLimiter({ limit: 10, windowMs: HOUR });
const customerMessageLimiter = createRateLimiter({ limit: 30, windowMs: HOUR });
const adminUploadLimiter = createRateLimiter({ limit: 30, windowMs: HOUR });

function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function limitRequests(limiter, message, { json = false, key = clientKey } = {}) {
  return (req, res, next) => {
    const result = limiter.consume(key(req));
    if (result.allowed) return next();
    res.setHeader("Retry-After", String(result.retryAfter));
    if (json) return res.status(429).json({ error: message });
    return res.status(429).render("error", {
      pageTitle: "Please wait a moment",
      message,
    });
  };
}

const dummyCustomerPasswordHash = Bun.password.hash("not-a-real-myngcraft-account-password");

const collections = [
  { name: "Jewelry", slug: "jewelry", image: "/images/myngcraft-cat-jewelry.jpg", note: "Pieces to keep close" },
  { name: "Decorations", slug: "decorations", image: "/images/myngcraft-cat-decorations.jpg", note: "Warm details for home" },
  { name: "Textiles", slug: "textiles", image: "/images/myngcraft-cat-textiles.jpg", note: "Soft, useful keepsakes" },
  { name: "Pottery", slug: "pottery", image: "/images/myngcraft-cat-pottery.jpg", note: "Made for daily rituals" },
  { name: "Accessories", slug: "accessories", image: "/images/myngcraft-cat-accessories.jpg", note: "Small joys to wear" },
];

app.use((req, res, next) => {
  const settings = getSettings();
  res.locals.settings = settings;
  res.locals.pageTitle = settings.store_name;
  res.locals.currentPath = req.path;
  res.locals.collections = collections;
  res.locals.categories = categories;
  res.locals.money = formatMoney;
  res.locals.year = new Date().getFullYear();
  res.locals.joined = req.query.joined === "1";
  res.locals.formatDate = formatDate;
  res.locals.statusLabel = statusLabel;
  res.locals.orderSteps = orderSteps;
  res.locals.imageForProduct = imageForProduct;
  next();
});

app.get("/", (req, res) => {
  let featuredProducts = listProducts({ featured: true, limit: 4 });
  if (featuredProducts.length === 0) featuredProducts = listProducts({ limit: 4 });
  res.render("home", {
    pageTitle: `${res.locals.settings.store_name} · Handmade with heart`,
    featuredProducts,
  });
});

app.get("/shop", (req, res) => {
  const search = cleanText(req.query.q, 80);
  const requestedCategory = cleanText(req.query.category, 40);
  const category = categories.find((item) => item.toLowerCase() === requestedCategory.toLowerCase()) || "";
  const products = listProducts({ category, search });
  res.render("shop", {
    pageTitle: `Shop · ${res.locals.settings.store_name}`,
    products,
    category,
    search,
  });
});

app.get("/product/:slug", (req, res) => {
  const product = getProductBySlug(req.params.slug);
  if (!product) return renderNotFound(res);
  const related = listProducts({ category: product.category, limit: 4 }).filter((item) => item.id !== product.id).slice(0, 3);
  res.render("product", {
    pageTitle: `${product.name} · ${res.locals.settings.store_name}`,
    product,
    related,
  });
});

app.get("/about", (req, res) => {
  res.render("about", { pageTitle: `Our story · ${res.locals.settings.store_name}` });
});

app.get("/contact", (req, res) => {
  res.render("contact", {
    pageTitle: `Contact · ${res.locals.settings.store_name}`,
    sent: req.query.sent === "1",
    errors: [],
    values: {},
  });
});

app.post("/contact", limitRequests(contactLimiter, "Please wait before sending another message."), (req, res) => {
  const values = {
    name: cleanText(req.body.name, 100),
    email: cleanText(req.body.email, 160).toLowerCase(),
    message: cleanText(req.body.message, 3000),
  };
  const errors = [];
  if (values.name.length < 2) errors.push("Please add your name.");
  if (!validEmail(values.email)) errors.push("Please add a valid email address.");
  if (values.message.length < 10) errors.push("Please tell us a little more in your message.");
  if (errors.length) {
    return res.status(400).render("contact", {
      pageTitle: `Contact · ${res.locals.settings.store_name}`,
      sent: false,
      errors,
      values,
    });
  }
  addContactMessage(values);
  res.redirect(303, "/contact?sent=1");
});

app.post("/newsletter", limitRequests(newsletterLimiter, "Please wait before trying that again."), (req, res) => {
  const email = cleanText(req.body.email, 160).toLowerCase();
  if (validEmail(email)) addSubscriber(email);
  res.redirect(303, "/?joined=1#little-notes");
});

app.get("/account/sign-in", (req, res) => {
  const returnTo = safeReturn(req.query.return, "/account");
  if (req.customer) return res.redirect(303, returnTo);
  res.render("account/sign-in", {
    pageTitle: `Sign in · ${res.locals.settings.store_name}`,
    error: "",
    email: "",
    returnTo,
  });
});

app.post("/account/sign-in", async (req, res) => {
  const email = cleanText(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || "").slice(0, 128);
  const returnTo = safeReturn(req.body.return_to, "/account");
  const ipKey = clientKey(req);
  const accountKey = `${ipKey}:${email}`;
  const ipAttempt = customerLoginIpLimiter.consume(ipKey);
  const accountAttempt = customerLoginAccountLimiter.consume(accountKey);
  if (!ipAttempt.allowed || !accountAttempt.allowed) {
    res.setHeader("Retry-After", String(Math.max(ipAttempt.retryAfter, accountAttempt.retryAfter)));
    return res.status(429).render("account/sign-in", {
      pageTitle: `Sign in · ${res.locals.settings.store_name}`,
      error: "Too many sign-in attempts. Please wait 15 minutes and try again.",
      email,
      returnTo,
    });
  }
  const customer = getCustomerByEmail(email);
  const passwordHash = customer?.password_hash || await dummyCustomerPasswordHash;
  const passwordOkay = await Bun.password.verify(password, passwordHash);
  if (!customer || !passwordOkay) {
    return res.status(401).render("account/sign-in", {
      pageTitle: `Sign in · ${res.locals.settings.store_name}`,
      error: "That email and password do not match. Please try again.",
      email,
      returnTo,
    });
  }
  customerLoginIpLimiter.reset(ipKey);
  customerLoginAccountLimiter.reset(accountKey);
  issueCustomerSession(res, customer.id, customer.session_version);
  res.redirect(303, returnTo);
});

app.get("/account/create", (req, res) => {
  const returnTo = safeReturn(req.query.return, "/account");
  if (req.customer) return res.redirect(303, returnTo);
  res.render("account/create", {
    pageTitle: `Create an account · ${res.locals.settings.store_name}`,
    errors: [],
    values: {},
    returnTo,
  });
});

app.post("/account/create", limitRequests(accountCreationLimiter, "Please wait before creating another account."), async (req, res) => {
  const values = {
    first_name: cleanText(req.body.first_name, 80),
    last_name: cleanText(req.body.last_name, 80),
    email: cleanText(req.body.email, 160).toLowerCase(),
  };
  const password = String(req.body.password || "").slice(0, 128);
  const confirmation = String(req.body.password_confirmation || "").slice(0, 128);
  const returnTo = safeReturn(req.body.return_to, "/account");
  const errors = [];
  if (values.first_name.length < 2) errors.push("Please enter your first name.");
  if (values.last_name.length < 2) errors.push("Please enter your last name.");
  if (!validEmail(values.email)) errors.push("Please enter a valid email address.");
  if (getCustomerByEmail(values.email)) errors.push("An account already uses that email. Try signing in instead.");
  if (password.length < 12) errors.push("Choose a password with at least 12 characters.");
  if (password !== confirmation) errors.push("The two passwords do not match.");
  if (errors.length) {
    return res.status(400).render("account/create", {
      pageTitle: `Create an account · ${res.locals.settings.store_name}`,
      errors,
      values,
      returnTo,
    });
  }
  try {
    const passwordHash = await Bun.password.hash(password);
    const customer = createCustomer({ ...values, password_hash: passwordHash });
    issueCustomerSession(res, customer.id, customer.session_version);
    res.redirect(303, returnTo);
  } catch (error) {
    console.error("Customer registration error:", error.message);
    res.status(400).render("account/create", {
      pageTitle: `Create an account · ${res.locals.settings.store_name}`,
      errors: ["We couldn't create that account. The email may already be registered."],
      values,
      returnTo,
    });
  }
});

app.use("/account", requireCustomer);

app.post("/account/sign-out", requireCustomerCsrf, (req, res) => {
  invalidateCustomerSessions(req.customer.id);
  clearCustomerSession(res);
  res.redirect(303, "/");
});

app.get("/account", (req, res) => {
  res.render("account/dashboard", {
    pageTitle: `My account · ${res.locals.settings.store_name}`,
    stats: getCustomerAccountStats(req.customer.id),
    currentOrders: listCustomerOrders(req.customer.id, "current", 4),
    pastOrders: listCustomerOrders(req.customer.id, "history", 3),
    favorites: listCustomerFavorites(req.customer.id).slice(0, 4),
    savedBag: getSavedBag(req.customer.id),
  });
});

app.get("/account/orders", (req, res) => {
  res.render("account/orders", {
    pageTitle: `My orders · ${res.locals.settings.store_name}`,
    currentOrders: listCustomerOrders(req.customer.id, "current"),
    pastOrders: listCustomerOrders(req.customer.id, "history"),
  });
});

app.get("/account/orders/:orderNumber", (req, res) => {
  let order = getCustomerOrder(req.customer.id, req.params.orderNumber);
  if (!order) return renderNotFound(res);
  markOrderMessagesRead(order.id, "customer");
  order = getCustomerOrder(req.customer.id, req.params.orderNumber);
  res.render("account/order", {
    pageTitle: `${order.order_number} · ${res.locals.settings.store_name}`,
    order,
    messageSent: req.query.sent === "1",
    messageError: "",
  });
});

app.post(
  "/account/orders/:orderNumber/messages",
  requireCustomerCsrf,
  limitRequests(customerMessageLimiter, "Please wait before sending more messages.", { key: (req) => req.customer.id }),
  (req, res) => {
  const order = getCustomerOrder(req.customer.id, req.params.orderNumber);
  if (!order) return renderNotFound(res);
  const body = cleanText(req.body.message, 2000);
  if (body.length < 2) {
    return res.status(400).render("account/order", {
      pageTitle: `${order.order_number} · ${res.locals.settings.store_name}`,
      order,
      messageSent: false,
      messageError: "Please write a short message before sending.",
    });
  }
  addOrderMessage({ orderId: order.id, customerId: req.customer.id, senderRole: "customer", body });
  res.redirect(303, `/account/orders/${encodeURIComponent(order.order_number)}?sent=1#conversation`);
  },
);

app.get("/account/favorites", (req, res) => {
  res.render("account/favorites", {
    pageTitle: `My favorites · ${res.locals.settings.store_name}`,
    favorites: listCustomerFavorites(req.customer.id),
  });
});

app.post("/account/favorites/:productId/toggle", requireCustomerCsrf, (req, res) => {
  toggleCustomerFavorite(req.customer.id, req.params.productId);
  res.redirect(303, safeReturn(req.body.return_to, "/account/favorites"));
});

app.get("/account/profile", (req, res) => {
  renderCustomerProfile(res, req.customer, {
    saved: req.query.saved === "1",
    passwordSaved: req.query.password === "saved",
  });
});

app.post("/account/profile", requireCustomerCsrf, (req, res) => {
  const values = customerProfileFromRequest(req);
  const errors = validateCustomerProfile(values, req.customer.id);
  if (errors.length) return renderCustomerProfile(res.status(400), { ...req.customer, ...values }, { profileErrors: errors });
  updateCustomerProfile(req.customer.id, values);
  res.redirect(303, "/account/profile?saved=1");
});

app.post("/account/password", requireCustomerCsrf, async (req, res) => {
  const currentPassword = String(req.body.current_password || "").slice(0, 128);
  const newPassword = String(req.body.new_password || "").slice(0, 128);
  const confirmation = String(req.body.new_password_confirmation || "").slice(0, 128);
  const errors = [];
  if (!(await Bun.password.verify(currentPassword, req.customer.password_hash))) errors.push("Your current password was not correct.");
  if (newPassword.length < 12) errors.push("Your new password needs at least 12 characters.");
  if (newPassword !== confirmation) errors.push("The two new passwords do not match.");
  if (errors.length) return renderCustomerProfile(res.status(400), req.customer, { passwordErrors: errors });
  const updatedCustomer = updateCustomerPassword(req.customer.id, await Bun.password.hash(newPassword));
  issueCustomerSession(res, updatedCustomer.id, updatedCustomer.session_version);
  res.redirect(303, "/account/profile?password=saved");
});

app.get("/api/account/bag", requireCustomer, (req, res) => {
  const items = getSavedBag(req.customer.id).map(cartApiItem);
  res.json({ items });
});

app.put("/api/account/bag", requireCustomer, requireCustomerCsrf, (req, res) => {
  const cartItems = Array.isArray(req.body.items) ? req.body.items.slice(0, 30) : [];
  const items = replaceSavedBag(req.customer.id, cartItems).map(cartApiItem);
  res.json({ items });
});

app.get("/cart", (req, res) => {
  res.render("cart", { pageTitle: `Your bag · ${res.locals.settings.store_name}` });
});

app.get("/checkout", requireCustomer, (req, res) => {
  res.render("checkout", { pageTitle: `Checkout · ${res.locals.settings.store_name}` });
});

app.post(
  "/api/orders",
  requireCustomer,
  requireCustomerCsrf,
  limitRequests(orderLimiter, "Please wait before sending another order.", { json: true, key: (req) => req.customer.id }),
  (req, res) => {
  try {
    const customer = {
      name: cleanText(req.body.customer?.name, 100),
      email: cleanText(req.body.customer?.email, 160).toLowerCase(),
      phone: cleanText(req.body.customer?.phone, 40),
      addressLine1: cleanText(req.body.customer?.addressLine1, 180),
      addressLine2: cleanText(req.body.customer?.addressLine2, 180),
      city: cleanText(req.body.customer?.city, 100),
      state: cleanText(req.body.customer?.state, 100),
      postalCode: cleanText(req.body.customer?.postalCode, 30),
      notes: cleanText(req.body.customer?.notes, 1000),
    };
    const errors = validateCustomer(customer);
    if (errors.length) return res.status(400).json({ error: errors[0] });
    const cartItems = Array.isArray(req.body.items) ? req.body.items.slice(0, 30) : [];
    const order = createOrder({ customer, customerId: req.customer.id, cartItems });
    res.status(201).json({
      orderNumber: order.orderNumber,
      redirect: `/account/orders/${encodeURIComponent(order.orderNumber)}`,
    });
  } catch (error) {
    console.error("Order error:", error.message);
    res.status(error.status || 500).json({ error: error.status ? error.message : "We couldn't save the order. Please try again." });
  }
  },
);

app.get("/admin/login", (req, res) => {
  if (req.adminSession) return res.redirect(303, "/admin");
  res.render("admin/login", {
    pageTitle: `Owner sign in · ${res.locals.settings.store_name}`,
    error: req.query.error === "1",
    locked: req.query.locked === "1",
  });
});

app.post("/admin/login", async (req, res) => {
  const key = clientKey(req);
  const attempt = adminLoginLimiter.consume(key);
  if (!attempt.allowed) {
    res.setHeader("Retry-After", String(attempt.retryAfter));
    return res.status(429).render("admin/login", {
      pageTitle: `Owner sign in · ${res.locals.settings.store_name}`,
      error: false,
      locked: true,
    });
  }
  if (!(await passwordMatches(String(req.body.password || "").slice(0, 256)))) {
    return res.redirect(303, "/admin/login?error=1");
  }
  adminLoginLimiter.reset(key);
  issueAdminSession(res);
  res.redirect(303, "/admin");
});

app.use("/admin", requireAdmin);

app.post("/admin/logout", requireCsrf, (req, res) => {
  clearAdminSession(res);
  res.redirect(303, "/admin/login");
});

app.get("/admin", (req, res) => {
  res.render("admin/dashboard", {
    pageTitle: `Owner home · ${res.locals.settings.store_name}`,
    stats: getDashboardStats(),
    recentOrders: listOrders(5),
    recentMessages: listContactMessages(3),
    recentOrderThreads: listOrderThreads(3),
  });
});

app.get("/admin/products", (req, res) => {
  res.render("admin/products", {
    pageTitle: `Your items · ${res.locals.settings.store_name}`,
    products: listProducts({ includeHidden: true }),
    notice: cleanText(req.query.notice, 120),
  });
});

app.get("/admin/products/new", (req, res) => {
  res.render("admin/product-form", {
    pageTitle: `Add an item · ${res.locals.settings.store_name}`,
    formTitle: "Add a new item",
    formHint: "Start with the basics. You can come back and change anything later.",
    product: blankProduct(),
    errors: [],
  });
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 1,
    fields: 12,
    parts: 13,
    fieldNameSize: 80,
    fieldSize: 5000,
    fieldArrayIndexLimit: 0,
  },
  fileFilter: (req, file, done) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) return done(null, true);
    const error = new Error("Please choose a JPG, PNG, or WebP photo.");
    error.status = 400;
    done(error);
  },
});

app.post(
  "/admin/products",
  limitRequests(adminUploadLimiter, "Please wait before uploading more items."),
  upload.single("image"),
  requireCsrf,
  async (req, res, next) => {
    const { product, errors } = productFromRequest(req);
    if (errors.length) {
      return res.status(400).render("admin/product-form", {
        pageTitle: `Add an item · ${res.locals.settings.store_name}`,
        formTitle: "Add a new item",
        formHint: "A few details need your attention.",
        product,
        errors,
      });
    }
    try {
      const imagePath = await saveProductImage(req.file);
      if (imagePath) product.image_path = imagePath;
      product.slug = uniqueProductSlug(product.name);
      createProduct(product);
      res.redirect(303, `/admin/products?notice=${encodeURIComponent(`${product.name} was saved.`)}`);
    } catch (error) {
      next(error);
    }
  },
);

app.get("/admin/products/:id/edit", (req, res) => {
  const product = getProductById(req.params.id);
  if (!product) return renderNotFound(res);
  res.render("admin/product-form", {
    pageTitle: `Edit ${product.name} · ${res.locals.settings.store_name}`,
    formTitle: "Edit this item",
    formHint: "Make your changes, then use the big save button at the bottom.",
    product,
    errors: [],
  });
});

app.post(
  "/admin/products/:id",
  limitRequests(adminUploadLimiter, "Please wait before uploading more item changes."),
  upload.single("image"),
  requireCsrf,
  async (req, res, next) => {
    const existing = getProductById(req.params.id);
    if (!existing) return renderNotFound(res);
    const { product, errors } = productFromRequest(req, existing);
    if (errors.length) {
      product.id = existing.id;
      return res.status(400).render("admin/product-form", {
        pageTitle: `Edit ${existing.name} · ${res.locals.settings.store_name}`,
        formTitle: "Edit this item",
        formHint: "A few details need your attention.",
        product,
        errors,
      });
    }
    try {
      const imagePath = await saveProductImage(req.file);
      if (imagePath) product.image_path = imagePath;
      product.slug = uniqueProductSlug(product.name, existing.id);
      updateProduct(existing.id, product);
      res.redirect(303, `/admin/products?notice=${encodeURIComponent(`${product.name} was updated.`)}`);
    } catch (error) {
      next(error);
    }
  },
);

app.post("/admin/products/:id/status", requireCsrf, (req, res) => {
  const product = getProductById(req.params.id);
  if (!product) return renderNotFound(res);
  const status = ["active", "draft", "archived"].includes(req.body.status) ? req.body.status : "draft";
  setProductStatus(product.id, status);
  const message = status === "active" ? `${product.name} is now visible in the shop.` : `${product.name} was moved out of the shop.`;
  res.redirect(303, `/admin/products?notice=${encodeURIComponent(message)}`);
});

app.get("/admin/orders", (req, res) => {
  const view = ["current", "history", "all"].includes(req.query.view) ? req.query.view : "current";
  res.render("admin/orders", {
    pageTitle: `Orders · ${res.locals.settings.store_name}`,
    orders: listOrders(100, view),
    view,
  });
});

app.get("/admin/orders/:id", (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) return renderNotFound(res);
  markOrderMessagesRead(order.id, "admin");
  res.render("admin/order", {
    pageTitle: `${order.order_number} · ${res.locals.settings.store_name}`,
    order,
    orderMessages: listOrderMessages(order.id),
    notice: cleanText(req.query.notice, 120),
    messageSent: req.query.message === "sent",
    messageError: "",
  });
});

app.post("/admin/orders/:id/status", requireCsrf, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) return renderNotFound(res);
  updateOrderStatus(order.id, req.body.status);
  res.redirect(303, `/admin/orders/${order.id}?notice=${encodeURIComponent("Order status updated.")}`);
});

app.post("/admin/orders/:id/messages", requireCsrf, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) return renderNotFound(res);
  const body = cleanText(req.body.message, 2000);
  if (body.length < 2) {
    return res.status(400).render("admin/order", {
      pageTitle: `${order.order_number} · ${res.locals.settings.store_name}`,
      order,
      orderMessages: listOrderMessages(order.id),
      notice: "",
      messageSent: false,
      messageError: "Please write a short reply before sending.",
    });
  }
  addOrderMessage({ orderId: order.id, customerId: order.customer_id, senderRole: "admin", body });
  res.redirect(303, `/admin/orders/${order.id}?message=sent#conversation`);
});

app.get("/admin/messages", (req, res) => {
  res.render("admin/messages", {
    pageTitle: `Messages · ${res.locals.settings.store_name}`,
    messages: listContactMessages(),
    orderThreads: listOrderThreads(),
  });
});

app.post("/admin/messages/:id/read", requireCsrf, (req, res) => {
  markMessageRead(req.params.id);
  res.redirect(303, "/admin/messages");
});

app.get("/admin/customers", (req, res) => {
  res.render("admin/customers", {
    pageTitle: `Customers · ${res.locals.settings.store_name}`,
    customers: listCustomers(),
  });
});

app.get("/admin/settings", (req, res) => {
  res.render("admin/settings", {
    pageTitle: `Store settings · ${res.locals.settings.store_name}`,
    saved: req.query.saved === "1",
  });
});

app.post("/admin/settings", requireCsrf, (req, res) => {
  updateSettings({
    store_name: cleanText(req.body.store_name, 100) || "Myng's Crafts",
    tagline: cleanText(req.body.tagline, 160),
    announcement: cleanText(req.body.announcement, 220),
    hero_eyebrow: cleanText(req.body.hero_eyebrow, 80),
    hero_heading: cleanText(req.body.hero_heading, 180),
    hero_text: cleanText(req.body.hero_text, 400),
    story_heading: cleanText(req.body.story_heading, 180),
    story_text: cleanText(req.body.story_text, 1200),
    contact_email: cleanText(req.body.contact_email, 160).toLowerCase(),
    contact_phone: cleanText(req.body.contact_phone, 50),
    free_shipping_cents: String(parseDollars(req.body.free_shipping, 7500)),
    flat_shipping_cents: String(parseDollars(req.body.flat_shipping, 600)),
    checkout_note: cleanText(req.body.checkout_note, 500),
  });
  res.redirect(303, "/admin/settings?saved=1");
});

app.use((req, res) => renderNotFound(res));

app.use((error, req, res, next) => {
  const status = error.status || (error instanceof multer.MulterError ? 400 : 500);
  if (status >= 500) console.error(error);
  const message = error instanceof multer.MulterError
    ? error.code === "LIMIT_FILE_SIZE"
      ? "That photo is too large. Please choose one smaller than 8 MB."
      : "That upload could not be accepted. Please choose one JPG, PNG, or WebP photo and try again."
    : status === 400
      ? error.message
      : "Something went wrong. Please try again.";
  res.status(status).render("error", { pageTitle: "Something went wrong", message });
});

async function saveProductImage(file) {
  if (!file) return "";

  const signatures = {
    "image/jpeg": (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
    "image/png": (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    "image/webp": (buffer) => buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP",
  };
  const extensions = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
  const signatureMatches = signatures[file.mimetype];
  if (!signatureMatches || !signatureMatches(file.buffer)) {
    const error = new Error("That file does not contain a valid JPG, PNG, or WebP photo.");
    error.status = 400;
    throw error;
  }

  const filename = `item-${Date.now()}-${randomBytes(12).toString("hex")}${extensions[file.mimetype]}`;
  await writeFile(join(uploadsDir, filename), file.buffer, { flag: "wx", mode: 0o600 });
  return `/uploads/${filename}`;
}

function productFromRequest(req, existing = null) {
  const price = cleanText(req.body.price, 30).replace(/[$,]/g, "");
  const parsedPrice = price === "" ? null : Math.round(Number(price) * 100);
  const parsedStock = Math.floor(Number(req.body.stock_quantity));
  const selectedCategory = categories.includes(req.body.category) ? req.body.category : "Jewelry";
  const product = {
    name: cleanText(req.body.name, 140),
    slug: existing?.slug || "",
    description: cleanText(req.body.description, 4000),
    price_cents: Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : null,
    category: selectedCategory,
    image_path: existing?.image_path || "/images/myngcraft-cat-jewelry.jpg",
    stock_quantity: Number.isFinite(parsedStock) && parsedStock >= 0 ? parsedStock : 0,
    status: req.body.published === "on" ? "active" : "draft",
    featured: req.body.featured === "on" ? 1 : 0,
  };
  const errors = [];
  if (product.name.length < 2) errors.push("Give the item a name.");
  if (price !== "" && product.price_cents === null) errors.push("Enter a price greater than zero, or leave it blank for “Price coming soon.”");
  if (!Number.isFinite(parsedStock) || parsedStock < 0) errors.push("Available quantity must be zero or more.");
  return { product, errors };
}

function blankProduct() {
  return {
    name: "",
    description: "",
    price_cents: null,
    category: "Jewelry",
    image_path: "",
    stock_quantity: 1,
    status: "draft",
    featured: 0,
  };
}

function validateCustomer(customer) {
  const errors = [];
  if (customer.name.length < 2) errors.push("Please enter your full name.");
  if (!validEmail(customer.email)) errors.push("Please enter a valid email address.");
  if (customer.addressLine1.length < 4) errors.push("Please enter your street address.");
  if (customer.city.length < 2) errors.push("Please enter your city.");
  if (customer.state.length < 2) errors.push("Please enter your state.");
  if (customer.postalCode.length < 3) errors.push("Please enter your postal code.");
  return errors;
}

function customerProfileFromRequest(req) {
  return {
    first_name: cleanText(req.body.first_name, 80),
    last_name: cleanText(req.body.last_name, 80),
    email: cleanText(req.body.email, 160).toLowerCase(),
    phone: cleanText(req.body.phone, 40),
    address_line_1: cleanText(req.body.address_line_1, 180),
    address_line_2: cleanText(req.body.address_line_2, 180),
    city: cleanText(req.body.city, 100),
    state: cleanText(req.body.state, 100),
    postal_code: cleanText(req.body.postal_code, 30),
  };
}

function validateCustomerProfile(customer, customerId) {
  const errors = [];
  if (customer.first_name.length < 2) errors.push("Please enter your first name.");
  if (customer.last_name.length < 2) errors.push("Please enter your last name.");
  if (!validEmail(customer.email)) errors.push("Please enter a valid email address.");
  const existing = getCustomerByEmail(customer.email);
  if (existing && existing.id !== Number(customerId)) errors.push("Another account already uses that email address.");
  return errors;
}

function renderCustomerProfile(response, profile, overrides = {}) {
  return response.render("account/profile", {
    pageTitle: `My information · ${response.locals.settings.store_name}`,
    profile,
    saved: false,
    passwordSaved: false,
    profileErrors: [],
    passwordErrors: [],
    ...overrides,
  });
}

function cartApiItem(product) {
  return {
    id: product.id,
    name: product.name,
    price: product.price_cents,
    image: imageForProduct(product),
    slug: product.slug,
    quantity: product.quantity,
  };
}

function cleanText(value, maximum) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maximum);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 160;
}

function parseDollars(value, fallback) {
  const normalized = cleanText(value, 30).replace(/[$,]/g, "");
  if (normalized === "") return 0;
  const amount = Math.round(Number(normalized) * 100);
  return Number.isFinite(amount) && amount >= 0 ? amount : fallback;
}

function formatDate(value, withTime = false) {
  const date = new Date(`${String(value).replace(" ", "T")}Z`);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

function statusLabel(status) {
  return {
    active: "In shop",
    draft: "Hidden draft",
    archived: "Archived",
    new: "Order received",
    confirmed: "In process",
    making: "Working on it",
    ready: "Sent",
    completed: "Delivered",
    cancelled: "Cancelled",
  }[status] || status;
}

function orderSteps(status) {
  const steps = [
    { value: "new", label: "Order received", note: "Your order is safely in Myng's hands." },
    { value: "confirmed", label: "In process", note: "The details and availability are confirmed." },
    { value: "making", label: "Working on it", note: "Myng is preparing your pieces with care." },
    { value: "ready", label: "Sent", note: "Your order is on its way to you." },
    { value: "completed", label: "Delivered", note: "Your order has reached its destination." },
  ];
  const currentIndex = steps.findIndex((step) => step.value === status);
  return steps.map((step, index) => ({
    ...step,
    state: status === "cancelled" ? "upcoming" : index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming",
  }));
}

function safeReturn(value, fallback = "/account") {
  const path = String(value || "").slice(0, 500);
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /[\u0000-\u001f\u007f]/.test(path)) return fallback;
  try {
    const parsed = new URL(path, "https://myngcraft.invalid");
    if (parsed.origin !== "https://myngcraft.invalid" || parsed.pathname.toLowerCase().startsWith("/admin")) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

function imageForProduct(product) {
  if (product.image_path) return product.image_path;
  const collection = collections.find((item) => item.name === product.category);
  return collection?.image || "/images/myngcraft-cat-jewelry.jpg";
}

function renderNotFound(res) {
  return res.status(404).render("error", {
    pageTitle: "Page not found",
    message: "We couldn't find that page. It may have moved or may no longer be available.",
  });
}

if (import.meta.main) {
  assertSecureProductionConfig();
  const port = Number(process.env.PORT || 1010);
  const host = process.env.HOST || "0.0.0.0";
  runningServer = app.listen(port, host, () => {
    console.log(`MyngCraft is ready at http://${host}:${port}`);
  });
  runningServer.requestTimeout = 60_000;
  runningServer.headersTimeout = 15_000;
  runningServer.keepAliveTimeout = 5_000;
  runningServer.ref?.();
}

export default app;
export { runningServer };
