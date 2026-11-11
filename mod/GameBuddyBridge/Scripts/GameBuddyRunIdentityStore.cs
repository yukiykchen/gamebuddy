using System.Text.Json;

namespace GameBuddyBridge.Scripts;

public sealed class GameBuddyRunIdentityStore
{
    public const string FileName = "active-run-identities.json";
    public const string Schema = "gamebuddy.run-identities.v1";

    private readonly string _path;
    private readonly object _gate = new();
    private IdentityDocument _document;

    public GameBuddyRunIdentityStore(string directory)
    {
        _path = Path.Combine(directory, FileName);
        _document = Read(_path);
    }

    public string? ActiveRunId
    {
        get
        {
            lock (_gate)
            {
                if (_document.ActiveFingerprint is null) return null;
                return _document.Runs.GetValueOrDefault(_document.ActiveFingerprint);
            }
        }
    }

    public string BeginNew(string fingerprint)
    {
        lock (_gate)
        {
            var runId = Guid.NewGuid().ToString("N");
            _document.Runs[fingerprint] = runId;
            _document.ActiveFingerprint = fingerprint;
            Write();
            return runId;
        }
    }

    public string Resume(string fingerprint)
    {
        lock (_gate)
        {
            if (!_document.Runs.TryGetValue(fingerprint, out var runId))
            {
                runId = Guid.NewGuid().ToString("N");
                _document.Runs[fingerprint] = runId;
            }
            _document.ActiveFingerprint = fingerprint;
            Write();
            return runId;
        }
    }

    public void End(string runId)
    {
        lock (_gate)
        {
            if (_document.ActiveFingerprint is not null
                && _document.Runs.GetValueOrDefault(_document.ActiveFingerprint) == runId)
                _document.ActiveFingerprint = null;
            Write();
        }
    }

    private void Write()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        var temp = _path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            File.WriteAllText(temp, JsonSerializer.Serialize(_document));
            File.Move(temp, _path, overwrite: true);
        }
        finally
        {
            if (File.Exists(temp)) File.Delete(temp);
        }
    }

    private static IdentityDocument Read(string path)
    {
        try
        {
            if (!File.Exists(path)) return new();
            var document = JsonSerializer.Deserialize<IdentityDocument>(File.ReadAllText(path));
            return document?.FileSchema == Schema ? document : new();
        }
        catch
        {
            return new();
        }
    }

    private sealed class IdentityDocument
    {
        public string FileSchema { get; set; } = Schema;
        public string? ActiveFingerprint { get; set; }
        public Dictionary<string, string> Runs { get; set; } = new(StringComparer.Ordinal);
    }
}
