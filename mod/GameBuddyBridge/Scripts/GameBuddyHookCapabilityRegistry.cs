namespace GameBuddyBridge.Scripts;

public sealed record GameBuddyHookCapability(string State, string? Reason = null);

public static class GameBuddyHookCapabilityRegistry
{
    private static readonly object Gate = new();
    private static readonly Dictionary<string, GameBuddyHookCapability> Capabilities = new(StringComparer.Ordinal)
    {
        ["lifecycle"] = new("unavailable", "hooks not installed"),
        ["combat_boundary"] = new("unavailable", "hooks not installed"),
        ["decisions"] = new("unavailable", "hooks not installed"),
        ["build"] = new("unavailable", "hooks not installed"),
        ["card_play"] = new("unavailable", "hook not installed"),
        ["card_movement"] = new("unavailable", "hooks not installed"),
        ["damage"] = new("unavailable", "hook not installed"),
        ["combat_resolution"] = new("unavailable", "hooks not installed"),
        ["reload_observation"] = new("unavailable", "hook not installed"),
        ["resources"] = new("unavailable", "hooks not installed")
    };

    public static void Available(string family)
    {
        lock (Gate) Capabilities[family] = new("available");
    }

    public static void Partial(string family, string reason)
    {
        lock (Gate)
        {
            if (Capabilities.GetValueOrDefault(family)?.State != "available")
                Capabilities[family] = new("partial", reason);
        }
    }

    public static IReadOnlyDictionary<string, GameBuddyHookCapability> Snapshot()
    {
        lock (Gate) return new Dictionary<string, GameBuddyHookCapability>(Capabilities, StringComparer.Ordinal);
    }
}
