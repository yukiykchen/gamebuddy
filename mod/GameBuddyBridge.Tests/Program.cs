using System.Text.Json;
using GameBuddyBridge.Scripts;

static void Assert(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

static Dictionary<string, object?> Archetype(string id, object delta, int? beforeScore = null)
{
    var archetype = new Dictionary<string, object?>
    {
        ["id"] = id,
        ["deltaPoints"] = delta,
        ["reason"] = $"{id}-reason",
        ["beforeScore"] = beforeScore ?? 10,
        ["afterScore"] = Math.Clamp((beforeScore ?? 10) + (delta is int value ? value : 0), 0, 100),
        ["beforeStage"] = "unformed",
        ["afterStage"] = "unformed",
        ["completedAxes"] = Array.Empty<string>()
    };
    return archetype;
}

static Dictionary<string, object?> Card(
    string cardId,
    object legacyDelta,
    IEnumerable<Dictionary<string, object?>> archetypes) => new()
{
    ["cardId"] = cardId,
    ["deltaPoints"] = legacyDelta,
    ["reason"] = "legacy-reason",
    ["archetypes"] = archetypes
};

static string Message(params Dictionary<string, object?>[] cards) => JsonSerializer.Serialize(new
{
    type = "draft_impact",
    signature = "ANGER:False|POMMEL_STRIKE:False|BASH:True",
    impacts = cards
});

static Dictionary<string, object?>[] ValidArchetypes(int autoStrike = 1) =>
[
    Archetype("auto_strike", autoStrike),
    Archetype("exhaust", -2),
    Archetype("strength", 0),
    Archetype("block", 3)
];

var validJson = Message(
    Card("ANGER", 1, ValidArchetypes()),
    Card("POMMEL_STRIKE", -100, ValidArchetypes(-100)),
    Card("BASH", 100, ValidArchetypes(100)));
Assert(GameBuddyRewardImpactCodec.TryParse(validJson, out var parsed), "Valid three-card message was rejected.");
Assert(parsed!.Impacts.Count == 3, "All three candidate impacts must be retained.");
Assert(parsed.Impacts["ANGER"].Archetypes.Select(item => item.Id)
    .SequenceEqual(GameBuddyRewardImpactCodec.ArchetypeIds), "Archetypes were not normalized to fixed order.");

var reversed = ValidArchetypes().Reverse();
Assert(GameBuddyRewardImpactCodec.TryParse(Message(Card("ANGER", 1, reversed)), out var reordered)
    && reordered!.Impacts["ANGER"].Archetypes[0].Id == "auto_strike",
    "Unique required IDs should parse and normalize regardless of input order.");

var missing = ValidArchetypes()[..3];
Assert(!GameBuddyRewardImpactCodec.TryParse(Message(Card("ANGER", 1, missing)), out _),
    "Missing archetype was accepted.");

var duplicate = ValidArchetypes();
duplicate[3] = Archetype("auto_strike", 3);
Assert(!GameBuddyRewardImpactCodec.TryParse(Message(Card("ANGER", 1, duplicate)), out _),
    "Duplicate archetype ID was accepted.");

var outOfRange = ValidArchetypes();
outOfRange[2] = Archetype("strength", 101);
Assert(!GameBuddyRewardImpactCodec.TryParse(Message(Card("ANGER", 1, outOfRange)), out _),
    "Out-of-range archetype delta was accepted.");

var fractional = ValidArchetypes();
fractional[1] = Archetype("exhaust", 0.5);
Assert(!GameBuddyRewardImpactCodec.TryParse(Message(Card("ANGER", 1, fractional)), out _),
    "Fractional archetype delta was accepted.");

Assert(!GameBuddyRewardImpactCodec.TryParse(Message(Card("ANGER", 2, ValidArchetypes())), out _),
    "Legacy auto-strike mismatch was accepted.");
Assert(!GameBuddyRewardImpactCodec.TryParse(
    """{"type":"draft_impact","signature":"old","impacts":[{"cardId":"ANGER","deltaPoints":1}]}""", out _),
    "Legacy one-line message was accepted.");

Assert(GameBuddyRewardImpactCodec.FormatLine(new("auto_strike", 4, null), true) == "自动打击 +4",
    "Chinese positive formatting is incorrect.");
Assert(GameBuddyRewardImpactCodec.FormatLine(new("exhaust", -2, null), false) == "Exhaust -2",
    "English negative formatting is incorrect.");
Assert(GameBuddyRewardImpactCodec.FormatLine(new("block", 0, null), true) == "格挡壁垒 0",
    "Zero formatting is incorrect.");
Assert(GameBuddyRewardImpactCodec.FormatLine(
    new("auto_strike", 14, null, 42, false, 56, "unformed", "started", ["auto_gate"]), true)
    == "自动打击 42 → 56 (+14) · 启动", "Started transition formatting is incorrect.");
Assert(GameBuddyRewardImpactCodec.FormatLine(
    new("strength", -2, null, 18, true, 16, "started", "started", []), true)
    == "力量叠加 18 → 16 (-2)", "Negative current score formatting is incorrect.");
Assert(GameBuddyRewardImpactCodec.FormatProgress(42, 0) == "42", "Zero delta should keep the current score only.");
Assert(GameBuddyRewardImpactCodec.FormatSignedDelta(14) == "+14", "Positive delta sign is incorrect.");
Assert(GameBuddyRewardImpactCodec.FormatSignedDelta(-2) == "-2", "Negative delta sign is incorrect.");
Assert(GameBuddyRewardImpactCodec.FormatReadiness("自动打击流", 72, "missing_starter", true)
    == "自动打击流：契合度 72 / 尚缺启动组件；已有部分配套",
    "Readiness overlay text is incorrect.");
Assert(GameBuddyRewardImpactCodec.FormatReadiness("自动打击流", 52, "operational", false)
    == "自动打击流：契合度 52 / 可以运转",
    "Operational readiness text is incorrect.");
Assert(GameBuddyRewardImpactCodec.FormatFunctionLine(
    [new DraftFunction("auto_loop", "抽牌循环")],
    [new DraftFunction("auto_gate", "自动打击启动")])
    == "已有：抽牌循环。待补足：自动打击启动",
    "Function line should show present and missing labels.");
Assert(GameBuddyRewardImpactCodec.FormatDelta(4, "missing_starter", "operational")
    == " +4 · 尚缺启动组件 → 可以运转",
    "Status transition must keep the numeric delta.");
Assert(GameBuddyRewardImpactCodec.FormatDelta(2, "operational", "operational")
    == " +2",
    "Unchanged status should keep only the delta.");
var current = GameBuddyRewardImpactCodec.CurrentFunctions(new DraftArchetypeImpact(
    "auto_strike", 4, null, 48, false, 52, "unformed", "started", ["auto_gate"],
    52, "operational", "missing_starter", "operational",
    [new DraftFunction("auto_gate", "自动打击启动"), new DraftFunction("auto_loop", "抽牌循环")],
    [new DraftFunction("auto_payoff", "打击兑现")],
    [new DraftFunction("auto_gate", "自动打击启动")]));
Assert(current.Present.Select(item => item.Id).SequenceEqual(["auto_loop"]),
    "Current functions must not treat the hovered card as already owned.");
Assert(current.Missing.Select(item => item.Id).SequenceEqual(["auto_payoff", "auto_gate"]),
    "A not-yet-taken starter stays missing until the deck confirms it.");
Assert(GameBuddyRewardSource.FromRoom("Event") == "event", "Event room should open an event reward source.");
Assert(GameBuddyRewardSource.FromRoom("Monster") == "combat", "Monster room should open a combat reward source.");
var stockKeys = GameBuddyShopStock.StockedKeys([
    ("card", true),
    ("card", false),
    ("card", true),
    ("relic", true)
]);
Assert(stockKeys.SequenceEqual(["card:0", "card:2", "relic:0"]),
    "Sold shop slots must keep their original stock keys.");
var readinessArchetype = new Dictionary<string, object?>
{
    ["id"] = "auto_strike",
    ["deltaPoints"] = 4,
    ["beforeScore"] = 48,
    ["afterScore"] = 52,
    ["beforeStage"] = "unformed",
    ["afterStage"] = "started",
    ["completedAxes"] = new[] { "auto_gate" },
    ["readiness"] = 52,
    ["status"] = "operational",
    ["beforeStatus"] = "missing_starter",
    ["afterStatus"] = "operational",
    ["presentFunctions"] = new[] { new { id = "auto_gate", label = "自动打击启动" } },
    ["missingFunctions"] = new[] { new { id = "auto_loop", label = "抽牌循环" } },
    ["completedFunctions"] = new[] { new { id = "auto_gate", label = "自动打击启动" } }
};
var readinessMessage = Message(new Dictionary<string, object?>
{
    ["cardId"] = "HELLRAISER",
    ["deltaPoints"] = 4,
    ["archetypes"] = new[]
    {
        readinessArchetype,
        Archetype("exhaust", 0),
        Archetype("strength", 0),
        Archetype("block", 0)
    }
});
Assert(GameBuddyRewardImpactCodec.TryParse(readinessMessage, out var readinessParsed)
    && readinessParsed!.Impacts["HELLRAISER"].Archetypes[0].Readiness == 52
    && readinessParsed.Impacts["HELLRAISER"].Archetypes[0].AfterStatus == "operational",
    "Ironclad readiness fields should decode.");
var withScore = ValidArchetypes();
withScore[0] = Archetype("auto_strike", 8, 9);
Assert(GameBuddyRewardImpactCodec.TryParse(Message(Card("ANGER", 8, withScore)), out var scored)
    && scored!.Impacts["ANGER"].Archetypes[0].BeforeScore == 9
    && scored.Impacts["ANGER"].Archetypes[0].AfterScore == 17,
    "before/after score was not retained.");

static RewardSelectionCard RewardCard(string id, bool upgraded = false) => new(id, upgraded);

var selection = new GameBuddyRewardSelectionTracker();
var baseline = new[] { RewardCard("STRIKE"), RewardCard("STRIKE"), RewardCard("BASH", true) };
var candidates = new[] { RewardCard("ANGER"), RewardCard("POMMEL_STRIKE"), RewardCard("BASH", true) };
selection.Begin("reward-1", baseline, candidates);
selection.Close("reward-1");
var deckWithPick = baseline.Append(RewardCard("POMMEL_STRIKE")).ToArray();
Assert(selection.Observe(deckWithPick) is null, "An unsettled deck snapshot confirmed a selection.");
var confirmed = selection.Observe(deckWithPick);
Assert(confirmed == new RewardSelectionResult("reward-1", "POMMEL_STRIKE", false),
    "A unique candidate increase was not confirmed.");
Assert(selection.Observe(deckWithPick) is null, "The same reward emitted more than one selection.");

selection.Begin("reward-2", baseline, candidates);
selection.Close("reward-2");
Assert(selection.Observe(baseline) is null && selection.Observe(baseline) is null,
    "Skipping a reward must not emit a selection.");

selection.Begin("reward-3", baseline, candidates);
selection.Close("reward-3");
var ambiguousDeck = baseline.Concat([RewardCard("ANGER"), RewardCard("POMMEL_STRIKE")]).ToArray();
Assert(selection.Observe(ambiguousDeck) is null && selection.Observe(ambiguousDeck) is null,
    "Multiple candidate increases must remain unknown.");

selection.Begin("reward-4", baseline, candidates);
selection.Close("another-reward");
Assert(selection.Observe(deckWithPick) is null && selection.Observe(deckWithPick) is null,
    "Closing a different reward signature must not confirm a selection.");

selection.Begin("reward-5", baseline, [RewardCard("BASH", true)]);
selection.Close("reward-5");
var upgradedCandidateDeck = baseline.Append(RewardCard("BASH", true)).ToArray();
Assert(selection.Observe(upgradedCandidateDeck) is null
    && selection.Observe(upgradedCandidateDeck)?.Upgraded == true,
    "Candidate identity must include upgraded state.");

static RewardCandidateProbe Probe(
    string id,
    bool hovered = false,
    bool focused = false,
    bool contains = false,
    float distance = 0) => new(id, hovered, focused, contains, distance);

Assert(GameBuddyRewardCandidateSelector.Resolve([
    Probe("LEFT", hovered: true, distance: 40),
    Probe("RIGHT", hovered: true, distance: 10)
], "LEFT") == "RIGHT", "Overlapping explicit hover must choose the nearest card center.");
Assert(GameBuddyRewardCandidateSelector.Resolve([
    Probe("LEFT", focused: true, distance: 5),
    Probe("RIGHT", contains: true, distance: 1)
], "RIGHT") == "LEFT", "Keyboard focus must outrank geometric fallback and last click.");
Assert(GameBuddyRewardCandidateSelector.Resolve([
    Probe("LEFT"),
    Probe("RIGHT", contains: true, distance: 3)
], "LEFT") == "RIGHT", "Exact pointer geometry must act as hover fallback.");
Assert(GameBuddyRewardCandidateSelector.Resolve([
    Probe("LEFT"),
    Probe("RIGHT")
], "LEFT") == "LEFT", "The last click must remain selected when no card is hovered or focused.");
Assert(GameBuddyRewardCandidateSelector.Resolve([Probe("LEFT"), Probe("RIGHT")], null) is null,
    "No hover, focus, or click must resolve to no candidate.");

Console.WriteLine("GameBuddy reward impact codec tests passed.");

var saveLoadDirectory = Directory.CreateTempSubdirectory("gamebuddy-save-loads").FullName;
var firstLoad = DateTimeOffset.Parse("2026-10-17T14:00:00Z");
var secondLoad = DateTimeOffset.Parse("2026-10-17T14:05:00Z");
Assert(GameBuddySaveLoadLog.Record(saveLoadDirectory, firstLoad), "First save-load record failed.");
Assert(GameBuddySaveLoadLog.Record(saveLoadDirectory, secondLoad), "Second save-load record failed.");
using (var saved = JsonDocument.Parse(File.ReadAllText(Path.Combine(saveLoadDirectory, GameBuddySaveLoadLog.FileName))))
{
    Assert(saved.RootElement.GetProperty("schema").GetString() == GameBuddySaveLoadLog.Schema,
        "Save-load schema was not written.");
    Assert(saved.RootElement.GetProperty("count").GetInt32() == 2, "Save-load count was not 2.");
    var loads = saved.RootElement.GetProperty("loads").EnumerateArray().ToArray();
    Assert(loads.Length == 2 && loads[0].GetProperty("seq").GetInt32() == 1 && loads[1].GetProperty("seq").GetInt32() == 2,
        "Save-load sequence numbers were not distinct.");
    var firstText = loads[0].GetProperty("at").GetString() ?? throw new InvalidOperationException("Save-load timestamp was missing.");
    var secondText = loads[1].GetProperty("at").GetString() ?? throw new InvalidOperationException("Save-load timestamp was missing.");
    var firstAt = DateTimeOffset.Parse(firstText);
    var secondAt = DateTimeOffset.Parse(secondText);
    Assert(firstAt.Offset == TimeSpan.Zero && secondAt > firstAt, "Save-load timestamps were not distinct UTC values.");
    foreach (var name in new[] { "seed", "playerName", "path", "account" })
        Assert(!saved.RootElement.TryGetProperty(name, out _), $"Save-load file stored {name}.");
}

var corruptDirectory = Directory.CreateTempSubdirectory("gamebuddy-save-loads-corrupt").FullName;
File.WriteAllText(Path.Combine(corruptDirectory, GameBuddySaveLoadLog.FileName), "{not-json");
Assert(GameBuddySaveLoadLog.Record(corruptDirectory, firstLoad), "Record after corrupt JSON failed.");
using (var recovered = JsonDocument.Parse(File.ReadAllText(Path.Combine(corruptDirectory, GameBuddySaveLoadLog.FileName))))
    Assert(recovered.RootElement.GetProperty("count").GetInt32() == 1, "Corrupt save-load file was not replaced.");

var blocker = Path.Combine(Path.GetTempPath(), "gamebuddy-save-load-blocker-" + Guid.NewGuid().ToString("N"));
File.WriteAllText(blocker, "not-a-directory");
Assert(!GameBuddySaveLoadLog.Record(Path.Combine(blocker, "child"), firstLoad),
    "Unwritable save-load directory was reported as saved.");

Console.WriteLine("GameBuddy save-load log tests passed.");

var factQueue = new GameBuddyFactQueue(3);
Assert(factQueue.Enqueue(1, "one") is null, "Fact queue dropped an item before reaching capacity.");
factQueue.Enqueue(2, "two");
factQueue.Enqueue(3, "three");
var overflow = factQueue.Enqueue(4, "four");
Assert(overflow == new GameBuddyFactGap(1, 1), "Fact queue did not report its exact overflow gap.");
Assert(factQueue.Snapshot().Select(item => item.SourceSeq).SequenceEqual([2L, 3L, 4L]),
    "Fact queue did not retain the newest ordered facts.");
factQueue.Acknowledge(2);
Assert(factQueue.Snapshot().Select(item => item.SourceSeq).SequenceEqual([3L, 4L]),
    "Fact acknowledgement removed the wrong source sequence.");
factQueue.Acknowledge(99);
Assert(factQueue.Snapshot().Count == 0, "Fact acknowledgement did not clear the durable prefix.");

var reconnect = new GameBuddyFactQueue(10);
reconnect.Enqueue(1, "one");
reconnect.Enqueue(2, "two");
reconnect.Enqueue(3, "three");
reconnect.Acknowledge(1);
Assert(reconnect.Snapshot().Select(item => item.SourceSeq).SequenceEqual([2L, 3L]),
    "Acknowledging a prefix must leave later facts in source order for resend.");

var overflowQueue = new GameBuddyFactQueue(1);
Assert(overflowQueue.Enqueue(1, "one") is null, "The first queued fact was dropped.");
var dropped = overflowQueue.Enqueue(2, "two");
Assert(dropped == new GameBuddyFactGap(1, 1), "Overflow did not report the dropped sequence.");
Assert(overflowQueue.Count == overflowQueue.Capacity, "Overflow left free space instead of staying full.");
overflowQueue.DeclareGap(3, "gap-1");
Assert(overflowQueue.Count == overflowQueue.Capacity, "Declaring a gap waited for a free queue slot.");
Assert(overflowQueue.Snapshot().Select(item => item.SourceSeq).SequenceEqual([2L, 3L]),
    "A full queue did not retain the overflow gap in source order.");
var widenedDrop = overflowQueue.Enqueue(4, "four");
Assert(widenedDrop == new GameBuddyFactGap(2, 2), "The second overflow did not report the newly dropped sequence.");
overflowQueue.DeclareGap(3, "gap-1-2");
Assert(overflowQueue.Snapshot().Select(item => item.Json).SequenceEqual(["gap-1-2", "four"]),
    "An unacknowledged gap declaration was not updated while the queue stayed full.");
overflowQueue.Acknowledge(3);
Assert(overflowQueue.Snapshot().Select(item => item.SourceSeq).SequenceEqual([4L]),
    "Acknowledging the gap prefix removed a later fact.");
overflowQueue.Acknowledge(4);
Assert(overflowQueue.Snapshot().Count == 0, "The retained fact remained after it was acknowledged.");

Console.WriteLine("GameBuddy fact queue tests passed.");

static long FactSourceSeq(string json)
{
    using var document = JsonDocument.Parse(json);
    return document.RootElement.GetProperty("data").GetProperty("sourceSeq").GetInt64();
}

var emitted = new List<string>();
GameBuddyFactEmitter.ResetForTests(10, emitted.Add, "session-a");
GameBuddyFactEmitter.Publish("room.entered", new { roomId = 1 });
GameBuddyFactEmitter.Publish("map.observed", new { roomId = 2 });
GameBuddyFactEmitter.Publish("room.exited", new { roomId = 3 });
GameBuddyFactEmitter.Acknowledge("other-session", 3);
Assert(GameBuddyFactEmitter.PendingJson().Count == 3, "Another source session cleared this session's resend queue.");
GameBuddyFactEmitter.Acknowledge("session-a", 1);
var resend = GameBuddyFactEmitter.PendingJson();
Assert(resend.Select(FactSourceSeq).SequenceEqual([2L, 3L]),
    "After a short disconnect the unacked suffix was not retained in source order.");

GameBuddyFactEmitter.ResetForTests(1, emitted.Add, "session-overflow");
GameBuddyFactEmitter.Publish("room.entered", new { roomId = 1 });
GameBuddyFactEmitter.Publish("room.exited", new { roomId = 2 });
var overflowPending = GameBuddyFactEmitter.PendingJson();
Assert(overflowPending.Select(FactSourceSeq).SequenceEqual([2L, 3L]),
    "Queue overflow did not declare its gap while the queue was still full.");
using (var gapDocument = JsonDocument.Parse(overflowPending[1]))
{
    var gap = gapDocument.RootElement.GetProperty("data");
    Assert(gap.GetProperty("eventType").GetString() == "capture.gap_detected", "Overflow did not emit capture.gap_detected.");
    Assert(gap.GetProperty("payload").GetProperty("reason").GetString() == "queue_overflow", "Overflow gap reason was not queue_overflow.");
    Assert(gap.GetProperty("payload").GetProperty("fromSourceSeq").GetInt64() == 1
        && gap.GetProperty("payload").GetProperty("toSourceSeq").GetInt64() == 1,
        "Overflow gap did not name the dropped sequence.");
}
GameBuddyFactEmitter.Publish("map.observed", new { roomId = 3 });
var widenedPending = GameBuddyFactEmitter.PendingJson();
using (var widenedDocument = JsonDocument.Parse(widenedPending.Single(item => FactSourceSeq(item) == 3)))
{
    var widened = widenedDocument.RootElement.GetProperty("data").GetProperty("payload");
    Assert(widened.GetProperty("fromSourceSeq").GetInt64() == 1 && widened.GetProperty("toSourceSeq").GetInt64() == 2,
        "A later overflow did not widen the unacknowledged gap.");
}
Assert(widenedPending.Select(FactSourceSeq).SequenceEqual([3L, 4L]),
    "The widened gap and the retained fact were not in source order.");

GameBuddyFactEmitter.ResetForTests(10, emitted.Add, "session-b");
GameBuddyFactEmitter.Publish("room.entered", new { roomId = 9 });
var restartedPending = GameBuddyFactEmitter.PendingJson();
Assert(restartedPending.Count == 1, "A new source session kept facts from the previous session.");
using (var restartedDocument = JsonDocument.Parse(restartedPending[0]))
{
    var restartedFact = restartedDocument.RootElement.GetProperty("data");
    Assert(restartedFact.GetProperty("sourceSessionId").GetString() == "session-b"
        && restartedFact.GetProperty("sourceSeq").GetInt64() == 1
        && restartedFact.GetProperty("eventId").GetString() == "session-b:1",
        "A restarted source session did not start again at sequence 1.");
}

Console.WriteLine("GameBuddy fact emitter resend tests passed.");

var identityDirectory = Directory.CreateTempSubdirectory("gamebuddy-run-identities").FullName;
var identities = new GameBuddyRunIdentityStore(identityDirectory);
var firstRun = identities.BeginNew("same-seed-fingerprint");
var secondRun = identities.BeginNew("same-seed-fingerprint");
Assert(firstRun != secondRun, "A confirmed new run reused the prior run ID for the same seed.");
var resumed = new GameBuddyRunIdentityStore(identityDirectory).Resume("same-seed-fingerprint");
Assert(resumed == secondRun, "A saved run did not retain its run ID after a Mod restart.");
identities.End(secondRun);
Assert(identities.ActiveRunId is null, "An ended run remained active.");

Console.WriteLine("GameBuddy run identity tests passed.");

// 可选地消费由真实 JS 评分器生成的完整 draft_impact，验证新增教学字段。
if (args.Length > 0)
{
    Assert(GameBuddyRewardImpactCodec.TryParse(File.ReadAllText(args[0]), out var affinityMessage),
        "Actual JS affinity replay must parse in the C# codec.");
    foreach (var offer in affinityMessage!.Impacts.Values)
    {
        foreach (var affinity in offer.Archetypes)
        {
            Assert(affinity.DeltaPoints == affinity.AfterScore - affinity.BeforeScore, "Delta differs across languages.");
            Assert(affinity.BeforeIdentity.HasValue && affinity.AfterIdentity.HasValue, "Identity evidence is missing.");
            Assert(affinity.ReferenceName is not null && affinity.BeforeReferenceName is not null, "Reference route is missing.");
            var ownedFunctions = GameBuddyRewardImpactCodec.CurrentFunctions(affinity);
            Assert(ownedFunctions.Present.SequenceEqual(affinity.BeforePresentFunctions!), "Owned functions came from a candidate.");
            Assert(ownedFunctions.Missing.SequenceEqual(affinity.BeforeMissingFunctions!), "Owned gaps came from a candidate.");
        }
    }
    Assert(GameBuddyRewardImpactCodec.FormatDelta(0, "operational", "operational") == " 0", "Zero must be visible.");
    Console.WriteLine("GameBuddy actual JS affinity replay passed.");
}
CardGuidanceTests.Run();

Assert(GameBuddyRunEnding.Resolve(false).Result == "loss", "Death must stay a loss.");
GameBuddyRunEnding.EnterAbandon();
Assert(GameBuddyRunEnding.Resolve(false).Reason == "abandoned", "Nested OnEnded(false) lost explicit abandonment.");
GameBuddyRunEnding.EnterAbandon();
GameBuddyRunEnding.ExitAbandon();
Assert(GameBuddyRunEnding.Resolve(false).Result == "abandoned", "Nested finalizer cleared the outer abandonment.");
Assert(GameBuddyRunEnding.Resolve(true).Result == "win", "Confirmed victory must remain victory.");
GameBuddyRunEnding.ExitAbandon();
Assert(GameBuddyRunEnding.Resolve(false).Result == "loss", "Abandon state leaked into the next death.");
Assert(GameBuddyRunEnding.Resolve(false, true).Result == "abandoned", "Abandon postfix did not retain intent.");
try { GameBuddyRunEnding.EnterAbandon(); throw new Exception("test"); }
catch { }
finally { GameBuddyRunEnding.ExitAbandon(); }
Assert(GameBuddyRunEnding.Resolve(false).Result == "loss", "Exception cleanup leaked abandonment state.");
Console.WriteLine("Explicit abandonment and nested run-end ordering passed.");

string Slice(string source, string start, string end)
{
    var from = source.IndexOf(start, StringComparison.Ordinal);
    if (from < 0) throw new InvalidOperationException($"Missing {start}");
    var to = source.IndexOf(end, from + start.Length, StringComparison.Ordinal);
    if (to < 0) throw new InvalidOperationException($"Missing {end}");
    return source.Substring(from, to - from);
}

string Repo(string relative)
{
    var dir = new DirectoryInfo(AppContext.BaseDirectory);
    while (dir is not null)
    {
        var candidate = Path.Combine(dir.FullName, relative);
        if (File.Exists(candidate)) return candidate;
        dir = dir.Parent;
    }
    throw new InvalidOperationException($"Missing {relative}");
}

var lifecycle = File.ReadAllText(Repo(Path.Combine("mod", "GameBuddyBridge", "Scripts", "GameBuddyLifecyclePatches.cs")));
var exporter = File.ReadAllText(Repo(Path.Combine("mod", "GameBuddyBridge", "Scripts", "GameBuddyExporter.cs")));
var fingerprint = Slice(lifecycle, "private static string Fingerprint", "private static string NormalizeTime");
Assert(fingerprint.Contains("if (startTime is null)", StringComparison.Ordinal), "Fingerprint lost the StartTime gate.");
Assert(fingerprint.Contains("AddMember(values, argument, \"AscensionLevel\")", StringComparison.Ordinal),
    "Ascension no longer participates in the run fingerprint.");
Assert(!fingerprint.Contains("gameMode", StringComparison.Ordinal), "Fingerprint gained a gameMode field.");
Assert(fingerprint.Split("AddMember(values, argument, \"GameMode\")").Length - 1 == 1,
    "GameMode fingerprint membership changed.");
var ended = Slice(lifecycle, "public static void EndedPostfix", "public static void AbandonedPostfix");
var observation = ended.IndexOf("PublishFinalFactObservation", StringComparison.Ordinal);
var endRun = ended.IndexOf("EndRun(cleared, ending.Reason)", StringComparison.Ordinal);
var authoritative = ended.IndexOf("AuthoritativeRunEnded", StringComparison.Ordinal);
Assert(observation >= 0 && endRun > observation && authoritative > endRun, "EndedPostfix order changed.");
Assert(lifecycle.Split("gameMode = GameBuddyClearFacts.GameModeText(ReadRunStateGameMode(__args))").Length - 1 == 2,
    "gameMode must be added to both run.started and run.resumed.");
var opened = Slice(exporter, "PublishEvent(\"event.opened\"", "PublishEvent(\"event.closed\")");
Assert(opened.Contains("title = snapshot.Event!.Title", StringComparison.Ordinal), "event.opened title changed.");
Assert(opened.Contains("kind = snapshot.Event.Kind", StringComparison.Ordinal), "event.opened kind changed.");
Assert(opened.Contains("eventId = snapshot.Event.EventId", StringComparison.Ordinal), "event.opened eventId changed.");
Assert(opened.Contains("pageId = snapshot.Event.PageId", StringComparison.Ordinal), "event.opened pageId changed.");
Assert(opened.Contains("description = snapshot.Event.Description", StringComparison.Ordinal), "event.opened description changed.");
Assert(opened.Contains("options = choosable", StringComparison.Ordinal), "event.opened options changed.");
Assert(!opened.Contains("optionId", StringComparison.Ordinal), "event.opened gained an option id.");
var closedAt = exporter.IndexOf("PublishEvent(\"event.closed\")", StringComparison.Ordinal);
Assert(exporter.Substring(closedAt, "PublishEvent(\"event.closed\");".Length) == "PublishEvent(\"event.closed\");",
    "event.closed gained a payload.");
var optionSelected = Slice(exporter, "\"event.option_selected\"", "\"event.option_resolved\"");
Assert(optionSelected.Contains("optionId = ReadTextMember(option, \"Id\", \"OptionId\")", StringComparison.Ordinal),
    "Existing option selection id changed.");
Assert(optionSelected.Contains("label = FormatLoc", StringComparison.Ordinal), "Existing option selection label changed.");
Assert(exporter.Contains("\"event.selected\"", StringComparison.Ordinal), "Confirmed options must emit event.selected.");
Assert(GameBuddyClearFacts.GameModeText(null) is null, "Missing game mode must stay empty.");
Assert(GameBuddyClearFacts.GameModeText("  Standard  ") == "Standard", "Game mode text was not trimmed.");
Assert(GameBuddyClearFacts.GameModeText("   ") is null, "Blank game mode was kept.");
Assert(GameBuddyClearFacts.GameModeText(DayOfWeek.Friday) == "Friday", "Game mode should stringify like other reflected values.");
var selectedJson = JsonSerializer.Serialize(
    GameBuddyClearFacts.EventSelected("BIG_FISH", "INITIAL", "BANANA"),
    new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
using (var selectedDocument = JsonDocument.Parse(selectedJson))
{
    var selected = selectedDocument.RootElement;
    Assert(selected.GetProperty("eventId").GetString() == "BIG_FISH", "event.selected eventId mismatch.");
    Assert(selected.GetProperty("pageId").GetString() == "INITIAL", "event.selected pageId mismatch.");
    Assert(selected.GetProperty("optionId").GetString() == "BANANA", "event.selected optionId mismatch.");
    Assert(selected.EnumerateObject().Count() == 3, "event.selected gained an extra field.");
}
Console.WriteLine("Cleared-run fact shape tests passed.");
RecapCaptureTests.Run();
