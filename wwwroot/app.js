const productGrid = document.querySelector("#product-grid");
const categoryList = document.querySelector("#category-list");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const sortSelect = document.querySelector("#sort-select");
const homePage = document.querySelector("#home-page");
const shopPage = document.querySelector("#shop-page");
const productPage = document.querySelector("#product-page");
const statsPage = document.querySelector("#stats-page");
const checkoutPage = document.querySelector("#checkout-page");
const ordersPage = document.querySelector("#orders-page");
const recommendationGrid = document.querySelector("#recommendation-grid");
const offersGrid = document.querySelector("#offers-grid");
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

const state = { category: "All", subcategory: "", search: "", page: 1, products: [], view: "home", productReturnView: "home", selectedOrderNumber: "" };
const productsPerPage = 16;
const money = amount => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
const promotionLabel = promotion => promotion === "Special offer"
  ? "Buy one, get the second 50% off"
  : promotion;

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
      state.page = 1;
      setPage("shop");
      loadCategories().catch(showError);
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
          state.page = 1;
          setPage("shop");
          loadCategories().catch(showError);
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

async function openProduct(product) {
  try {
    await trackProductClick(product.id);
    if (state.view !== "product") state.productReturnView = state.view;
    history.pushState({ productReturnView: state.productReturnView }, "", `/?product=${product.id}`);
    showProduct(product);
    setPage("product");
  } catch (error) {
    showError(error);
  }
}

function showProduct(product) {
  const detail = document.querySelector("#product-detail");
  detail.replaceChildren();
  const visual = document.createElement("div");
  visual.className = "product-detail-visual";
  visual.style.backgroundColor = ["#f4f7f4", "#edf2ee", "#f1f5f1", "#e9f0eb"][product.id % 4];
  const icon = document.createElement("span");
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = product.icon;
  visual.append(icon);

  const info = document.createElement("div");
  info.className = "product-detail-info";
  const category = document.createElement("p");
  category.className = "eyebrow";
  category.textContent = `${product.category} · ${product.subcategory}`;
  const title = document.createElement("h1");
  title.id = "product-page-title";
  title.textContent = product.name;
  const rating = document.createElement("p");
  rating.className = "rating";
  rating.textContent = `★ ${product.rating.toFixed(1)} (${product.reviewCount} reviews)`;
  const price = document.createElement("p");
  price.className = `product-detail-price${product.originalPrice ? " sale-price" : ""}`;
  price.textContent = money(product.price);
  if (product.originalPrice) {
    const originalPrice = document.createElement("del");
    originalPrice.className = "original-price";
    originalPrice.textContent = money(product.originalPrice);
    price.append(" ", originalPrice);
  }
  const description = document.createElement("p");
  description.className = "product-detail-description";
  description.textContent = product.description;
  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "add-button product-detail-add";
  addButton.textContent = "Add to cart";
  addButton.addEventListener("click", () => addToCart(product.id));
  info.append(category, title, rating);
  if (product.promotion) {
    const promotion = document.createElement("span");
    promotion.className = "promotion-badge product-detail-promotion";
    promotion.textContent = promotionLabel(product.promotion);
    info.append(promotion);
  }
  info.append(price, description, addButton);
  detail.append(visual, info);
}

async function openProductById(productId) {
  try {
    const product = await api(`/api/products/${productId}`);
    showProduct(product);
    setPage("product");
  } catch (error) {
    showError(error);
    history.replaceState({}, "", "/");
    setPage("shop");
  }
}

function createProductCard(product) {
  const card = document.createElement("article");
  card.className = "product-card";
  const visual = document.createElement("button");
  visual.type = "button";
  visual.className = "product-visual";
  visual.setAttribute("aria-label", `View ${product.name}`);
  visual.addEventListener("click", () => openProduct(product));
  visual.style.backgroundColor = ["#f4f7f4", "#edf2ee", "#f1f5f1", "#e9f0eb"][product.id % 4];
  const category = document.createElement("span");
  category.className = "product-category";
  category.textContent = `${product.category} · ${product.subcategory}`;
  const icon = document.createElement("span");
  icon.className = "product-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = product.icon;
  visual.append(category, icon);
  if (product.promotion) {
    const badge = document.createElement("span");
    badge.className = "promotion-badge";
    badge.textContent = promotionLabel(product.promotion);
    visual.append(badge);
  }

  const details = document.createElement("div");
  details.className = "product-details";
  const titleRow = document.createElement("div");
  titleRow.className = "product-title-row";
  const title = document.createElement("button");
  title.type = "button";
  title.className = "product-title-button";
  title.setAttribute("aria-label", `View ${product.name}`);
  title.textContent = product.name;
  title.addEventListener("click", () => openProduct(product));
  const titleHeading = document.createElement("h3");
  titleHeading.className = "product-title";
  titleHeading.append(title);
  const price = document.createElement("span");
  price.className = `product-price${product.originalPrice ? " sale-price" : ""}`;
  const currentPrice = document.createElement("span");
  currentPrice.textContent = money(product.price);
  price.append(currentPrice);
  if (product.originalPrice) {
    const originalPrice = document.createElement("del");
    originalPrice.textContent = money(product.originalPrice);
    price.append(originalPrice);
  }
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
  return card;
}

function renderShopPage() {
  productGrid.replaceChildren();
  const start = (state.page - 1) * productsPerPage;
  const pageProducts = state.products.slice(start, start + productsPerPage);
  const pageCount = Math.ceil(state.products.length / productsPerPage);
  resultsLabel.textContent = state.products.length
    ? `Showing ${start + 1}–${Math.min(start + productsPerPage, state.products.length)} of ${state.products.length} items`
    : "0 items";
  emptyState.hidden = state.products.length !== 0;
  productGrid.hidden = state.products.length === 0;
  pageProducts.forEach(product => productGrid.append(createProductCard(product)));

  const pagination = document.querySelector("#pagination");
  pagination.hidden = pageCount <= 1;
  document.querySelector("#previous-page").disabled = state.page <= 1;
  document.querySelector("#next-page").disabled = state.page >= pageCount;
  document.querySelector("#page-status").textContent = `Page ${state.page} of ${pageCount}`;
}

async function loadProducts() {
  const params = new URLSearchParams();
  if (state.search) params.set("search", state.search);
  if (state.category !== "All") params.set("category", state.category);
  if (state.subcategory) params.set("subcategory", state.subcategory);
  if (sortSelect.value !== "featured") params.set("sort", sortSelect.value);
  state.products = await api(`/api/products?${params}`);
  const pageCount = Math.max(1, Math.ceil(state.products.length / productsPerPage));
  state.page = Math.min(state.page, pageCount);
  renderShopPage();
}

function getMixedRecommendations(products, limit) {
  const grouped = new Map();
  products.forEach(product => {
    const categoryProducts = grouped.get(product.category) || [];
    categoryProducts.push(product);
    grouped.set(product.category, categoryProducts);
  });
  const groups = [...grouped.values()];
  const mixed = [];
  for (let index = 0; mixed.length < limit; index += 1) {
    let added = false;
    groups.forEach(group => {
      if (group[index] && mixed.length < limit) {
        mixed.push(group[index]);
        added = true;
      }
    });
    if (!added) break;
  }
  return mixed;
}

async function loadHomeRecommendations() {
  const [products, stats] = await Promise.all([
    api("/api/products"),
    api("/api/account/stats")
  ]);
  const engagedCategories = stats.categories
    .filter(category => category.totalPoints > 0)
    .sort((left, right) => right.totalPoints - left.totalPoints);
  const regularProducts = products.filter(product => !product.promotion && !product.originalPrice);
  let recommended;
  if (engagedCategories.length === 0) {
    recommended = getMixedRecommendations(regularProducts, 8);
    document.querySelector("#recommendation-intro").textContent =
      "A little bit of everything, picked to help you find a new favorite.";
  } else {
    const byCategory = new Map(engagedCategories.map(category => [
      category.name,
      regularProducts.filter(product => product.category === category.name)
        .sort((left, right) => right.rating - left.rating || left.id - right.id)
    ]));
    recommended = [];
    for (let index = 0; recommended.length < 8; index += 1) {
      let added = false;
      engagedCategories.forEach(category => {
        const product = byCategory.get(category.name)?.[index];
        if (product && recommended.length < 8) {
          recommended.push(product);
          added = true;
        }
      });
      if (!added) break;
    }
    document.querySelector("#recommendation-intro").textContent =
      `Based on the categories you’ve been exploring, here are a few picks for you.`;
  }

  recommendationGrid.replaceChildren();
  recommended.forEach(product => recommendationGrid.append(createProductCard(product)));

  const offers = products.filter(product => product.promotion || product.originalPrice);
  const engagedCategoryNames = engagedCategories.map(category => category.name);
  const categoryOrder = [
    ...engagedCategoryNames,
    ...new Set(offers.map(product => product.category).filter(category => !engagedCategoryNames.includes(category)))
  ];
  const recommendedOffers = [];
  categoryOrder.forEach(category => {
    const categoryOffers = offers.filter(product => product.category === category);
    const sale = categoryOffers.find(product => product.originalPrice);
    const special = categoryOffers.find(product => product.promotion && !product.originalPrice);
    if (sale && recommendedOffers.length < 8) recommendedOffers.push(sale);
    if (special && recommendedOffers.length < 8) recommendedOffers.push(special);
  });
  if (recommendedOffers.length < 8) {
    getMixedRecommendations(offers.filter(product => !recommendedOffers.includes(product)), 8 - recommendedOffers.length)
      .forEach(product => recommendedOffers.push(product));
  }
  offersGrid.replaceChildren();
  recommendedOffers.forEach(product => offersGrid.append(createProductCard(product)));
  document.querySelector("#offers-empty").hidden = recommendedOffers.length > 0;
}

async function loadStats() {
  const stats = await api("/api/account/stats");
  document.querySelector("#stats-product-adds").textContent = stats.productAddEvents;
  document.querySelector("#stats-product-units").textContent = stats.productsAdded;
  document.querySelector("#stats-total-points").textContent = stats.totalPoints;
  document.querySelector("#stats-categories-explored").textContent = stats.categoriesExplored;
  document.querySelector("#stats-category-points").textContent = stats.categoryPoints;
  document.querySelector("#stats-subcategory-points").textContent = stats.subcategoryPoints;
  document.querySelector("#stats-product-view-points").textContent = stats.productViewPoints;
  document.querySelector("#stats-cart-add-points").textContent = stats.cartAddPoints;
  document.querySelector("#stats-purchase-points").textContent = stats.purchasePoints;

  const chartCategories = stats.categories.filter(category => category.totalPoints > 0);
  const totalPoints = chartCategories.reduce((total, category) => total + category.totalPoints, 0);
  const pie = document.querySelector("#category-pie");
  const colors = ["#17382b", "#456c5c", "#c97845", "#82a092", "#d9a27b", "#5d7868", "#a8bdb2", "#a85c31"];
  let angle = 0;
  const slices = chartCategories.map((category, index) => {
    const start = angle;
    angle += totalPoints ? category.totalPoints / totalPoints * 360 : 0;
    return `${colors[index % colors.length]} ${start}deg ${angle}deg`;
  });
  pie.style.background = totalPoints
    ? `conic-gradient(${slices.join(", ")})`
    : "conic-gradient(#e7eee9 0deg 360deg)";
  pie.setAttribute("aria-label", totalPoints
    ? `Category point distribution, ${totalPoints} total points`
    : "No category points recorded");
  document.querySelector("#category-pie-total").replaceChildren(
    document.createTextNode(String(totalPoints)),
    document.createElement("br")
  );
  const pieLabel = document.createElement("small");
  pieLabel.textContent = "points";
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
    count.textContent = category.totalPoints;
    item.append(swatch, name, count);
    legend.append(item);
  });
  if (!chartCategories.length) {
    const empty = document.createElement("p");
    empty.className = "stats-empty";
    empty.textContent = "Category points will appear here as you browse.";
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
    total.textContent = `${category.totalPoints} points`;
    const header = document.createElement("div");
    header.className = "breakdown-heading";
    header.append(heading, total);
    section.append(header);
    const parentRow = document.createElement("div");
    parentRow.className = "breakdown-row";
    const parentName = document.createElement("span");
    parentName.textContent = "Category selection points";
    const parentCount = document.createElement("span");
    parentCount.textContent = category.categoryPoints;
    parentRow.append(parentName, parentCount);
    section.append(parentRow);
    const productRow = document.createElement("div");
    productRow.className = "breakdown-row";
    const productName = document.createElement("span");
    productName.textContent = "Subcategory selection points";
    const productCount = document.createElement("span");
    productCount.textContent = category.subcategoryPoints;
    productRow.append(productName, productCount);
    section.append(productRow);
    [
      ["Product-view points", category.productViewPoints],
      ["Cart-add points", category.cartAddPoints],
      ["Purchase points", category.purchasePoints]
    ].forEach(([label, points]) => {
      const row = document.createElement("div");
      row.className = "breakdown-row";
      const name = document.createElement("span");
      name.textContent = label;
      const value = document.createElement("span");
      value.textContent = points;
      row.append(name, value);
      section.append(row);
    });
    category.subcategories.forEach(subcategory => {
      const row = document.createElement("div");
      row.className = "breakdown-row subcategory-breakdown";
      const name = document.createElement("span");
      name.textContent = subcategory.name;
      const counts = document.createElement("span");
      counts.textContent = `Select ${subcategory.subcategoryPoints} · Views ${subcategory.productViewPoints} · Cart ${subcategory.cartAddPoints} · Purchases ${subcategory.purchasePoints} · Total ${subcategory.totalPoints}`;
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
    quantity.append(`${item.quantity} × ${money(item.product.price)}`);
    if (item.product.originalPrice) {
      const originalPrice = document.createElement("del");
      originalPrice.textContent = ` ${money(item.product.originalPrice)}`;
      quantity.append(originalPrice);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-item";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => removeFromCart(item.product.id));
    info.append(title, quantity, remove);
    const total = document.createElement("span");
    total.className = "cart-row-total";
    total.textContent = money(item.lineTotal);
    if (item.savings > 0) {
      const savings = document.createElement("small");
      savings.className = "cart-savings";
      savings.textContent = `Save ${money(item.savings)} · ${promotionLabel(item.product.promotion)}`;
      total.append(savings);
    }
    row.append(art, info, total);
    cartItems.append(row);
  });
}

async function loadCheckoutSummary() {
  const cart = await api("/api/cart");
  if (cart.items.length === 0) {
    showToast("Add something to your cart before checkout.");
    setPage("shop");
    return;
  }

  const items = document.querySelector("#checkout-items");
  items.replaceChildren();
  cart.items.forEach(item => {
    const row = document.createElement("div");
    row.className = "checkout-item";
    const name = document.createElement("span");
    name.textContent = `${item.product.icon} ${item.product.name} × ${item.quantity}`;
    const lineTotal = document.createElement("strong");
    lineTotal.textContent = money(item.lineTotal);
    if (item.savings > 0) {
      const savings = document.createElement("small");
      savings.className = "cart-savings";
      savings.textContent = `Save ${money(item.savings)} · ${promotionLabel(item.product.promotion)}`;
      lineTotal.append(document.createElement("br"), savings);
    }
    row.append(name, lineTotal);
    items.append(row);
  });

  const shipping = cart.subtotal >= 75 ? 0 : 5.99;
  const tax = Math.round(cart.subtotal * 0.08 * 100) / 100;
  document.querySelector("#checkout-subtotal").textContent = money(cart.subtotal);
  document.querySelector("#checkout-shipping").textContent = shipping === 0 ? "Free" : money(shipping);
  document.querySelector("#checkout-tax").textContent = money(tax);
  document.querySelector("#checkout-total").textContent = money(cart.subtotal + shipping + tax);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(date));
}

async function loadOrders(preferredOrderNumber = state.selectedOrderNumber) {
  const orders = await api("/api/orders");
  const orderList = document.querySelector("#order-list");
  const empty = document.querySelector("#orders-empty");
  orderList.replaceChildren();
  empty.hidden = orders.length > 0;

  orders.forEach(order => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `order-list-item${order.orderNumber === preferredOrderNumber ? " selected" : ""}`;
    const number = document.createElement("strong");
    number.textContent = order.orderNumber;
    const summary = document.createElement("span");
    summary.textContent = `${order.status} · ${money(order.total)}`;
    const placed = document.createElement("small");
    placed.textContent = `Placed ${formatDate(order.placedAt)}`;
    button.append(number, summary, placed);
    button.addEventListener("click", () => showOrder(order));
    orderList.append(button);
  });

  let selected = orders.find(order => order.orderNumber === preferredOrderNumber);
  if (!selected && orders.length) selected = orders[0];
  if (selected) showOrder(selected);
}

function showOrder(order) {
  state.selectedOrderNumber = order.orderNumber;
  const detail = document.querySelector("#order-detail");
  detail.replaceChildren();

  const header = document.createElement("div");
  header.className = "order-detail-heading";
  const heading = document.createElement("div");
  const number = document.createElement("h2");
  number.textContent = order.orderNumber;
  const tracking = document.createElement("p");
  tracking.textContent = `Tracking number: ${order.trackingNumber}`;
  const expected = document.createElement("p");
  expected.textContent = `Estimated delivery ${formatDate(order.estimatedDelivery)}`;
  heading.append(number, tracking, expected);
  const status = document.createElement("span");
  status.className = "order-status";
  status.textContent = order.status === "OutForDelivery" ? "Out for delivery" : order.status;
  header.append(heading, status);
  detail.append(header);

  const timeline = document.createElement("ol");
  timeline.className = "order-timeline";
  const steps = [
    ["Processing", "Order received"],
    ["Packed", "Packed and ready"],
    ["Shipped", "On the way"],
    ["OutForDelivery", "Out for delivery"],
    ["Delivered", "Delivered"]
  ];
  const completedStatuses = new Set(order.statusHistory.map(event => event.status));
  steps.forEach(([key, label]) => {
    const step = document.createElement("li");
    step.className = completedStatuses.has(key) ? "complete" : "";
    const labelText = document.createElement("strong");
    labelText.textContent = label;
    const event = order.statusHistory.find(entry => entry.status === key);
    const time = document.createElement("small");
    time.textContent = event ? formatDate(event.at) : "Upcoming";
    step.append(labelText, time);
    timeline.append(step);
  });
  detail.append(timeline);

  const itemHeading = document.createElement("h3");
  itemHeading.textContent = "Items";
  detail.append(itemHeading);
  order.items.forEach(item => {
    const row = document.createElement("div");
    row.className = "order-item";
    const itemName = document.createElement("span");
    itemName.textContent = `${item.productIcon} ${item.productName} × ${item.quantity}`;
    const lineTotal = document.createElement("strong");
    lineTotal.textContent = money(item.lineTotal);
    if (item.savings > 0) {
      const savings = document.createElement("small");
      savings.className = "cart-savings";
      savings.textContent = `Save ${money(item.savings)} · ${promotionLabel(item.promotion)}`;
      lineTotal.append(document.createElement("br"), savings);
    }
    row.append(itemName, lineTotal);
    detail.append(row);
  });

  const address = document.createElement("p");
  address.className = "order-address";
  address.textContent = `Delivering to ${order.shippingAddress.fullName}, ${order.shippingAddress.street}, ${order.shippingAddress.city}, ${order.shippingAddress.region} ${order.shippingAddress.postalCode}`;
  detail.append(address);

  const totals = document.createElement("div");
  totals.className = "order-totals";
  [
    ["Subtotal", order.subtotal],
    ["Shipping", order.shipping],
    ["Tax", order.tax],
    ["Total", order.total]
  ].forEach(([label, amount]) => {
    const row = document.createElement("div");
    const title = document.createElement("span");
    title.textContent = label;
    const value = document.createElement("strong");
    value.textContent = money(amount);
    row.append(title, value);
    totals.append(row);
  });
  detail.append(totals);

  const advance = document.createElement("button");
  advance.type = "button";
  advance.className = "checkout-button advance-order-button";
  advance.textContent = order.status === "Delivered" ? "Demo order delivered" : "Advance simulated tracking status";
  advance.disabled = order.status === "Delivered";
  advance.addEventListener("click", async () => {
    try {
      const updated = await api(`/api/orders/${encodeURIComponent(order.orderNumber)}/advance`, { method: "POST" });
      state.selectedOrderNumber = updated.orderNumber;
      await loadOrders(updated.orderNumber);
    } catch (error) {
      showError(error);
    }
  });
  detail.append(advance);
  document.querySelector("#tracking-number").value = order.trackingNumber;
  document.querySelectorAll(".order-list-item").forEach(button => {
    button.classList.toggle("selected", button.querySelector("strong")?.textContent === order.orderNumber);
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

function setPage(view) {
  if (view !== "product" && new URLSearchParams(location.search).has("product")) {
    history.replaceState({}, "", "/");
  }
  state.view = view;
  homePage.hidden = view !== "home";
  shopPage.hidden = view !== "shop";
  productPage.hidden = view !== "product";
  statsPage.hidden = view !== "stats";
  checkoutPage.hidden = view !== "checkout";
  ordersPage.hidden = view !== "orders";
  browseBar.hidden = ["stats", "checkout", "orders"].includes(view);
  statsToggle.textContent = view === "stats" ? "Back" : "Stats";
  document.querySelector("#home-toggle").setAttribute("aria-current", String(view === "home"));
  document.querySelector("#shop-toggle").setAttribute("aria-current", String(view === "shop"));
  document.querySelector("#order-toggle").setAttribute("aria-current", String(view === "orders"));

  if (view === "home") loadHomeRecommendations().catch(showError);
  if (view === "shop") loadProducts().catch(showError);
  if (view === "stats") loadStats().catch(showError);
  if (view === "checkout") loadCheckoutSummary().catch(showError);
  if (view === "orders") loadOrders().catch(showError);
}

searchForm.addEventListener("submit", event => {
  event.preventDefault();
  state.search = searchInput.value.trim();
  state.page = 1;
  setPage("shop");
});
searchInput.addEventListener("search", () => {
  state.search = searchInput.value.trim();
  state.page = 1;
  setPage("shop");
});
sortSelect.addEventListener("change", () => {
  state.page = 1;
  loadProducts().catch(showError);
});
document.querySelector("#home-toggle").addEventListener("click", () => setPage("home"));
document.querySelector("#shop-toggle").addEventListener("click", () => setPage("shop"));
document.querySelector("#order-toggle").addEventListener("click", () => setPage("orders"));
document.querySelector("#product-back-button").addEventListener("click", () => {
  const returnView = state.productReturnView;
  setPage(returnView === "shop" ? "shop" : "home");
});
document.querySelector("#home-shop-button").addEventListener("click", () => setPage("shop"));
document.querySelector("#recommendations-shop-button").addEventListener("click", () => setPage("shop"));
document.querySelector("#offers-shop-button").addEventListener("click", () => setPage("shop"));
document.querySelector("#checkout-back").addEventListener("click", () => setPage("shop"));
statsToggle.addEventListener("click", () => {
  if (state.view === "stats") {
    setPage(state.previousView || "home");
  } else {
    state.previousView = state.view;
    setPage("stats");
  }
});
document.querySelector("#previous-page").addEventListener("click", () => {
  if (state.page > 1) {
    state.page -= 1;
    renderShopPage();
    shopPage.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});
document.querySelector("#next-page").addEventListener("click", () => {
  const pageCount = Math.ceil(state.products.length / productsPerPage);
  if (state.page < pageCount) {
    state.page += 1;
    renderShopPage();
    shopPage.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});
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
document.querySelector("#checkout-button").addEventListener("click", () => {
  setCartOpen(false);
  setPage("checkout");
});
document.querySelector("#checkout-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = document.querySelector("#place-order-button");
  const formData = new FormData(form);
  submitButton.disabled = true;
  try {
    const order = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        shippingAddress: {
          fullName: formData.get("fullName"),
          street: formData.get("street"),
          city: formData.get("city"),
          region: formData.get("region"),
          postalCode: formData.get("postalCode")
        }
      })
    });
    state.selectedOrderNumber = order.orderNumber;
    form.reset();
    await refreshCart();
    setPage("orders");
    showToast(`Demo order ${order.orderNumber} placed`);
  } catch (error) {
    showError(error);
  } finally {
    submitButton.disabled = false;
  }
});
document.querySelector("#tracking-form").addEventListener("submit", async event => {
  event.preventDefault();
  const trackingNumber = document.querySelector("#tracking-number").value.trim();
  try {
    const order = await api(`/api/orders/track/${encodeURIComponent(trackingNumber)}`);
    state.selectedOrderNumber = order.orderNumber;
    showOrder(order);
    document.querySelectorAll(".order-list-item").forEach(button => {
      button.classList.toggle("selected", button.querySelector("strong")?.textContent === order.orderNumber);
    });
  } catch (error) {
    showError(error);
  }
});

window.addEventListener("popstate", event => {
  const productId = Number(new URLSearchParams(location.search).get("product"));
  if (Number.isInteger(productId) && productId > 0) {
    openProductById(productId);
    return;
  }
  const returnView = event.state?.productReturnView || state.productReturnView;
  setPage(returnView === "shop" ? "shop" : "home");
});

async function initializeStorefront() {
  await Promise.all([loadCategories(), refreshCart()]);
  const productId = Number(new URLSearchParams(location.search).get("product"));
  if (Number.isInteger(productId) && productId > 0) {
    await openProductById(productId);
  } else {
    await loadHomeRecommendations();
  }
}

initializeStorefront().catch(showError);