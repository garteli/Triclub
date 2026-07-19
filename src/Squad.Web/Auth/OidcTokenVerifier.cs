using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

using Squad.Core;

namespace Squad.Web;

/// <summary>
/// Verifies a Google or Apple OpenID Connect id_token: fetches the provider's
/// signing keys from its published JWKS (cached + auto-rotated by ConfigurationManager),
/// validates the signature, issuer, audience (our OAuth client id) and lifetime,
/// then returns the trustworthy claims. Returns null on any validation failure.
///
/// One instance per provider — registered only when that provider's ClientId is
/// configured (see Program.cs / appsettings "Auth" section).
/// </summary>
public sealed class OidcTokenVerifier : IExternalTokenVerifier
{
    private readonly ConfigurationManager<OpenIdConnectConfiguration> _config;
    private readonly string[] _validAudiences;
    private readonly string[] _validIssuers;
    // MapInboundClaims=false keeps the OIDC claim names as-is ('sub', 'email',
    // 'name', 'email_verified'); the default remaps 'sub' -> the legacy
    // nameidentifier URI, which made the 'sub' lookup below come back empty.
    private readonly JwtSecurityTokenHandler _handler = new() { MapInboundClaims = false };

    public ExternalProvider Provider { get; }

    private OidcTokenVerifier(ExternalProvider provider, string metadataUrl, string[] audiences, string[] validIssuers, HttpClient http)
    {
        Provider = provider;
        _validAudiences = audiences;
        _validIssuers = validIssuers;
        _config = new ConfigurationManager<OpenIdConnectConfiguration>(
            metadataUrl, new OpenIdConnectConfigurationRetriever(), new HttpDocumentRetriever(http));
    }

    // Web sign-in (GSI) issues an id_token whose audience is the web client id; the
    // native iOS Google SDK issues one whose audience is the iOS client id. Accept
    // either (both are our own Google project clients). `extraAudiences` are ignored
    // when null/blank, so existing web-only deployments are unaffected.
    public static OidcTokenVerifier Google(string clientId, HttpClient http, params string?[] extraAudiences) => new(
        ExternalProvider.Google,
        "https://accounts.google.com/.well-known/openid-configuration",
        Audiences(clientId, extraAudiences),
        new[] { "https://accounts.google.com", "accounts.google.com" },
        http);

    // Web Sign in with Apple uses the Services ID as audience; native iOS uses the
    // app's bundle id. Accept either.
    public static OidcTokenVerifier Apple(string clientId, HttpClient http, params string?[] extraAudiences) => new(
        ExternalProvider.Apple,
        "https://appleid.apple.com/.well-known/openid-configuration",
        Audiences(clientId, extraAudiences),
        new[] { "https://appleid.apple.com" },
        http);

    private static string[] Audiences(string clientId, string?[] extra) =>
        new[] { clientId }
            .Concat(extra.Where(a => !string.IsNullOrWhiteSpace(a))!)
            .Cast<string>()
            .Distinct()
            .ToArray();

    public async Task<ExternalVerifyResult> VerifyAsync(string idToken, CancellationToken ct)
    {
        try
        {
            var config = await _config.GetConfigurationAsync(ct);
            var parameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuers = _validIssuers,
                ValidateAudience = true,
                ValidAudiences = _validAudiences,
                ValidateIssuerSigningKey = true,
                IssuerSigningKeys = config.SigningKeys,
                ValidateLifetime = true,
                ClockSkew = TimeSpan.FromSeconds(30),
            };

            var principal = _handler.ValidateToken(idToken, parameters, out _);

            var sub = principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
            if (string.IsNullOrEmpty(sub)) return new ExternalVerifyResult(null, "token had no 'sub' claim");

            var email = principal.FindFirstValue(JwtRegisteredClaimNames.Email);
            var name = principal.FindFirstValue("name") ?? principal.FindFirstValue(JwtRegisteredClaimNames.GivenName);
            var emailVerified = string.Equals(
                principal.FindFirstValue("email_verified"), "true", StringComparison.OrdinalIgnoreCase);

            return new ExternalVerifyResult(new ExternalIdentity(sub, email, name, emailVerified), null);
        }
        catch (Exception ex)
        {
            // Bad signature, wrong audience, expired, network/JWKS failure — all mean "not authenticated".
            // The reason is surfaced for diagnostics (audience mismatch vs JWKS/egress failure look very different).
            return new ExternalVerifyResult(null, $"{ex.GetType().Name}: {ex.Message}");
        }
    }
}
