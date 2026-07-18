var builder = WebApplication.CreateBuilder(args);

var app = builder.Build();

// Serve the compiled React SPA from wwwroot.
app.UseDefaultFiles();   // serves index.html at "/"
app.UseStaticFiles();

// Example API surface. The React client currently ships with its demo data
// inline, but this is where real squad/ride/plan endpoints would live.
app.MapGet("/api/health", () => Results.Ok(new { status = "ok", app = "Squad" }));

// SPA fallback: any non-file, non-API route returns index.html so the
// client-side app can handle it.
app.MapFallbackToFile("index.html");

app.Run();
