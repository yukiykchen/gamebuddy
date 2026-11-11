using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using HarmonyLib;

namespace GameBuddyBridge.Scripts;

public static class GameBuddyLifecyclePatches
{
    public static void Apply(Harmony harmony, string modDirectory)
    {
        var runManager = AccessTools.TypeByName("MegaCrit.Sts2.Core.Runs.RunManager")
            ?? throw new InvalidOperationException("RunManager type is unavailable.");

        var installed = 0;
        installed += PatchNamed(harmony, runManager, "SetUpNewSingleplayer", nameof(NewRunPostfix), modDirectory) ? 1 : 0;
        installed += PatchNamed(harmony, runManager, "SetUpNewMultiplayer", nameof(NewRunPostfix), modDirectory) ? 1 : 0;
        installed += PatchNamed(harmony, runManager, "SetUpSavedSingleplayer", nameof(ResumeRunPostfix), modDirectory) ? 1 : 0;
        installed += PatchNamed(harmony, runManager, "SetUpSavedMultiplayer", nameof(ResumeRunPostfix), modDirectory) ? 1 : 0;
        installed += PatchNamed(harmony, runManager, "OnEnded", nameof(EndedPostfix), modDirectory) ? 1 : 0;
        installed += PatchNamed(harmony, runManager, "Abandon", nameof(AbandonedPostfix), modDirectory) ? 1 : 0;
        if (installed == 6) GameBuddyHookCapabilityRegistry.Available("lifecycle");
        else if (installed > 0) GameBuddyHookCapabilityRegistry.Partial("lifecycle", $"{installed}/6 lifecycle hooks installed");
    }

    public static void NewRunPostfix(MethodBase __originalMethod, object[] __args)
    {
        try
        {
            var fingerprint = Fingerprint(__args);
            GameBuddyFactEmitter.BeginNewRun(fingerprint, new
            {
                setupPath = __originalMethod.Name,
                fingerprintVersion = 1,
                gameMode = GameBuddyClearFacts.GameModeText(ReadRunStateGameMode(__args))
            });
        }
        catch (Exception ex)
        {
            GameBuddyDiagnostics.Write(AppContext.BaseDirectory, $"new-run fact failed: {ex.Message}");
        }
    }

    public static void ResumeRunPostfix(MethodBase __originalMethod, object[] __args)
    {
        try
        {
            var fingerprint = Fingerprint(__args);
            GameBuddyFactEmitter.ResumeRun(fingerprint, new
            {
                setupPath = __originalMethod.Name,
                fingerprintVersion = 1,
                gameMode = GameBuddyClearFacts.GameModeText(ReadRunStateGameMode(__args))
            });
        }
        catch (Exception ex)
        {
            GameBuddyDiagnostics.Write(AppContext.BaseDirectory, $"resume-run fact failed: {ex.Message}");
        }
    }

    public static void EndedPostfix(object[] __args)
    {
        var cleared = __args.OfType<bool>().FirstOrDefault();
        var ending = GameBuddyRunEnding.Resolve(cleared);
        GameBuddyExporter.PublishFinalFactObservation();
        GameBuddyFactEmitter.EndRun(cleared, ending.Reason);
        GameBuddyExporter.AuthoritativeRunEnded(cleared, ending.Result == "abandoned");
    }

    public static void AbandonedPostfix()
    {
        GameBuddyExporter.PublishFinalFactObservation();
        GameBuddyFactEmitter.EndRun(false, "abandoned");
        GameBuddyExporter.AuthoritativeRunEnded(false, true);
    }

    public static void AbandonPrefix() => GameBuddyRunEnding.EnterAbandon();
    public static Exception? AbandonFinalizer(Exception? __exception)
    {
        GameBuddyRunEnding.ExitAbandon();
        return __exception;
    }

    private static bool PatchNamed(Harmony harmony, Type type, string name, string patchName, string modDirectory)
    {
        var methods = type.GetMethods(BindingFlags.Instance | BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)
            .Where(method => method.Name == name)
            .ToArray();
        if (methods.Length == 0)
        {
            GameBuddyDiagnostics.Write(modDirectory, $"lifecycle hook unavailable: {type.FullName}.{name}");
            return false;
        }
        var patch = new HarmonyMethod(typeof(GameBuddyLifecyclePatches), patchName);
        foreach (var method in methods)
            harmony.Patch(method, postfix: patch,
                prefix: patchName == nameof(AbandonedPostfix) ? new HarmonyMethod(typeof(GameBuddyLifecyclePatches), nameof(AbandonPrefix)) : null,
                finalizer: patchName == nameof(AbandonedPostfix) ? new HarmonyMethod(typeof(GameBuddyLifecyclePatches), nameof(AbandonFinalizer)) : null);
        GameBuddyDiagnostics.Write(modDirectory, $"lifecycle hook applied: {type.FullName}.{name} x{methods.Length}");
        return true;
    }

    private static string Fingerprint(IEnumerable<object?> arguments)
    {
        var materialized = arguments.Where(argument => argument is not null).Cast<object>().ToArray();
        var values = new List<string>();
        var startTime = materialized
            .Select(argument => ReadMember(argument, "StartTime"))
            .FirstOrDefault(value => value is not null);
        if (startTime is not null)
        {
            values.Add($"StartTime:{NormalizeTime(startTime)}");
        }
        foreach (var argument in materialized)
        {
            if (startTime is null)
            {
                AddMember(values, argument, "GameMode");
                AddMember(values, argument, "Ascension");
                AddMember(values, argument, "AscensionLevel");
                AddMember(values, argument, "Seed");
                AddMember(values, argument, "RunSeed");
            }
            AddPlayerIds(values, argument);
        }
        if (values.Count == 0) values.Add("unknown:" + Guid.NewGuid().ToString("N"));
        var raw = string.Join("|", values.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal));
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLowerInvariant();
    }

    private static string NormalizeTime(object value)
    {
        return value switch
        {
            DateTimeOffset offset => offset.ToUniversalTime().ToUnixTimeMilliseconds().ToString(),
            DateTime time => time.ToUniversalTime().Ticks.ToString(),
            _ => value.ToString() ?? string.Empty
        };
    }

    private static void AddMember(List<string> values, object source, string name)
    {
        var value = ReadMember(source, name);
        if (value is not null) values.Add($"{name}:{value}");
    }

    private static void AddPlayerIds(List<string> values, object source)
    {
        var players = ReadMember(source, "Players") as System.Collections.IEnumerable;
        if (players is null) return;
        foreach (var player in players)
        {
            if (player is null) continue;
            var id = ReadMember(player, "NetId") ?? ReadMember(player, "Id");
            if (id is not null) values.Add($"player:{id}");
        }
    }

    private static object? ReadMember(object source, string name)
    {
        var type = source.GetType();
        return type.GetProperty(name, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)?.GetValue(source)
            ?? type.GetField(name, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)?.GetValue(source);
    }

    private static object? ReadRunStateGameMode(IEnumerable<object?> arguments)
    {
        try
        {
            foreach (var argument in arguments)
            {
                var value = GameModeValue(argument);
                if (value is not null) return value;
            }
            return GameModeValue(CurrentRunState());
        }
        catch
        {
            return null;
        }
    }

    private static object? GameModeValue(object? source)
    {
        if (!IsRunState(source)) return null;
        return ReadMember(source!, "GameMode");
    }

    private static bool IsRunState(object? source)
    {
        if (source is null) return false;
        for (var type = source.GetType(); type is not null; type = type.BaseType)
        {
            if (type.FullName == "MegaCrit.Sts2.Core.Runs.RunState" || type.Name == "RunState") return true;
        }
        return false;
    }

    private static object? CurrentRunState()
    {
        var runManagerType = AccessTools.TypeByName("MegaCrit.Sts2.Core.Runs.RunManager");
        if (runManagerType is null) return null;
        var instance = runManagerType.GetProperty("Instance", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)?.GetValue(null);
        if (instance is null) return null;
        var method = runManagerType.GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)
            .FirstOrDefault(candidate => candidate.Name == "DebugOnlyGetState" && candidate.GetParameters().Length == 0);
        return method?.Invoke(instance, null);
    }
}
