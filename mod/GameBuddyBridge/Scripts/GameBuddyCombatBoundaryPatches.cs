using System.Reflection;
using HarmonyLib;

namespace GameBuddyBridge.Scripts;

public static class GameBuddyCombatBoundaryPatches
{
    public static void Apply(Harmony harmony, string modDirectory)
    {
        var hookType = AccessTools.TypeByName("MegaCrit.Sts2.Core.Hooks.Hook")
            ?? AccessTools.TypeByName("MegaCrit.Sts2.Core.Hook");
        if (hookType is null)
        {
            GameBuddyDiagnostics.Write(modDirectory, "combat hook type unavailable");
            return;
        }
        var installed = 0;
        installed += PatchNamed(harmony, hookType, "BeforeCombatStart", nameof(CombatStartedPostfix), modDirectory) ? 1 : 0;
        installed += PatchNamed(harmony, hookType, "AfterCombatVictory", nameof(CombatVictoryPostfix), modDirectory) ? 1 : 0;
        installed += PatchNamed(harmony, hookType, "AfterCombatEnd", nameof(CombatEndedPostfix), modDirectory) ? 1 : 0;
        if (installed == 3) GameBuddyHookCapabilityRegistry.Available("combat_boundary");
        else if (installed > 0) GameBuddyHookCapabilityRegistry.Partial("combat_boundary", $"{installed}/3 combat boundary hooks installed");
    }

    public static void CombatStartedPostfix(object[] __args)
    {
        GameBuddyRecapCapture.ResetCombat();
        var roomKey = ResolveRoomKey(__args);
        GameBuddyFactEmitter.StartCombat(roomKey, new
        {
            roomKey,
            hook = "BeforeCombatStart"
        });
    }

    public static void CombatVictoryPostfix()
    {
        GameBuddyFactEmitter.EndCombat(true, new { hook = "AfterCombatVictory", afterSnapshotId = GameBuddyRecapCapture.Capture("combat_victory_observed") });
    }

    public static void CombatEndedPostfix(object[] __args)
    {
        var victory = __args.OfType<bool>().FirstOrDefault();
        GameBuddyFactEmitter.EndCombat(victory, new { hook = "AfterCombatEnd", afterSnapshotId = GameBuddyRecapCapture.Capture("combat_end_observed") });
    }

    private static bool PatchNamed(Harmony harmony, Type type, string name, string patchName, string modDirectory)
    {
        var methods = type.GetMethods(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)
            .Where(method => method.Name == name)
            .ToArray();
        if (methods.Length == 0)
        {
            GameBuddyDiagnostics.Write(modDirectory, $"combat hook unavailable: {type.FullName}.{name}");
            return false;
        }
        var patch = new HarmonyMethod(typeof(GameBuddyCombatBoundaryPatches), patchName);
        foreach (var method in methods) harmony.Patch(method, postfix: patch);
        GameBuddyDiagnostics.Write(modDirectory, $"combat hook applied: {type.FullName}.{name} x{methods.Length}");
        return true;
    }

    private static string ResolveRoomKey(IEnumerable<object?> arguments)
    {
        foreach (var argument in arguments)
        {
            if (argument is null) continue;
            var room = FindRoomIdentity(argument, 0);
            if (room is not null) return room;
        }
        return "room-unknown";
    }

    private static string? FindRoomIdentity(object source, int depth)
    {
        var type = source.GetType();
        if (type.Name.Contains("Room", StringComparison.OrdinalIgnoreCase))
        {
            var id = ReadMember(source, "Id") ?? ReadMember(source, "RoomId");
            if (id is not null) return $"{type.FullName}:{id}";
        }
        if (depth >= 2) return null;
        foreach (var name in new[] { "Room", "CurrentRoom", "AbstractRoom", "CombatRoom" })
        {
            var child = ReadMember(source, name);
            if (child is null || ReferenceEquals(child, source)) continue;
            var found = FindRoomIdentity(child, depth + 1);
            if (found is not null) return found;
        }
        return null;
    }

    private static object? ReadMember(object source, string name)
    {
        var type = source.GetType();
        return type.GetProperty(name, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)?.GetValue(source)
            ?? type.GetField(name, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)?.GetValue(source);
    }
}
