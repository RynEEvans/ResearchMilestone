# Retail Genie

A bare-bones Retail Genie storefront built with ASP.NET Core and a static, responsive browser UI.

## Run locally

Requires the .NET 9 SDK.

```powershell
dotnet run
```

Open the local URL printed by `dotnet run`. The same app serves the storefront and its JSON API.

## Included

- Product catalog stored in `data/products.json`, with parent/subcategory filters, keyword search, and sorting
- Home screen with account-interest-based product recommendations and a general category mix for new accounts
- Shop catalog paginated to 16 products per page
- Per-browser shopping cart with add, remove, clear, quantity, and subtotal
- Built-in Cappy Demo account (no login) with persistent cart-add history in `data/account-activity.json`
- Persistent category, subcategory, and product click tracking with an account stats page and category pie chart
- One-click reset for tracked activity (the cart and catalog are preserved)
- 115 sample products, with exactly five items in each of 23 subcategories
- Responsive storefront UI served from `wwwroot`

## API

- `GET /api/products?search=&category=&subcategory=&sort=` (`price-asc`, `price-desc`, or `rating`)
- `GET /api/categories`
- `GET /api/cart`
- `GET /api/account`
- `GET /api/account/activity` (add history is retained after cart removal)
- `GET /api/account/stats`
- `POST /api/account/category-clicks` with `{ "category": "Tech", "subcategory": "Audio" }`
- `POST /api/account/product-clicks/{productId}` (records product interest under its category and subcategory)
- `DELETE /api/account/activity` (clears tracked cart-add and browse activity)
- `POST /api/cart/items` with `{ "productId": 1, "quantity": 1 }`
- `DELETE /api/cart/items/{productId}`
- `DELETE /api/cart`

Edit `data/products.json` to update the product catalog; restart the app to load catalog changes. The built-in Cappy Demo account needs no login. Every successful add to cart is recorded in `data/account-activity.json`, and category/subcategory selections are recorded in `data/category-activity.json`; both remain after app restarts. The stats page summarizes these events and visualizes category browsing activity as a pie chart. The reset button clears both activity logs but leaves the current cart and product catalog unchanged. This demo account and activity logs are shared by everyone using this app instance. Carts use ASP.NET Core's in-memory session store and are lost when the app restarts. This is a starter prototype, not a production checkout; orders, inventory management, payment, and user-specific accounts are not implemented.
