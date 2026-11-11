using Godot;

namespace GameBuddyBridge.Scripts;

internal static class GameBuddyCollectorNode
{
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
        try
        {
            GameBuddyRewardOverlay.ProcessFrame();
        }
        catch (Exception ex)
        {
            GD.PushWarning($"[GameBuddyBridge] reward overlay skipped: {ex.Message}");
        }
        if (!_reportedReady)
        {
            _reportedReady = true;
            GameBuddyExporter.ReportCollectorReady();
        }

        var now = Time.GetTicksMsec();
        if (now - _lastTicks < 200)
        {
            return;
        }

        _lastTicks = now;
        GameBuddyExporter.CaptureAndPublish();
    }
}
