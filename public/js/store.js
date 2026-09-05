(() => {
  const CART_KEY = "myngcraft-cart-v1";
  const CART_OWNER_KEY = "myngcraft-cart-owner-v1";
  const customerId = document.querySelector('meta[name="myng-customer-id"]')?.content || "";
  const customerCsrf = document.querySelector('meta[name="myng-customer-csrf"]')?.content || "";
  let bagSyncTimer;

  function normalizeCart(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => ({
        id: Number(item.id),
        name: String(item.name || "Item").slice(0, 140),
        price: Math.max(0, Number(item.price) || 0),
        image: String(item.image || "").slice(0, 300),
        slug: String(item.slug || "").slice(0, 100),
        quantity: Math.max(1, Math.min(Number(item.quantity) || 1, 25)),
      }))
      .filter((item) => Number.isInteger(item.id) && item.price > 0);
  }

  function readCart() {
    try {
      return normalizeCart(JSON.parse(localStorage.getItem(CART_KEY) || "[]"));
    } catch {
      return [];
    }
  }

  function saveCart(cart, { sync = true } = {}) {
    const normalized = normalizeCart(cart);
    localStorage.setItem(CART_KEY, JSON.stringify(normalized));
    updateCartCount(normalized);
    if (sync) scheduleSavedBagSync(normalized);
    return normalized;
  }

  function scheduleSavedBagSync(cart) {
    if (!customerId || !customerCsrf) return;
    clearTimeout(bagSyncTimer);
    bagSyncTimer = setTimeout(() => persistSavedBag(cart), 450);
  }

  async function persistSavedBag(cart) {
    if (!customerId || !customerCsrf) return null;
    try {
      const response = await fetch("/api/account/bag", {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": customerCsrf,
        },
        body: JSON.stringify({
          items: normalizeCart(cart).map((item) => ({ productId: item.id, quantity: item.quantity })),
        }),
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return null;
      const result = await response.json();
      return normalizeCart(result.items);
    } catch {
      return null;
    }
  }

  function mergeCarts(localItems, serverItems) {
    const merged = new Map(normalizeCart(localItems).map((item) => [item.id, item]));
    for (const serverItem of normalizeCart(serverItems)) {
      const localItem = merged.get(serverItem.id);
      merged.set(serverItem.id, {
        ...serverItem,
        quantity: Math.max(serverItem.quantity, localItem?.quantity || 0),
      });
    }
    return [...merged.values()];
  }

  async function hydrateSavedBag() {
    if (!customerId) {
      localStorage.setItem(CART_OWNER_KEY, "guest");
      return;
    }

    try {
      const response = await fetch("/api/account/bag", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return;
      const result = await response.json();
      const serverCart = normalizeCart(result.items);
      const previousOwner = localStorage.getItem(CART_OWNER_KEY);
      let resolvedCart = serverCart;

      if (!previousOwner || previousOwner === "guest") {
        const mergedCart = mergeCarts(readCart(), serverCart);
        resolvedCart = (await persistSavedBag(mergedCart)) || mergedCart;
      }

      localStorage.setItem(CART_OWNER_KEY, customerId);
      saveCart(resolvedCart, { sync: false });
    } catch {
      // The local bag remains usable if account syncing is temporarily unavailable.
    }
  }

  function updateCartCount(cart = readCart()) {
    const count = cart.reduce((total, item) => total + item.quantity, 0);
    document.querySelectorAll("[data-cart-count]").forEach((element) => {
      element.textContent = String(count);
      element.setAttribute("aria-label", `${count} ${count === 1 ? "item" : "items"} in bag`);
    });
  }

  function formatMoney(cents) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  }

  function showToast(message) {
    const toast = document.querySelector("[data-toast]");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(showToast.timeout);
    showToast.timeout = setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }

  function addToCart(button) {
    const id = Number(button.dataset.productId);
    const quantityControl = document.querySelector("[data-product-quantity]");
    const quantity = Math.max(1, Math.min(Number(quantityControl?.value) || 1, 25));
    const cart = readCart();
    const existing = cart.find((item) => item.id === id);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + quantity, 25);
    } else {
      cart.push({
        id,
        name: button.dataset.productName,
        price: Number(button.dataset.productPrice),
        image: button.dataset.productImage,
        slug: button.dataset.productSlug,
        quantity,
      });
    }
    saveCart(cart);
    showToast(`${button.dataset.productName} was added to your bag.`);
  }

  document.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-add-to-cart]");
    if (addButton) addToCart(addButton);
  });

  const menuButton = document.querySelector("[data-menu-button]");
  if (menuButton) {
    menuButton.addEventListener("click", () => {
      const open = document.body.classList.toggle("menu-open");
      menuButton.setAttribute("aria-expanded", String(open));
    });
  }

  const siteHeader = document.querySelector("[data-site-header]");
  if (siteHeader) {
    const updateHeader = () => siteHeader.classList.toggle("is-stuck", window.scrollY > 80);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
  }

  function renderCartPage() {
    const root = document.querySelector("[data-cart-page]");
    if (!root) return;
    const cart = readCart();
    root.replaceChildren();
    if (!cart.length) {
      const empty = document.createElement("div");
      empty.className = "cart-empty";
      empty.innerHTML = '<span>♡</span><h2>Your bag is waiting.</h2><p>Take a look around and find a piece that feels like you.</p><a class="button button-primary" href="/shop">Browse the shop</a>';
      root.append(empty);
      return;
    }

    const layout = document.createElement("div");
    layout.className = "cart-layout";
    const list = document.createElement("div");
    list.className = "cart-list";
    const template = document.querySelector("#cart-item-template");

    for (const item of cart) {
      const fragment = template.content.cloneNode(true);
      const article = fragment.querySelector(".cart-item");
      article.dataset.itemId = String(item.id);
      fragment.querySelector("[data-item-image]").src = item.image;
      fragment.querySelector("[data-item-image]").alt = item.name;
      fragment.querySelectorAll("[data-item-link]").forEach((link) => { link.href = `/product/${encodeURIComponent(item.slug)}`; });
      fragment.querySelector("[data-item-name]").textContent = item.name;
      fragment.querySelector("[data-item-price]").textContent = formatMoney(item.price);
      fragment.querySelector("[data-item-total]").textContent = formatMoney(item.price * item.quantity);
      const select = fragment.querySelector("[data-item-quantity]");
      for (let number = 1; number <= 25; number += 1) {
        const option = document.createElement("option");
        option.value = String(number);
        option.textContent = String(number);
        option.selected = number === item.quantity;
        select.append(option);
      }
      select.addEventListener("change", () => {
        const current = readCart();
        const target = current.find((entry) => entry.id === item.id);
        if (target) target.quantity = Number(select.value);
        saveCart(current);
        renderCartPage();
      });
      fragment.querySelector("[data-remove-item]").addEventListener("click", () => {
        saveCart(readCart().filter((entry) => entry.id !== item.id));
        renderCartPage();
        showToast(`${item.name} was removed.`);
      });
      list.append(fragment);
    }

    const subtotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);
    const summary = document.createElement("aside");
    summary.className = "cart-summary";
    const heading = document.createElement("h2");
    heading.textContent = "Bag summary";
    const subtotalRow = document.createElement("p");
    subtotalRow.innerHTML = `<span>Subtotal</span><strong>${formatMoney(subtotal)}</strong>`;
    const shippingRow = document.createElement("p");
    shippingRow.innerHTML = "<span>Shipping</span><strong>At checkout</strong>";
    const totalRow = document.createElement("p");
    totalRow.className = "cart-total";
    totalRow.innerHTML = `<span>Current total</span><strong>${formatMoney(subtotal)}</strong>`;
    const checkoutLink = document.createElement("a");
    checkoutLink.className = "button button-primary";
    checkoutLink.href = "/checkout";
    checkoutLink.textContent = "Continue to checkout";
    const note = document.createElement("small");
    note.textContent = "You can review everything once more before sending your order.";
    summary.append(heading, subtotalRow, shippingRow, totalRow, checkoutLink, note);
    layout.append(list, summary);
    root.append(layout);
  }

  function renderCheckout() {
    const root = document.querySelector("[data-checkout-page]");
    if (!root) return;
    const cart = readCart();
    const itemsRoot = root.querySelector("[data-checkout-items]");
    const submit = root.querySelector("[data-checkout-submit]");
    itemsRoot.replaceChildren();

    if (!cart.length) {
      const empty = document.createElement("p");
      empty.textContent = "Your bag is empty. Visit the shop before checking out.";
      itemsRoot.append(empty);
      submit.disabled = true;
    }

    for (const item of cart) {
      const row = document.createElement("div");
      row.className = "summary-item";
      const image = document.createElement("img");
      image.src = item.image;
      image.alt = "";
      const copy = document.createElement("p");
      const name = document.createElement("strong");
      name.textContent = item.name;
      const quantity = document.createElement("small");
      quantity.textContent = `Quantity ${item.quantity}`;
      copy.append(name, quantity);
      const total = document.createElement("b");
      total.textContent = formatMoney(item.price * item.quantity);
      row.append(image, copy, total);
      itemsRoot.append(row);
    }

    const subtotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);
    const threshold = Math.max(0, Number(root.dataset.freeShipping) || 0);
    const flatShipping = Math.max(0, Number(root.dataset.flatShipping) || 0);
    const shipping = threshold > 0 && subtotal >= threshold ? 0 : flatShipping;
    root.querySelector("[data-checkout-subtotal]").textContent = formatMoney(subtotal);
    root.querySelector("[data-checkout-shipping]").textContent = shipping === 0 ? "Free" : formatMoney(shipping);
    root.querySelector("[data-checkout-total]").textContent = formatMoney(subtotal + shipping);

    const form = root.querySelector("[data-checkout-form]");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const errorBox = root.querySelector("[data-checkout-error]");
      errorBox.hidden = true;
      submit.disabled = true;
      submit.textContent = "Saving your order…";
      const data = new FormData(form);
      const customer = Object.fromEntries(data.entries());
      try {
        const response = await fetch("/api/orders", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": customerCsrf,
          },
          body: JSON.stringify({
            customer,
            items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })),
          }),
        });
        const isJson = response.headers.get("content-type")?.includes("application/json");
        const result = isJson ? await response.json() : {};
        if (response.redirected) throw new Error("Please sign in again before sending your order.");
        if (!response.ok) throw new Error(result.error || "We couldn't save the order.");
        localStorage.removeItem(CART_KEY);
        window.location.assign(result.redirect);
      } catch (error) {
        errorBox.textContent = error.message || "We couldn't save the order. Please try again.";
        errorBox.hidden = false;
        errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
        submit.disabled = false;
        submit.textContent = "Send my order request";
      }
    });
  }

  document.querySelectorAll("[data-customer-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = button.closest(".customer-password-field")?.querySelector("input");
      if (!input) return;
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      button.textContent = showing ? "Show" : "Hide";
      button.setAttribute("aria-pressed", String(!showing));
    });
  });

  updateCartCount();
  hydrateSavedBag().finally(() => {
    updateCartCount();
    renderCartPage();
    renderCheckout();
  });
})();
