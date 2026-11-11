using System.Collections;
using System.Reflection;

namespace GameBuddyBridge.Scripts;

internal static class GameBuddyFactProjection
{
    public static object? Read(object? source, params string[] names)
    {
        if (source is null) return null;
        var type = source.GetType();
        foreach (var name in names)
        {
            try
            {
                var property = type.GetProperty(name, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                if (property?.GetValue(source) is object propertyValue) return propertyValue;
                var field = type.GetField(name, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                if (field?.GetValue(source) is object fieldValue) return fieldValue;
            }
            catch
            {
                // A fact hook must not disrupt the game because a diagnostic getter failed.
            }
        }
        return null;
    }

    public static string? Text(object? source, params string[] names)
    {
        var value = names.Length == 0 ? source : Read(source, names);
        return value?.ToString();
    }

    public static int? Integer(object? source, params string[] names)
    {
        var value = Read(source, names);
        if (value is null) return null;
        try { return Convert.ToInt32(value); }
        catch { return null; }
    }

    public static bool? Boolean(object? source, params string[] names)
    {
        var value = Read(source, names);
        if (value is bool result) return result;
        return null;
    }

    public static string? EntityId(object? source)
    {
        if (source is null) return null;
        return Text(source, "CombatId", "NetId", "EntityId", "Id");
    }

    public static string? ModelId(object? source)
    {
        if (source is null) return null;
        var id = Read(source, "Id", "ModelId");
        return Text(id, "Entry", "Id") ?? id?.ToString();
    }

    public static object[] Items(object? source)
    {
        if (source is not IEnumerable items || source is string) return [];
        return items.Cast<object?>().Where(item => item is not null).Cast<object>().ToArray();
    }
}
