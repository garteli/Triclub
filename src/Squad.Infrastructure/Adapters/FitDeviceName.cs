using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Reflection;
using System.Text;
using Dynastream.Fit;

namespace Squad.Infrastructure;

/// <summary>
/// Turns a FIT file's FileId / creator DeviceInfo messages into a human display name
/// like "Garmin Edge 1050". Prefers the device's own product_name string; otherwise
/// maps the manufacturer + (Garmin) product ids to their SDK constant names and spaces
/// them into words ("Edge1050" → "Edge 1050"). The value→name reflection maps are built
/// once per enum-holder class and cached.
/// </summary>
internal static class FitDeviceName
{
    public static string? Resolve(FileIdMesg? fileId, DeviceInfoMesg? creator)
    {
        ushort? mfg = fileId?.GetManufacturer() ?? creator?.GetManufacturer();
        ushort? garmin = fileId?.GetGarminProduct() ?? creator?.GetGarminProduct();

        // The device's own marketing name, when it wrote one (most common on device_info).
        string? productName = Clean(creator?.GetProductNameAsString())
                           ?? Clean(fileId?.GetProductNameAsString());

        string? mfgName = mfg is null ? null : Spaced(NameOf(typeof(Manufacturer), mfg.Value));

        // Product: explicit product_name string > mapped Garmin product constant.
        productName ??= (mfg == Manufacturer.Garmin && garmin is not null && garmin.Value != 0)
            ? Spaced(NameOf(typeof(GarminProduct), garmin.Value))
            : null;

        if (productName is null) return mfgName;
        if (mfgName is null) return productName;

        // Some product_name strings already lead with the brand — don't double it up.
        return productName.StartsWith(mfgName, StringComparison.OrdinalIgnoreCase)
            ? productName
            : $"{mfgName} {productName}";
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    // value → the FIT constant field name on an enum-holder class (GarminProduct.Edge1050 → "Edge1050").
    private static string? NameOf(Type holder, ushort value)
    {
        var map = Maps.GetOrAdd(holder, BuildMap);
        return map.TryGetValue(value, out var name) ? name : null;
    }

    private static readonly ConcurrentDictionary<Type, IReadOnlyDictionary<ushort, string>> Maps = new();

    private static IReadOnlyDictionary<ushort, string> BuildMap(Type holder)
    {
        var d = new Dictionary<ushort, string>();
        foreach (var f in holder.GetFields(BindingFlags.Public | BindingFlags.Static))
        {
            if (f.FieldType != typeof(ushort)) continue;
            var v = (ushort)f.GetRawConstantValue()!;
            if (!d.ContainsKey(v)) d[v] = f.Name;   // first constant for a value wins
        }
        return d;
    }

    // "Edge1050" → "Edge 1050", "EdgeExplore2" → "Edge Explore 2". Nulls out the SDK's "Invalid".
    private static string? Spaced(string? name)
    {
        if (string.IsNullOrEmpty(name) || name.Equals("Invalid", StringComparison.OrdinalIgnoreCase)) return null;
        var sb = new StringBuilder(name.Length + 4);
        for (int i = 0; i < name.Length; i++)
        {
            char c = name[i];
            if (i > 0)
            {
                char p = name[i - 1];
                bool upperBoundary = char.IsUpper(c) && (char.IsLower(p) || char.IsDigit(p));
                bool digitBoundary = char.IsDigit(c) && !char.IsDigit(p);
                if (upperBoundary || digitBoundary) sb.Append(' ');
            }
            sb.Append(c);
        }
        return sb.ToString();
    }
}
