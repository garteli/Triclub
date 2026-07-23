using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Squad.Core;
using Squad.Infrastructure;
using Squad.Web;

var builder = WebApplication.CreateBuilder(args);

// ---- ingest + persistence + live-ride state ----
var sqlConnection = builder.Configuration.GetConnectionString("Sql") ?? "";
var storageConnection = builder.Configuration.GetConnectionString("Storage");
// The club's default cut of each tracked ride payment, in basis points (1000 = 10%).
var clubFeeBps = builder.Configuration.GetValue<int?>("Payments:ClubFeeBps") ?? 1000;
// AI plan import (PDF → training plan). No key ⇒ the import feature is dark (endpoint 503).
var aiApiKey = builder.Configuration["Ai:Anthropic:ApiKey"];
var aiModel = builder.Configuration["Ai:Anthropic:Model"];
// Plan library seeding: only AI-generates the built-in plan templates when explicitly enabled
// (PlanLibrary:Seed=true), optionally capped per run (PlanLibrary:SeedLimit) to roll out gradually.
var seedLibrary = builder.Configuration.GetValue<bool>("PlanLibrary:Seed");
var seedLimit = builder.Configuration.GetValue<int?>("PlanLibrary:SeedLimit") ?? 0;
builder.Services.AddSquadInfrastructure(
    sqlConnection, storageConnection, clubFeeBps, aiApiKey, aiModel, seedLibrary, seedLimit);

// ---- realtime (feed + live ride) ----
builder.Services.AddSignalR();
builder.Services.AddScoped<IActivityFanout, SignalRActivityFanout>();

// ---- CORS ----
// The native app serves the bundled SPA from capacitor://localhost (iOS) and
// https://localhost (Android), so its /api and /hubs calls to this backend are
// cross-origin. Allow the Capacitor webview origins. SignalR + bearer flows need
// an explicit origin list with credentials (not AllowAnyOrigin). On the web the SPA
// is same-origin, so this policy is a no-op there.
const string NativeCors = "native";
builder.Services.AddCors(options =>
    options.AddPolicy(NativeCors, policy => policy
        .WithOrigins("capacitor://localhost", "ionic://localhost", "http://localhost", "https://localhost")
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials()));

// ---- auth ----
// Protected endpoints/hubs read the caller's athlete id from the NameIdentifier
// (or 'sub') claim of a validated JWT bearer token. Configure the "Jwt" section
// (Issuer / Audience / Key) in appsettings; keep the signing key out of source
// control (user-secrets / env / key vault) in anything but local dev.
var jwt = builder.Configuration.GetSection("Jwt");
var signingKey = jwt["Key"];
if (string.IsNullOrWhiteSpace(signingKey))
    throw new InvalidOperationException(
        "Jwt:Key is not configured. Set it via user-secrets, an environment variable, " +
        "or appsettings.Development.json before starting the protected API.");

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwt["Issuer"],
            ValidateAudience = true,
            ValidAudience = jwt["Audience"],
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
        };

        // WebSockets can't carry an Authorization header, so SignalR passes the
        // token as ?access_token=... — lift it onto the request for hub paths only.
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
                    context.Token = accessToken;
                return Task.CompletedTask;
            },
        };
    });
builder.Services.AddAuthorization();

// Sysadmin allowlist (Admin:Emails in config, plus the founding admin). Gates /api/admin.
builder.Services.AddSingleton<AdminRegistry>();

// ---- token issuance + social sign-in ----
// JWT minting (same "Jwt" config the bearer middleware validates above).
builder.Services.AddSingleton<ITokenIssuer, JwtTokenIssuer>();
builder.Services.AddHttpClient();

// Register a verifier per configured provider. A provider with no ClientId set is
// simply not wired — its /api/auth/{provider} endpoint reports "not configured" and
// the client hides that button (GET /api/auth/config).
var googleClientId = builder.Configuration["Auth:Google:ClientId"];
var googleIosClientId = builder.Configuration["Auth:Google:iOSClientId"];   // native iOS SDK audience
if (!string.IsNullOrWhiteSpace(googleClientId))
    builder.Services.AddSingleton<IExternalTokenVerifier>(sp =>
        OidcTokenVerifier.Google(googleClientId, sp.GetRequiredService<IHttpClientFactory>().CreateClient(), googleIosClientId));

var appleClientId = builder.Configuration["Auth:Apple:ClientId"];
var appleBundleId = builder.Configuration["Auth:Apple:BundleId"];           // native iOS Sign in with Apple audience
if (!string.IsNullOrWhiteSpace(appleClientId))
    builder.Services.AddSingleton<IExternalTokenVerifier>(sp =>
        OidcTokenVerifier.Apple(appleClientId, sp.GetRequiredService<IHttpClientFactory>().CreateClient(), appleBundleId));

var app = builder.Build();

// Serve the compiled React SPA from wwwroot. Cache strategy avoids the "reload still shows old
// HTML" trap: index.html must NEVER be cached (it names the current hashed bundles), while the
// content-hashed assets under /assets can cache forever (a new build = a new filename).
Action<Microsoft.AspNetCore.StaticFiles.StaticFileResponseContext> applyStaticCacheHeaders = ctx =>
{
    var headers = ctx.Context.Response.Headers;
    // index.html names the current hashed bundles, and version.json is the deploy marker the app
    // polls — neither may ever be cached, or a new deploy stays invisible.
    if (ctx.File.Name.Equals("index.html", StringComparison.OrdinalIgnoreCase)
        || ctx.File.Name.Equals("version.json", StringComparison.OrdinalIgnoreCase))
    {
        headers.CacheControl = "no-cache, no-store, must-revalidate";
        headers.Pragma = "no-cache";
        headers.Expires = "0";
    }
    else if (ctx.Context.Request.Path.StartsWithSegments("/assets"))
    {
        headers.CacheControl = "public, max-age=31536000, immutable";
    }
};

app.UseDefaultFiles();
app.UseStaticFiles(new Microsoft.AspNetCore.Builder.StaticFileOptions { OnPrepareResponse = applyStaticCacheHeaders });

app.UseCors(NativeCors);

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok", app = "Domestique Hub" }));

app.MapAuth();             // POST /api/auth/{register,login,google,apple}  GET /api/auth/{config,me}
app.MapProfile();          // GET/PUT /api/profile
app.MapProfilePage();      // GET /api/profile/page  +  POST/PUT/DELETE /api/profile/goal
app.MapImages();           // avatars + activity photos (upload + authenticated read proxy)
app.MapActivityIntake();   // POST /api/activities/upload  +  /api/activities/native/{source}
app.MapActivityQuery();    // GET  /api/activities
app.MapInteractions();     // kudos + comments on /api/activities/{id}
app.MapHealthDaily();      // POST/GET /api/health/daily (Apple Health wellness)
app.MapSquads();           // GET/POST /api/squads (+ /{id}, /{id}/join)
app.MapSquadTargets();      // group target races: /api/squads/{id}/targets (owner add/remove, members view)
app.MapSquadEvents();       // ad-hoc group sessions: /api/squads/{id}/events + /api/events/{id}/{join,leave,checkin}
app.MapCourses();           // saved routes/courses: /api/courses (list/get/create/delete)
app.MapPayments();         // ride-payment ledger: /api/payments (+ /mine, /squad/{id}, /{id}/paid, /{id}/waive)
app.MapLeaderboard();      // GET  /api/squads/{squadId}/leaderboard
app.MapClubRanking();      // GET  /api/clubs/ranking (cross-club board)
app.MapFeed();             // GET  /api/feed
app.MapAthletes();         // GET /api/athletes/{id} (+ follow/unfollow)
app.MapNotifications();     // GET /api/notifications (+ /read)
app.MapPlan();             // GET /api/plan
app.MapChat();             // GET/POST /api/messages
app.MapDirectMessages();   // GET/POST /api/dm/{peerId} (1:1 direct messages)
app.MapAdmin();            // GET/DELETE /api/admin/* (sysadmin-only: users + clubs)
app.MapSquadHub();         // /hubs/squad
app.MapChatHub();          // /hubs/chat
app.MapRideHub();          // /hubs/ride

// "Sign in with Apple" domain verification. Apple fetches this exact path; the default static-file
// provider skips dot-folders and the SPA fallback would return index.html, so serve it explicitly
// from config (set Apple__DomainAssociation to the file Apple gives you — no code deploy needed).
app.MapGet("/.well-known/apple-developer-domain-association.txt", (IConfiguration cfg) =>
{
    var body = cfg["Apple:DomainAssociation"];
    return string.IsNullOrWhiteSpace(body) ? Results.NotFound() : Results.Text(body, "text/plain");
});

// SPA fallback for client-side routes — same no-cache headers so a deep-link reload also
// revalidates index.html (MapFallbackToFile uses its own static-file pipeline, not the one above).
app.MapFallbackToFile("index.html", new Microsoft.AspNetCore.Builder.StaticFileOptions { OnPrepareResponse = applyStaticCacheHeaders });

app.Run();
