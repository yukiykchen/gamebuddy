using Godot;

namespace GameBuddyBridge.Scripts;

internal static class GameBuddyCollectorNode
{
    /// <summary>
    /// Cadence of full run-state snapshots. The desktop companion only feeds a decision loop,
    /// and every snapshot re-formats the whole deck, so the interval is deliberately coarse.
    /// Event messages (reward/event/shop/rest open and close) are published immediately and
    /// do not wait on this.
    /// </summary>
    private const ulong SnapshotIntervalMsec = 5000;

    private static SceneTree? _tree;
    private static ulong _lastTicks;
    private static bool _reportedReady;

    public static void Attach(SceneTree tree)
    {
        if (_tree is not null)
        {
            return;
        }

        _tree = tree;
        tree.ProcessFrame += OnProcessFrame;
    }

    private static void OnProcessFrame()
    {
        if (!_reportedReady)
        {
            _reportedReady = true;
            GameBuddyExporter.ReportCollectorReady();
        }

        var now = Time.GetTicksMsec();
        if (now - _lastTicks < SnapshotIntervalMsec)
        {
            return;
        }

        _lastTicks = now;
        GameBuddyExporter.CaptureAndPublish();
    }
}
