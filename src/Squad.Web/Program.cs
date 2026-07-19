using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
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

// ---- token issuance + social sign-in ----
// JWT minting (same "Jwt" config the bearer middleware validates above).
builder.Services.AddSingleton<ITokenIssuer, JwtTokenIssuer>();
builder.Services.AddHttpClient();

// Register a verifier per configured provider. A provider with no ClientId set is
// simply not wired — its /api/auth/{provider} endpoint reports "not configured" and
// the client hides that button (GET /api/auth/config).
var googleClientId = builder.Configuration["Auth:Google:ClientId"];
if (!string.IsNullOrWhiteSpace(googleClientId))
    builder.Services.AddSingleton<IExternalTokenVerifier>(sp =>
        OidcTokenVerifier.Google(googleClientId, sp.GetRequiredService<IHttpClientFactory>().CreateClient()));

var appleClientId = builder.Configuration["Auth:Apple:ClientId"];
if (!string.IsNullOrWhiteSpace(appleClientId))
    builder.Services.AddSingleton<IExternalTokenVerifier>(sp =>
        OidcTokenVerifier.Apple(appleClientId, sp.GetRequiredService<IHttpClientFactory>().CreateClient()));

var app = builder.Build();

// Serve the compiled React SPA from wwwroot.
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok", app = "Domestique Club" }));

app.MapAuth();             // POST /api/auth/{register,login,google,apple}  GET /api/auth/{config,me}
app.MapProfile();          // GET/PUT /api/profile
app.MapActivityIntake();   // POST /api/activities/upload  +  /api/activities/native/{source}
app.MapActivityQuery();    // GET  /api/activities
app.MapSquads();           // GET/POST /api/squads (+ /{id}, /{id}/join)
app.MapLeaderboard();      // GET  /api/squads/{squadId}/leaderboard
app.MapFeed();             // GET  /api/feed
app.MapAthletes();         // GET /api/athletes/{id} (+ follow/unfollow)
app.MapChat();             // GET/POST /api/messages
app.MapSquadHub();         // /hubs/squad
app.MapChatHub();          // /hubs/chat
app.MapRideHub();          // /hubs/ride

// SPA fallback for client-side routes.
app.MapFallbackToFile("index.html");

app.Run();
