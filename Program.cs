using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDistributedMemoryCache();
builder.Services.AddSession(options =>
{
    options.Cookie.HttpOnly = true;
    options.Cookie.IsEssential = true;
    options.IdleTimeout = TimeSpan.FromHours(2);
});

var app = builder.Build();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseSession();

var products = new List<Product>
{
    new(1, "Wireless Headphones", "Audio", 79.99m, "Comfortable over-ear headphones with rich, balanced sound.", "🎧", 4.7, 128),
    new(2, "Everyday Backpack", "Accessories", 49.50m, "A durable, water-resistant backpack for work and weekends.", "🎒", 4.5, 86),
    new(3, "Insulated Travel Mug", "Home", 24.95m, "Double-wall stainless steel keeps drinks hot or cold.", "☕", 4.6, 203),
    new(4, "Desk Lamp", "Home", 34.99m, "Adjustable LED lighting with a clean, modern design.", "💡", 4.3, 57),
    new(5, "Smart Fitness Watch", "Electronics", 119.00m, "Track workouts, daily activity, and notifications on the go.", "⌚", 4.4, 94),
    new(6, "Cotton Throw Blanket", "Home", 39.00m, "A soft, breathable throw for the sofa or your favorite chair.", "🧶", 4.8, 172),
    new(7, "Portable Bluetooth Speaker", "Audio", 59.99m, "Take clear, room-filling sound with you wherever you go.", "🔊", 4.5, 111),
    new(8, "Ceramic Plant Pot", "Home", 18.50m, "A simple glazed planter that brightens up any shelf.", "🪴", 4.2, 39)
};

app.MapGet("/api/products", (string? search, string? category, string? sort) =>
{
    IEnumerable<Product> result = products;

    if (!string.IsNullOrWhiteSpace(search))
    {
        result = result.Where(product =>
            product.Name.Contains(search, StringComparison.OrdinalIgnoreCase) ||
            product.Description.Contains(search, StringComparison.OrdinalIgnoreCase) ||
            product.Category.Contains(search, StringComparison.OrdinalIgnoreCase));
    }

    if (!string.IsNullOrWhiteSpace(category) && category != "All")
    {
        result = result.Where(product => product.Category.Equals(category, StringComparison.OrdinalIgnoreCase));
    }

    result = sort?.ToLowerInvariant() switch
    {
        "price-asc" => result.OrderBy(product => product.Price),
        "price-desc" => result.OrderByDescending(product => product.Price),
        "rating" => result.OrderByDescending(product => product.Rating),
        _ => result.OrderBy(product => product.Id)
    };

    return Results.Ok(result);
});

app.MapGet("/api/categories", () =>
    Results.Ok(products.Select(product => product.Category).Distinct().OrderBy(category => category)));

app.MapGet("/api/cart", (HttpContext context) => Results.Ok(GetCart(context, products)));

app.MapPost("/api/cart/items", (AddCartItemRequest request, HttpContext context) =>
{
    if (request.Quantity < 1 || request.Quantity > 99)
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["quantity"] = ["Quantity must be between 1 and 99."]
        });
    }

    if (!products.Any(product => product.Id == request.ProductId))
    {
        return Results.NotFound(new { message = "Product not found." });
    }

    var cart = ReadCart(context);
    var currentQuantity = cart.GetValueOrDefault(request.ProductId);
    if (currentQuantity + request.Quantity > 99)
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["quantity"] = ["A maximum of 99 of each item can be added."]
        });
    }

    cart[request.ProductId] = currentQuantity + request.Quantity;
    WriteCart(context, cart);
    return Results.Ok(BuildCart(cart, products));
});

app.MapDelete("/api/cart/items/{productId:int}", (int productId, HttpContext context) =>
{
    var cart = ReadCart(context);
    cart.Remove(productId);
    WriteCart(context, cart);
    return Results.Ok(BuildCart(cart, products));
});

app.MapDelete("/api/cart", (HttpContext context) =>
{
    WriteCart(context, []);
    return Results.Ok(BuildCart(new Dictionary<int, int>(), products));
});

app.Run();

static Dictionary<int, int> ReadCart(HttpContext context)
{
    var serializedCart = context.Session.GetString("cart");
    return string.IsNullOrEmpty(serializedCart)
        ? []
        : JsonSerializer.Deserialize<Dictionary<int, int>>(serializedCart) ?? [];
}

static void WriteCart(HttpContext context, Dictionary<int, int> cart) =>
    context.Session.SetString("cart", JsonSerializer.Serialize(cart));

static CartResponse GetCart(HttpContext context, IReadOnlyCollection<Product> products) =>
    BuildCart(ReadCart(context), products);

static CartResponse BuildCart(Dictionary<int, int> cart, IReadOnlyCollection<Product> products)
{
    var items = cart
        .Select(entry => products.FirstOrDefault(product => product.Id == entry.Key) is { } product
            ? new CartItem(product, entry.Value, decimal.Round(product.Price * entry.Value, 2))
            : null)
        .Where(item => item is not null)
        .Select(item => item!)
        .ToList();

    return new CartResponse(items, items.Sum(item => item.Quantity), decimal.Round(items.Sum(item => item.LineTotal), 2));
}

record Product(int Id, string Name, string Category, decimal Price, string Description, string Icon, double Rating, int ReviewCount);
record AddCartItemRequest(int ProductId, int Quantity = 1);
record CartItem(Product Product, int Quantity, decimal LineTotal);
record CartResponse(IReadOnlyList<CartItem> Items, int ItemCount, decimal Subtotal);
