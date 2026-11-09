using HarmonyLib;

namespace GameBuddyBridge.Scripts;

public static class SaveLoadCountPatch
{
    public static void Postfix()
    {
        GameBuddySaveLoadLog.RecordObserved();
        GameBuddyFactEmitter.ObserveReload(GameBuddySaveLoadLog.ObservedCount());
    }

    public static void Apply(Harmony harmony, string modDirectory)
    {
        GameBuddySaveLoadLog.UseDirectory(modDirectory);
        var method = AccessTools.Method(
            typeof(MegaCrit.Sts2.Core.Saves.SaveManager),
            nameof(MegaCrit.Sts2.Core.Saves.SaveManager.IncrementNumReloads));
        if (method == null)
        {
            GameBuddyDiagnostics.Write(modDirectory, "save-load patch unavailable");
            return;
        }

        harmony.Patch(method, postfix: new HarmonyMethod(typeof(SaveLoadCountPatch), nameof(Postfix)));
        GameBuddyHookCapabilityRegistry.Available("reload_observation");
        GameBuddyDiagnostics.Write(modDirectory, "save-load patch applied");
    }
}
