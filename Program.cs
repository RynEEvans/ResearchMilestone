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

var productsPath = Path.Combine(builder.Environment.ContentRootPath, "data", "products.json");
var products = JsonSerializer.Deserialize<List<Product>>(
    File.ReadAllText(productsPath),
    JsonSerializerOptions.Web)
    ?? throw new InvalidDataException($"The product catalog at '{productsPath}' is empty or invalid.");

var accountActivityPath = Path.Combine(builder.Environment.ContentRootPath, "data", "account-activity.json");
Directory.CreateDirectory(Path.GetDirectoryName(accountActivityPath)!);
if (!File.Exists(accountActivityPath))
{
    File.WriteAllText(accountActivityPath, "[]");
}

var accountActivityStore = new AccountActivityStore(accountActivityPath);
var categoryActivityPath = Path.Combine(builder.Environment.ContentRootPath, "data", "category-activity.json");
if (!File.Exists(categoryActivityPath))
{
    File.WriteAllText(categoryActivityPath, "[]");
}

var categoryActivityStore = new CategoryActivityStore(categoryActivityPath);
var ordersPath = Path.Combine(builder.Environment.ContentRootPath, "data", "orders.json");
if (!File.Exists(ordersPath))
{
    File.WriteAllText(ordersPath, "[]");
}

var orderStore = new CategoryActivityStore.OrderStore(ordersPath);

app.MapGet("/api/products", (string? search, string? category, string? subcategory, string? sort) =>
{
    IEnumerable<Product> result = products;

    if (!string.IsNullOrWhiteSpace(search))
    {
        result = result.Where(product =>
            product.Name.Contains(search, StringComparison.OrdinalIgnoreCase) ||
            product.Description.Contains(search, StringComparison.OrdinalIgnoreCase) ||
            product.Category.Contains(search, StringComparison.OrdinalIgnoreCase) ||
            product.Subcategory.Contains(search, StringComparison.OrdinalIgnoreCase));
    }

    if (!string.IsNullOrWhiteSpace(category) && category != "All")
    {
        result = result.Where(product => product.Category.Equals(category, StringComparison.OrdinalIgnoreCase));
    }

    if (!string.IsNullOrWhiteSpace(subcategory))
    {
        result = result.Where(product => product.Subcategory.Equals(subcategory, StringComparison.OrdinalIgnoreCase));
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

app.MapGet("/api/products/{productId:int}", (int productId) =>
{
    var product = products.FirstOrDefault(product => product.Id == productId);
    return product is null ? Results.NotFound(new { message = "Product not found." }) : Results.Ok(product);
});

app.MapGet("/api/categories", () =>
    Results.Ok(products
        .GroupBy(product => product.Category)
        .OrderBy(group => group.Key)
        .Select(group => new ProductCategory(
            group.Key,
            group.Select(product => product.Subcategory).Distinct().OrderBy(subcategory => subcategory).ToArray()))));

app.MapGet("/api/account", () =>
    Results.Ok(new Account("cappy-demo", "Cappy Demo")));

app.MapGet("/api/account/activity", async () =>
{
    var activity = await accountActivityStore.GetActivityAsync();
    return Results.Ok(new AccountActivityResponse(
        new Account("cappy-demo", "Cappy Demo"),
        activity.Count,
        activity.Sum(entry => entry.Quantity),
        activity));
});

app.MapGet("/api/account/stats", async () =>
{
    var productActivity = await accountActivityStore.GetActivityAsync();
    var categoryActivity = await categoryActivityStore.GetActivityAsync();
    var categoryStats = products
        .GroupBy(product => product.Category)
        .OrderBy(group => group.Key)
        .Select(group =>
        {
            var categoryPoints = categoryActivity
                .Where(entry => entry.Category.Equals(group.Key, StringComparison.OrdinalIgnoreCase))
                .Sum(entry => GetActivityPoints(entry));
            var subcategories = group
                .GroupBy(product => product.Subcategory)
                .OrderBy(subcategoryGroup => subcategoryGroup.Key)
                .Select(subcategoryGroup =>
                {
                    var activity = categoryActivity.Where(entry =>
                        entry.Category.Equals(group.Key, StringComparison.OrdinalIgnoreCase) &&
                        entry.Subcategory?.Equals(subcategoryGroup.Key, StringComparison.OrdinalIgnoreCase) == true);
                    var entries = activity.ToArray();
                    return new SubcategoryPointStats(
                        subcategoryGroup.Key,
                        entries.Where(entry => entry.Source == "category").Sum(GetActivityPoints),
                        entries.Where(IsProductView).Sum(GetActivityPoints),
                        entries.Where(entry => entry.Source == "cart-add").Sum(GetActivityPoints),
                        entries.Where(entry => entry.Source == "purchase").Sum(GetActivityPoints),
                        entries.Sum(GetActivityPoints));
                })
                .ToArray();

            return new CategoryClickStats(
                group.Key,
                categoryActivity.Where(entry =>
                    entry.Category.Equals(group.Key, StringComparison.OrdinalIgnoreCase) &&
                    entry.Source == "category" &&
                    entry.Subcategory is null).Sum(GetActivityPoints),
                categoryActivity.Where(entry =>
                    entry.Category.Equals(group.Key, StringComparison.OrdinalIgnoreCase) &&
                    entry.Source == "category" &&
                    entry.Subcategory is not null).Sum(GetActivityPoints),
                categoryActivity.Where(entry =>
                    entry.Category.Equals(group.Key, StringComparison.OrdinalIgnoreCase) &&
                    IsProductView(entry)).Sum(GetActivityPoints),
                categoryActivity.Where(entry =>
                    entry.Category.Equals(group.Key, StringComparison.OrdinalIgnoreCase) &&
                    entry.Source == "cart-add").Sum(GetActivityPoints),
                categoryActivity.Where(entry =>
                    entry.Category.Equals(group.Key, StringComparison.OrdinalIgnoreCase) &&
                    entry.Source == "purchase").Sum(GetActivityPoints),
                categoryPoints,
                subcategories);
        })
        .ToArray();

    return Results.Ok(new AccountStatsResponse(
        new Account("cappy-demo", "Cappy Demo"),
        productActivity.Count,
        productActivity.Sum(entry => entry.Quantity),
        categoryStats.Sum(category => category.CategoryPoints),
        categoryStats.Sum(category => category.SubcategoryPoints),
        categoryStats.Sum(category => category.ProductViewPoints),
        categoryStats.Sum(category => category.CartAddPoints),
        categoryStats.Sum(category => category.PurchasePoints),
        categoryStats.Sum(category => category.TotalPoints),
        categoryStats.Count(category => category.TotalPoints > 0),
        categoryStats));
});

app.MapPost("/api/account/category-clicks", async (CategoryClickRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.Category))
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["category"] = ["A product category is required."]
        });
    }

    var category = products
        .Where(product => product.Category.Equals(request.Category, StringComparison.OrdinalIgnoreCase))
        .Select(product => product.Category)
        .FirstOrDefault();
    if (category is null)
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["category"] = ["Choose an existing product category."]
        });
    }

    string? subcategory = null;
    if (request.Subcategory is not null)
    {
        subcategory = products
            .Where(product => product.Category.Equals(category, StringComparison.OrdinalIgnoreCase))
            .Select(product => product.Subcategory)
            .FirstOrDefault(value => value.Equals(request.Subcategory, StringComparison.OrdinalIgnoreCase));
        if (subcategory is null)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["subcategory"] = ["Choose a subcategory that belongs to the selected category."]
            });
        }
    }

    await categoryActivityStore.RecordClickAsync(category, subcategory, "category");
    return Results.NoContent();
});

app.MapPost("/api/account/product-clicks/{productId:int}", async (int productId) =>
{
    var product = products.FirstOrDefault(product => product.Id == productId);
    if (product is null)
    {
        return Results.NotFound(new { message = "Product not found." });
    }

    await categoryActivityStore.RecordClickAsync(product.Category, product.Subcategory, "product-view");
    return Results.NoContent();
});

app.MapDelete("/api/account/activity", async () =>
{
    await accountActivityStore.ClearAsync();
    await categoryActivityStore.ClearAsync();
    return Results.NoContent();
});

app.MapGet("/api/orders", async () => Results.Ok(await orderStore.GetOrdersAsync()));

app.MapGet("/api/orders/track/{trackingNumber}", async (string trackingNumber) =>
{
    var order = await orderStore.FindByTrackingNumberAsync(trackingNumber);
    return order is null ? Results.NotFound(new { message = "No order was found for that tracking number." }) : Results.Ok(order);
});

app.MapPost("/api/orders", async (CreateOrderRequest request, HttpContext context) =>
{
    if (request.ShippingAddress is not { } shippingAddress)
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["shippingAddress"] = ["Enter shipping details."]
        });
    }

    var validationErrors = ValidateShippingAddress(shippingAddress);
    if (validationErrors.Count > 0)
    {
        return Results.ValidationProblem(validationErrors);
    }

    var cart = ReadCart(context);
    if (cart.Count == 0)
    {
        return Results.BadRequest(new { message = "Your cart is empty." });
    }

    var cartResponse = BuildCart(cart, products);
    if (cartResponse.Items.Count == 0)
    {
        return Results.BadRequest(new { message = "Your cart no longer contains available products." });
    }

    var order = await orderStore.CreateAsync(cartResponse, shippingAddress);
    foreach (var item in cartResponse.Items)
    {
        await categoryActivityStore.RecordClickAsync(item.Product.Category, item.Product.Subcategory, "purchase");
    }
    WriteCart(context, []);
    return Results.Created($"/api/orders/track/{order.TrackingNumber}", order);
});

app.MapPost("/api/orders/{orderNumber}/advance", async (string orderNumber) =>
{
    var order = await orderStore.AdvanceStatusAsync(orderNumber);
    return order is null
        ? Results.NotFound(new { message = "Order not found." })
        : Results.Ok(order);
});

app.MapGet("/api/cart", (HttpContext context) => Results.Ok(GetCart(context, products)));

app.MapPost("/api/cart/items", async (AddCartItemRequest request, HttpContext context) =>
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

    var product = products.First(product => product.Id == request.ProductId);
    await accountActivityStore.RecordAddAsync(product, request.Quantity);
    await categoryActivityStore.RecordClickAsync(product.Category, product.Subcategory, "cart-add");
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
            ? BuildCartItem(product, entry.Value)
            : null)
        .Where(item => item is not null)
        .Select(item => item!)
        .ToList();

    return new CartResponse(items, items.Sum(item => item.Quantity), decimal.Round(items.Sum(item => item.LineTotal), 2));
}

static CartItem BuildCartItem(Product product, int quantity)
{
    var savings = product.OriginalPrice is { } originalPrice
        ? decimal.Round((originalPrice - product.Price) * quantity, 2, MidpointRounding.AwayFromZero)
        : product.Promotion == "Special offer"
            ? decimal.Round(product.Price * (quantity / 2) * 0.5m, 2, MidpointRounding.AwayFromZero)
            : 0m;
    var lineTotal = decimal.Round(product.Price * quantity - savings, 2, MidpointRounding.AwayFromZero);
    return new CartItem(product, quantity, lineTotal, savings);
}

static Dictionary<string, string[]> ValidateShippingAddress(ShippingAddress address)
{
    var errors = new Dictionary<string, string[]>();
    if (string.IsNullOrWhiteSpace(address.FullName)) errors["fullName"] = ["Enter the recipient's name."];
    if (string.IsNullOrWhiteSpace(address.Street)) errors["street"] = ["Enter a street address."];
    if (string.IsNullOrWhiteSpace(address.City)) errors["city"] = ["Enter a city."];
    if (string.IsNullOrWhiteSpace(address.Region)) errors["region"] = ["Enter a state or region."];
    if (string.IsNullOrWhiteSpace(address.PostalCode)) errors["postalCode"] = ["Enter a postal code."];
    if (address.FullName?.Length > 100) errors["fullName"] = ["Name must be 100 characters or fewer."];
    if (address.Street?.Length > 160) errors["street"] = ["Street address must be 160 characters or fewer."];
    if (address.City?.Length > 80) errors["city"] = ["City must be 80 characters or fewer."];
    if (address.Region?.Length > 80) errors["region"] = ["State or region must be 80 characters or fewer."];
    if (address.PostalCode?.Length > 20) errors["postalCode"] = ["Postal code must be 20 characters or fewer."];
    return errors;
}

static bool IsProductView(CategoryClickEntry entry) => entry.Source is "product-view" or "product";

static int GetActivityPoints(CategoryClickEntry entry) => entry.Source switch
{
    "category" => 1,
    "product-view" or "product" => 2,
    "cart-add" => 3,
    "purchase" => 4,
    _ => 0
};

record Product(
    int Id,
    string Name,
    string Category,
    string Subcategory,
    decimal Price,
    string Description,
    string Icon,
    double Rating,
    int ReviewCount,
    decimal? OriginalPrice = null,
    string? Promotion = null);
record ProductCategory(string Name, IReadOnlyList<string> Subcategories);
record AddCartItemRequest(int ProductId, int Quantity = 1);
record CartItem(Product Product, int Quantity, decimal LineTotal, decimal Savings = 0);
record CartResponse(IReadOnlyList<CartItem> Items, int ItemCount, decimal Subtotal);
record Account(string Id, string Name);
record AccountActivityEntry(Guid Id, int ProductId, string ProductName, string ProductIcon, decimal UnitPrice, int Quantity, DateTimeOffset AddedAt);
record AccountActivityResponse(Account Account, int AddEvents, int ProductsAdded, IReadOnlyList<AccountActivityEntry> Activity);
record CategoryClickRequest(string Category, string? Subcategory);
record CategoryClickEntry(Guid Id, string Category, string? Subcategory, string? Source, DateTimeOffset ClickedAt);
record SubcategoryPointStats(
    string Name,
    int SubcategoryPoints,
    int ProductViewPoints,
    int CartAddPoints,
    int PurchasePoints,
    int TotalPoints);
record CategoryClickStats(
    string Name,
    int CategoryPoints,
    int SubcategoryPoints,
    int ProductViewPoints,
    int CartAddPoints,
    int PurchasePoints,
    int TotalPoints,
    IReadOnlyList<SubcategoryPointStats> Subcategories);
record AccountStatsResponse(
    Account Account,
    int ProductAddEvents,
    int ProductsAdded,
    int CategoryPoints,
    int SubcategoryPoints,
    int ProductViewPoints,
    int CartAddPoints,
    int PurchasePoints,
    int TotalPoints,
    int CategoriesExplored,
    IReadOnlyList<CategoryClickStats> Categories);
record ShippingAddress(string? FullName, string? Street, string? City, string? Region, string? PostalCode);
record CreateOrderRequest(ShippingAddress? ShippingAddress);
record OrderLineItem(
    int ProductId,
    string ProductName,
    string ProductIcon,
    decimal UnitPrice,
    int Quantity,
    decimal LineTotal,
    decimal? OriginalPrice = null,
    string? Promotion = null,
    decimal Savings = 0);
record OrderStatusEvent(string Status, string Label, DateTimeOffset At);
record RetailOrder(
    string OrderNumber,
    string TrackingNumber,
    string AccountName,
    DateTimeOffset PlacedAt,
    DateTimeOffset EstimatedDelivery,
    string Status,
    ShippingAddress ShippingAddress,
    IReadOnlyList<OrderLineItem> Items,
    decimal Subtotal,
    decimal Shipping,
    decimal Tax,
    decimal Total,
    IReadOnlyList<OrderStatusEvent> StatusHistory);

sealed class AccountActivityStore(string filePath)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly SemaphoreSlim fileLock = new(1, 1);

    public async Task<IReadOnlyList<AccountActivityEntry>> GetActivityAsync()
    {
        await fileLock.WaitAsync();
        try
        {
            var json = await File.ReadAllTextAsync(filePath);
            return JsonSerializer.Deserialize<List<AccountActivityEntry>>(json, JsonOptions)
                ?? throw new InvalidDataException($"The account activity file at '{filePath}' is empty or invalid.");
        }
        finally
        {
            fileLock.Release();
        }
    }

    public async Task RecordAddAsync(Product product, int quantity)
    {
        await fileLock.WaitAsync();
        try
        {
            var json = await File.ReadAllTextAsync(filePath);
            var activity = JsonSerializer.Deserialize<List<AccountActivityEntry>>(json, JsonOptions)
                ?? throw new InvalidDataException($"The account activity file at '{filePath}' is empty or invalid.");
            activity.Add(new AccountActivityEntry(
                Guid.NewGuid(),
                product.Id,
                product.Name,
                product.Icon,
                product.Price,
                quantity,
                DateTimeOffset.UtcNow));
            await File.WriteAllTextAsync(filePath, JsonSerializer.Serialize(activity, JsonOptions));
        }
        finally
        {
            fileLock.Release();
        }
    }

    public async Task ClearAsync()
    {
        await fileLock.WaitAsync();
        try
        {
            await File.WriteAllTextAsync(filePath, "[]");
        }
        finally
        {
            fileLock.Release();
        }
    }
}

sealed class CategoryActivityStore(string filePath)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly SemaphoreSlim fileLock = new(1, 1);

    public async Task<IReadOnlyList<CategoryClickEntry>> GetActivityAsync()
    {
        await fileLock.WaitAsync();
        try
        {
            var json = await File.ReadAllTextAsync(filePath);
            return JsonSerializer.Deserialize<List<CategoryClickEntry>>(json, JsonOptions)
                ?? throw new InvalidDataException($"The category activity file at '{filePath}' is empty or invalid.");
        }
        finally
        {
            fileLock.Release();
        }
    }

    public sealed class OrderStore(string filePath)
    {
        private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };
        private static readonly (string Status, string Label)[] StatusSteps =
        [
            ("Processing", "Order received"),
            ("Packed", "Packed and ready"),
            ("Shipped", "On the way"),
            ("OutForDelivery", "Out for delivery"),
            ("Delivered", "Delivered")
        ];
        private readonly SemaphoreSlim fileLock = new(1, 1);

        public async Task<IReadOnlyList<RetailOrder>> GetOrdersAsync()
        {
            await fileLock.WaitAsync();
            try
            {
                return await ReadOrdersAsync();
            }
            finally
            {
                fileLock.Release();
            }
        }

        public async Task<RetailOrder?> FindByTrackingNumberAsync(string trackingNumber)
        {
            await fileLock.WaitAsync();
            try
            {
                var orders = await ReadOrdersAsync();
                return orders.FirstOrDefault(order =>
                    order.TrackingNumber.Equals(trackingNumber, StringComparison.OrdinalIgnoreCase) ||
                    order.OrderNumber.Equals(trackingNumber, StringComparison.OrdinalIgnoreCase));
            }
            finally
            {
                fileLock.Release();
            }
        }

        public async Task<RetailOrder> CreateAsync(CartResponse cart, ShippingAddress address)
        {
            await fileLock.WaitAsync();
            try
            {
                var orders = await ReadOrdersAsync();
                var now = DateTimeOffset.UtcNow;
                var subtotal = decimal.Round(cart.Subtotal, 2);
                var shipping = subtotal >= 75m ? 0m : 5.99m;
                var tax = decimal.Round(subtotal * 0.08m, 2);
                var orderNumber = $"RG-{now:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";
                var status = StatusSteps[0];
                var order = new RetailOrder(
                    orderNumber,
                    $"TRK-{Guid.NewGuid().ToString("N")[..12].ToUpperInvariant()}",
                    "Cappy Demo",
                    now,
                    now.AddDays(5),
                    status.Status,
                    address,
                    cart.Items.Select(item => new OrderLineItem(
                        item.Product.Id,
                        item.Product.Name,
                        item.Product.Icon,
                        item.Product.Price,
                        item.Quantity,
                        item.LineTotal,
                        item.Product.OriginalPrice,
                        item.Product.Promotion,
                        item.Savings)).ToArray(),
                    subtotal,
                    shipping,
                    tax,
                    decimal.Round(subtotal + shipping + tax, 2),
                    [new OrderStatusEvent(status.Status, status.Label, now)]);
                orders.Insert(0, order);
                await WriteOrdersAsync(orders);
                return order;
            }
            finally
            {
                fileLock.Release();
            }
        }

        public async Task<RetailOrder?> AdvanceStatusAsync(string orderNumber)
        {
            await fileLock.WaitAsync();
            try
            {
                var orders = await ReadOrdersAsync();
                var orderIndex = orders.FindIndex(order => order.OrderNumber.Equals(orderNumber, StringComparison.OrdinalIgnoreCase));
                if (orderIndex < 0) return null;

                var order = orders[orderIndex];
                var currentStep = Array.FindIndex(StatusSteps, step => step.Status == order.Status);
                if (currentStep < 0 || currentStep >= StatusSteps.Length - 1) return order;

                var nextStep = StatusSteps[currentStep + 1];
                var updated = order with
                {
                    Status = nextStep.Status,
                    StatusHistory = order.StatusHistory.Append(
                        new OrderStatusEvent(nextStep.Status, nextStep.Label, DateTimeOffset.UtcNow)).ToArray()
                };
                orders[orderIndex] = updated;
                await WriteOrdersAsync(orders);
                return updated;
            }
            finally
            {
                fileLock.Release();
            }
        }

        private async Task<List<RetailOrder>> ReadOrdersAsync()
        {
            var json = await File.ReadAllTextAsync(filePath);
            return JsonSerializer.Deserialize<List<RetailOrder>>(json, JsonOptions)
                ?? throw new InvalidDataException($"The order file at '{filePath}' is empty or invalid.");
        }

        private Task WriteOrdersAsync(List<RetailOrder> orders) =>
            File.WriteAllTextAsync(filePath, JsonSerializer.Serialize(orders, JsonOptions));
    }

    public async Task RecordClickAsync(string category, string? subcategory, string source)
    {
        await fileLock.WaitAsync();
        try
        {
            var json = await File.ReadAllTextAsync(filePath);
            var activity = JsonSerializer.Deserialize<List<CategoryClickEntry>>(json, JsonOptions)
                ?? throw new InvalidDataException($"The category activity file at '{filePath}' is empty or invalid.");
            activity.Add(new CategoryClickEntry(Guid.NewGuid(), category, subcategory, source, DateTimeOffset.UtcNow));
            await File.WriteAllTextAsync(filePath, JsonSerializer.Serialize(activity, JsonOptions));
        }
        finally
        {
            fileLock.Release();
        }
    }

    public async Task ClearAsync()
    {
        await fileLock.WaitAsync();
        try
        {
            await File.WriteAllTextAsync(filePath, "[]");
        }
        finally
        {
            fileLock.Release();
        }
    }
}
