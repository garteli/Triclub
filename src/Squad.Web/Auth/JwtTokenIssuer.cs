using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

using Squad.Core;

namespace Squad.Web;

/// <summary>
/// Mints the app's own HS256 JWT bearer. Signed with the same "Jwt" config the
/// bearer middleware validates against (Program.cs), so a token issued here is
/// accepted by the protected endpoints/hubs. 'sub'/NameIdentifier = athlete id.
/// </summary>
public sealed class JwtTokenIssuer : ITokenIssuer
{
    private readonly SigningCredentials _credentials;
    private readonly string? _issuer;
    private readonly string? _audience;
    private readonly TimeSpan _lifetime;

    public JwtTokenIssuer(IConfiguration config)
    {
        var jwt = config.GetSection("Jwt");
        var key = jwt["Key"] ?? throw new InvalidOperationException("Jwt:Key is not configured.");
        _issuer = jwt["Issuer"];
        _audience = jwt["Audience"];
        _lifetime = TimeSpan.FromDays(double.TryParse(jwt["LifetimeDays"], out var d) ? d : 30);
        _credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256);
    }

    public (string token, DateTimeOffset expiresUtc) Issue(AthleteAccount a)
    {
        var now = DateTimeOffset.UtcNow;
        var expires = now.Add(_lifetime);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, a.Id.ToString()),
            new(ClaimTypes.NameIdentifier, a.Id.ToString()),
            new("name", a.DisplayName),
            new("squad", a.SquadId.ToString()),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };
        if (!string.IsNullOrEmpty(a.Email))
            claims.Add(new Claim(JwtRegisteredClaimNames.Email, a.Email));

        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _audience,
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: expires.UtcDateTime,
            signingCredentials: _credentials);

        return (new JwtSecurityTokenHandler().WriteToken(token), expires);
    }
}
