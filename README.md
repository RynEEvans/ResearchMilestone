# Retail Genie

A bare-bones Retail Genie storefront built with ASP.NET Core and a static, responsive browser UI.

## Run locally

Requires the .NET 9 SDK.

```powershell
dotnet run
```

Open the local URL printed by `dotnet run`. The same app serves the storefront and its JSON API.

## Included

- Product catalog with keyword search, category filters, and sorting
- Per-browser shopping cart with add, remove, clear, quantity, and subtotal
- Responsive storefront UI served from `wwwroot`

## API

- `GET /api/products?search=&category=&sort=` (`price-asc`, `price-desc`, or `rating`)
- `GET /api/categories`
- `GET /api/cart`
- `POST /api/cart/items` with `{ "productId": 1, "quantity": 1 }`
- `DELETE /api/cart/items/{productId}`
- `DELETE /api/cart`

Catalog data is sample data in memory, and carts use ASP.NET Core's in-memory session store. This is a starter prototype, not a production checkout: cart data is lost when the app restarts, and checkout, accounts, orders, inventory management, payment, and persistent storage are not implemented.
