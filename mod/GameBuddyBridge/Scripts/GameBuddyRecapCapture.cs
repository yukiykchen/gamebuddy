using System.Runtime.CompilerServices;
using System.Text.Json;

namespace GameBuddyBridge.Scripts;

// All identities live outside game objects. Never infer an origin from a model/name match.
internal static class GameBuddyRecapCapture
{
    private sealed class Identity { public string Id { get; } = $"instance:{Guid.NewGuid():N}"; }
    private sealed record EntityRole(string Side);
    private static readonly ConditionalWeakTable<object, EntityRole> EntityRoles = new();
    private sealed record ActionContext(string ActionId, string? BeforeSnapshotId);
    private static readonly ConditionalWeakTable<object, Identity> Identities = new();
    private static readonly ConditionalWeakTable<object, ActionContext> Actions = new();
    private static readonly Dictionary<string, string> DecisionSnapshots = new();
    private static readonly HashSet<object> Deck = new(ReferenceEqualityComparer.Instance);
    public static Func<object?>? SnapshotProvider { get; set; }
    public static int? Turn { get; private set; }
    public static string? Side { get; private set; }
    public static string? RestDecisionId { get; private set; }
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public static string? InstanceId(object? value) => value is null || value.GetType().IsValueType || value is string
        ? null : Identities.GetValue(value, _ => new Identity()).Id;

    public static void RegisterDeck(IEnumerable<object> cards)
    {
        Deck.Clear();
        foreach (var card in cards) Deck.Add(card);
    }

    public static string? OriginId(object? card)
    {
        if (card is null) return null;
        if (Deck.Contains(card)) return InstanceId(card);
        var origin = GameBuddyFactProjection.Read(card, "DeckVersion", "DeckCard", "OriginalCard", "SourceCard");
        return origin is not null && Deck.Contains(origin) ? InstanceId(origin) : null;
    }

    public static void ObserveTurn(int? turn, string? side) { Turn = turn; Side = side; }
    public static void ResetCombat() { Turn = null; Side = null; }
    public static void ResetRun()
    {
        ResetCombat(); Deck.Clear(); DecisionSnapshots.Clear(); Actions.Clear(); EntityRoles.Clear(); RestDecisionId = null;
    }

    // This captures a hook observation, not a promise that every async trigger has settled.
    public static string? Capture(string point, string? actionId = null, string? decisionId = null)
    {
        if (GameBuddyFactEmitter.ActiveRunId is not string runId || SnapshotProvider is null) return null;
        try
        {
            var state = SnapshotProvider();
            if (state is null) return null;
            var snapshot = JsonSerializer.Deserialize<Dictionary<string, object?>>(JsonSerializer.Serialize(state, JsonOptions))!;
            var id = $"snapshot:{Guid.NewGuid():N}";
            snapshot["schema"] = "gamebuddy.recap-snapshot.v1";
            snapshot["snapshotId"] = id;
            snapshot["runId"] = runId;
            var inCombat = !snapshot.TryGetValue("inCombat", out var inCombatValue)
                || inCombatValue is not JsonElement flag || flag.ValueKind != JsonValueKind.False;
            var combatId = inCombat ? GameBuddyFactEmitter.ActiveCombatId : null;
            snapshot["combatId"] = combatId;
            snapshot["attemptGeneration"] = combatId is not null ? GameBuddyFactEmitter.AttemptGeneration : (int?)null;
            snapshot["capturedAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            snapshot["capturePoint"] = point;
            snapshot["timing"] = new { turn = Turn, side = Side, actionId, decisionId, settlementStatus = "hook_observed" };
            // Embed snapshot in the durable fact stream: the normal append + ACK covers both.
            GameBuddyFactEmitter.Publish("context.snapshot", new { snapshot },
                combatId, combatId is not null ? GameBuddyFactEmitter.AttemptGeneration : (int?)null,
                decisionId: decisionId, actionId: actionId, observationMethod: "snapshot");
            return id;
        }
        catch { return null; } // A read-only diagnostic must not interfere with a game action.
    }

    public static string? OfferDecision(string decisionId, string kind)
    {
        var snapshotId = Capture($"before_{kind}_choice", decisionId: decisionId);
        if (snapshotId is not null) DecisionSnapshots[decisionId] = snapshotId;
        if (kind == "rest") RestDecisionId = decisionId;
        return snapshotId;
    }
    public static string? BeforeDecision(string? decisionId) => decisionId is not null
        ? DecisionSnapshots.GetValueOrDefault(decisionId) : null;
    public static void FinishDecision(string? decisionId)
    {
        if (decisionId is not null) DecisionSnapshots.Remove(decisionId);
        if (RestDecisionId == decisionId) RestDecisionId = null;
    }
    public static void BeginCard(object? play, object? card)
    {
        var subject = play ?? card;
        if (subject is null) return;
        var id = $"card-play:{Guid.NewGuid():N}";
        var context = new ActionContext(id, Capture("before_card_effects", actionId: id));
        Actions.Remove(subject); Actions.Add(subject, context);
        if (card is not null && !ReferenceEquals(card, subject)) { Actions.Remove(card); Actions.Add(card, context); }
    }
    public static (string ActionId, string? BeforeSnapshotId) EndCard(object? play, object? card)
    {
        ActionContext? context = null;
        if (play is not null) Actions.TryGetValue(play, out context);
        if (context is null && card is not null) Actions.TryGetValue(card, out context);
        if (play is not null) Actions.Remove(play);
        if (card is not null) Actions.Remove(card);
        return (context?.ActionId ?? $"card-play:{Guid.NewGuid():N}", context?.BeforeSnapshotId);
    }
    public static void RegisterEntity(object entity, string side)
    {
        EntityRoles.Remove(entity); EntityRoles.Add(entity, new EntityRole(side));
    }
    public static string? EntitySide(object? entity) => EntitySide(entity, 0);
    private static string? EntitySide(object? entity, int depth)
    {
        if (entity is null || depth > 2) return null;
        if (EntityRoles.TryGetValue(entity, out var role)) return role.Side;
        if (GameBuddyFactProjection.Boolean(entity, "IsPlayer") is true) return "Player";
        if (GameBuddyFactProjection.Boolean(entity, "IsEnemy", "IsMonster") is true) return "Enemy";
        return GameBuddyFactProjection.Text(entity, "Side", "Team")
            ?? EntitySide(GameBuddyFactProjection.Read(entity, "Creature", "Owner"), depth + 1);
    }
}
