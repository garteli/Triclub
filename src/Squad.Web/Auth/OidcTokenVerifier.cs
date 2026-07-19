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
    private readonly string _clientId;
    private readonly string[] _validIssuers;
    private readonly JwtSecurityTokenHandler _handler = new();

    public ExternalProvider Provider { get; }

    private OidcTokenVerifier(ExternalProvider provider, string metadataUrl, string clientId, string[] validIssuers, HttpClient http)
    {
        Provider = provider;
        _clientId = clientId;
        _validIssuers = validIssuers;
        _config = new ConfigurationManager<OpenIdConnectConfiguration>(
            metadataUrl, new OpenIdConnectConfigurationRetriever(), new HttpDocumentRetriever(http));
    }

    public static OidcTokenVerifier Google(string clientId, HttpClient http) => new(
        ExternalProvider.Google,
        "https://accounts.google.com/.well-known/openid-configuration",
        clientId,
        new[] { "https://accounts.google.com", "accounts.google.com" },
        http);

    public static OidcTokenVerifier Apple(string clientId, HttpClient http) => new(
        ExternalProvider.Apple,
        "https://appleid.apple.com/.well-known/openid-configuration",
        clientId,
        new[] { "https://appleid.apple.com" },
        http);

    public async Task<ExternalIdentity?> VerifyAsync(string idToken, CancellationToken ct)
    {
        try
        {
            var config = await _config.GetConfigurationAsync(ct);
            var parameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuers = _validIssuers,
                ValidateAudience = true,
                ValidAudience = _clientId,
                ValidateIssuerSigningKey = true,
                IssuerSigningKeys = config.SigningKeys,
                ValidateLifetime = true,
                ClockSkew = TimeSpan.FromSeconds(30),
            };

            var principal = _handler.ValidateToken(idToken, parameters, out _);

            var sub = principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
            if (string.IsNullOrEmpty(sub)) return null;

            var email = principal.FindFirstValue(JwtRegisteredClaimNames.Email);
            var name = principal.FindFirstValue("name") ?? principal.FindFirstValue(JwtRegisteredClaimNames.GivenName);
            var emailVerified = string.Equals(
                principal.FindFirstValue("email_verified"), "true", StringComparison.OrdinalIgnoreCase);

            return new ExternalIdentity(sub, email, name, emailVerified);
        }
        catch (Exception)
        {
            // Bad signature, wrong audience, expired, network/JWKS failure — all mean "not authenticated".
            return null;
        }
    }
}
