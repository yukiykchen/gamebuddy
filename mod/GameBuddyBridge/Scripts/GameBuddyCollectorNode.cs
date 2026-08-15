using Godot;

namespace GameBuddyBridge.Scripts;

public sealed partial class GameBuddyCollectorNode : Node
{
    private double _elapsed;
    private bool _reportedReady;

    public GameBuddyCollectorNode()
    {
        Name = "GameBuddyCollector";
        ProcessMode = ProcessModeEnum.Always;
    }

    public override void _Process(double delta)
    {
        if (!_reportedReady)
        {
            _reportedReady = true;
            GameBuddyExporter.ReportCollectorReady();
        }

        _elapsed += delta;
        if (_elapsed < 0.20)
        {
            return;
        }

        _elapsed = 0;
        GameBuddyExporter.CaptureAndPublish();
    }
}
