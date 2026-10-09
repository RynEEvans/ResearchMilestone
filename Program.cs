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
            var categoryClicks = categoryActivity.Count(entry =>
                entry.Category.Equals(group.Key, StringComparison.OrdinalIgnoreCase) &&
                entry.Source != "product" &&
                entry.Subcategory is null);
            var subcategories = group
                .GroupBy(product => product.Subcategory)
                .OrderBy(subcategoryGroup => subcategoryGroup.Key)
                .Select(subcategoryGroup =>
                {
                    var subcategoryClicks = categoryActivity.Count(entry =>
                        entry.Category.Equals(group.Key, StringComparison.OrdinalIgnoreCase) &&
                        entry.Source != "product" &&
                        entry.Subcategory?.Equals(subcategoryGroup.Key, StringComparison.OrdinalIgnoreCase) == true);
                    var productClicks = categoryActivity.Count(entry =>
                        entry.Category.Equals(group.Key, StringComparison.OrdinalIgnoreCase) &&
                        entry.Subcategory?.Equals(subcategoryGroup.Key, StringComparison.OrdinalIgnoreCase) == true &&
                        entry.Source == "product");

                    return new SubcategoryClickStats(subcategoryGroup.Key, subcategoryClicks, productClicks);
                })
                .ToArray();
            var subcategoryClicks = subcategories.Sum(subcategory => subcategory.Clicks);
            var productClicks = categoryActivity.Count(entry =>
                entry.Category.Equals(group.Key, StringComparison.OrdinalIgnoreCase) &&
                entry.Source == "product");

            return new CategoryClickStats(
                group.Key,
                categoryClicks,
                subcategoryClicks,
                productClicks,
                categoryClicks + subcategoryClicks + productClicks,
                subcategories);
        })
        .ToArray();

    return Results.Ok(new AccountStatsResponse(
        new Account("cappy-demo", "Cappy Demo"),
        productActivity.Count,
        productActivity.Sum(entry => entry.Quantity),
        categoryActivity.Count(entry => entry.Source != "product" && entry.Subcategory is null),
        categoryActivity.Count(entry => entry.Source != "product" && entry.Subcategory is not null),
        categoryActivity.Count(entry => entry.Source == "product"),
        categoryActivity.Count,
        categoryStats.Count(category => category.TotalClicks > 0),
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

    await categoryActivityStore.RecordClickAsync(product.Category, product.Subcategory, "product");
    return Results.NoContent();
});

app.MapDelete("/api/account/activity", async () =>
{
    await accountActivityStore.ClearAsync();
    await categoryActivityStore.ClearAsync();
    return Results.NoContent();
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
    await categoryActivityStore.RecordClickAsync(product.Category, product.Subcategory, "product");
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

record Product(int Id, string Name, string Category, string Subcategory, decimal Price, string Description, string Icon, double Rating, int ReviewCount);
record ProductCategory(string Name, IReadOnlyList<string> Subcategories);
record AddCartItemRequest(int ProductId, int Quantity = 1);
record CartItem(Product Product, int Quantity, decimal LineTotal);
record CartResponse(IReadOnlyList<CartItem> Items, int ItemCount, decimal Subtotal);
record Account(string Id, string Name);
record AccountActivityEntry(Guid Id, int ProductId, string ProductName, string ProductIcon, decimal UnitPrice, int Quantity, DateTimeOffset AddedAt);
record AccountActivityResponse(Account Account, int AddEvents, int ProductsAdded, IReadOnlyList<AccountActivityEntry> Activity);
record CategoryClickRequest(string Category, string? Subcategory);
record CategoryClickEntry(Guid Id, string Category, string? Subcategory, string? Source, DateTimeOffset ClickedAt);
record SubcategoryClickStats(string Name, int Clicks, int ProductClicks);
record CategoryClickStats(
    string Name,
    int CategoryClicks,
    int SubcategoryClicks,
    int ProductClicks,
    int TotalClicks,
    IReadOnlyList<SubcategoryClickStats> Subcategories);
record AccountStatsResponse(
    Account Account,
    int ProductAddEvents,
    int ProductsAdded,
    int CategoryClicks,
    int SubcategoryClicks,
    int ProductClicks,
    int TotalBrowseClicks,
    int CategoriesExplored,
    IReadOnlyList<CategoryClickStats> Categories);

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
