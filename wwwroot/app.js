const productGrid = document.querySelector("#product-grid");
const categoryList = document.querySelector("#category-list");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const sortSelect = document.querySelector("#sort-select");
const resultsLabel = document.querySelector("#results-label");
const emptyState = document.querySelector("#empty-state");
const cartCount = document.querySelector("#cart-count");
const cartDrawer = document.querySelector("#cart-drawer");
const cartBackdrop = document.querySelector("#cart-backdrop");
const cartItems = document.querySelector("#cart-items");
const cartEmpty = document.querySelector("#cart-empty");
const cartSummary = document.querySelector("#cart-summary");
const toast = document.querySelector("#toast");

const state = { category: "All", search: "" };
const money = amount => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers }
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.title || detail.message || "Something went wrong. Please try again.");
  }
  return response.status === 204 ? null : response.json();
}

function showError(error) {
  showToast(error.message || "Something went wrong. Please try again.");
}

let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2400);
}

async function loadCategories() {
  const categories = await api("/api/categories");
  categoryList.replaceChildren();
  ["All", ...categories].forEach(category => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `category-button${state.category === category ? " active" : ""}`;
    button.textContent = category;
    button.setAttribute("aria-pressed", String(state.category === category));
    button.addEventListener("click", () => {
      state.category = category;
      loadCategories();
      loadProducts().catch(showError);
    });
    categoryList.append(button);
  });
}

async function loadProducts() {
  const params = new URLSearchParams();
  if (state.search) params.set("search", state.search);
  if (state.category !== "All") params.set("category", state.category);
  if (sortSelect.value !== "featured") params.set("sort", sortSelect.value);
  const products = await api(`/api/products?${params}`);
  productGrid.replaceChildren();
  resultsLabel.textContent = `${products.length} ${products.length === 1 ? "item" : "items"} to make your day`;
  emptyState.hidden = products.length !== 0;
  productGrid.hidden = products.length === 0;

  products.forEach(product => {
    const card = document.createElement("article");
    card.className = "product-card";
    const visual = document.createElement("div");
    visual.className = "product-visual";
    visual.style.backgroundColor = ["#f3f0e8", "#f3eae4", "#edf0e8", "#eeeaf1"][product.id % 4];
    const category = document.createElement("span");
    category.className = "product-category";
    category.textContent = product.category;
    const icon = document.createElement("span");
    icon.className = "product-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = product.icon;
    visual.append(category, icon);

    const details = document.createElement("div");
    details.className = "product-details";
    const titleRow = document.createElement("div");
    titleRow.className = "product-title-row";
    const title = document.createElement("h3");
    title.className = "product-title";
    title.textContent = product.name;
    const price = document.createElement("span");
    price.className = "product-price";
    price.textContent = money(product.price);
    titleRow.append(title, price);
    const rating = document.createElement("p");
    rating.className = "rating";
    rating.textContent = `★ ${product.rating.toFixed(1)}`;
    const reviewCount = document.createElement("span");
    reviewCount.textContent = `(${product.reviewCount})`;
    rating.append(reviewCount);
    const description = document.createElement("p");
    description.className = "product-description";
    description.textContent = product.description;
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "add-button";
    addButton.textContent = "Add to cart";
    addButton.addEventListener("click", () => addToCart(product.id));
    details.append(titleRow, rating, description, addButton);
    card.append(visual, details);
    productGrid.append(card);
  });
}

async function refreshCart() {
  const cart = await api("/api/cart");
  cartCount.textContent = cart.itemCount;
  cartCount.setAttribute("aria-label", `${cart.itemCount} items`);
  cartItems.replaceChildren();
  cartEmpty.hidden = cart.items.length > 0;
  cartSummary.hidden = cart.items.length === 0;
  cartItems.hidden = cart.items.length === 0;
  document.querySelector("#cart-subtotal").textContent = money(cart.subtotal);

  cart.items.forEach(item => {
    const row = document.createElement("div");
    row.className = "cart-row";
    const art = document.createElement("div");
    art.className = "cart-row-art";
    art.setAttribute("aria-hidden", "true");
    art.textContent = item.product.icon;
    const info = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = item.product.name;
    const quantity = document.createElement("p");
    quantity.textContent = `${item.quantity} × ${money(item.product.price)}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-item";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => removeFromCart(item.product.id));
    info.append(title, quantity, remove);
    const total = document.createElement("span");
    total.className = "cart-row-total";
    total.textContent = money(item.lineTotal);
    row.append(art, info, total);
    cartItems.append(row);
  });
}

async function addToCart(productId) {
  try {
    await api("/api/cart/items", { method: "POST", body: JSON.stringify({ productId, quantity: 1 }) });
    await refreshCart();
    showToast("Added to your cart");
  } catch (error) {
    showError(error);
  }
}

async function removeFromCart(productId) {
  try {
    await api(`/api/cart/items/${productId}`, { method: "DELETE" });
    await refreshCart();
  } catch (error) {
    showError(error);
  }
}

function setCartOpen(open) {
  cartDrawer.classList.toggle("open", open);
  cartDrawer.setAttribute("aria-hidden", String(!open));
  cartBackdrop.hidden = !open;
  document.body.style.overflow = open ? "hidden" : "";
  if (open) document.querySelector("#cart-close").focus();
}

searchForm.addEventListener("submit", event => {
  event.preventDefault();
  state.search = searchInput.value.trim();
  loadProducts().catch(showError);
});
searchInput.addEventListener("search", () => {
  state.search = searchInput.value.trim();
  loadProducts().catch(showError);
});
sortSelect.addEventListener("change", () => loadProducts().catch(showError));
document.querySelector("#cart-toggle").addEventListener("click", () => setCartOpen(true));
document.querySelector("#cart-close").addEventListener("click", () => setCartOpen(false));
document.querySelector("#keep-shopping").addEventListener("click", () => setCartOpen(false));
cartBackdrop.addEventListener("click", () => setCartOpen(false));
document.addEventListener("keydown", event => {
  if (event.key === "Escape") setCartOpen(false);
});
document.querySelector("#clear-cart").addEventListener("click", async () => {
  try {
    await api("/api/cart", { method: "DELETE" });
    await refreshCart();
  } catch (error) {
    showError(error);
  }
});
document.querySelector("#checkout-button").addEventListener("click", () => showToast("Checkout is coming soon."));

Promise.all([loadCategories(), loadProducts(), refreshCart()]).catch(showError);
