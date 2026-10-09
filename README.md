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
- Individual product detail pages, with views tracked as weighted category/subcategory points
- Home screen with account-interest-based product recommendations and a general category mix for new accounts
- Horizontally scrollable home recommendations and an Offers for you shelf, with sale pricing and special offers in every subcategory
- Shop catalog paginated to 16 products per page
- Per-browser shopping cart with add, remove, clear, quantity, and subtotal
- Built-in Cappy Demo account (no login) with persistent cart-add history in `data/account-activity.json`
- Persistent weighted category and product activity points: category/subcategory selection = 1, product view = 2, cart add = 3, purchase = 4; account stats include a points pie chart and breakdown
- One-click reset for tracked activity (the cart and catalog are preserved)
- 115 sample products, with exactly five items in each of 23 subcategories
- Responsive storefront UI served from `wwwroot`

## API

- `GET /api/products?search=&category=&subcategory=&sort=` (`price-asc`, `price-desc`, or `rating`)
- `GET /api/products/{productId}`
- `GET /api/categories`
- `GET /api/cart`
- `GET /api/account`
- `GET /api/account/activity` (add history is retained after cart removal)
- `GET /api/account/stats`
- `POST /api/account/category-clicks` with `{ "category": "Tech", "subcategory": "Audio" }` (records 1 point)
- `POST /api/account/product-clicks/{productId}` (records 2 points under its category and subcategory)
- `DELETE /api/account/activity` (clears tracked cart-add and browse activity)
- `POST /api/cart/items` with `{ "productId": 1, "quantity": 1 }`
- `DELETE /api/cart/items/{productId}`
- `DELETE /api/cart`
- `POST /api/orders` with a `shippingAddress` object (`fullName`, `street`, `city`, `region`, `postalCode`); creates a simulated order without collecting payment
- `GET /api/orders` (Cappy Demo order history)
- `GET /api/orders/track/{trackingNumber}` (also accepts an order number)
- `POST /api/orders/{orderNumber}/advance` (advance the demo tracking status)

Edit `data/products.json` to update the product catalog; restart the app to load catalog changes. Each subcategory has sale and special-offer items shown in the horizontal Offers for you shelf; sales display the original price and discounted price. Special offers mean buy one, get the second item at 50% off; the discount is calculated automatically for each pair in the cart and order. Each product opens a detail page; viewing a product adds 2 points, category/subcategory selection adds 1, a successful cart addition adds 3, and ordering a product adds 4 points to its category and subcategory. The built-in Cappy Demo account needs no login. Every successful add to cart is also recorded in `data/account-activity.json`; weighted activity is stored in `data/category-activity.json`. Both remain after app restarts. The stats page summarizes weighted points and visualizes category points as a pie chart. The reset button clears both activity logs but leaves the current cart and product catalog unchanged. This demo account, activity logs, and order history are shared by everyone using this app instance. Carts use ASP.NET Core's in-memory session store and are lost when the app restarts. Demo orders are persisted in `data/orders.json`; checkout simulates shipping, tax, and order tracking but does not collect payment or card details. Tracking progression can be advanced from the Orders page. This is a starter prototype, not a production checkout; inventory management, real payment, and user-specific accounts are not implemented.
