using System.Security.Claims;

using Squad.Core;

namespace Squad.Web;

/// <summary>
/// Issues the app's JWT after verifying credentials. Four ways in — email/password
/// register + login, and Google / Apple id_token exchange — all converge on one
/// AthleteAccount and one signed token the rest of the API accepts.
/// </summary>
public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuth(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/auth");

        // Tells the client which social providers are wired + their public client ids,
        // so the browser SDKs (Google Identity Services / Sign in with Apple JS) can
        // initialize. Client ids are not secrets. Only configured providers are listed.
        g.MapGet("/config", (IEnumerable<IExternalTokenVerifier> verifiers, IConfiguration config) =>
        {
            var enabled = verifiers.Select(v => v.Provider).ToHashSet();
            return Results.Ok(new
            {
                // clientId = web client (GSI / Apple JS). iosClientId / bundleId let the
                // native app initialize the native Google / Apple SDKs at runtime (not secrets).
                google = enabled.Contains(ExternalProvider.Google)
                    ? new { clientId = config["Auth:Google:ClientId"], iosClientId = config["Auth:Google:iOSClientId"] } : null,
                apple = enabled.Contains(ExternalProvider.Apple)
                    ? new { clientId = config["Auth:Apple:ClientId"], bundleId = config["Auth:Apple:BundleId"] } : null,
            });
        });

        // TEMP diagnostics for OAuth bring-up: does the App Service have egress to the
        // provider JWKS endpoints? (VNet-integrated apps sometimes can't reach the internet.)
        g.MapGet("/_diag", async (IHttpClientFactory factory, CancellationToken ct) =>
        {
            var http = factory.CreateClient();
            http.Timeout = TimeSpan.FromSeconds(10);
            async Task<object> Probe(string url)
            {
                try { var r = await http.GetAsync(url, ct); return new { url, status = (int)r.StatusCode, ok = r.IsSuccessStatusCode }; }
                catch (Exception e) { return new { url, error = $"{e.GetType().Name}: {e.Message}" }; }
            }
            return Results.Ok(new
            {
                google = await Probe("https://accounts.google.com/.well-known/openid-configuration"),
                googleCerts = await Probe("https://www.googleapis.com/oauth2/v3/certs"),
                apple = await Probe("https://appleid.apple.com/.well-known/openid-configuration"),
            });
        });

        // Email/password auth has been removed — Google and Apple are the only sign-in methods.
        g.MapPost("/google", (ExternalLoginRequest req, HttpContext http, IAthleteAccounts accounts, ITokenIssuer issuer, AdminRegistry admins, IEnumerable<IExternalTokenVerifier> verifiers, CancellationToken ct)
            => External(ExternalProvider.Google, req, accounts, issuer, admins, verifiers, ct));
        g.MapPost("/apple", (ExternalLoginRequest req, HttpContext http, IAthleteAccounts accounts, ITokenIssuer issuer, AdminRegistry admins, IEnumerable<IExternalTokenVerifier> verifiers, CancellationToken ct)
            => External(ExternalProvider.Apple, req, accounts, issuer, admins, verifiers, ct));

        g.MapGet("/me", Me).RequireAuthorization();

        return app;
    }

    // --- Google / Apple id_token exchange ---

    private static async Task<IResult> External(
        ExternalProvider provider, ExternalLoginRequest req,
        IAthleteAccounts accounts, ITokenIssuer issuer, AdminRegistry admins,
        IEnumerable<IExternalTokenVerifier> verifiers, CancellationToken ct)
    {
        var verifier = verifiers.FirstOrDefault(v => v.Provider == provider);
        if (verifier is null)
            return Results.Json(new { error = $"{provider} sign-in is not configured on the server." }, statusCode: 501);

        if (string.IsNullOrWhiteSpace(req.IdToken))
            return Results.BadRequest(new { error = "idToken is required." });

        var result = await verifier.VerifyAsync(req.IdToken, ct);
        var identity = result.Identity;
        if (identity is null)
            // NOTE: `detail` is temporary diagnostics for OAuth bring-up — remove once sign-in is confirmed.
            return Results.Json(new { error = $"The {provider} token could not be verified: {result.Error}", detail = result.Error }, statusCode: 401);

        // 1) Known federated subject → sign straight in.
        var account = await accounts.FindByProviderAsync(provider, identity.Subject, ct);

        // 2) Same verified email as an existing account → link this provider to it.
        if (account is null && identity.EmailVerified && !string.IsNullOrEmpty(identity.Email))
        {
            var byEmail = await accounts.FindByEmailAsync(identity.Email.ToLowerInvariant(), ct);
            if (byEmail is not null)
            {
                await accounts.LinkProviderAsync(byEmail.Id, provider, identity.Subject, ct);
                account = byEmail;
            }
        }

        // 3) First time we've seen them → create an account.
        if (account is null)
        {
            var name = string.IsNullOrWhiteSpace(identity.Name) ? EmailLocalPart(identity.Email) : identity.Name!;
            var created = NewAccount(name, identity.Email?.ToLowerInvariant(),
                googleSub: provider == ExternalProvider.Google ? identity.Subject : null,
                appleSub: provider == ExternalProvider.Apple ? identity.Subject : null);
            await accounts.CreateAsync(created, ct);
            account = ToAccount(created);
        }

        return Ok(account, issuer, admins, provider.ToString().ToLowerInvariant());
    }

    // --- current athlete ---

    private static async Task<IResult> Me(HttpContext http, IAthleteAccounts accounts, AdminRegistry admins, CancellationToken ct)
    {
        var id = http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub");
        if (!Guid.TryParse(id, out var athleteId)) return Results.Unauthorized();

        var account = await accounts.GetAsync(athleteId, ct);
        if (account is null) return Results.Unauthorized();

        return Results.Ok(new
        {
            athleteId = account.Id,
            name = account.DisplayName,
            initials = account.Initials,
            avatarColor = account.AvatarColor,
            email = account.Email,
            squadId = account.SquadId,
            isAdmin = admins.IsAdmin(account.Email),
        });
    }

    // --- helpers ---

    private static IResult Ok(AthleteAccount a, ITokenIssuer issuer, AdminRegistry admins, string provider)
    {
        var (token, expires) = issuer.Issue(a);
        return Results.Ok(new AuthResult(
            token, expires, a.Id, a.DisplayName, a.Initials, a.AvatarColor, a.Email, a.SquadId, provider,
            IsAdmin: admins.IsAdmin(a.Email)));
    }

    private static NewAthleteAccount NewAccount(
        string name, string? email, string? passwordHash = null, string? googleSub = null, string? appleSub = null)
    {
        var id = Guid.NewGuid();
        // A fresh, private "Solo" squad id (materialised in SqlAthleteAccounts.CreateAsync) — new
        // signups get their own squad, not the shared landing club, so they don't auto-join a group.
        return new NewAthleteAccount(
            id, name, Initials(name), AvatarColor(id), Guid.NewGuid(),
            email, passwordHash, googleSub, appleSub);
    }

    private static AthleteAccount ToAccount(NewAthleteAccount a) => new(
        a.Id, a.DisplayName, a.Initials, a.AvatarColor, a.SquadId,
        a.Email, a.PasswordHash, a.GoogleSub, a.AppleSub);

    private static string Initials(string name)
    {
        var parts = name.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0) return "?";
        var first = char.ToUpperInvariant(parts[0][0]);
        return parts.Length == 1 ? first.ToString() : $"{first}{char.ToUpperInvariant(parts[^1][0])}";
    }

    // Stable per-athlete accent from a small palette (matches the client's accent set).
    private static readonly string[] Palette = { "#d6ff3f", "#ff6a2c", "#2fdcc8", "#5a86ff", "#ff6f61", "#ffb84d" };
    private static string AvatarColor(Guid id) => Palette[(id.GetHashCode() & 0x7fffffff) % Palette.Length];

    private static string EmailLocalPart(string? email)
        => string.IsNullOrEmpty(email) ? "Athlete" : email.Split('@')[0];
}
