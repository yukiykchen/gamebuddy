using Godot;
using Godot.Bridge;
using MegaCrit.Sts2.Core.Logging;
using MegaCrit.Sts2.Core.Modding;

namespace GameBuddyBridge.Scripts;

[ModInitializer("Init")]
public class Entry
{
    public static void Init()
    {
        var modDirectory = Path.GetDirectoryName(typeof(Entry).Assembly.Location) ?? AppContext.BaseDirectory;
        GameBuddyDiagnostics.Write(modDirectory, "initializer invoked");
        try
        {
            GameBuddyExporter.Initialize(modDirectory);

            var root = ((SceneTree)Engine.GetMainLoop()).Root;
            var collector = new GameBuddyCollectorNode();
            root.CallDeferred(Node.MethodName.AddChild, collector);
            GameBuddyDiagnostics.Write(modDirectory, "collector queued for deferred attachment; bridge ready");
            Log.Info($"[GameBuddyBridge] initialized. Directory={modDirectory}");
        }
        catch (Exception ex)
        {
            GameBuddyDiagnostics.Write(modDirectory, $"initialization failed: {ex}");
            Log.Error($"[GameBuddyBridge] initialization failed: {ex.Message}");
        }
    }
}

internal static class GameBuddyDiagnostics
{
    public static void Write(string modDirectory, string message)
    {
        try
        {
            var line = $"{DateTimeOffset.UtcNow:O} {message}{System.Environment.NewLine}";
            File.AppendAllText(Path.Combine(modDirectory, "GameBuddyBridge.log"), line);
        }
        catch
        {
            // Diagnostics must never prevent the game from starting.
        }
    }
}
