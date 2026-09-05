import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { once } from "node:events";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { assertSecureProductionConfig, createRateLimiter } from "../lib/security.js";

const testDatabasePath = join("/tmp", `myngcraft-db-test-${process.pid}.sqlite`);
const testPort = 24000 + (process.pid % 10000);
process.env.DATABASE_PATH = testDatabasePath;
process.env.ADMIN_PASSWORD = "test-owner-password";
process.env.SESSION_SECRET = "test-session-secret";
process.env.NODE_ENV = "test";
process.env.COOKIE_SECURE = "false";

let store;
let serverStore;
let httpServer;
let baseUrl;
let customer;
let customerOrder;

beforeAll(async () => {
  store = await import(`../lib/db.js?test=${Date.now()}`);
  const { default: app } = await import(`../server.js?test=${Date.now()}`);
  serverStore = await import("../lib/db.js");
  httpServer = app.listen(testPort, "127.0.0.1");
  await once(httpServer, "listening");
  baseUrl = `http://127.0.0.1:${testPort}`;
});

afterAll(async () => {
  if (httpServer?.listening) {
    httpServer.close();
    await once(httpServer, "close");
  }
  serverStore?.db.close();
  store?.db.close();
  for (const suffix of ["", "-shm", "-wal"]) {
    const path = `${testDatabasePath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

describe("MyngCraft store data", () => {
  test("starts with the migrated catalog and editable settings", () => {
    expect(store.getSettings().store_name).toBe("Myng's Crafts");
    expect(store.listProducts()).toHaveLength(1);
    expect(store.listProducts()[0].category).toBe("Jewelry");
  });

  test("creates a sellable item with a unique address", () => {
    const product = store.createProduct({
      name: "Rose Drop Earrings",
      slug: store.uniqueProductSlug("Rose Drop Earrings"),
      description: "Handmade for the test catalog.",
      price_cents: 2500,
      category: "Jewelry",
      image_path: "/images/myngcraft-cat-jewelry.jpg",
      stock_quantity: 2,
      status: "active",
      featured: 1,
    });
    expect(product.slug).toBe("rose-drop-earrings");
    expect(store.uniqueProductSlug("Rose Drop Earrings")).toBe("rose-drop-earrings-2");
  });

  test("creates a customer account and updates saved information", async () => {
    customer = store.createCustomer({
      email: "Customer@Example.com",
      password_hash: await Bun.password.hash("a-good-test-password"),
      first_name: "Test",
      last_name: "Customer",
    });
    expect(store.getCustomerByEmail("CUSTOMER@example.com").id).toBe(customer.id);
    expect(await Bun.password.verify("a-good-test-password", customer.password_hash)).toBe(true);

    customer = store.updateCustomerProfile(customer.id, {
      email: "customer@example.com",
      first_name: "Test",
      last_name: "Customer",
      phone: "305-555-0100",
      address_line_1: "100 Test Lane",
      address_line_2: "Apt 2",
      city: "Miami",
      state: "FL",
      postal_code: "33101",
    });
    expect(customer.address_line_2).toBe("Apt 2");
    expect(customer.city).toBe("Miami");
  });

  test("keeps customer favorites and a saved bag", () => {
    const product = store.listProducts({ search: "Rose Drop" })[0];
    expect(store.toggleCustomerFavorite(customer.id, product.id)).toBe(true);
    expect(store.listCustomerFavorites(customer.id)[0].id).toBe(product.id);

    const bag = store.replaceSavedBag(customer.id, [
      { productId: product.id, quantity: 1 },
      { productId: product.id, quantity: 1 },
    ]);
    expect(bag).toHaveLength(1);
    expect(bag[0].quantity).toBe(2);
    expect(store.getCustomerAccountStats(customer.id).bagItems).toBe(2);
  });

  test("records an order using trusted prices and reduces stock", () => {
    const product = store.listProducts({ search: "Rose Drop" })[0];
    customerOrder = store.createOrder({
      customerId: customer.id,
      customer: {
        name: "Test Customer",
        email: "customer@example.com",
        phone: "",
        addressLine1: "100 Test Lane",
        addressLine2: "",
        city: "Miami",
        state: "FL",
        postalCode: "33101",
        notes: "",
      },
      cartItems: [{ productId: product.id, quantity: 1 }],
    });
    expect(customerOrder.total).toBe(3100);
    expect(store.getProductById(product.id).stock_quantity).toBe(1);
    expect(store.listOrders()).toHaveLength(1);
    expect(store.listCustomerOrders(customer.id, "current")).toHaveLength(1);
    expect(store.getSavedBag(customer.id)).toHaveLength(0);
    expect(store.getCustomerOrder(customer.id, store.listOrders()[0].order_number).history[0].status).toBe("new");
  });

  test("keeps order conversations, read state, and status history together", () => {
    const order = store.getOrderById(customerOrder.id);
    store.addOrderMessage({ orderId: order.id, customerId: customer.id, senderRole: "customer", body: "Could you gift wrap this?" });
    expect(store.getDashboardStats().unreadOrderMessages).toBe(1);
    expect(store.listOrderThreads()[0].order_number).toBe(order.order_number);
    store.markOrderMessagesRead(order.id, "admin");
    expect(store.getDashboardStats().unreadOrderMessages).toBe(0);

    store.addOrderMessage({ orderId: order.id, customerId: customer.id, senderRole: "admin", body: "Absolutely — I will wrap it." });
    expect(store.getCustomerAccountStats(customer.id).unreadMessages).toBe(1);
    store.markOrderMessagesRead(order.id, "customer");
    expect(store.getCustomerAccountStats(customer.id).unreadMessages).toBe(0);

    store.updateOrderStatus(order.id, "confirmed");
    store.updateOrderStatus(order.id, "making");
    store.updateOrderStatus(order.id, "ready");
    store.updateOrderStatus(order.id, "completed");
    expect(store.getOrderStatusHistory(order.id).map((entry) => entry.status)).toEqual(["new", "confirmed", "making", "ready", "completed"]);
    expect(store.listCustomerOrders(customer.id, "current")).toHaveLength(0);
    expect(store.listCustomerOrders(customer.id, "history")).toHaveLength(1);
    expect(store.listCustomers()[0].total_spent_cents).toBe(3100);
  });

  test("stores customer messages for the owner dashboard", () => {
    store.addContactMessage({ name: "A Customer", email: "hello@example.com", message: "Can this be made in blue?" });
    expect(store.getDashboardStats().unreadMessages).toBe(1);
    expect(store.listContactMessages()[0].name).toBe("A Customer");
  });
});

describe("Security controls", () => {
  test("rate limits repeated requests and resets after its window", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 10_000, maxKeys: 10 });
    expect(limiter.consume("client", 1_000).allowed).toBe(true);
    expect(limiter.consume("client", 1_001).allowed).toBe(true);
    const blocked = limiter.consume("client", 1_002);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBe(10);
    expect(limiter.consume("client", 11_001).allowed).toBe(true);
  });

  test("refuses unsafe production secrets", () => {
    const original = {
      nodeEnv: process.env.NODE_ENV,
      adminPassword: process.env.ADMIN_PASSWORD,
      adminPasswordHash: process.env.ADMIN_PASSWORD_HASH,
      sessionSecret: process.env.SESSION_SECRET,
      cookieSecure: process.env.COOKIE_SECURE,
    };
    try {
      process.env.NODE_ENV = "production";
      process.env.ADMIN_PASSWORD = "short";
      delete process.env.ADMIN_PASSWORD_HASH;
      process.env.SESSION_SECRET = "short";
      process.env.COOKIE_SECURE = "false";
      expect(() => assertSecureProductionConfig()).toThrow("Refusing to start");
    } finally {
      process.env.NODE_ENV = original.nodeEnv;
      process.env.ADMIN_PASSWORD = original.adminPassword;
      if (original.adminPasswordHash === undefined) delete process.env.ADMIN_PASSWORD_HASH;
      else process.env.ADMIN_PASSWORD_HASH = original.adminPasswordHash;
      process.env.SESSION_SECRET = original.sessionSecret;
      process.env.COOKIE_SECURE = original.cookieSecure;
    }
  });
});

describe("Customer and owner web experience", () => {
  test("supports customer sign-up, sign-in, saved shopping, orders, and two-way messages", async () => {
    const protectedCheckout = await fetch(`${baseUrl}/checkout`, { redirect: "manual" });
    expect(protectedCheckout.status).toBe(303);
    expect(protectedCheckout.headers.get("location")).toContain("/account/sign-in");
    expect(protectedCheckout.headers.get("cache-control")).toContain("no-store");

    const signInPage = await fetch(`${baseUrl}/account/sign-in`);
    expect(signInPage.status).toBe(200);
    expect(signInPage.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(signInPage.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(signInPage.headers.get("x-powered-by")).toBeNull();
    expect(await signInPage.text()).toContain("Sign in to your little corner");

    const crossSiteWrite = await fetch(`${baseUrl}/newsletter`, {
      method: "POST",
      redirect: "manual",
      headers: {
        Origin: "https://attacker.example",
        "Sec-Fetch-Site": "cross-site",
      },
      body: new URLSearchParams({ email: "blocked@example.com" }),
    });
    expect(crossSiteWrite.status).toBe(403);

    const registration = await fetch(`${baseUrl}/account/create`, {
      method: "POST",
      redirect: "manual",
      body: new URLSearchParams({
        first_name: "Maria",
        last_name: "Tester",
        email: "maria-web@example.com",
        password: "customer-pass-123",
        password_confirmation: "customer-pass-123",
        return_to: "/account",
      }),
    });
    expect(registration.status).toBe(303);
    let customerCookie = cookieFrom(registration);
    expect(customerCookie).toContain("myng_customer=");
    expect(registration.headers.get("set-cookie")).toContain("HttpOnly");

    let accountPage = await fetch(`${baseUrl}/account`, { headers: { Cookie: customerCookie } });
    let accountHtml = await accountPage.text();
    expect(accountPage.status).toBe(200);
    expect(accountHtml).toContain("Hello, Maria");
    let customerCsrf = metaContent(accountHtml, "myng-customer-csrf");

    const signOut = await fetch(`${baseUrl}/account/sign-out`, {
      method: "POST",
      redirect: "manual",
      headers: { Cookie: customerCookie },
      body: new URLSearchParams({ _csrf: customerCsrf }),
    });
    expect(signOut.status).toBe(303);

    const badLogin = await fetch(`${baseUrl}/account/sign-in`, {
      method: "POST",
      redirect: "manual",
      body: new URLSearchParams({ email: "maria-web@example.com", password: "wrong-password", return_to: "/account" }),
    });
    expect(badLogin.status).toBe(401);

    const login = await fetch(`${baseUrl}/account/sign-in`, {
      method: "POST",
      redirect: "manual",
      body: new URLSearchParams({ email: "maria-web@example.com", password: "customer-pass-123", return_to: "/account" }),
    });
    expect(login.status).toBe(303);
    customerCookie = cookieFrom(login);

    accountPage = await fetch(`${baseUrl}/account`, { headers: { Cookie: customerCookie } });
    accountHtml = await accountPage.text();
    customerCsrf = metaContent(accountHtml, "myng-customer-csrf");
    expect(customerCsrf.length).toBeGreaterThan(20);

    const profileSave = await fetch(`${baseUrl}/account/profile`, {
      method: "POST",
      redirect: "manual",
      headers: { Cookie: customerCookie },
      body: new URLSearchParams({
        _csrf: customerCsrf,
        first_name: "Maria",
        last_name: "Tester",
        email: "maria-web@example.com",
        phone: "305-555-0199",
        address_line_1: "200 Web Lane",
        address_line_2: "Unit 3",
        city: "Miami",
        state: "FL",
        postal_code: "33101",
      }),
    });
    expect(profileSave.status).toBe(303);
    expect(serverStore.getCustomerByEmail("maria-web@example.com").address_line_2).toBe("Unit 3");

    const previousCustomerCookie = customerCookie;
    const passwordChange = await fetch(`${baseUrl}/account/password`, {
      method: "POST",
      redirect: "manual",
      headers: { Cookie: customerCookie },
      body: new URLSearchParams({
        _csrf: customerCsrf,
        current_password: "customer-pass-123",
        new_password: "a-new-customer-passphrase",
        new_password_confirmation: "a-new-customer-passphrase",
      }),
    });
    expect(passwordChange.status).toBe(303);
    customerCookie = cookieFrom(passwordChange);
    expect(customerCookie).not.toBe(previousCustomerCookie);

    const oldSession = await fetch(`${baseUrl}/account`, {
      redirect: "manual",
      headers: { Cookie: previousCustomerCookie },
    });
    expect(oldSession.status).toBe(303);
    expect(oldSession.headers.get("location")).toContain("/account/sign-in");

    accountPage = await fetch(`${baseUrl}/account`, { headers: { Cookie: customerCookie } });
    accountHtml = await accountPage.text();
    expect(accountPage.status).toBe(200);
    customerCsrf = metaContent(accountHtml, "myng-customer-csrf");

    const product = serverStore.listProducts({ search: "Rose Drop" })[0];
    const favorite = await fetch(`${baseUrl}/account/favorites/${product.id}/toggle`, {
      method: "POST",
      redirect: "manual",
      headers: { Cookie: customerCookie },
      body: new URLSearchParams({ _csrf: customerCsrf, return_to: "/account/favorites" }),
    });
    expect(favorite.status).toBe(303);

    const favoritesPage = await fetch(`${baseUrl}/account/favorites`, { headers: { Cookie: customerCookie } });
    expect(await favoritesPage.text()).toContain("Rose Drop Earrings");

    const savedBag = await fetch(`${baseUrl}/api/account/bag`, {
      method: "PUT",
      headers: {
        Cookie: customerCookie,
        "Content-Type": "application/json",
        "x-csrf-token": customerCsrf,
      },
      body: JSON.stringify({ items: [{ productId: product.id, quantity: 1 }] }),
    });
    expect(savedBag.status).toBe(200);
    expect((await savedBag.json()).items[0].name).toBe("Rose Drop Earrings");

    const orderResponse = await fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      headers: {
        Cookie: customerCookie,
        "Content-Type": "application/json",
        "x-csrf-token": customerCsrf,
      },
      body: JSON.stringify({
        customer: {
          name: "Maria Tester",
          email: "maria-web@example.com",
          phone: "305-555-0199",
          addressLine1: "200 Web Lane",
          addressLine2: "Unit 3",
          city: "Miami",
          state: "FL",
          postalCode: "33101",
          notes: "Please use blue ribbon.",
        },
        items: [{ productId: product.id, quantity: 1 }],
      }),
    });
    expect(orderResponse.status).toBe(201);
    const createdOrder = await orderResponse.json();
    expect(createdOrder.orderNumber.startsWith("MC-")).toBe(true);
    expect(createdOrder.redirect).toBe(`/account/orders/${createdOrder.orderNumber}`);
    expect(serverStore.getSavedBag(serverStore.getCustomerByEmail("maria-web@example.com").id)).toHaveLength(0);

    let customerOrderPage = await fetch(`${baseUrl}/account/orders/${createdOrder.orderNumber}`, { headers: { Cookie: customerCookie } });
    let customerOrderHtml = await customerOrderPage.text();
    expect(customerOrderHtml).toContain("Order received");
    expect(customerOrderHtml).toContain("Rose Drop Earrings");

    const customerMessage = await fetch(`${baseUrl}/account/orders/${createdOrder.orderNumber}/messages`, {
      method: "POST",
      redirect: "manual",
      headers: { Cookie: customerCookie },
      body: new URLSearchParams({ _csrf: customerCsrf, message: "Can you make sure this is gift wrapped?" }),
    });
    expect(customerMessage.status).toBe(303);

    const ownerLogin = await fetch(`${baseUrl}/admin/login`, {
      method: "POST",
      redirect: "manual",
      body: new URLSearchParams({ password: "test-owner-password" }),
    });
    expect(ownerLogin.status).toBe(303);
    const ownerCookie = cookieFrom(ownerLogin);
    expect(ownerLogin.headers.get("set-cookie")).toContain("SameSite=Strict");
    expect(ownerLogin.headers.get("set-cookie")).toContain("Path=/admin");
    const ownerHome = await fetch(`${baseUrl}/admin`, { headers: { Cookie: ownerCookie } });
    const ownerHomeHtml = await ownerHome.text();
    const ownerCsrf = hiddenValue(ownerHomeHtml, "_csrf");
    expect(ownerHome.headers.get("cache-control")).toContain("no-store");
    expect(ownerHomeHtml).toContain("Maria Tester");

    const invalidUploadForm = new FormData();
    invalidUploadForm.set("_csrf", ownerCsrf);
    invalidUploadForm.set("name", "Not Really an Image");
    invalidUploadForm.set("price", "20.00");
    invalidUploadForm.set("stock_quantity", "1");
    invalidUploadForm.set("category", "Jewelry");
    invalidUploadForm.set("published", "on");
    invalidUploadForm.set("image", new Blob(["not an image"], { type: "image/png" }), "fake.png");
    const invalidUpload = await fetch(`${baseUrl}/admin/products`, {
      method: "POST",
      redirect: "manual",
      headers: { Cookie: ownerCookie },
      body: invalidUploadForm,
    });
    expect(invalidUpload.status).toBe(400);
    expect(await invalidUpload.text()).toContain("does not contain a valid JPG, PNG, or WebP photo");
    expect(serverStore.listProducts({ includeHidden: true, search: "Not Really" })).toHaveLength(0);

    const adminMessages = await fetch(`${baseUrl}/admin/messages`, { headers: { Cookie: ownerCookie } });
    expect(await adminMessages.text()).toContain("Can you make sure this is gift wrapped?");

    const order = serverStore.listOrders().find((item) => item.order_number === createdOrder.orderNumber);
    const statusUpdate = await fetch(`${baseUrl}/admin/orders/${order.id}/status`, {
      method: "POST",
      redirect: "manual",
      headers: { Cookie: ownerCookie },
      body: new URLSearchParams({ _csrf: ownerCsrf, status: "ready" }),
    });
    expect(statusUpdate.status).toBe(303);

    const ownerReply = await fetch(`${baseUrl}/admin/orders/${order.id}/messages`, {
      method: "POST",
      redirect: "manual",
      headers: { Cookie: ownerCookie },
      body: new URLSearchParams({ _csrf: ownerCsrf, message: "Yes — it is gift wrapped and on the way." }),
    });
    expect(ownerReply.status).toBe(303);

    customerOrderPage = await fetch(`${baseUrl}/account/orders/${createdOrder.orderNumber}`, { headers: { Cookie: customerCookie } });
    customerOrderHtml = await customerOrderPage.text();
    expect(customerOrderHtml).toContain("Sent");
    expect(customerOrderHtml).toContain("Yes — it is gift wrapped and on the way.");

    const customersPage = await fetch(`${baseUrl}/admin/customers`, { headers: { Cookie: ownerCookie } });
    expect(await customersPage.text()).toContain("maria-web@example.com");
  }, 15000);
});

function cookieFrom(response) {
  return String(response.headers.get("set-cookie") || "").split(";")[0];
}

function metaContent(html, name) {
  return html.match(new RegExp(`<meta name="${name}" content="([^"]+)"`))?.[1] || "";
}

function hiddenValue(html, name) {
  return html.match(new RegExp(`name="${name}" value="([^"]+)"`))?.[1] || "";
}
