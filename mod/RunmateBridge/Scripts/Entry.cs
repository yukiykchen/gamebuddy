using Godot;
using Godot.Bridge;
using MegaCrit.Sts2.Core.Logging;
using MegaCrit.Sts2.Core.Modding;

namespace RunmateBridge.Scripts;

[ModInitializer("Init")]
public class Entry
{
    public static void Init()
    {
        var modDirectory = Path.GetDirectoryName(typeof(Entry).Assembly.Location) ?? AppContext.BaseDirectory;
        RunmateExporter.Initialize(modDirectory);

        var root = ((SceneTree)Engine.GetMainLoop()).Root;
        var collector = new RunmateCollectorNode();
        root.AddChild(collector);
        Log.Info($"[RunmateBridge] initialized. Directory={modDirectory}");
    }
}
