const productGrid = document.querySelector("#product-grid");
const categoryList = document.querySelector("#category-list");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const sortSelect = document.querySelector("#sort-select");
const shopPage = document.querySelector("#shop");
const statsPage = document.querySelector("#stats-page");
const browseBar = document.querySelector(".browse-bar");
const statsToggle = document.querySelector("#stats-toggle");
const resultsLabel = document.querySelector("#results-label");
const emptyState = document.querySelector("#empty-state");
const cartCount = document.querySelector("#cart-count");
const cartDrawer = document.querySelector("#cart-drawer");
const cartBackdrop = document.querySelector("#cart-backdrop");
const accountDrawer = document.querySelector("#account-drawer");
const accountBackdrop = document.querySelector("#account-backdrop");
const cartItems = document.querySelector("#cart-items");
const cartEmpty = document.querySelector("#cart-empty");
const cartSummary = document.querySelector("#cart-summary");
const toast = document.querySelector("#toast");

const state = { category: "All", subcategory: "", search: "" };
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
  const categoryButtons = [
    { name: "All", subcategories: [] },
    ...categories
  ];
  categoryButtons.forEach(category => {
    const button = document.createElement("button");
    button.type = "button";
    const isActive = state.category === category.name && !state.subcategory;
    button.className = `category-button${isActive ? " active" : ""}`;
    button.textContent = category.name;
    button.setAttribute("aria-pressed", String(isActive));
    button.addEventListener("click", () => {
      if (category.name !== "All") {
        trackCategoryClick(category.name).catch(showError);
      }
      state.category = category.name;
      state.subcategory = "";
      loadCategories().catch(showError);
      loadProducts().catch(showError);
    });
    categoryList.append(button);

    if (category.name === state.category && category.name !== "All") {
      category.subcategories.forEach(subcategory => {
        const subcategoryButton = document.createElement("button");
        subcategoryButton.type = "button";
        subcategoryButton.className = `category-button category-button-sub${state.subcategory === subcategory ? " active" : ""}`;
        subcategoryButton.textContent = subcategory;
        subcategoryButton.setAttribute("aria-pressed", String(state.subcategory === subcategory));
        subcategoryButton.addEventListener("click", () => {
          trackCategoryClick(category.name, subcategory).catch(showError);
          state.subcategory = state.subcategory === subcategory ? "" : subcategory;
          loadCategories().catch(showError);
          loadProducts().catch(showError);
        });
        categoryList.append(subcategoryButton);
      });
    }
  });
}

async function trackCategoryClick(category, subcategory) {
  await api("/api/account/category-clicks", {
    method: "POST",
    body: JSON.stringify({ category, subcategory })
  });
}

async function trackProductClick(productId) {
  await api(`/api/account/product-clicks/${productId}`, { method: "POST" });
}

async function loadProducts() {
  const params = new URLSearchParams();
  if (state.search) params.set("search", state.search);
  if (state.category !== "All") params.set("category", state.category);
  if (state.subcategory) params.set("subcategory", state.subcategory);
  if (sortSelect.value !== "featured") params.set("sort", sortSelect.value);
  const products = await api(`/api/products?${params}`);
  productGrid.replaceChildren();
  resultsLabel.textContent = `${products.length} ${products.length === 1 ? "item" : "items"} to make your day`;
  emptyState.hidden = products.length !== 0;
  productGrid.hidden = products.length === 0;

  products.forEach(product => {
    const card = document.createElement("article");
    card.className = "product-card";
    const visual = document.createElement("button");
    visual.type = "button";
    visual.className = "product-visual";
    visual.setAttribute("aria-label", `View ${product.name}`);
    visual.addEventListener("click", () => trackProductClick(product.id).catch(showError));
    visual.style.backgroundColor = ["#f4f7f4", "#edf2ee", "#f1f5f1", "#e9f0eb"][product.id % 4];
    const category = document.createElement("span");
    category.className = "product-category";
    category.textContent = `${product.category} · ${product.subcategory}`;
    const icon = document.createElement("span");
    icon.className = "product-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = product.icon;
    visual.append(category, icon);

    const details = document.createElement("div");
    details.className = "product-details";
    const titleRow = document.createElement("div");
    titleRow.className = "product-title-row";
    const title = document.createElement("button");
    title.type = "button";
    title.className = "product-title-button";
    title.setAttribute("aria-label", `View ${product.name}`);
    title.textContent = product.name;
    title.addEventListener("click", () => trackProductClick(product.id).catch(showError));
    const titleHeading = document.createElement("h3");
    titleHeading.className = "product-title";
    titleHeading.append(title);
    const price = document.createElement("span");
    price.className = "product-price";
    price.textContent = money(product.price);
    titleRow.append(titleHeading, price);
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

async function loadStats() {
  const stats = await api("/api/account/stats");
  document.querySelector("#stats-product-adds").textContent = stats.productAddEvents;
  document.querySelector("#stats-product-units").textContent = stats.productsAdded;
  document.querySelector("#stats-product-clicks").textContent = stats.productClicks;
  document.querySelector("#stats-total-browse-clicks").textContent = stats.totalBrowseClicks;
  document.querySelector("#stats-categories-explored").textContent = stats.categoriesExplored;
  document.querySelector("#stats-category-clicks").textContent = stats.categoryClicks;
  document.querySelector("#stats-subcategory-clicks").textContent = stats.subcategoryClicks;

  const chartCategories = stats.categories.filter(category => category.totalClicks > 0);
  const totalClicks = chartCategories.reduce((total, category) => total + category.totalClicks, 0);
  const pie = document.querySelector("#category-pie");
  const colors = ["#17382b", "#456c5c", "#c97845", "#82a092", "#d9a27b", "#5d7868", "#a8bdb2", "#a85c31"];
  let angle = 0;
  const slices = chartCategories.map((category, index) => {
    const start = angle;
    angle += totalClicks ? category.totalClicks / totalClicks * 360 : 0;
    return `${colors[index % colors.length]} ${start}deg ${angle}deg`;
  });
  pie.style.background = totalClicks
    ? `conic-gradient(${slices.join(", ")})`
    : "conic-gradient(#e7eee9 0deg 360deg)";
  pie.setAttribute("aria-label", totalClicks
    ? `Category click distribution, ${totalClicks} total clicks`
    : "No category clicks recorded");
  document.querySelector("#category-pie-total").replaceChildren(
    document.createTextNode(String(totalClicks)),
    document.createElement("br")
  );
  const pieLabel = document.createElement("small");
  pieLabel.textContent = "clicks";
  document.querySelector("#category-pie-total").append(pieLabel);

  const legend = document.querySelector("#category-legend");
  legend.replaceChildren();
  chartCategories.forEach((category, index) => {
    const item = document.createElement("div");
    item.className = "legend-item";
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.backgroundColor = colors[index % colors.length];
    const name = document.createElement("span");
    name.textContent = category.name;
    const count = document.createElement("strong");
    count.textContent = category.totalClicks;
    item.append(swatch, name, count);
    legend.append(item);
  });
  if (!chartCategories.length) {
    const empty = document.createElement("p");
    empty.className = "stats-empty";
    empty.textContent = "Category clicks will appear here as you browse.";
    legend.append(empty);
  }

  const breakdown = document.querySelector("#category-breakdown");
  breakdown.replaceChildren();
  stats.categories.forEach(category => {
    const section = document.createElement("section");
    section.className = "breakdown-category";
    const heading = document.createElement("h3");
    heading.textContent = category.name;
    const total = document.createElement("strong");
    total.textContent = `${category.totalClicks} total`;
    const header = document.createElement("div");
    header.className = "breakdown-heading";
    header.append(heading, total);
    section.append(header);
    const parentRow = document.createElement("div");
    parentRow.className = "breakdown-row";
    const parentName = document.createElement("span");
    parentName.textContent = "Category clicks";
    const parentCount = document.createElement("span");
    parentCount.textContent = category.categoryClicks;
    parentRow.append(parentName, parentCount);
    section.append(parentRow);
    const productRow = document.createElement("div");
    productRow.className = "breakdown-row";
    const productName = document.createElement("span");
    productName.textContent = "Product clicks";
    const productCount = document.createElement("span");
    productCount.textContent = category.productClicks;
    productRow.append(productName, productCount);
    section.append(productRow);
    category.subcategories.forEach(subcategory => {
      const row = document.createElement("div");
      row.className = "breakdown-row subcategory-breakdown";
      const name = document.createElement("span");
      name.textContent = subcategory.name;
      const counts = document.createElement("span");
      counts.textContent = `${subcategory.clicks} category · ${subcategory.productClicks} product`;
      row.append(name, counts);
      section.append(row);
    });
    breakdown.append(section);
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

async function loadAccountActivity() {
  const account = await api("/api/account/activity");
  document.querySelector("#account-title").textContent = account.account.name;
  document.querySelector("#account-add-events").textContent = account.addEvents;
  document.querySelector("#account-products-added").textContent = account.productsAdded;

  const activityList = document.querySelector("#activity-list");
  const activityEmpty = document.querySelector("#activity-empty");
  activityList.replaceChildren();
  activityEmpty.hidden = account.activity.length > 0;

  account.activity.slice().reverse().forEach(entry => {
    const row = document.createElement("article");
    row.className = "activity-row";
    const icon = document.createElement("span");
    icon.className = "activity-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = entry.productIcon;
    const details = document.createElement("div");
    details.className = "activity-details";
    const name = document.createElement("h4");
    name.textContent = entry.productName;
    const meta = document.createElement("p");
    const addedAt = new Date(entry.addedAt).toLocaleString();
    meta.textContent = `Added ${entry.quantity} · ${addedAt}`;
    details.append(name, meta);
    const price = document.createElement("span");
    price.className = "activity-price";
    price.textContent = money(entry.unitPrice);
    row.append(icon, details, price);
    activityList.append(row);
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
  if (open) setAccountOpen(false);
  cartDrawer.classList.toggle("open", open);
  cartDrawer.setAttribute("aria-hidden", String(!open));
  cartBackdrop.hidden = !open;
  document.body.style.overflow = open ? "hidden" : "";
  if (open) document.querySelector("#cart-close").focus();
}

function setAccountOpen(open) {
  if (open) setCartOpen(false);
  accountDrawer.classList.toggle("open", open);
  accountDrawer.setAttribute("aria-hidden", String(!open));
  accountBackdrop.hidden = !open;
  document.body.style.overflow = open ? "hidden" : "";
  if (open) {
    document.querySelector("#account-close").focus();
    loadAccountActivity().catch(showError);
  }
}

function setStatsPage(open) {
  shopPage.hidden = open;
  statsPage.hidden = !open;
  browseBar.hidden = open;
  statsToggle.textContent = open ? "Shop" : "Stats";
  if (open) loadStats().catch(showError);
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
statsToggle.addEventListener("click", () => setStatsPage(statsPage.hidden));
document.querySelector("#cart-toggle").addEventListener("click", () => setCartOpen(true));
document.querySelector("#account-toggle").addEventListener("click", () => setAccountOpen(true));
document.querySelector("#cart-close").addEventListener("click", () => setCartOpen(false));
document.querySelector("#account-close").addEventListener("click", () => setAccountOpen(false));
document.querySelector("#keep-shopping").addEventListener("click", () => setCartOpen(false));
cartBackdrop.addEventListener("click", () => setCartOpen(false));
accountBackdrop.addEventListener("click", () => setAccountOpen(false));
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    setCartOpen(false);
    setAccountOpen(false);
  }
});
document.querySelector("#clear-cart").addEventListener("click", async () => {
  try {
    await api("/api/cart", { method: "DELETE" });
    await refreshCart();
  } catch (error) {
    showError(error);
  }
});
document.querySelector("#reset-data").addEventListener("click", async () => {
  if (!window.confirm("Clear all saved product-add and category browsing activity for Cappy Demo? Your current cart and product catalog will stay unchanged.")) {
    return;
  }

  try {
    await api("/api/account/activity", { method: "DELETE" });
    await loadStats();
    if (accountDrawer.classList.contains("open")) await loadAccountActivity();
    showToast("Tracked data cleared");
  } catch (error) {
    showError(error);
  }
});
document.querySelector("#checkout-button").addEventListener("click", () => showToast("Checkout is coming soon."));

Promise.all([loadCategories(), loadProducts(), refreshCart()]).catch(showError);
