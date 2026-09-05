import { Database } from "bun:sqlite";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const databasePath = process.env.DATABASE_PATH || join(projectRoot, "data", "myngcraft.sqlite");
const databaseDirectory = dirname(databasePath);

process.umask(0o077);
const databaseDirectoryAlreadyExisted = existsSync(databaseDirectory);
mkdirSync(databaseDirectory, { recursive: true, mode: 0o700 });
if (!databaseDirectoryAlreadyExisted) chmodSync(databaseDirectory, 0o700);

export const db = new Database(databasePath, { create: true, strict: true });
chmodSync(databasePath, 0o600);

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA busy_timeout = 5000;");
db.exec("PRAGMA secure_delete = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    price_cents INTEGER,
    category TEXT NOT NULL DEFAULT 'Jewelry',
    image_path TEXT NOT NULL DEFAULT '',
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('active', 'draft', 'archived')),
    featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    address_line_1 TEXT NOT NULL DEFAULT '',
    address_line_2 TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT '',
    postal_code TEXT NOT NULL DEFAULT '',
    session_version INTEGER NOT NULL DEFAULT 1 CHECK (session_version > 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    order_number TEXT NOT NULL UNIQUE,
    public_token TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    address_line_1 TEXT NOT NULL,
    address_line_2 TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'confirmed', 'making', 'ready', 'completed', 'cancelled')),
    subtotal_cents INTEGER NOT NULL,
    shipping_cents INTEGER NOT NULL,
    total_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    product_image TEXT NOT NULL DEFAULT '',
    unit_price_cents INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    line_total_cents INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS customer_favorites (
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (customer_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS saved_cart_items (
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 25),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (customer_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS order_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('new', 'confirmed', 'making', 'ready', 'completed', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    sender_role TEXT NOT NULL CHECK (sender_role IN ('customer', 'admin')),
    body TEXT NOT NULL,
    read_by_customer INTEGER NOT NULL DEFAULT 0 CHECK (read_by_customer IN (0, 1)),
    read_by_admin INTEGER NOT NULL DEFAULT 0 CHECK (read_by_admin IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS contact_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
  CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_created ON contact_messages(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_order_history_order ON order_status_history(order_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_order_messages_order ON order_messages(order_id, created_at);
`);

// Existing installations created before customer accounts need this additive column.
const orderColumns = db.query("PRAGMA table_info(orders)").all().map((column) => column.name);
if (!orderColumns.includes("customer_id")) {
  db.exec("ALTER TABLE orders ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;");
}
const customerColumns = db.query("PRAGMA table_info(customers)").all().map((column) => column.name);
if (!customerColumns.includes("session_version")) {
  db.exec("ALTER TABLE customers ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;");
}
db.exec("CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC);");
db.exec(`
  INSERT INTO order_status_history (order_id, status, created_at)
  SELECT orders.id, orders.status, orders.created_at
  FROM orders
  WHERE NOT EXISTS (
    SELECT 1 FROM order_status_history WHERE order_status_history.order_id = orders.id
  );
`);

export const categories = ["Jewelry", "Decorations", "Textiles", "Pottery", "Accessories"];

const settingDefaults = {
  store_name: "Myng's Crafts",
  short_name: "MYNG",
  tagline: "Handmade pieces, thoughtfully yours.",
  announcement: "Complimentary shipping on orders over $75 · Handmade in small batches",
  hero_eyebrow: "HANDMADE WITH HEART",
  hero_heading: "Little treasures, made to feel personal.",
  hero_text: "Thoughtful jewelry and handmade keepsakes, created in small batches and wrapped with care.",
  story_heading: "Made by hand. Chosen by heart.",
  story_text: "Myng's Crafts is a small creative studio built around the joy of making. Every piece is selected or finished with care, so it can become part of your everyday story—or someone else's favorite gift.",
  contact_email: "",
  contact_phone: "",
  free_shipping_cents: "7500",
  flat_shipping_cents: "600",
  checkout_note: "No payment is collected online yet. Myng will contact you to confirm your order and arrange payment.",
};

const insertSetting = db.query("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
for (const [key, value] of Object.entries(settingDefaults)) {
  insertSetting.run(key, value);
}

const existingProductCount = db.query("SELECT COUNT(*) AS count FROM products").get().count;
if (existingProductCount === 0) {
  db.query(`
    INSERT INTO products (
      name, slug, description, price_cents, category, image_path,
      stock_quantity, status, featured
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "Handmade Necklace & Earring Set",
    "handmade-necklace-earring-set",
    "A handmade necklace and earring set from the original Myng's Crafts catalog. Add the price and available quantity in the owner area when this piece is ready to sell.",
    null,
    "Jewelry",
    "/images/myngcraft-cat-accessories.jpg",
    0,
    "active",
    1,
  );
}

export function getSettings() {
  const rows = db.query("SELECT key, value FROM settings").all();
  return rows.reduce((settings, row) => {
    settings[row.key] = row.value;
    return settings;
  }, { ...settingDefaults });
}

export function updateSettings(values) {
  const update = db.query(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  const transaction = db.transaction((entries) => {
    for (const [key, value] of entries) update.run(key, String(value ?? ""));
  });
  transaction(Object.entries(values));
}

export function createCustomer(customer) {
  const result = db.query(`
    INSERT INTO customers (email, password_hash, first_name, last_name)
    VALUES (?, ?, ?, ?)
  `).run(customer.email.toLowerCase(), customer.password_hash, customer.first_name, customer.last_name);
  return getCustomerById(result.lastInsertRowid);
}

export function getCustomerById(id) {
  return db.query(`
    SELECT id, email, password_hash, first_name, last_name, phone,
      address_line_1, address_line_2, city, state, postal_code,
      session_version, created_at, updated_at
    FROM customers WHERE id = ?
  `).get(Number(id));
}

export function getCustomerByEmail(email) {
  return db.query(`
    SELECT id, email, password_hash, first_name, last_name, phone,
      address_line_1, address_line_2, city, state, postal_code,
      session_version, created_at, updated_at
    FROM customers WHERE email = ? COLLATE NOCASE
  `).get(String(email || "").toLowerCase());
}

export function updateCustomerProfile(id, customer) {
  db.query(`
    UPDATE customers SET
      email = ?, first_name = ?, last_name = ?, phone = ?,
      address_line_1 = ?, address_line_2 = ?, city = ?, state = ?, postal_code = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    customer.email.toLowerCase(),
    customer.first_name,
    customer.last_name,
    customer.phone,
    customer.address_line_1,
    customer.address_line_2,
    customer.city,
    customer.state,
    customer.postal_code,
    Number(id),
  );
  return getCustomerById(id);
}

export function updateCustomerPassword(id, passwordHash) {
  db.query(`
    UPDATE customers SET
      password_hash = ?, session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(passwordHash, Number(id));
  return getCustomerById(id);
}

export function invalidateCustomerSessions(id) {
  db.query("UPDATE customers SET session_version = session_version + 1 WHERE id = ?").run(Number(id));
  return getCustomerById(id);
}

export function listCustomers(limit = 200) {
  return db.query(`
    SELECT customers.id, customers.email, customers.first_name, customers.last_name,
      customers.phone, customers.created_at,
      COUNT(orders.id) AS order_count,
      COALESCE(SUM(CASE WHEN orders.status != 'cancelled' THEN orders.total_cents ELSE 0 END), 0) AS total_spent_cents
    FROM customers
    LEFT JOIN orders ON orders.customer_id = customers.id
    GROUP BY customers.id
    ORDER BY datetime(customers.created_at) DESC, customers.id DESC
    LIMIT ?
  `).all(Math.max(1, Number(limit) || 200));
}

export function getCustomerAccountStats(customerId) {
  return {
    currentOrders: db.query("SELECT COUNT(*) AS count FROM orders WHERE customer_id = ? AND status NOT IN ('completed', 'cancelled')").get(Number(customerId)).count,
    favorites: db.query("SELECT COUNT(*) AS count FROM customer_favorites WHERE customer_id = ?").get(Number(customerId)).count,
    bagItems: db.query("SELECT COALESCE(SUM(quantity), 0) AS count FROM saved_cart_items WHERE customer_id = ?").get(Number(customerId)).count,
    unreadMessages: db.query("SELECT COUNT(*) AS count FROM order_messages WHERE customer_id = ? AND sender_role = 'admin' AND read_by_customer = 0").get(Number(customerId)).count,
  };
}

export function listCustomerFavoriteIds(customerId) {
  return db.query("SELECT product_id FROM customer_favorites WHERE customer_id = ?").all(Number(customerId)).map((row) => row.product_id);
}

export function listCustomerFavorites(customerId) {
  return db.query(`
    SELECT products.*
    FROM customer_favorites
    JOIN products ON products.id = customer_favorites.product_id
    WHERE customer_favorites.customer_id = ? AND products.status = 'active'
    ORDER BY datetime(customer_favorites.created_at) DESC
  `).all(Number(customerId));
}

export function toggleCustomerFavorite(customerId, productId) {
  const existing = db.query("SELECT 1 AS found FROM customer_favorites WHERE customer_id = ? AND product_id = ?").get(Number(customerId), Number(productId));
  if (existing) {
    db.query("DELETE FROM customer_favorites WHERE customer_id = ? AND product_id = ?").run(Number(customerId), Number(productId));
    return false;
  }
  const product = db.query("SELECT id FROM products WHERE id = ? AND status = 'active'").get(Number(productId));
  if (!product) return false;
  db.query("INSERT INTO customer_favorites (customer_id, product_id) VALUES (?, ?)").run(Number(customerId), Number(productId));
  return true;
}

export function getSavedBag(customerId) {
  return db.query(`
    SELECT products.*, saved_cart_items.quantity
    FROM saved_cart_items
    JOIN products ON products.id = saved_cart_items.product_id
    WHERE saved_cart_items.customer_id = ? AND products.status = 'active'
    ORDER BY datetime(saved_cart_items.updated_at) DESC
  `).all(Number(customerId));
}

export function replaceSavedBag(customerId, cartItems) {
  const replace = db.transaction(() => {
    db.query("DELETE FROM saved_cart_items WHERE customer_id = ?").run(Number(customerId));
    const add = db.query(`
      INSERT INTO saved_cart_items (customer_id, product_id, quantity, updated_at)
      SELECT ?, id, ?, CURRENT_TIMESTAMP FROM products WHERE id = ? AND status = 'active'
    `);
    const merged = new Map();
    for (const item of cartItems) {
      const productId = Number(item.productId);
      const quantity = Math.max(1, Math.min(Number(item.quantity) || 1, 25));
      if (Number.isInteger(productId)) merged.set(productId, Math.min((merged.get(productId) || 0) + quantity, 25));
    }
    for (const [productId, quantity] of merged) add.run(Number(customerId), quantity, productId);
  });
  replace();
  return getSavedBag(customerId);
}

export function getProductById(id) {
  return db.query("SELECT * FROM products WHERE id = ?").get(Number(id));
}

export function getProductBySlug(slug) {
  return db.query("SELECT * FROM products WHERE slug = ? AND status = 'active'").get(slug);
}

export function listProducts({ category = "", search = "", includeHidden = false, featured = false, limit = 100 } = {}) {
  const clauses = [];
  const values = [];

  if (!includeHidden) clauses.push("status = 'active'");
  if (category) {
    clauses.push("category = ?");
    values.push(category);
  }
  if (search) {
    clauses.push("(name LIKE ? OR description LIKE ? OR category LIKE ?)");
    const term = `%${search}%`;
    values.push(term, term, term);
  }
  if (featured) clauses.push("featured = 1");

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  values.push(Math.max(1, Math.min(Number(limit) || 100, 250)));
  return db.query(`
    SELECT * FROM products
    ${where}
    ORDER BY featured DESC, datetime(updated_at) DESC, id DESC
    LIMIT ?
  `).all(...values);
}

export function createProduct(product) {
  const result = db.query(`
    INSERT INTO products (
      name, slug, description, price_cents, category, image_path,
      stock_quantity, status, featured, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    product.name,
    product.slug,
    product.description,
    product.price_cents,
    product.category,
    product.image_path,
    product.stock_quantity,
    product.status,
    product.featured,
  );
  return getProductById(result.lastInsertRowid);
}

export function updateProduct(id, product) {
  db.query(`
    UPDATE products SET
      name = ?, slug = ?, description = ?, price_cents = ?, category = ?,
      image_path = ?, stock_quantity = ?, status = ?, featured = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    product.name,
    product.slug,
    product.description,
    product.price_cents,
    product.category,
    product.image_path,
    product.stock_quantity,
    product.status,
    product.featured,
    Number(id),
  );
  return getProductById(id);
}

export function setProductStatus(id, status) {
  if (!["active", "draft", "archived"].includes(status)) throw new Error("Invalid product status");
  db.query("UPDATE products SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, Number(id));
}

export function uniqueProductSlug(value, excludeId = null) {
  const base = slugify(value) || "handmade-item";
  let candidate = base;
  let number = 2;
  while (true) {
    const existing = excludeId
      ? db.query("SELECT id FROM products WHERE slug = ? AND id != ?").get(candidate, Number(excludeId))
      : db.query("SELECT id FROM products WHERE slug = ?").get(candidate);
    if (!existing) return candidate;
    candidate = `${base}-${number++}`;
  }
}

export function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function getDashboardStats() {
  const unreadContactMessages = db.query("SELECT COUNT(*) AS count FROM contact_messages WHERE is_read = 0").get().count;
  const unreadOrderMessages = db.query("SELECT COUNT(*) AS count FROM order_messages WHERE sender_role = 'customer' AND read_by_admin = 0").get().count;
  return {
    activeProducts: db.query("SELECT COUNT(*) AS count FROM products WHERE status = 'active'").get().count,
    draftProducts: db.query("SELECT COUNT(*) AS count FROM products WHERE status = 'draft'").get().count,
    newOrders: db.query("SELECT COUNT(*) AS count FROM orders WHERE status = 'new'").get().count,
    customerCount: db.query("SELECT COUNT(*) AS count FROM customers").get().count,
    unreadContactMessages,
    unreadOrderMessages,
    unreadMessages: unreadContactMessages + unreadOrderMessages,
  };
}

export function listOrders(limit = 100, group = "all") {
  const condition = group === "current"
    ? "WHERE status NOT IN ('completed', 'cancelled')"
    : group === "history"
      ? "WHERE status IN ('completed', 'cancelled')"
      : "";
  return db.query(`SELECT * FROM orders ${condition} ORDER BY datetime(created_at) DESC, id DESC LIMIT ?`).all(Math.max(1, Number(limit) || 100));
}

export function listCustomerOrders(customerId, group = "all", limit = 100) {
  const condition = group === "current"
    ? "AND status NOT IN ('completed', 'cancelled')"
    : group === "history"
      ? "AND status IN ('completed', 'cancelled')"
      : "";
  return db.query(`
    SELECT * FROM orders
    WHERE customer_id = ? ${condition}
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ?
  `).all(Number(customerId), Math.max(1, Number(limit) || 100));
}

export function getOrderById(id) {
  const order = db.query("SELECT * FROM orders WHERE id = ?").get(Number(id));
  if (!order) return null;
  order.items = db.query("SELECT * FROM order_items WHERE order_id = ? ORDER BY id").all(order.id);
  return order;
}

export function getCustomerOrder(customerId, orderNumber) {
  const order = db.query("SELECT * FROM orders WHERE customer_id = ? AND order_number = ?").get(Number(customerId), orderNumber);
  if (!order) return null;
  order.items = db.query("SELECT * FROM order_items WHERE order_id = ? ORDER BY id").all(order.id);
  order.history = getOrderStatusHistory(order.id);
  order.messages = listOrderMessages(order.id);
  return order;
}

export function getOrderStatusHistory(orderId) {
  return db.query("SELECT * FROM order_status_history WHERE order_id = ? ORDER BY datetime(created_at), id").all(Number(orderId));
}

export function updateOrderStatus(id, status) {
  const allowed = ["new", "confirmed", "making", "ready", "completed", "cancelled"];
  if (!allowed.includes(status)) throw new Error("Invalid order status");
  const update = db.transaction(() => {
    const order = db.query("SELECT status FROM orders WHERE id = ?").get(Number(id));
    if (!order || order.status === status) return;
    db.query("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, Number(id));
    db.query("INSERT INTO order_status_history (order_id, status) VALUES (?, ?)").run(Number(id), status);
  });
  update();
}

export function createOrder({ customer, customerId = null, cartItems }) {
  const settings = getSettings();
  const create = db.transaction(() => {
    const merged = new Map();
    for (const item of cartItems) {
      const productId = Number(item.productId);
      const quantity = Math.max(1, Math.min(Number(item.quantity) || 1, 25));
      if (!Number.isInteger(productId)) continue;
      merged.set(productId, Math.min((merged.get(productId) || 0) + quantity, 25));
    }
    if (merged.size === 0) throw orderError("Your bag is empty.");

    const resolvedItems = [];
    let subtotal = 0;
    for (const [productId, quantity] of merged) {
      const product = db.query("SELECT * FROM products WHERE id = ? AND status = 'active'").get(productId);
      if (!product) throw orderError("One of the items is no longer available. Please refresh your bag.");
      if (!Number.isInteger(product.price_cents) || product.price_cents <= 0) {
        throw orderError(`${product.name} is not ready to order yet.`);
      }
      if (product.stock_quantity < quantity) {
        throw orderError(`Only ${product.stock_quantity} of ${product.name} ${product.stock_quantity === 1 ? "is" : "are"} available.`);
      }
      const lineTotal = product.price_cents * quantity;
      subtotal += lineTotal;
      resolvedItems.push({ product, quantity, lineTotal });
    }

    const freeShipping = Number(settings.free_shipping_cents) || 0;
    const flatShipping = Math.max(0, Number(settings.flat_shipping_cents) || 0);
    const shipping = freeShipping > 0 && subtotal >= freeShipping ? 0 : flatShipping;
    const total = subtotal + shipping;
    const orderNumber = makeOrderNumber();
    const publicToken = randomBytes(18).toString("hex");

    const orderResult = db.query(`
      INSERT INTO orders (
        customer_id, order_number, public_token, customer_name, email, phone,
        address_line_1, address_line_2, city, state, postal_code, notes,
        subtotal_cents, shipping_cents, total_cents
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      customerId ? Number(customerId) : null,
      orderNumber,
      publicToken,
      customer.name,
      customer.email,
      customer.phone,
      customer.addressLine1,
      customer.addressLine2,
      customer.city,
      customer.state,
      customer.postalCode,
      customer.notes,
      subtotal,
      shipping,
      total,
    );

    const addItem = db.query(`
      INSERT INTO order_items (
        order_id, product_id, product_name, product_image,
        unit_price_cents, quantity, line_total_cents
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const reduceStock = db.query(`
      UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND stock_quantity >= ?
    `);

    for (const item of resolvedItems) {
      addItem.run(
        orderResult.lastInsertRowid,
        item.product.id,
        item.product.name,
        item.product.image_path,
        item.product.price_cents,
        item.quantity,
        item.lineTotal,
      );
      const stockResult = reduceStock.run(item.quantity, item.product.id, item.quantity);
      if (stockResult.changes !== 1) throw orderError(`The stock for ${item.product.name} just changed. Please try again.`);
    }

    db.query("INSERT INTO order_status_history (order_id, status) VALUES (?, 'new')").run(orderResult.lastInsertRowid);
    if (customerId) db.query("DELETE FROM saved_cart_items WHERE customer_id = ?").run(Number(customerId));

    return {
      id: Number(orderResult.lastInsertRowid),
      orderNumber,
      publicToken,
      total,
    };
  });

  return create();
}

export function addContactMessage({ name, email, message }) {
  db.query("INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)").run(name, email, message);
}

export function listContactMessages(limit = 100) {
  return db.query("SELECT * FROM contact_messages ORDER BY datetime(created_at) DESC, id DESC LIMIT ?").all(Math.max(1, Number(limit) || 100));
}

export function markMessageRead(id) {
  db.query("UPDATE contact_messages SET is_read = 1 WHERE id = ?").run(Number(id));
}

export function addOrderMessage({ orderId, customerId = null, senderRole, body }) {
  if (!["customer", "admin"].includes(senderRole)) throw new Error("Invalid message sender");
  const result = db.query(`
    INSERT INTO order_messages (
      order_id, customer_id, sender_role, body, read_by_customer, read_by_admin
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    Number(orderId),
    customerId ? Number(customerId) : null,
    senderRole,
    body,
    senderRole === "customer" ? 1 : 0,
    senderRole === "admin" ? 1 : 0,
  );
  return db.query("SELECT * FROM order_messages WHERE id = ?").get(result.lastInsertRowid);
}

export function listOrderMessages(orderId) {
  return db.query("SELECT * FROM order_messages WHERE order_id = ? ORDER BY datetime(created_at), id").all(Number(orderId));
}

export function markOrderMessagesRead(orderId, readerRole) {
  if (readerRole === "admin") {
    db.query("UPDATE order_messages SET read_by_admin = 1 WHERE order_id = ? AND sender_role = 'customer'").run(Number(orderId));
  } else if (readerRole === "customer") {
    db.query("UPDATE order_messages SET read_by_customer = 1 WHERE order_id = ? AND sender_role = 'admin'").run(Number(orderId));
  }
}

export function listOrderThreads(limit = 100) {
  return db.query(`
    SELECT orders.id AS order_id, orders.order_number, orders.customer_name, orders.email,
      latest.body, latest.sender_role, latest.created_at,
      SUM(CASE WHEN all_messages.sender_role = 'customer' AND all_messages.read_by_admin = 0 THEN 1 ELSE 0 END) AS unread_count
    FROM orders
    JOIN order_messages AS latest ON latest.id = (
      SELECT newest.id FROM order_messages AS newest
      WHERE newest.order_id = orders.id
      ORDER BY datetime(newest.created_at) DESC, newest.id DESC LIMIT 1
    )
    JOIN order_messages AS all_messages ON all_messages.order_id = orders.id
    GROUP BY orders.id
    ORDER BY datetime(latest.created_at) DESC, latest.id DESC
    LIMIT ?
  `).all(Math.max(1, Number(limit) || 100));
}

export function addSubscriber(email) {
  db.query("INSERT OR IGNORE INTO subscribers (email) VALUES (?)").run(email);
}

export function formatMoney(cents) {
  if (!Number.isInteger(cents)) return "Price coming soon";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function makeOrderNumber() {
  const today = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  return `MC-${today}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

function orderError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}
