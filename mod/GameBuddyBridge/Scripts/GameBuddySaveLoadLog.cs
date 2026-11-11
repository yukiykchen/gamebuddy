using System.Globalization;
using System.Text.Json;

namespace GameBuddyBridge.Scripts;

public static class GameBuddySaveLoadLog
{
    public const string FileName = "save-loads.json";
    public const string Schema = "gamebuddy.save-load.v1";

    private static readonly object Gate = new();
    private static string _directory = string.Empty;

    public static void UseDirectory(string directory)
    {
        _directory = directory ?? string.Empty;
    }

    public static bool RecordObserved() => Record(_directory, null);

    public static int ObservedCount()
    {
        lock (Gate)
        {
            if (string.IsNullOrWhiteSpace(_directory)) return 0;
            return ReadLoads(Path.Combine(_directory, FileName)).Count;
        }
    }

    public static bool Record(string directory, DateTimeOffset? observedAt)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(directory)) return false;
            lock (Gate)
            {
                Directory.CreateDirectory(directory);
                var path = Path.Combine(directory, FileName);
                var loads = ReadLoads(path);
                var at = (observedAt ?? DateTimeOffset.UtcNow).ToUniversalTime();
                if (loads.Count > 0 && at <= loads[^1].At)
                    at = loads[^1].At.AddTicks(1);
                var seq = loads.Count == 0 ? 1 : loads[^1].Seq + 1;
                loads.Add(new LoadEntry(seq, at));
                WriteAtomic(path, loads);
                return true;
            }
        }
        catch
        {
            return false;
        }
    }

    private static List<LoadEntry> ReadLoads(string path)
    {
        if (!File.Exists(path)) return [];
        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            var root = document.RootElement;
            if (!root.TryGetProperty("schema", out var schema) || schema.GetString() != Schema)
                return [];
            if (!root.TryGetProperty("loads", out var loads) || loads.ValueKind != JsonValueKind.Array)
                return [];
            var entries = new List<LoadEntry>();
            foreach (var item in loads.EnumerateArray())
            {
                var seq = item.GetProperty("seq").GetInt32();
                var atText = item.GetProperty("at").GetString();
                if (string.IsNullOrEmpty(atText)) throw new FormatException("Save-load entry is missing a timestamp.");
                var at = DateTimeOffset.Parse(
                    atText,
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.RoundtripKind).ToUniversalTime();
                entries.Add(new LoadEntry(seq, at));
            }
            return entries;
        }
        catch
        {
            return [];
        }
    }

    private static void WriteAtomic(string path, List<LoadEntry> loads)
    {
        var payload = new Dictionary<string, object?>
        {
            ["schema"] = Schema,
            ["count"] = loads.Count,
            ["loads"] = loads.Select(entry => new Dictionary<string, object?>
            {
                ["seq"] = entry.Seq,
                ["at"] = entry.At.ToString("O", CultureInfo.InvariantCulture)
            }).ToArray()
        };
        var json = JsonSerializer.Serialize(payload);
        var temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            File.WriteAllText(temp, json);
            File.Move(temp, path, overwrite: true);
        }
        finally
        {
            if (File.Exists(temp)) File.Delete(temp);
        }
    }

    private sealed record LoadEntry(int Seq, DateTimeOffset At);
}
