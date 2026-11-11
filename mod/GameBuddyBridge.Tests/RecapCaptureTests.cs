using System.Text.Json;
using GameBuddyBridge.Scripts;

internal static class RecapCaptureTests
{
    private sealed class Card { public string Id => "BASH"; public Card? DeckVersion { get; init; } }
    public static void Run()
    {
        void Check(bool value, string message) { if (!value) throw new Exception(message); }
        var deck = new Card(); var duplicate = new Card(); var combat = new Card { DeckVersion = deck };
        GameBuddyRecapCapture.RegisterDeck(new object[] { deck, duplicate });
        Check(GameBuddyRecapCapture.InstanceId(deck) != GameBuddyRecapCapture.InstanceId(duplicate), "Same-name cards share identity");
        Check(GameBuddyRecapCapture.InstanceId(deck) == GameBuddyRecapCapture.InstanceId(deck), "Identity is unstable");
        Check(GameBuddyRecapCapture.OriginId(combat) == GameBuddyRecapCapture.InstanceId(deck), "Explicit deck reference was lost");
        Check(GameBuddyRecapCapture.OriginId(new Card()) is null, "An origin was guessed from the model ID");
        var messages = new List<string>();
        GameBuddyFactEmitter.ResetForTests(100, messages.Add, "recap-test");
        GameBuddyFactEmitter.StartCombat("room", new { });
        GameBuddyRecapCapture.SnapshotProvider = () => new { player = new { hp = 24 }, hand = new[] { new { cardModelId = "BASH" } } };
        GameBuddyRecapCapture.ObserveTurn(2, "Player");
        var before = GameBuddyRecapCapture.OfferDecision("rest-1", "rest");
        Check(before is not null && before == GameBuddyRecapCapture.BeforeDecision("rest-1"), "Decision snapshot not linked");
        GameBuddyRecapCapture.BeginCard(combat, combat);
        var action = GameBuddyRecapCapture.EndCard(combat, combat);
        Check(action.BeforeSnapshotId is not null, "Before hook snapshot missing");
        var unobserved = GameBuddyRecapCapture.EndCard(new Card(), null);
        Check(unobserved.BeforeSnapshotId is null, "Missing before hook fabricated a state");
        GameBuddyFactEmitter.Publish("rest.action_completed", new { action = "smith", beforeSnapshotId = before }, decisionId: "rest-1");
        using var fact = JsonDocument.Parse(messages.Last());
        Check(fact.RootElement.GetProperty("data").GetProperty("beforeSnapshotId").GetString() == before, "Root snapshot reference missing");
        using var snapshot = JsonDocument.Parse(messages.First(m => m.Contains("context.snapshot")));
        var stored = snapshot.RootElement.GetProperty("data").GetProperty("payload").GetProperty("snapshot");
        Check(stored.GetProperty("player").GetProperty("hp").GetInt32() == 24, "Snapshot not durably embedded in fact");
        Check(stored.GetProperty("timing").GetProperty("settlementStatus").GetString() == "hook_observed", "Async settlement overstated");
        GameBuddyRecapCapture.FinishDecision("rest-1");
        Check(GameBuddyRecapCapture.BeforeDecision("rest-1") is null, "Decision context leaked");
        GameBuddyRecapCapture.SnapshotProvider = () => throw new Exception("unsupported getter");
        Check(GameBuddyRecapCapture.Capture("test") is null, "Capture errors must not escape into game logic");
        GameBuddyRecapCapture.SnapshotProvider = () => new { inCombat = false, player = new { hp = 24 } };
        GameBuddyRecapCapture.Capture("outside_combat");
        using var outside = JsonDocument.Parse(messages.Last());
        Check(!outside.RootElement.GetProperty("data").TryGetProperty("combatId", out _), "Rest snapshot inherited an ended combat");
        var entity = new object(); GameBuddyRecapCapture.RegisterEntity(entity, "Player");
        Check(GameBuddyRecapCapture.EntitySide(entity) == "Player", "Observed entity side was lost");
        GameBuddyRecapCapture.ResetRun();
        Check(GameBuddyRecapCapture.EntitySide(entity) is null, "A previous run's entity role leaked");
        GameBuddyRecapCapture.SnapshotProvider = null;
        GameBuddyFactEmitter.EndRun(false, "abandoned");
        using var abandoned = JsonDocument.Parse(messages.Last(m => m.Contains("combat.ended")));
        Check(abandoned.RootElement.GetProperty("data").GetProperty("payload").GetProperty("outcome").GetString() == "abandoned", "An abandoned combat lost its end boundary");
        Console.WriteLine("Recap identity, contextual snapshots and decision links passed.");
    }
}
