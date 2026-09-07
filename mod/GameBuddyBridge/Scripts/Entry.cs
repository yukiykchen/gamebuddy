using Godot;
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

            if (Engine.GetMainLoop() is not SceneTree tree)
            {
                GameBuddyDiagnostics.Write(modDirectory, "main loop is not a SceneTree; collector not attached");
                return;
            }

            GameBuddyCollectorNode.Attach(tree);
            GameBuddyDiagnostics.Write(modDirectory, "collector attached via ProcessFrame; bridge ready");
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
