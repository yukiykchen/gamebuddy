namespace GameBuddyBridge.Scripts;

// Abandon内部可能同步调用OnEnded(false)；显式意图需在该嵌套调用前可见。
internal static class GameBuddyRunEnding
{
    private static int _abandonDepth;
    public static void EnterAbandon() => _abandonDepth++;
    public static void ExitAbandon() { if (_abandonDepth > 0) _abandonDepth--; }
    public static (string Result, string Reason) Resolve(bool cleared, bool explicitAbandon = false) => cleared
        ? ("win", "game_ended_victory")
        : explicitAbandon || _abandonDepth > 0 ? ("abandoned", "abandoned") : ("loss", "game_ended_not_cleared");
}
