using Godot;

namespace RunmateBridge.Scripts;

public sealed partial class RunmateCollectorNode : Node
{
    private double _elapsed;

    public RunmateCollectorNode()
    {
        Name = "RunmateCollector";
        ProcessMode = ProcessModeEnum.Always;
    }

    public override void _Process(double delta)
    {
        _elapsed += delta;
        if (_elapsed < 0.20)
        {
            return;
        }

        _elapsed = 0;
        RunmateExporter.CaptureAndPublish();
    }
}
