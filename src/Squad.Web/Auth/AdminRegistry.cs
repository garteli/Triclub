namespace Squad.Web;

/// <summary>
/// The allowlist of sysadmin emails. Seeded with the founding admin and extended via
/// configuration (<c>Admin:Emails</c>, comma/semicolon separated). Comparison is
/// case-insensitive. Sysadmin status is checked against the account's verified email
/// (from the DB / the JWT's email claim), never anything the client sends.
/// </summary>
public sealed class AdminRegistry
{
    private readonly HashSet<string> _emails = new(StringComparer.OrdinalIgnoreCase)
    {
        "eli3046@gmail.com",
    };

    public AdminRegistry(IConfiguration config)
    {
        var configured = config["Admin:Emails"];
        if (!string.IsNullOrWhiteSpace(configured))
            foreach (var email in configured.Split(new[] { ',', ';' },
                         StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                _emails.Add(email);
    }

    public bool IsAdmin(string? email)
        => !string.IsNullOrWhiteSpace(email) && _emails.Contains(email.Trim());
}
