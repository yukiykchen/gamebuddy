using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace GameBuddyBridge.Scripts;

public static class GameBuddyFactEmitter
{
    private const string FactSchema = "gamebuddy.fact-event.v1";
    private static readonly object Gate = new();
    private static string SourceSessionId = Guid.NewGuid().ToString("N");
    private static readonly Stopwatch Elapsed = Stopwatch.StartNew();
    private static GameBuddyFactQueue Queue = new();
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private static Action<string>? _broadcast;
    private static GameBuddyRunIdentityStore? _identities;
    private static long _sourceSeq;
    private static long _gapDeclarationSeq;
    private static GameBuddyFactGap? _pendingGap;
    private static string? _runId;
    private static string? _combatId;
    private static string? _combatRoomKey;
    private static int _attemptGeneration;
    private static bool _combatEnded;
    private static bool _reloadPending;

    public static string? ActiveRunId { get { lock (Gate) return _runId ?? _identities?.ActiveRunId; } }
    public static string? ActiveCombatId { get { lock (Gate) return _combatId; } }
    public static int AttemptGeneration { get { lock (Gate) return _attemptGeneration; } }

    public static void Initialize(string modDirectory, Action<string> broadcast)
    {
        lock (Gate)
        {
            _broadcast = broadcast;
            _identities = new GameBuddyRunIdentityStore(modDirectory);
            _runId ??= _identities.ActiveRunId;
        }
    }

    public static string BeginNewRun(string fingerprint, object payload)
    {
        lock (Gate)
        {
            _runId = (_identities ?? throw new InvalidOperationException("Fact emitter is not initialized.")).BeginNew(fingerprint);
            ResetCombat();
            GameBuddyRecapCapture.ResetRun();
            EmitLocked("run.started", payload);
            EmitCapabilitiesLocked();
            return _runId;
        }
    }

    public static string ResumeRun(string fingerprint, object payload)
    {
        lock (Gate)
        {
            _runId = (_identities ?? throw new InvalidOperationException("Fact emitter is not initialized.")).Resume(fingerprint);
            ResetCombat();
            GameBuddyRecapCapture.ResetRun();
            EmitLocked("run.resumed", payload);
            EmitCapabilitiesLocked();
            return _runId;
        }
    }

    public static void EndRun(bool cleared, string reason, object? details = null)
    {
        lock (Gate)
        {
            if (_runId is null) return;
            if (_combatId is not null && !_combatEnded && (reason == "death" || reason == "abandoned"))
            {
                EmitLocked("combat.ended", new { victory = false, outcome = reason, playerDied = reason == "death", details, afterSnapshotId = GameBuddyRecapCapture.Capture("run_end_observed") },
                    combatId: _combatId, attemptGeneration: _attemptGeneration);
                _combatEnded = true;
            }
            EmitLocked("run.ended", new { cleared, reason, details });
            _identities?.End(_runId);
            _runId = null;
            ResetCombat();
        }
    }

    public static string StartCombat(string roomKey, object payload)
    {
        lock (Gate)
        {
            RequireRun();
            if (!_reloadPending || _combatEnded || !string.Equals(_combatRoomKey, roomKey, StringComparison.Ordinal))
            {
                _combatId = Hash($"{_runId}|{roomKey}|{Guid.NewGuid():N}");
                _attemptGeneration = 0;
            }
            _combatRoomKey = roomKey;
            _combatEnded = false;
            _reloadPending = false;
            EmitLocked("combat.started", payload, combatId: _combatId, attemptGeneration: _attemptGeneration);
            return _combatId!;
        }
    }

    public static void EndCombat(bool victory, object? details = null)
    {
        lock (Gate)
        {
            if (_runId is null || _combatId is null || _combatEnded) return;
            EmitLocked("combat.ended", new { victory, details }, combatId: _combatId, attemptGeneration: _attemptGeneration);
            _combatEnded = true;
        }
    }

    public static void ObserveReload(int reloadCount)
    {
        lock (Gate)
        {
            if (_runId is null) return;
            EmitLocked("run.reload_observed", new
            {
                observationId = $"{_runId}:{reloadCount}",
                observedCount = reloadCount,
                combatId = _combatId
            });
            _reloadPending = true;
            if (_combatId is null || _combatEnded) return;
            var replaced = _attemptGeneration;
            _attemptGeneration += 1;
            EmitLocked("combat.attempt_replaced", new
            {
                replacedGeneration = replaced,
                reloadCount
            }, combatId: _combatId, attemptGeneration: _attemptGeneration);
        }
    }

    public static void Publish(
        string eventType,
        object payload,
        string? combatId = null,
        int? attemptGeneration = null,
        string? decisionId = null,
        string? actionId = null,
        string observationMethod = "direct_hook",
        IReadOnlyDictionary<string, string>? unknownReasons = null)
    {
        lock (Gate)
        {
            if (_runId is null) return;
            EmitLocked(eventType, payload, combatId, attemptGeneration, decisionId, actionId,
                observationMethod, unknownReasons);
        }
    }

    public static IReadOnlyList<string> PendingJson()
    {
        return Queue.Snapshot().Select(item => item.Json).ToArray();
    }

    internal static void ResetForTests(int capacity, Action<string>? broadcast, string sourceSessionId)
    {
        lock (Gate)
        {
            Queue = new GameBuddyFactQueue(capacity);
            _broadcast = broadcast;
            SourceSessionId = sourceSessionId;
            _sourceSeq = 0;
            _gapDeclarationSeq = 0;
            _pendingGap = null;
            _runId = "run-test";
            _identities = null;
            ResetCombat();
        }
    }

    public static void Acknowledge(string sourceSessionId, long sourceSeq)
    {
        if (!string.Equals(sourceSessionId, SourceSessionId, StringComparison.Ordinal)) return;
        lock (Gate)
        {
            Queue.Acknowledge(sourceSeq);
            if (_gapDeclarationSeq > 0 && sourceSeq >= _gapDeclarationSeq)
            {
                _gapDeclarationSeq = 0;
                _pendingGap = null;
            }
        }
    }

    private static void EmitCapabilitiesLocked()
    {
        EmitLocked("capture.capability_reported", new
        {
            build = "unknown",
            gameAssemblyVersion = AppDomain.CurrentDomain.GetAssemblies().FirstOrDefault(a => a.GetName().Name == "sts2")?.GetName().Version?.ToString(),
            capabilities = GameBuddyHookCapabilityRegistry.Snapshot()
        });
    }

    private static void EmitLocked(
        string eventType,
        object payload,
        string? combatId = null,
        int? attemptGeneration = null,
        string? decisionId = null,
        string? actionId = null,
        string observationMethod = "direct_hook",
        IReadOnlyDictionary<string, string>? unknownReasons = null)
    {
        RequireRun();
        var seq = ++_sourceSeq;
        var json = SerializeFact(seq, eventType, payload, combatId, attemptGeneration, decisionId, actionId,
            observationMethod, unknownReasons);
        var gap = Queue.Enqueue(seq, json);
        _broadcast?.Invoke(json);
        if (gap is not null) PublishOverflowLocked(gap);
    }

    private static void PublishOverflowLocked(GameBuddyFactGap gap)
    {
        var cumulative = _pendingGap is null
            ? gap
            : new GameBuddyFactGap(
                Math.Min(_pendingGap.FromSourceSeq, gap.FromSourceSeq),
                Math.Max(_pendingGap.ToSourceSeq, gap.ToSourceSeq));
        _pendingGap = cumulative;
        if (_gapDeclarationSeq == 0) _gapDeclarationSeq = ++_sourceSeq;
        var json = SerializeFact(_gapDeclarationSeq, "capture.gap_detected", new
        {
            fromSourceSeq = cumulative.FromSourceSeq,
            toSourceSeq = cumulative.ToSourceSeq,
            reason = "queue_overflow"
        }, null, null, null, null, "unknown", null);
        Queue.DeclareGap(_gapDeclarationSeq, json);
        _broadcast?.Invoke(json);
    }

    private static string SerializeFact(
        long seq,
        string eventType,
        object payload,
        string? combatId,
        int? attemptGeneration,
        string? decisionId,
        string? actionId,
        string observationMethod,
        IReadOnlyDictionary<string, string>? unknownReasons)
    {
        var reasons = unknownReasons ?? new Dictionary<string, string>();
        var payloadJson = JsonSerializer.SerializeToElement(payload, JsonOptions);
        string? Reference(string name)
        {
            if (payloadJson.ValueKind != JsonValueKind.Object) return null;
            if (payloadJson.TryGetProperty(name, out var direct) && direct.ValueKind == JsonValueKind.String) return direct.GetString();
            return payloadJson.TryGetProperty("details", out var details) && details.ValueKind == JsonValueKind.Object
                && details.TryGetProperty(name, out var nested) && nested.ValueKind == JsonValueKind.String ? nested.GetString() : null;
        }
        var fact = new
        {
            schema = FactSchema,
            eventVersion = 1,
            eventId = $"{SourceSessionId}:{seq}",
            eventType,
            runId = _runId,
            sourceSessionId = SourceSessionId,
            sourceSeq = seq,
            occurredAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            sourceElapsedMs = Elapsed.ElapsedMilliseconds,
            combatId,
            attemptGeneration,
            decisionId,
            actionId,
            beforeSnapshotId = Reference("beforeSnapshotId"),
            afterSnapshotId = Reference("afterSnapshotId"),
            contextSnapshotId = Reference("contextSnapshotId"),
            payload,
            quality = new
            {
                observationMethod,
                unknownFields = reasons.Keys.ToArray(),
                unknownReasons = reasons
            }
        };
        return JsonSerializer.Serialize(new { type = "fact", data = fact }, JsonOptions);
    }

    private static void ResetCombat()
    {
        _combatId = null;
        _combatRoomKey = null;
        _attemptGeneration = 0;
        _combatEnded = false;
        _reloadPending = false;
    }

    private static void RequireRun()
    {
        if (_runId is null) throw new InvalidOperationException("No active run identity.");
    }

    private static string Hash(string value)
    {
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)))[..24].ToLowerInvariant();
    }
}
