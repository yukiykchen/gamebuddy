namespace GameBuddyBridge.Scripts;

internal static class GameBuddyShopStock
{
    internal static string Key(string collection, int originalIndex) => $"{collection}:{originalIndex}";

    internal static IReadOnlyList<string> StockedKeys(IEnumerable<(string Collection, bool Stocked)> slots)
    {
        var counts = new Dictionary<string, int>(StringComparer.Ordinal);
        var keys = new List<string>();
        foreach (var slot in slots)
        {
            counts.TryGetValue(slot.Collection, out var index);
            var key = Key(slot.Collection, index);
            counts[slot.Collection] = index + 1;
            if (slot.Stocked) keys.Add(key);
        }
        return keys;
    }
}

internal static class GameBuddyRewardSource
{
    internal static string FromRoom(string? room)
    {
        if (string.IsNullOrWhiteSpace(room)) return "combat";
        return room.Contains("Event", StringComparison.OrdinalIgnoreCase)
            || room.Contains("Ancient", StringComparison.OrdinalIgnoreCase)
            ? "event"
            : "combat";
    }
}
