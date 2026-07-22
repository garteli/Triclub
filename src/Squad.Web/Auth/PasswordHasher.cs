using System.Security.Cryptography;

namespace Squad.Web;

/// <summary>
/// PBKDF2 (SHA-256) password hashing — no external dependency. Serialized as
/// "iterations.saltBase64.hashBase64" so the parameters travel with the hash and
/// can be raised later without breaking existing rows. Verify is constant-time.
/// </summary>
public static class PasswordHasher
{
    private const int Iterations = 120_000;
    private const int SaltSize = 16;   // bytes
    private const int KeySize = 32;    // bytes (256-bit)

    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var key = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, KeySize);
        return $"{Iterations}.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(key)}";
    }

    public static bool Verify(string password, string? stored)
    {
        if (string.IsNullOrEmpty(stored)) return false;
        var parts = stored.Split('.');
        if (parts.Length != 3 || !int.TryParse(parts[0], out var iterations)) return false;

        byte[] salt, expected;
        try
        {
            salt = Convert.FromBase64String(parts[1]);
            expected = Convert.FromBase64String(parts[2]);
        }
        catch (FormatException)
        {
            return false;
        }

        var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, expected.Length);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }
}
