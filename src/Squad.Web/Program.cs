using Squad.Core;
using Squad.Infrastructure;
using Squad.Web;

var builder = WebApplication.CreateBuilder(args);

// ---- ingest + persistence + live-ride state ----
var sqlConnection = builder.Configuration.GetConnectionString("Sql") ?? "";
builder.Services.AddSquadInfrastructure(sqlConnection);

// ---- realtime (feed + live ride) ----
builder.Services.AddSignalR();
builder.Services.AddScoped<IActivityFanout, SignalRActivityFanout>();

// ---- auth ----
// Protected endpoints/hubs read the caller's athlete id from their identity.
// TODO: register a real scheme (JWT bearer / cookie). Until then, the SPA and
// /api/health work; the protected APIs require an authenticated caller.
builder.Services.AddAuthentication();
builder.Services.AddAuthorization();

var app = builder.Build();

// Serve the compiled React SPA from wwwroot.
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok", app = "Squad" }));

app.MapActivityIntake();   // POST /api/activities/upload  +  /api/activities/native/{source}
app.MapLeaderboard();      // GET  /api/squads/{squadId}/leaderboard
app.MapSquadHub();         // /hubs/squad
app.MapRideHub();          // /hubs/ride

// SPA fallback for client-side routes.
app.MapFallbackToFile("index.html");

app.Run();
