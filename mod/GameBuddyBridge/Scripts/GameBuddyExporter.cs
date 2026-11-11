using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Godot;
using MegaCrit.Sts2.Core.Combat;
using MegaCrit.Sts2.Core.Context;
using MegaCrit.Sts2.Core.Entities.Cards;
using MegaCrit.Sts2.Core.Entities.Creatures;
using MegaCrit.Sts2.Core.Entities.Merchant;
using MegaCrit.Sts2.Core.Entities.Players;
using MegaCrit.Sts2.Core.Logging;
using MegaCrit.Sts2.Core.Models;
using MegaCrit.Sts2.Core.Models.Events;
using MegaCrit.Sts2.Core.Map;
using MegaCrit.Sts2.Core.Nodes.Cards.Holders;
using MegaCrit.Sts2.Core.Nodes.Events;
using MegaCrit.Sts2.Core.Nodes.Rooms;
using MegaCrit.Sts2.Core.Nodes.Screens.Map;
using MegaCrit.Sts2.Core.Rooms;
using MegaCrit.Sts2.Core.Runs;

namespace GameBuddyBridge.Scripts;

public static class GameBuddyExporter
{
    private const int Port = 27182;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private static readonly object Gate = new();
    private static GameBuddyWebSocketServer? _server;
    private static string _modDirectory = string.Empty;
    private static string _lastSignature = string.Empty;
    private static bool _wasInCombat;
    private static int _lastTurn = -1;
    private static string? _lastRecapCombatKey;
    private static bool _wasMapVisible;
    private static string? _activeRouteDecisionId;
    private static bool _wasAtRest;
    private static GameBuddyState? _restOpenSnapshot;
    private static Node? _activeCardRewardScreen;
    private static string _lastCardRewardSignature = string.Empty;
    private static string? _activeRewardDecisionId;
    private static bool _rewardFactOffered;
    private static readonly GameBuddyRewardSelectionTracker RewardSelectionTracker = new();
    private static List<string> _lastCombatEnemies = new();
    private static string? _lastCombatNodeType;
    private static string _lastEventSignature = string.Empty;
    private static bool _eventChoiceOpen;
    private static string? _activeEventDecisionId;
    private static string? _activeEventId;
    private static string? _activeEventPageId;
    private static string _lastShopSignature = string.Empty;
    private static bool _shopOpen;
    private static bool _cardRemovalOpen;
    private static string _lastCardRemovalSignature = string.Empty;
    private static string? _activeShopDecisionId;
    private static object? _activeRunObject;
    private static string? _activeRunId;
    private static string? _lastRunFactSignature;
    private static long _activeRunStartedAt;
    private static string? _pendingRunResult;
    private static GameBuddyState? _lastRunSnapshot;
    private static int _damageTurn = -1;
    private static int _turnDamage;
    private static int _maxTurnDamage;
    private static readonly Dictionary<string, int> LastEnemyHp = new(StringComparer.Ordinal);

    public static void Initialize(string modDirectory)
    {
        lock (Gate)
        {
            if (_server is not null)
            {
                return;
            }

            _modDirectory = modDirectory;
            try
            {
                _server = new GameBuddyWebSocketServer(Port);
                _server.Start();
                GameBuddyFactEmitter.Initialize(modDirectory, _server.BroadcastFact);
                GameBuddyRecapCapture.SnapshotProvider = CaptureRecapState;
                GameBuddyDiagnostics.Write(modDirectory, $"WebSocket listening on 127.0.0.1:{Port}");
                Log.Info($"[GameBuddyBridge] WebSocket server listening on 127.0.0.1:{Port}");
            }
            catch (Exception ex)
            {
                _server = null;
                GameBuddyDiagnostics.Write(modDirectory, $"WebSocket failed to start: {ex}");
                Log.Warn($"[GameBuddyBridge] WebSocket failed to start: {ex.Message}");
            }
        }
    }

    public static void ReportCollectorReady()
    {
        GameBuddyDiagnostics.Write(_modDirectory, "collector attached and processing");
    }

    public static void CaptureAndPublish()
    {
        try
        {
            var runState = RunManager.Instance.DebugOnlyGetState();
            if (runState is null)
            {
                return;
            }

            var player = LocalContext.GetMe(runState) ?? runState.Players.FirstOrDefault();
            if (player is null)
            {
                return;
            }

            EnsureRunLifecycle(runState, player);
            var snapshot = BuildSnapshot(runState, player);
            PublishRunObservation(snapshot, false);
            TrackTurnDamage(snapshot);
            snapshot = snapshot with { Run = snapshot.Run with { MaxTurnDamage = _maxTurnDamage } };
            _lastRunSnapshot = snapshot;
            var json = JsonSerializer.Serialize(new BridgeMessage<GameBuddyState>("state", snapshot), JsonOptions);
            var signature = JsonSerializer.Serialize(snapshot with { Timestamp = 0 }, JsonOptions);
            if (!string.Equals(signature, _lastSignature, StringComparison.Ordinal))
            {
                _lastSignature = signature;
                _server?.BroadcastState(json);
            }

            if (snapshot.Combat is not null)
            {
                _lastCombatEnemies = snapshot.Combat.Enemies.Select(enemy => enemy.Name).ToList();
                _lastCombatNodeType = snapshot.Run.CurrentNode ?? snapshot.Run.Room;
            }
            PublishCardRewardIfReady(snapshot);
            PublishSelectedCardIfReady(snapshot);
            PublishTransitions(snapshot);
            PublishEventLifecycle(snapshot);
            PublishShopLifecycle(snapshot);
        }
        catch (Exception ex)
        {
            Log.Warn($"[GameBuddyBridge] state capture failed: {ex.Message}");
        }
    }

    private static void EnsureRunLifecycle(RunState runState, Player player)
    {
        var authoritativeRunId = GameBuddyFactEmitter.ActiveRunId;
        if (ReferenceEquals(_activeRunObject, runState)
            && !string.IsNullOrEmpty(_activeRunId)
            && (authoritativeRunId is null || authoritativeRunId == _activeRunId))
        {
            return;
        }

        if (_activeRunObject is not null && authoritativeRunId == _activeRunId)
        {
            _activeRunObject = runState;
            return;
        }

        _activeRunObject = runState;
        _activeRunStartedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        _activeRunId = authoritativeRunId ?? BuildRunId(runState, player);
        _pendingRunResult = null;
        _lastRunSnapshot = null;
        _damageTurn = -1;
        _turnDamage = 0;
        _maxTurnDamage = 0;
        LastEnemyHp.Clear();
        PublishEvent("run.started", new
        {
            runId = _activeRunId,
            character = player.Character.Id.Entry,
            ascension = ReadIntValue(ReadMember(runState, "AscensionLevel", "Ascension")),
            startedAt = _activeRunStartedAt
        });
    }

    private static void PublishRunObservation(GameBuddyState snapshot, bool force)
    {
        var runId = GameBuddyFactEmitter.ActiveRunId;
        if (runId is null) return;
        var signature = $"{runId}|{snapshot.Run.Act}|{snapshot.Run.Floor}|{snapshot.Run.CurrentCoord}|"
            + $"{snapshot.Player.Hp}|{snapshot.Player.MaxHp}|{snapshot.Player.Gold}|"
            + $"{string.Join(",", snapshot.Player.Cards.Select(card => $"{card.Id}:{card.Upgraded}"))}|"
            + $"{string.Join(",", snapshot.Player.Relics.Select(relic => relic.Id))}|"
            + $"{string.Join(",", snapshot.Player.Potions.Select(potion => potion.Id))}";
        if (!force && signature == _lastRunFactSignature) return;
        _lastRunFactSignature = signature;
        GameBuddyFactEmitter.Publish("run.observed", new
        {
            character = snapshot.Run.Character,
            ascension = snapshot.Run.Ascension,
            act = snapshot.Run.Act,
            floor = snapshot.Run.Floor,
            totalFloor = snapshot.Run.TotalFloor,
            hp = snapshot.Player.Hp,
            maxHp = snapshot.Player.MaxHp,
            gold = snapshot.Player.Gold,
            deck = snapshot.Player.Cards,
            relics = snapshot.Player.Relics,
            potions = snapshot.Player.Potions
        }, observationMethod: "snapshot");
    }

    public static void PublishFinalFactObservation()
    {
        if (_lastRunSnapshot is not null) PublishRunObservation(_lastRunSnapshot, true);
    }

    private static string BuildRunId(RunState runState, Player player)
    {
        var seed = ReadMember(runState, "Seed", "RunSeed", "SeedString")?.ToString();
        var identity = string.IsNullOrWhiteSpace(seed)
            ? $"{player.Character.Id.Entry}|{_activeRunStartedAt}|{Guid.NewGuid():N}"
            : $"{player.Character.Id.Entry}|{seed}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(identity)))[..20].ToLowerInvariant();
    }

    public static void AuthoritativeRunEnded(bool cleared, bool abandoned = false)
    {
        _pendingRunResult = GameBuddyRunEnding.Resolve(cleared, abandoned).Result;
        EndActiveRun();
    }

    private static void EndActiveRun()
    {
        if (string.IsNullOrEmpty(_activeRunId))
        {
            return;
        }

        var snapshot = _lastRunSnapshot;
        var result = _pendingRunResult ?? "loss";
        PublishEvent("run.ended", new
        {
            runId = _activeRunId,
            result,
            act = snapshot?.Run.Act,
            floor = snapshot?.Run.TotalFloor ?? snapshot?.Run.Floor,
            playtimeSeconds = Math.Max(0, (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - _activeRunStartedAt) / 1000),
            bossId = snapshot?.Run.FinalBossId ?? snapshot?.Run.NextBossId,
            bossName = snapshot?.Run.FinalBossName ?? snapshot?.Run.NextBoss,
            maxTurnDamage = _maxTurnDamage
        });
        _activeRunObject = null;
        _activeRunId = null;
        _lastRunSnapshot = null;
        _pendingRunResult = null;
        LastEnemyHp.Clear();
    }

    private static void TrackTurnDamage(GameBuddyState snapshot)
    {
        if (snapshot.Combat is null)
        {
            _damageTurn = -1;
            _turnDamage = 0;
            LastEnemyHp.Clear();
            return;
        }

        if (_damageTurn != snapshot.Combat.Turn)
        {
            _damageTurn = snapshot.Combat.Turn;
            _turnDamage = 0;
            LastEnemyHp.Clear();
        }

        var current = new Dictionary<string, int>(StringComparer.Ordinal);
        for (var index = 0; index < snapshot.Combat.Enemies.Count; index += 1)
        {
            var enemy = snapshot.Combat.Enemies[index];
            var key = enemy.Id ?? $"{enemy.Name}#{index}";
            current[key] = Math.Max(0, enemy.Hp);
            if (LastEnemyHp.TryGetValue(key, out var before) && enemy.Hp < before)
            {
                _turnDamage += before - Math.Max(0, enemy.Hp);
            }
        }
        LastEnemyHp.Clear();
        foreach (var pair in current) LastEnemyHp[pair.Key] = pair.Value;
        _maxTurnDamage = Math.Max(_maxTurnDamage, _turnDamage);
    }

    private static void PublishTransitions(GameBuddyState snapshot)
    {
        var inCombat = snapshot.Combat is not null;
        var mapVisible = NMapScreen.Instance?.IsVisibleInTree() == true;

        if (inCombat && !_wasInCombat)
        {
            var boss = string.Equals(snapshot.Run.CurrentNode, "Boss", StringComparison.OrdinalIgnoreCase);
            var actualBoss = boss ? snapshot.Combat?.Enemies.FirstOrDefault() : null;
            PublishEvent("combat.started", new
            {
                roomType = snapshot.Run.CurrentNode ?? snapshot.Run.Room,
                enemies = snapshot.Combat?.Enemies.Select(enemy => new { enemy.Id, enemy.Name }).ToList(),
                bossId = actualBoss?.Id ?? (boss ? snapshot.Run.NextBossId : null),
                bossName = actualBoss?.Name ?? (boss ? snapshot.Run.NextBoss : null)
            });
        }
        var recapCombatKey = $"{GameBuddyFactEmitter.ActiveCombatId}:{GameBuddyFactEmitter.AttemptGeneration}";
        if (inCombat && recapCombatKey != _lastRecapCombatKey && GameBuddyFactEmitter.ActiveCombatId is string combatId)
        {
            _lastRecapCombatKey = recapCombatKey;
            var boss = string.Equals(snapshot.Run.CurrentNode, "Boss", StringComparison.OrdinalIgnoreCase);
            var actualBoss = boss ? snapshot.Combat?.Enemies.FirstOrDefault() : null;
            GameBuddyFactEmitter.Publish("combat.started", new
            {
                roomType = snapshot.Run.CurrentNode ?? snapshot.Run.Room,
                enemies = snapshot.Combat?.Enemies.Select(enemy => new { enemy.Id, enemy.Name }).ToList(),
                boss,
                bossId = actualBoss?.Id,
                bossName = actualBoss?.Name,
                deckInstanceIds = snapshot.Player.Cards.Select(card => card.DeckCardInstanceId).Where(id => id is not null).ToArray(),
                afterSnapshotId = GameBuddyRecapCapture.Capture("combat_start_observed")
            }, combatId: combatId, attemptGeneration: GameBuddyFactEmitter.AttemptGeneration,
                observationMethod: "snapshot");
        }
        if (!inCombat && _wasInCombat) PublishEvent("combat.ended", new { roomType = _lastCombatNodeType, victory = snapshot.Player.Hp > 0 });
        if (inCombat && snapshot.Combat?.Turn is int turn && turn != _lastTurn)
        {
            PublishEvent("turn.started", new { turn });
            _lastTurn = turn;
        }
        if (mapVisible && !_wasMapVisible)
        {
            PublishEvent("map.opened");
            _activeRouteDecisionId = $"route:{Guid.NewGuid():N}";
            GameBuddyFactEmitter.Publish("map.observed", new
            {
                snapshot.Map.Current,
                snapshot.Map.Start,
                snapshot.Map.Boss,
                snapshot.Map.SecondBoss,
                snapshot.Map.Nodes,
                snapshot.Map.Routes,
                snapshot.Map.RoutesTruncated
            }, observationMethod: "snapshot");
            GameBuddyFactEmitter.Publish("route.offered", new
            {
                beforeSnapshotId = GameBuddyRecapCapture.OfferDecision(_activeRouteDecisionId, "route"),
                current = snapshot.Map.Current,
                legalEntries = snapshot.Map.Routes
                    .Where(route => route.Count > 0)
                    .Select(route => route[0])
                    .Distinct(StringComparer.Ordinal)
                    .ToArray()
            }, decisionId: _activeRouteDecisionId, observationMethod: "snapshot");
        }

        var atRest = !inCombat
            && string.Equals(snapshot.Run.CurrentNode, "RestSite", StringComparison.OrdinalIgnoreCase)
            && !mapVisible;
        if (atRest && !_wasAtRest)
        {
            _restOpenSnapshot = snapshot;
            PublishEvent("rest.opened");
            var restDecisionId = $"rest:{Guid.NewGuid():N}";
            var beforeSnapshotId = GameBuddyRecapCapture.OfferDecision(restDecisionId, "rest");
            GameBuddyFactEmitter.Publish("rest.options_offered", new
            {
                beforeSnapshotId,
                hp = snapshot.Player.Hp,
                maxHp = snapshot.Player.MaxHp,
                canHeal = (bool?)null,
                missingHp = Math.Max(0, snapshot.Player.MaxHp - snapshot.Player.Hp),
                healAvailabilitySource = "unsupported",
                smithCandidates = snapshot.Player.Cards
                    .Select((card, index) => new { slot = index, card.Id, card.Name, card.Upgraded, card.DeckCardInstanceId, availability = "unknown" })
                    .ToArray()
            }, decisionId: restDecisionId, observationMethod: "snapshot");
        }
        if (!atRest && _wasAtRest)
        {
            PublishEvent("rest.closed", InferRestClosed(_restOpenSnapshot, snapshot));
            _restOpenSnapshot = null;
        }

        _wasInCombat = inCombat;
        _wasMapVisible = mapVisible;
        _wasAtRest = atRest;
    }

    public static void PublishRouteSelected(object? coordinate)
    {
        GameBuddyFactEmitter.Publish("route.selected", new
        {
            coordinate = coordinate?.ToString(),
            beforeSnapshotId = GameBuddyRecapCapture.BeforeDecision(_activeRouteDecisionId),
            afterSnapshotId = GameBuddyRecapCapture.Capture("route_selected_observed", decisionId: _activeRouteDecisionId)
        }, decisionId: _activeRouteDecisionId, observationMethod: "direct_hook");
        GameBuddyRecapCapture.FinishDecision(_activeRouteDecisionId);
        _activeRouteDecisionId = null;
    }

    private static object InferRestClosed(GameBuddyState? before, GameBuddyState after)
    {
        if (before is null) return new { action = (string?)null };
        if (after.Player.Hp > before.Player.Hp)
        {
            return new { action = "HEAL", hpBefore = before.Player.Hp, hpAfter = after.Player.Hp };
        }

        var beforeUpgraded = new HashSet<string>(
            before.Player.Cards.Where(card => card.Upgraded).Select(card => $"{card.Id}\0{card.Name}"));
        foreach (var card in after.Player.Cards)
        {
            if (!card.Upgraded) continue;
            if (beforeUpgraded.Contains($"{card.Id}\0{card.Name}")) continue;
            return new { action = "SMITH", cardId = card.Id, cardName = card.Name };
        }

        return new { action = (string?)null };
    }

    private static void PublishEvent(string name, object? data = null)
    {
        var message = JsonSerializer.Serialize(new BridgeEvent("event", name, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), data), JsonOptions);
        _server?.BroadcastEvent(message);
    }

    private static void PublishEventLifecycle(GameBuddyState snapshot)
    {
        var options = snapshot.Event?.Options ?? new List<EventOptionSnapshot>();
        var choosable = options.Where(option => !option.Locked).ToList();
        var signature = snapshot.Event is null || choosable.Count == 0
            ? string.Empty
            : $"{snapshot.Event.EventId}|{snapshot.Event.PageId}|{snapshot.Event.Kind}|{snapshot.Event.Title}|{string.Join("|", choosable.Select(option => $"{option.Index}:{option.OptionId}:{option.Label}:{option.Description}"))}";
        if (choosable.Count > 0 && !string.Equals(signature, _lastEventSignature, StringComparison.Ordinal))
        {
            if (!_eventChoiceOpen) _activeEventDecisionId = $"event:{Guid.NewGuid():N}";
            _lastEventSignature = signature;
            _eventChoiceOpen = true;
            _activeEventId = snapshot.Event!.EventId;
            _activeEventPageId = snapshot.Event.PageId;
            GameBuddyFactEmitter.Publish("event.options_offered", new
            {
                beforeSnapshotId = GameBuddyRecapCapture.OfferDecision(_activeEventDecisionId!, "event"),
                eventId = snapshot.Event!.EventId,
                pageId = snapshot.Event.PageId,
                candidateVersion = signature,
                options = choosable
            }, decisionId: _activeEventDecisionId, observationMethod: "snapshot");
            PublishEvent("event.opened", new
            {
                title = snapshot.Event!.Title,
                kind = snapshot.Event.Kind,
                eventId = snapshot.Event.EventId,
                pageId = snapshot.Event.PageId,
                description = snapshot.Event.Description,
                options = choosable
            });
            return;
        }

        if (_eventChoiceOpen && choosable.Count == 0)
        {
            _eventChoiceOpen = false;
            _lastEventSignature = string.Empty;
            _activeEventDecisionId = null;
            PublishEvent("event.closed");
            _activeEventId = null;
            _activeEventPageId = null;
        }
    }

    private static void PublishShopLifecycle(GameBuddyState snapshot)
    {
        var shop = snapshot.Shop;
        var signature = shop is null
            ? string.Empty
            : $"{shop.Gold}|{string.Join("|", shop.Items.Select(item => $"{item.Index}:{item.ItemType}:{item.Id}:{item.Price}:{item.Stocked}:{item.Card?.Upgraded}"))}";
        if (shop is not null && !string.Equals(signature, _lastShopSignature, StringComparison.Ordinal))
        {
            var eventName = _shopOpen ? "shop.updated" : "shop.opened";
            if (!_shopOpen) _activeShopDecisionId = $"shop:{Guid.NewGuid():N}";
            _shopOpen = true;
            _lastShopSignature = signature;
            GameBuddyFactEmitter.Publish(eventName == "shop.opened" ? "shop.opened" : "shop.inventory_updated", new
            {
                beforeSnapshotId = GameBuddyRecapCapture.OfferDecision(_activeShopDecisionId!, "shop"),
                inventoryVersion = signature,
                shop.Gold,
                shop.Items
            }, decisionId: _activeShopDecisionId, observationMethod: "snapshot");
            PublishEvent(eventName, new
            {
                gold = shop.Gold,
                items = shop.Items,
                visitId = _activeShopDecisionId
            });
            return;
        }

        if (_shopOpen && shop is null)
        {
            _shopOpen = false;
            _lastShopSignature = string.Empty;
            GameBuddyFactEmitter.Publish("shop.closed", new { }, decisionId: _activeShopDecisionId,
                observationMethod: "direct_hook");
            GameBuddyRecapCapture.FinishDecision(_activeShopDecisionId);
            _activeShopDecisionId = null;
            PublishEvent("shop.closed");
        }
    }

    internal static string? CurrentShopDecisionId => _activeShopDecisionId;

    public static void PublishEventOptionSelected(object option)
    {
        var actionId = $"event:{Guid.NewGuid():N}";
        GameBuddyFactEmitter.Publish("event.option_selected", new
        {
            beforeSnapshotId = GameBuddyRecapCapture.BeforeDecision(_activeEventDecisionId),
            optionId = ReadTextMember(option, "Id", "OptionId"),
            label = FormatLoc(ReadMember(option, "Title", "Label", "Text"))
        }, decisionId: _activeEventDecisionId, actionId: actionId, observationMethod: "direct_hook");
        GameBuddyFactEmitter.Publish("event.option_resolved", new
        {
            status = "observed",
            afterSnapshotId = GameBuddyRecapCapture.Capture("event_choice_observed", actionId, _activeEventDecisionId),
            settlementStatus = "unknown",
            outcome = (string?)null
        }, decisionId: _activeEventDecisionId, actionId: actionId, observationMethod: "direct_hook",
            unknownReasons: new Dictionary<string, string> { ["payload.outcome"] = "not_observed" });
        var selectedEvent = GameBuddyClearFacts.EventSelected(
            _activeEventId, _activeEventPageId, ReadTextMember(option, "Id", "OptionId"));
        if (selectedEvent is not null)
        {
            GameBuddyFactEmitter.Publish("event.selected", selectedEvent,
                decisionId: _activeEventDecisionId, actionId: actionId, observationMethod: "direct_hook");
        }
    }

    private static EventSnapshot? BuildEventSnapshot(RunState runState)
    {
        try
        {
            if (runState.CurrentRoom is not EventRoom eventRoom)
            {
                return null;
            }

            var model = eventRoom.CanonicalEvent;
            var kind = model is AncientEventModel ? "ancient" : "event";
            // Optional early-access identifiers can move between patches. Keep
            // display text as the compatibility path when reflection finds none.
            var eventId = ReadTextMember(model, "Id", "EventId", "ModelId");
            var pageObject = ReadMember(eventRoom, "CurrentPage", "Page", "CurrentEventPage")
                ?? ReadMember(model, "CurrentPage", "Page", "CurrentEventPage");
            var pageId = ReadTextMember(pageObject, "Id", "PageId", "Name")
                ?? ReadTextMember(eventRoom, "CurrentPageId", "PageId")
                ?? ReadTextMember(model, "CurrentPageId", "PageId");
            var title = FormatLoc(model?.Title);
            var description = FormatLoc(model?.Description);
            var options = new List<EventOptionSnapshot>();
            var uiRoom = NEventRoom.Instance;
            if (uiRoom is not null && GodotObject.IsInstanceValid(uiRoom))
            {
                var buttons = FindNodes<NEventOptionButton>(uiRoom);
                buttons.Sort((left, right) =>
                {
                    if (left is Control leftControl && right is Control rightControl)
                    {
                        var row = leftControl.GlobalPosition.Y.CompareTo(rightControl.GlobalPosition.Y);
                        return row != 0 ? row : leftControl.GlobalPosition.X.CompareTo(rightControl.GlobalPosition.X);
                    }
                    return 0;
                });
                var index = 0;
                foreach (var button in buttons)
                {
                    if (!button.IsVisibleInTree())
                    {
                        continue;
                    }

                    var option = button.Option;
                    if (option is null || option.IsProceed || option.WasChosen)
                    {
                        continue;
                    }

                    var relicName = option.Relic is null ? string.Empty : FormatLoc(option.Relic.Title);
                    var relicDescription = option.Relic is null
                        ? string.Empty
                        : FormatLoc(ReadMember(option.Relic, "DynamicDescription", "Description"));
                    var label = relicName.Length > 0 ? relicName : FormatLoc(option.Title);
                    if (string.IsNullOrWhiteSpace(label))
                    {
                        continue;
                    }

                    var text = relicDescription.Length > 0 ? relicDescription : FormatLoc(option.Description);
                    var optionId = ReadTextMember(option, "Id", "OptionId", "TextKey", "TitleKey");
                    options.Add(new EventOptionSnapshot(index, label, text, option.IsLocked, optionId));
                    index += 1;
                }
            }

            return new EventSnapshot(title, description, kind, options, eventId, pageId);
        }
        catch (Exception ex)
        {
            Log.Warn($"[GameBuddyBridge] event capture failed: {ex.Message}");
            return null;
        }
    }

    private static List<T> FindNodes<T>(Node start, int depth = 0) where T : Node
    {
        var found = new List<T>();
        CollectNodes(start, found, depth);
        return found;
    }

    private static void CollectNodes<T>(Node? node, List<T> found, int depth) where T : Node
    {
        if (node is null || depth > 24 || !GodotObject.IsInstanceValid(node))
        {
            return;
        }

        if (node is T match)
        {
            found.Add(match);
        }

        foreach (var child in node.GetChildren())
        {
            if (child is Node childNode)
            {
                CollectNodes(childNode, found, depth + 1);
            }
        }
    }

    private static string FormatLoc(object? value)
    {
        if (value is null) return string.Empty;
        if (value is string text) return text.Trim();
        try
        {
            var formatted = value.GetType().GetMethod("GetFormattedText", Type.EmptyTypes)?.Invoke(value, null)?.ToString();
            if (!string.IsNullOrWhiteSpace(formatted)) return formatted.Trim();
        }
        catch
        {
            // LocString layout can move between game patches.
        }

        return value.ToString()?.Trim() ?? string.Empty;
    }

    public static void TrackCardRewardScreen(Node screen)
    {
        if (!ReferenceEquals(_activeCardRewardScreen, screen))
        {
            RewardSelectionTracker.Reset();
            _activeRewardDecisionId = $"reward:{Guid.NewGuid():N}";
            _rewardFactOffered = false;
        }
        _activeCardRewardScreen = screen;
        _lastCardRewardSignature = string.Empty;
    }

    public static void ClearCardRewardScreen(Node screen)
    {
        if (ReferenceEquals(_activeCardRewardScreen, screen))
        {
            RewardSelectionTracker.Close(_lastCardRewardSignature);
            _activeCardRewardScreen = null;
            PublishEvent("card.reward.closed");
        }
    }

    public static void BeginCardRemoval(Player player, CardSelectorPrefs prefs, Func<CardModel, bool>? filter)
    {
        try
        {
            lock (Gate)
            {
                if (_server is null || player is null || player.Creature is { IsDead: true })
                {
                    _cardRemovalOpen = false;
                    return;
                }
                var candidates = (player.Deck?.Cards ?? new List<CardModel>())
                    .Where(card => card is not null && !string.IsNullOrWhiteSpace(card.Id.Entry))
                    .Where(card => IsRemovalCandidate(card, filter))
                    .ToList();
                if (candidates.Count == 0)
                {
                    _cardRemovalOpen = false;
                    return;
                }
                var mapped = MapCards(candidates);
                var signature = $"{prefs.MinSelect}:{prefs.MaxSelect}:{prefs.Cancelable}|"
                    + string.Join("|", mapped.Select(card => $"{card.Id}:{card.Upgraded}"));
                _cardRemovalOpen = true;
                if (string.Equals(signature, _lastCardRemovalSignature, StringComparison.Ordinal)) return;
                _lastCardRemovalSignature = signature;
                var promptKey = ReadPromptKey(prefs);
                PublishEvent("card.removal.opened", new
                {
                    cards = mapped,
                    minSelect = prefs.MinSelect,
                    maxSelect = prefs.MaxSelect,
                    cancelable = prefs.Cancelable,
                    promptTable = promptKey.Table,
                    promptKey = promptKey.Entry,
                    inShop = _shopOpen,
                    candidateCount = mapped.Count
                });
            }
        }
        catch (Exception ex)
        {
            Log.Warn($"[GameBuddyBridge] card removal open skipped: {ex.Message}");
        }
    }

    public static void EndCardRemoval(NCardGridSelectionScreen screen)
    {
        try
        {
            lock (Gate)
            {
                if (!_cardRemovalOpen || screen is not NDeckCardSelectScreen) return;
                _cardRemovalOpen = false;
                _lastCardRemovalSignature = string.Empty;
                PublishEvent("card.removal.closed");
            }
        }
        catch (Exception ex)
        {
            Log.Warn($"[GameBuddyBridge] card removal close skipped: {ex.Message}");
        }
    }

    private static bool IsRemovalCandidate(CardModel card, Func<CardModel, bool>? filter)
    {
        if (!card.IsRemovable) return false;
        if (filter is null) return true;
        try { return filter(card); }
        catch { return false; }
    }

    private static (string? Table, string? Entry) ReadPromptKey(CardSelectorPrefs prefs)
    {
        try
        {
            var prompt = prefs.Prompt;
            return prompt is null ? (null, null) : (prompt.LocTable, prompt.LocEntryKey);
        }
        catch { return (null, null); }
    }

    public static void ResolveCardRewardSkipped()
    {
        if (_activeRewardDecisionId is null) return;
        GameBuddyFactEmitter.Publish("reward.resolved", new
        {
            result = "skipped",
            beforeSnapshotId = GameBuddyRecapCapture.BeforeDecision(_activeRewardDecisionId),
            afterSnapshotId = GameBuddyRecapCapture.Capture("reward_skip_observed", decisionId: _activeRewardDecisionId),
            candidateVersion = _lastCardRewardSignature
        }, decisionId: _activeRewardDecisionId, observationMethod: "direct_hook");
        GameBuddyRecapCapture.FinishDecision(_activeRewardDecisionId);
        _activeRewardDecisionId = null;
    }

    public static void ResolveCardRewardTaken(object? reward)
    {
        if (_activeRewardDecisionId is null) return;
        var card = ReadMember(reward, "Card", "CardModel", "Reward");
        GameBuddyFactEmitter.Publish("reward.resolved", new
        {
            result = "selected",
            beforeSnapshotId = GameBuddyRecapCapture.BeforeDecision(_activeRewardDecisionId),
            afterSnapshotId = GameBuddyRecapCapture.Capture("reward_taken_observed", decisionId: _activeRewardDecisionId),
            cardInstanceId = GameBuddyRecapCapture.InstanceId(card),
            cardId = GameBuddyFactProjection.ModelId(card),
            upgraded = ReadBoolMember(card, "IsUpgraded", "Upgraded"),
            candidateVersion = _lastCardRewardSignature
        }, decisionId: _activeRewardDecisionId, observationMethod: "direct_hook");
        GameBuddyRecapCapture.FinishDecision(_activeRewardDecisionId);
        _activeRewardDecisionId = null;
    }

    private static void PublishCardRewardIfReady(GameBuddyState snapshot)
    {
        var screen = _activeCardRewardScreen;
        if (screen is null || !GodotObject.IsInstanceValid(screen))
        {
            _activeCardRewardScreen = null;
            return;
        }

        var reward = snapshot.Reward;
        if (reward is null) return;
        var mapped = reward.Cards;
        var signature = reward.Signature;
        if (string.Equals(signature, _lastCardRewardSignature, StringComparison.Ordinal))
        {
            return;
        }

        _lastCardRewardSignature = signature;
        RewardSelectionTracker.Begin(
            signature,
            snapshot.Player.Cards.Select(card => new RewardSelectionCard(card.Id, card.Upgraded)),
            mapped.Select(card => new RewardSelectionCard(card.Id, card.Upgraded)));
        GameBuddyRewardOverlay.SetOffer((MegaCrit.Sts2.Core.Nodes.Screens.CardSelection.NCardRewardSelectionScreen)screen, signature, mapped.Select(card => $"{card.Id}:{(card.Upgraded ? "1" : "0")}"));
        var factType = _rewardFactOffered ? "reward.updated" : "reward.offered";
        _rewardFactOffered = true;
        GameBuddyFactEmitter.Publish(factType, new
        {
            beforeSnapshotId = _activeRewardDecisionId is not null ? GameBuddyRecapCapture.OfferDecision(_activeRewardDecisionId, "reward") : null,
            candidateVersion = signature,
            candidates = mapped.Select((card, index) => new
            {
                slot = index,
                cardId = card.Id,
                card.Name,
                card.Upgraded
            }).ToArray(),
            canSkip = true,
            source = GameBuddyRewardSource.FromRoom(snapshot.Run.Room)
        }, decisionId: _activeRewardDecisionId, observationMethod: "direct_hook");
        PublishEvent("card.reward.opened", new
        {
            cards = mapped,
            signature,
            canSkip = true,
            source = GameBuddyRewardSource.FromRoom(snapshot.Run.Room),
            opportunityId = _activeRewardDecisionId,
            context = new
            {
                act = snapshot.Run.Act,
                actId = snapshot.Run.ActId,
                actName = snapshot.Run.ActName,
                floor = snapshot.Run.Floor,
                defeatedType = _lastCombatNodeType,
                defeatedEnemies = _lastCombatEnemies,
                nextBossId = snapshot.Run.NextBossId,
                nextBoss = snapshot.Run.NextBoss
            }
        });
    }

    private static void PublishSelectedCardIfReady(GameBuddyState snapshot)
    {
        var selected = RewardSelectionTracker.Observe(
            snapshot.Player.Cards.Select(card => new RewardSelectionCard(card.Id, card.Upgraded)));
        if (selected is null)
        {
            return;
        }

        PublishEvent("card.reward.selected", new
        {
            signature = selected.Signature,
            cardId = selected.CardId,
            upgraded = selected.Upgraded
        });
        GameBuddyFactEmitter.Publish("reward.resolved", new
        {
            result = "selected",
            beforeSnapshotId = GameBuddyRecapCapture.BeforeDecision(_activeRewardDecisionId),
            afterSnapshotId = GameBuddyRecapCapture.Capture("reward_deck_change_observed", decisionId: _activeRewardDecisionId),
            cardId = selected.CardId,
            upgraded = selected.Upgraded,
            candidateVersion = selected.Signature
        }, decisionId: _activeRewardDecisionId, observationMethod: "state_diff");
        GameBuddyRecapCapture.FinishDecision(_activeRewardDecisionId);
        _activeRewardDecisionId = null;
    }

    private static void CollectRewardCards(Node node, List<CardModel> cards, int depth)
    {
        if (depth > 15)
        {
            return;
        }

        foreach (var child in node.GetChildren())
        {
            if (child is NCardHolder holder && holder.CardModel is not null)
            {
                cards.Add(holder.CardModel);
                continue;
            }
            if (child is Node childNode)
            {
                CollectRewardCards(childNode, cards, depth + 1);
            }
        }
    }

    private static RewardSnapshot? BuildRewardSnapshot()
    {
        if (_activeCardRewardScreen is not { } screen || !GodotObject.IsInstanceValid(screen) || !screen.IsInsideTree()) return null;
        var cards = new List<CardModel>();
        CollectRewardCards(screen, cards, 0);
        var mapped = MapCards(cards.Where(card => !string.IsNullOrWhiteSpace(card.Id.Entry)).Take(6));
        if (mapped.Count == 0) return null;
        var signature = string.Join("|", mapped.Select((card, index) => $"{index}:{card.Id}:{card.Upgraded}"));
        return new(mapped, signature, true);
    }

    internal static int? CurrentEnergy()
    {
        var run = RunManager.Instance.DebugOnlyGetState();
        var player = run is null ? null : LocalContext.GetMe(run) ?? run.Players.FirstOrDefault();
        return player?.PlayerCombatState?.Energy;
    }
    internal static int? CurrentTurn()
    {
        var run = RunManager.Instance.DebugOnlyGetState();
        var player = run is null ? null : LocalContext.GetMe(run) ?? run.Players.FirstOrDefault();
        return player?.Creature.CombatState?.RoundNumber;
    }

    private static object? CaptureRecapState()
    {
        var run = RunManager.Instance.DebugOnlyGetState();
        if (run is null) return null;
        var player = LocalContext.GetMe(run) ?? run.Players.FirstOrDefault();
        if (player is null) return null;
        var state = BuildSnapshot(run, player);
        object Card(CardSnapshot c) => new {
            cardModelId = c.Id, c.Name, c.Upgraded, c.Cost,
            combatCardInstanceId = c.CombatCardInstanceId,
            originDeckCardInstanceId = c.DeckCardInstanceId,
            playable = (bool?)null, availabilitySource = "unsupported"
        };
        return new {
            inCombat = state.Combat is not null,
            location = new { state.Run.Act, state.Run.TotalFloor, state.Run.CurrentCoord, state.Run.CurrentNode },
            player = state.Player,
            hand = state.Combat?.Hand.Select(Card).ToArray() ?? Array.Empty<object>(),
            cardZones = new {
                draw = new { count = state.Combat?.DrawPile.Count, members = (object?)null },
                discard = state.Combat?.DiscardPile.Select(Card).ToArray() ?? Array.Empty<object>(),
                exhaust = state.Combat?.ExhaustPile.Select(Card).ToArray() ?? Array.Empty<object>()
            },
            enemies = player.Creature.CombatState?.HittableEnemies.Select(e => new {
                entityInstanceId = GameBuddyRecapCapture.InstanceId(e), modelId = e.Monster?.Id.Entry,
                e.Name, hp = e.CurrentHp, e.MaxHp, e.Block, alive = e.IsAlive,
                visibleIntent = MapEnemy(e).Intent
            }).ToArray(),
            choices = new { state.Event, state.Shop, state.Reward, state.Map },
            visibility = new { hand = true, drawPileOrder = false, enemyIntent = true },
            quality = new { observationMethod = "snapshot", unknownFields = new[] {
                "cardAvailability", "settlementCompletion", "triggerAttribution", "drawPileOrder" } }
        };
    }

    private static GameBuddyState BuildSnapshot(RunState runState, Player player)
    {
        GameBuddyRecapCapture.RegisterDeck(player.Deck.Cards.Cast<object>());
        foreach (var participant in runState.Players) GameBuddyRecapCapture.RegisterEntity(participant.Creature, "Player");
        if (player.Creature.CombatState is { } battle)
            foreach (var enemy in battle.HittableEnemies) GameBuddyRecapCapture.RegisterEntity(enemy, "Enemy");
        var combat = player.PlayerCombatState;
        var combatState = CombatManager.Instance.IsInProgress && combat is not null
            ? new CombatSnapshot(
                player.Creature.CombatState?.RoundNumber ?? 0,
                MapCards(combat.Hand.Cards),
                MapCards(combat.DrawPile.Cards),
                MapCards(combat.DiscardPile.Cards),
                MapCards(combat.ExhaustPile.Cards),
                player.Creature.CombatState?.HittableEnemies.Where(enemy => enemy.IsAlive).Select(MapEnemy).ToList() ?? new List<EnemySnapshot>(),
                GameBuddyFactEmitter.ActiveCombatId, GameBuddyFactEmitter.AttemptGeneration, GameBuddyRecapCapture.Side)
            : null;

        var currentPoint = runState.CurrentMapPoint;
        var coord = runState.CurrentMapCoord;
        var mapSnapshot = BuildMapSnapshot(runState);
        var nextBossId = runState.Act.BossEncounter.Id.Entry;
        var nextBoss = runState.Act.BossEncounter.Title.GetFormattedText();
        var secondBossId = runState.Act.SecondBossEncounter?.Id.Entry;
        var secondBoss = runState.Act.SecondBossEncounter?.Title.GetFormattedText();
        var maxPotionSlots = ReadIntValue(ReadMember(player, "MaxPotionSlots", "PotionSlots", "PotionCapacity", "MaxPotions"));
        return new GameBuddyState(
            "gamebuddy.state.v1",
            DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            "sts2-mod-bridge",
            new RunSnapshot(
                runState.CurrentActIndex + 1,
                runState.ActFloor,
                runState.CurrentRoom?.RoomType.ToString(),
                player.Character.Id.Entry,
                runState.TotalFloor,
                currentPoint?.PointType.ToString(),
                coord.HasValue ? $"{coord.Value.row},{coord.Value.col}" : null,
                runState.Act.Id.Entry,
                runState.Act.Title.GetFormattedText(),
                nextBossId,
                nextBoss,
                secondBossId,
                secondBoss,
                _activeRunId,
                _activeRunStartedAt,
                ReadIntValue(ReadMember(runState, "AscensionLevel", "Ascension")),
                _maxTurnDamage,
                string.Equals(currentPoint?.PointType.ToString(), "Boss", StringComparison.OrdinalIgnoreCase) ? nextBossId : null,
                string.Equals(currentPoint?.PointType.ToString(), "Boss", StringComparison.OrdinalIgnoreCase) ? nextBoss : null),
            new PlayerSnapshot(
                player.Creature.CurrentHp,
                player.Creature.MaxHp,
                player.Creature.Block,
                player.Gold,
                combat?.Energy ?? 0,
                combat?.MaxEnergy ?? 0,
                MapCards(player.Deck.Cards),
                player.Relics.Select(relic => new OwnedItemSnapshot(relic.Id.Entry, relic.Title.GetFormattedText())).ToList(),
                player.Potions.Select(potion => new OwnedItemSnapshot(potion.Id.Entry, potion.Title.GetFormattedText())).ToList(),
                maxPotionSlots),
            combatState,
            mapSnapshot,
            BuildEventSnapshot(runState),
            BuildShopSnapshot(runState, player),
            BuildRewardSnapshot());
    }

    private static ShopSnapshot? BuildShopSnapshot(RunState runState, Player player)
    {
        try
        {
            if (runState.CurrentRoom is not MerchantRoom room)
            {
                GameBuddyRewardOverlay.ClearShop();
                return null;
            }

            MerchantInventory? inventory = room.Inventories.Find(candidate => candidate.Player == player);
            if (inventory is null)
            {
                return null;
            }

            var items = new List<ShopItemSnapshot>();
            var index = 0;
            var cardSlot = 0;
            foreach (var entry in inventory.CardEntries)
            {
                var stockKey = GameBuddyShopStock.Key("card", cardSlot);
                cardSlot++;
                var card = entry.CreationResult?.Card;
                if (card is null || !entry.IsStocked) continue;
                items.Add(MapShopItem(index++, "card", card.Id.Entry, FormatLoc(card.Title), entry, ReadTextMember(card, "Rarity", "CardRarity"),
                    ReadTextMember(card, "DynamicDescription", "Description", "CanonicalDescription", "CardDescription"), MapCard(card), stockKey));
            }
            var relicSlot = 0;
            foreach (var entry in inventory.RelicEntries)
            {
                var stockKey = GameBuddyShopStock.Key("relic", relicSlot);
                relicSlot++;
                var relic = entry.Model;
                if (relic is null || !entry.IsStocked) continue;
                items.Add(MapShopItem(index++, "relic", relic.Id.Entry, FormatLoc(relic.Title), entry, ReadTextMember(relic, "Rarity", "RelicRarity"),
                    ReadTextMember(relic, "DynamicDescription", "Description"), null, stockKey));
            }
            var potionSlot = 0;
            foreach (var entry in inventory.PotionEntries)
            {
                var stockKey = GameBuddyShopStock.Key("potion", potionSlot);
                potionSlot++;
                var potion = entry.Model;
                if (potion is null || !entry.IsStocked) continue;
                items.Add(MapShopItem(index++, "potion", potion.Id.Entry, FormatLoc(potion.Title), entry, ReadTextMember(potion, "Rarity", "PotionRarity"),
                    ReadTextMember(potion, "DynamicDescription", "Description"), null, stockKey));
            }

            var removalEntry = ReadMember(inventory, "CardRemovalEntry", "RemovalEntry", "PurgeEntry")
                ?? ReadMember(room, "CardRemovalEntry", "RemovalEntry", "PurgeEntry");
            if (removalEntry is not null && (ReadBoolMember(removalEntry, "IsStocked", "Available", "Enabled") ?? true))
            {
                items.Add(MapShopItem(index, "service", "CARD_REMOVAL", "删除一张牌", removalEntry, null,
                    "从牌组中永久删除一张牌。", null));
            }
            else
            {
                var removalPrice = ReadIntValue(ReadMember(inventory, "CardRemovalCost", "RemovalCost", "PurgeCost", "CurrentRemovalCost"))
                    ?? ReadIntValue(ReadMember(room, "CardRemovalCost", "RemovalCost", "PurgeCost", "CurrentRemovalCost"));
                if (removalPrice is not null)
                {
                    items.Add(new ShopItemSnapshot(index, "service", "CARD_REMOVAL", "删除一张牌", removalPrice,
                        removalPrice <= player.Gold, true, false, null, "从牌组中永久删除一张牌。", null));
                }
            }

            var fingerprint = $"{_activeRunId}|{player.Gold}|{string.Join("|", items.Select(item => $"{item.StockKey}:{item.Id}:{item.Price}:{item.Card?.Upgraded}"))}|{string.Join("|", player.Deck.Cards.Select(card => $"{card.Id.Entry}:{card.IsUpgraded}"))}|{string.Join("|", player.Relics.Select(relic => relic.Id.Entry))}";
            var guidanceSignature = GameBuddyRewardOverlay.SetShop(fingerprint,
                items.Where(item => item.ItemType == "card" && item.Stocked).Select(item => $"{item.Id}:{(item.Card?.Upgraded == true ? "1" : "0")}"));
            return new ShopSnapshot(player.Gold, items, guidanceSignature);
        }
        catch (Exception ex)
        {
            Log.Warn($"[GameBuddyBridge] shop capture failed: {ex.Message}");
            return null;
        }
    }

    private static ShopItemSnapshot MapShopItem(
        int index,
        string itemType,
        string id,
        string name,
        object entry,
        string? rarity,
        string? description,
        CardSnapshot? card,
        string? stockKey = null)
    {
        var price = ReadIntValue(ReadMember(entry, "Price", "Cost", "CurrentPrice", "CurrentCost", "FinalPrice", "FinalCost", "_price", "_cost"));
        var affordable = ReadBoolMember(entry, "EnoughGold", "IsAffordable") ?? false;
        var stocked = ReadBoolMember(entry, "IsStocked", "Stocked", "Available") ?? true;
        var onSale = ReadBoolMember(entry, "OnSale", "IsOnSale", "Discounted") ?? false;
        return new ShopItemSnapshot(index, itemType, id, name, price, affordable, stocked, onSale, rarity, description, card, stockKey);
    }

    private static MapSnapshot BuildMapSnapshot(RunState runState)
    {
        var visited = runState.VisitedMapCoords.Select(CoordId).ToList();
        var current = runState.CurrentMapCoord is { } currentCoord ? CoordId(currentCoord) : null;
        try
        {
            var map = runState.Map;
            if (map is null)
            {
                return EmptyMap(visited, current);
            }

            var nodes = new List<MapNodeSnapshot>();
            foreach (var point in map.GetAllMapPoints())
            {
                var children = new List<string>();
                if (point.Children is not null)
                {
                    foreach (var child in point.Children)
                    {
                        children.Add(CoordId(child.coord));
                    }
                }

                var encounter = ReadMember(point, "Encounter", "EncounterModel", "BossEncounter", "RoomModel");
                var encounterId = ReadTextMember(point, "EncounterId", "EncounterModelId")
                    ?? ReadTextMember(encounter, "Id", "Entry");
                var encounterName = ReadTextMember(point, "EncounterName")
                    ?? ReadTextMember(encounter, "Title", "Name");
                nodes.Add(new MapNodeSnapshot(
                    CoordId(point.coord),
                    point.coord.row,
                    point.coord.col,
                    MapTypeName(point.PointType),
                    children,
                    encounterId,
                    encounterName));
            }

            var byId = new Dictionary<string, MapNodeSnapshot>(StringComparer.Ordinal);
            foreach (var node in nodes)
            {
                byId[node.Id] = node;
            }

            var start = map.StartingMapPoint is { } startPoint ? CoordId(startPoint.coord) : null;
            var boss = map.BossMapPoint is { } bossPoint ? CoordId(bossPoint.coord) : null;
            var secondBoss = map.SecondBossMapPoint is { } secondBossPoint ? CoordId(secondBossPoint.coord) : null;
            if (boss is not null && byId.TryGetValue(boss, out var bossNode))
            {
                var encounter = runState.Act.BossEncounter;
                var enriched = bossNode with { EncounterId = encounter.Id.Entry, EncounterName = encounter.Title.GetFormattedText() };
                byId[boss] = enriched;
                nodes[nodes.FindIndex(node => node.Id == boss)] = enriched;
            }
            if (secondBoss is not null && byId.TryGetValue(secondBoss, out var secondBossNode) && runState.Act.SecondBossEncounter is { } secondEncounter)
            {
                var enriched = secondBossNode with { EncounterId = secondEncounter.Id.Entry, EncounterName = secondEncounter.Title.GetFormattedText() };
                byId[secondBoss] = enriched;
                nodes[nodes.FindIndex(node => node.Id == secondBoss)] = enriched;
            }
            var originCandidates = ResolveOriginIds(byId, current, start);
            var routes = new List<List<string>>();
            var truncated = false;
            foreach (var origin in originCandidates)
            {
                var found = EnumerateRoutes(byId, origin, boss, 256 - routes.Count, out var originTruncated);
                routes.AddRange(found);
                if (originTruncated)
                {
                    truncated = true;
                    break;
                }
            }

            if (!string.IsNullOrEmpty(boss))
            {
                var toBoss = routes.Where(route => route.Contains(boss)).ToList();
                if (toBoss.Count > 0) routes = toBoss;
            }

            if (routes.Count == 0 && originCandidates.Count > 0)
            {
                routes = originCandidates.Select(id => new List<string> { id }).ToList();
            }
            return new MapSnapshot(
                visited,
                current,
                start,
                boss,
                secondBoss,
                map.GetRowCount(),
                map.GetColumnCount(),
                nodes,
                routes,
                truncated);
        }
        catch (Exception ex)
        {
            Log.Warn($"[GameBuddyBridge] map capture failed: {ex.Message}");
            return EmptyMap(visited, current);
        }
    }

    private static MapSnapshot EmptyMap(List<string> visited, string? current)
    {
        return new MapSnapshot(visited, current, null, null, null, 0, 0, new List<MapNodeSnapshot>(), new List<List<string>>(), false);
    }

    private static List<string> ResolveOriginIds(
        Dictionary<string, MapNodeSnapshot> byId,
        string? current,
        string? start)
    {
        if (current is not null && byId.TryGetValue(current, out var currentNode))
        {
            var hasChild = currentNode.Children.Any(byId.ContainsKey);
            if (hasChild || (currentNode.Type != "Boss" && currentNode.Type != "Ancient"))
            {
                return new List<string> { current };
            }
        }

        if (start is not null && byId.ContainsKey(start))
        {
            return new List<string> { start };
        }

        var incoming = new HashSet<string>(StringComparer.Ordinal);
        foreach (var node in byId.Values)
        {
            foreach (var child in node.Children)
            {
                incoming.Add(child);
            }
        }

        var roots = byId.Values
            .Where(node => !incoming.Contains(node.Id) && node.Type != "Boss" && node.Type != "Ancient")
            .OrderBy(node => node.Row)
            .ThenBy(node => node.Col)
            .Select(node => node.Id)
            .ToList();
        if (roots.Count > 0) return roots;

        var choosable = byId.Values.Where(node => node.Type != "Boss" && node.Type != "Ancient").ToList();
        if (choosable.Count == 0) return new List<string>();
        var minRow = choosable.Min(node => node.Row);
        return choosable.Where(node => node.Row == minRow).Select(node => node.Id).ToList();
    }

    private static List<List<string>> EnumerateRoutes(
        Dictionary<string, MapNodeSnapshot> byId,
        string? originId,
        string? bossId,
        int maxRoutes,
        out bool truncated)
    {
        var truncatedFlag = false;
        var routes = new List<List<string>>();
        if (originId is null || !byId.ContainsKey(originId))
        {
            truncated = false;
            return routes;
        }

        var path = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);

        void Walk(string id)
        {
            if (truncatedFlag)
            {
                return;
            }

            if (!seen.Add(id))
            {
                return;
            }

            path.Add(id);
            var node = byId[id];
            var next = new List<string>();
            foreach (var child in node.Children)
            {
                if (byId.ContainsKey(child) && !seen.Contains(child))
                {
                    next.Add(child);
                }
            }

            if ((bossId is not null && id == bossId) || next.Count == 0)
            {
                if (routes.Count >= maxRoutes)
                {
                    truncatedFlag = true;
                }
                else
                {
                    routes.Add(path.ToList());
                }
            }
            else
            {
                foreach (var child in next)
                {
                    Walk(child);
                    if (truncatedFlag)
                    {
                        break;
                    }
                }
            }

            path.RemoveAt(path.Count - 1);
            seen.Remove(id);
        }

        Walk(originId);
        truncated = truncatedFlag;
        return routes;
    }

    private static string CoordId(MapCoord coord) => $"{coord.row},{coord.col}";

    private static string MapTypeName(MapPointType type) => type.ToString();

    private static object? ReadMember(object? source, params string[] names)
    {
        if (source is null) return null;
        var type = source.GetType();
        const System.Reflection.BindingFlags flags = System.Reflection.BindingFlags.Instance
            | System.Reflection.BindingFlags.Public
            | System.Reflection.BindingFlags.NonPublic
            | System.Reflection.BindingFlags.IgnoreCase;
        foreach (var name in names)
        {
            try
            {
                var property = type.GetProperty(name, flags);
                if (property is not null && property.GetIndexParameters().Length == 0)
                {
                    var value = property.GetValue(source);
                    if (value is not null) return value;
                }
                var field = type.GetField(name, flags);
                if (field?.GetValue(source) is { } fieldValue) return fieldValue;
            }
            catch
            {
                // Optional early-access metadata can move between game patches.
            }
        }
        return null;
    }

    private static string? ReadTextMember(object? source, params string[] names)
    {
        var value = ReadMember(source, names);
        if (value is null) return null;
        if (value is string text) return string.IsNullOrWhiteSpace(text) ? null : text;

        try
        {
            var formatted = value.GetType().GetMethod("GetFormattedText", Type.EmptyTypes)?.Invoke(value, null)?.ToString();
            if (!string.IsNullOrWhiteSpace(formatted)) return formatted;
        }
        catch
        {
            // Fall through to nested identifier/text properties.
        }

        var nested = ReadMember(value, "Entry", "Value", "Name");
        var result = nested?.ToString();
        return string.IsNullOrWhiteSpace(result) ? null : result;
    }

    private static bool? ReadBoolMember(object? source, params string[] names)
    {
        var value = ReadMember(source, names);
        if (value is null) return null;
        if (value is bool boolean) return boolean;
        return bool.TryParse(value.ToString(), out var parsed) ? parsed : null;
    }

    private static int? ReadIntValue(object? value)
    {
        if (value is null) return null;
        try
        {
            if (value is byte or sbyte or short or ushort or int or uint or long or ulong)
            {
                return Convert.ToInt32(value);
            }

            var amountMethod = value.GetType().GetMethod("GetAmountToSpend", Type.EmptyTypes);
            if (amountMethod?.Invoke(value, null) is { } amount)
            {
                return Convert.ToInt32(amount);
            }

            var nested = ReadMember(value, "Amount", "Value", "BaseAmount", "Cost");
            if (nested is not null && !ReferenceEquals(nested, value))
            {
                return Convert.ToInt32(nested);
            }
        }
        catch
        {
            // Optional cost metadata can move between early-access patches.
        }
        return null;
    }

    private static CardSnapshot MapCard(CardModel card)
    {
        var energyCostX = card.EnergyCost.CostsX;
        int? energyCost = energyCostX ? null : card.EnergyCost.GetAmountToSpend();
        var description = ReadTextMember(card, "DynamicDescription", "Description", "CanonicalDescription", "CardDescription");

        var starCostObject = ReadMember(card, "StarCost", "StarsCost", "StarEnergyCost", "StarCostAmount", "RequiredStars", "StarsRequired");
        var starCostX = ReadBoolMember(card, "IsXStarCost", "CostsXStars", "CostsXStar", "StarsCostX")
            ?? ReadBoolMember(starCostObject, "CostsX", "IsX")
            ?? false;
        var starCost = starCostX ? null : ReadIntValue(starCostObject);
        if (starCost <= 0) starCost = null;
        var starMetadataAvailable = starCostObject is not null
            || ReadMember(card, "IsXStarCost", "CostsXStars", "CostsXStar", "StarsCostX") is not null;

        return new CardSnapshot(
            card.Id.Entry,
            card.Title,
            card.Type.ToString(),
            energyCost,
            card.IsUpgraded,
            description,
            description is null ? "unavailable" : "runtime",
            energyCost,
            energyCostX,
            "runtime",
            starCost,
            starCostX,
            starMetadataAvailable ? "runtime" : "unavailable",
            GameBuddyRecapCapture.InstanceId(card),
            GameBuddyRecapCapture.OriginId(card));
    }

    private static List<CardSnapshot> MapCards(IEnumerable<CardModel> cards)
    {
        return cards.Select(MapCard).ToList();
    }

    private static EnemySnapshot MapEnemy(Creature enemy)
    {
        var intent = "none";
        var intentKinds = new List<string>();
        string? nextMoveId = null;
        string? nextMoveName = null;
        if (enemy.IsMonster && enemy.Monster?.NextMove is { } nextMove)
        {
            intent = string.Join(" | ", nextMove.Intents.Select(item => item.GetType().Name));
            intentKinds = nextMove.Intents
                .Select(item => NormalizeIntentKind(item.GetType().Name))
                .Where(kind => kind is not null)
                .Cast<string>()
                .Distinct()
                .ToList();
            // NextMove metadata varies between early-access builds. Read it best-effort,
            // and leave fields null rather than guessing a move from the intent.
            nextMoveId = ReadTextMember(nextMove, "MoveId", "MoveID", "Id", "ActionId");
            nextMoveName = ReadTextMember(nextMove, "MoveName", "DisplayName", "Title", "Name");
        }

        return new EnemySnapshot(enemy.Monster?.Id.Entry, enemy.Name, enemy.CurrentHp, enemy.MaxHp, enemy.Block, intent, intentKinds, enemy.IsAlive, nextMoveId, nextMoveName, GameBuddyRecapCapture.InstanceId(enemy));
    }

    private static string? NormalizeIntentKind(string typeName)
    {
        var value = typeName.ToLowerInvariant();
        if (value.Contains("heal")) return "heal";
        if (value.Contains("attack") || value.Contains("deathblow")) return "attack";
        if (value.Contains("carddebuff") || value.Contains("debuff")) return "debuff";
        if (value.Contains("status")) return "status";
        if (value.Contains("buff")) return "buff";
        if (value.Contains("defend") || value.Contains("block")) return "defend";
        if (value.Contains("summon")) return "summon";
        return null;
    }
}

public sealed record BridgeMessage<T>(string Type, T Data);
public sealed record BridgeEvent(string Type, string Name, long Timestamp, object? Data);

public sealed record GameBuddyState(string Schema, long Timestamp, string Source, RunSnapshot Run, PlayerSnapshot Player, CombatSnapshot? Combat, MapSnapshot Map, EventSnapshot? Event, ShopSnapshot? Shop, RewardSnapshot? Reward = null);
public sealed record RewardSnapshot(List<CardSnapshot> Cards, string Signature, bool CanSkip);
public sealed record EventSnapshot(string Title, string Description, string Kind, List<EventOptionSnapshot> Options, string? EventId, string? PageId);
public sealed record EventOptionSnapshot(int Index, string Label, string Description, bool Locked, string? OptionId);
public sealed record RunSnapshot(
    int Act,
    int Floor,
    string? Room,
    string Character,
    int TotalFloor,
    string? CurrentNode,
    string? CurrentCoord,
    string ActId,
    string ActName,
    string? NextBossId,
    string? NextBoss,
    string? SecondBossId,
    string? SecondBoss,
    string? RunId,
    long StartedAt,
    int? Ascension,
    int MaxTurnDamage,
    string? FinalBossId,
    string? FinalBossName);
public sealed record PlayerSnapshot(int Hp, int MaxHp, int Block, int Gold, int Energy, int MaxEnergy, List<CardSnapshot> Cards, List<OwnedItemSnapshot> Relics, List<OwnedItemSnapshot> Potions, int? MaxPotionSlots);
public sealed record CombatSnapshot(int Turn, List<CardSnapshot> Hand, List<CardSnapshot> DrawPile, List<CardSnapshot> DiscardPile, List<CardSnapshot> ExhaustPile, List<EnemySnapshot> Enemies, string? CombatId = null, int? AttemptGeneration = null, string? Side = null);
public sealed record EnemySnapshot(string? Id, string Name, int Hp, int MaxHp, int Block, string? Intent, List<string> IntentKinds, bool Alive, string? NextMoveId, string? NextMoveName, string? EntityInstanceId = null);
public sealed record CardSnapshot(
    string Id,
    string Name,
    string Type,
    int? Cost,
    bool Upgraded,
    string? Description,
    string DescriptionSource,
    int? EnergyCost,
    bool EnergyCostX,
    string EnergyCostSource,
    int? StarCost,
    bool StarCostX,
    string StarCostSource,
    string? CombatCardInstanceId = null,
    string? DeckCardInstanceId = null);
public sealed record OwnedItemSnapshot(string Id, string Name);
public sealed record ShopSnapshot(int Gold, List<ShopItemSnapshot> Items, string? GuidanceSignature = null);
public sealed record ShopItemSnapshot(int Index, string ItemType, string Id, string Name, int? Price, bool Affordable, bool Stocked, bool OnSale, string? Rarity, string? Description, CardSnapshot? Card, string? StockKey = null);
public sealed record MapSnapshot(
    List<string> Visited,
    string? Current,
    string? Start,
    string? Boss,
    string? SecondBoss,
    int Rows,
    int Cols,
    List<MapNodeSnapshot> Nodes,
    List<List<string>> Routes,
    bool RoutesTruncated);
public sealed record MapNodeSnapshot(string Id, int Row, int Col, string Type, List<string> Children, string? EncounterId, string? EncounterName);

internal sealed class GameBuddyWebSocketServer
{
    private readonly TcpListener _listener;
    private readonly List<TcpClient> _clients = new();
    private readonly Dictionary<TcpClient, SemaphoreSlim> _sendLocks = new();
    private readonly object _gate = new();
    private CancellationTokenSource _cts = new();
    private byte[]? _lastStateFrame;

    public GameBuddyWebSocketServer(int port)
    {
        _listener = new TcpListener(IPAddress.Loopback, port);
    }

    public void Start()
    {
        _listener.Start();
        _ = AcceptLoopAsync(_cts.Token);
    }

    public void BroadcastState(string json)
    {
        var frame = WebSocketFrames.Text(json);
        _lastStateFrame = frame;
        BroadcastFrame(frame);
    }

    public void BroadcastEvent(string json)
    {
        BroadcastFrame(WebSocketFrames.Text(json));
    }

    public void BroadcastFact(string json)
    {
        BroadcastFrame(WebSocketFrames.Text(json));
    }

    private void BroadcastFrame(byte[] frame)
    {
        TcpClient[] clients;
        lock (_gate) clients = _clients.ToArray();
        foreach (var client in clients) _ = SendAsync(client, frame, CancellationToken.None);
    }

    private async Task AcceptLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                var client = await _listener.AcceptTcpClientAsync(cancellationToken);
                _ = HandleClientAsync(client, cancellationToken);
            }
            catch (OperationCanceledException) { return; }
            catch (Exception ex) { Log.Warn($"[GameBuddyBridge] accept failed: {ex.Message}"); }
        }
    }

    private async Task HandleClientAsync(TcpClient client, CancellationToken cancellationToken)
    {
        try
        {
            using var stream = client.GetStream();
            var request = await ReadHttpHeadersAsync(stream, cancellationToken);
            var key = request.Headers.TryGetValue("Sec-WebSocket-Key", out var value) ? value : null;
            if (string.IsNullOrWhiteSpace(key)) return;

            var accept = Convert.ToBase64String(SHA1.HashData(Encoding.ASCII.GetBytes(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")));
            var response = $"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {accept}\r\n\r\n";
            await stream.WriteAsync(Encoding.ASCII.GetBytes(response), cancellationToken);
            lock (_gate)
            {
                _clients.Add(client);
                _sendLocks[client] = new SemaphoreSlim(1, 1);
            }
            if (_lastStateFrame is not null) await SendAsync(client, _lastStateFrame, cancellationToken);
            foreach (var pending in GameBuddyFactEmitter.PendingJson())
                await SendAsync(client, WebSocketFrames.Text(pending), cancellationToken);

            while (!cancellationToken.IsCancellationRequested && client.Connected)
            {
                var message = await WebSocketFrames.ReadTextAsync(stream, cancellationToken);
                if (message is null) break;
                if (TryReadFactAck(message, out var sourceSessionId, out var ackSourceSeq))
                {
                    GameBuddyFactEmitter.Acknowledge(sourceSessionId, ackSourceSeq);
                }
                else if (message.Contains("request_snapshot", StringComparison.Ordinal))
                {
                    if (_lastStateFrame is not null) await SendAsync(client, _lastStateFrame, cancellationToken);
                }
                else
                {
                    GameBuddyRewardOverlay.QueueImpactMessage(message);
                }
            }
        }
        catch (Exception ex) when (ex is IOException or SocketException or OperationCanceledException)
        {
            Log.Debug($"[GameBuddyBridge] client disconnected: {ex.Message}");
        }
        finally
        {
            SemaphoreSlim? sendLock;
            lock (_gate)
            {
                _clients.Remove(client);
                _sendLocks.Remove(client, out sendLock);
            }
            sendLock?.Dispose();
            client.Dispose();
        }
    }

    private static bool TryReadFactAck(string json, out string sourceSessionId, out long ackSourceSeq)
    {
        sourceSessionId = string.Empty;
        ackSourceSeq = 0;
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (!root.TryGetProperty("type", out var type) || type.GetString() != "fact_ack"
                || !root.TryGetProperty("sourceSessionId", out var session)
                || !root.TryGetProperty("ackSourceSeq", out var sequence)
                || string.IsNullOrWhiteSpace(session.GetString())
                || !sequence.TryGetInt64(out ackSourceSeq)
                || ackSourceSeq < 0)
                return false;
            sourceSessionId = session.GetString()!;
            return true;
        }
        catch
        {
            return false;
        }
    }

    private async Task SendAsync(TcpClient client, byte[] frame, CancellationToken cancellationToken)
    {
        SemaphoreSlim? sendLock;
        lock (_gate) _sendLocks.TryGetValue(client, out sendLock);
        if (sendLock is null) return;

        try
        {
            await sendLock.WaitAsync(cancellationToken);
            try { await client.GetStream().WriteAsync(frame, cancellationToken); }
            finally { sendLock.Release(); }
        }
        catch (OperationCanceledException) { }
        catch
        {
            client.Dispose();
        }
    }

    private static async Task<HttpHeaders> ReadHttpHeadersAsync(NetworkStream stream, CancellationToken cancellationToken)
    {
        var bytes = new List<byte>();
        var buffer = new byte[1024];
        while (bytes.Count < 16 * 1024)
        {
            var read = await stream.ReadAsync(buffer, cancellationToken);
            if (read == 0) break;
            bytes.AddRange(buffer.AsSpan(0, read).ToArray());
            if (bytes.Count >= 4 && bytes[^4] == '\r' && bytes[^3] == '\n' && bytes[^2] == '\r' && bytes[^1] == '\n') break;
        }

        var lines = Encoding.ASCII.GetString(bytes.ToArray()).Split("\r\n", StringSplitOptions.RemoveEmptyEntries);
        var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var line in lines.Skip(1))
        {
            var separator = line.IndexOf(':');
            if (separator > 0) headers[line[..separator].Trim()] = line[(separator + 1)..].Trim();
        }
        return new HttpHeaders(headers);
    }

    private sealed record HttpHeaders(Dictionary<string, string> Headers);
}

internal static class WebSocketFrames
{
    public static byte[] Text(string value)
    {
        var payload = Encoding.UTF8.GetBytes(value);
        using var stream = new MemoryStream();
        stream.WriteByte(0x81);
        if (payload.Length < 126) stream.WriteByte((byte)payload.Length);
        else if (payload.Length <= ushort.MaxValue) { stream.WriteByte(126); stream.WriteByte((byte)(payload.Length >> 8)); stream.WriteByte((byte)payload.Length); }
        else { stream.WriteByte(127); for (var shift = 56; shift >= 0; shift -= 8) stream.WriteByte((byte)((long)payload.Length >> shift)); }
        stream.Write(payload);
        return stream.ToArray();
    }

    public static async Task<string?> ReadTextAsync(NetworkStream stream, CancellationToken cancellationToken)
    {
        var header = await ReadExactAsync(stream, 2, cancellationToken);
        if (header is null) return null;
        var opcode = header[0] & 0x0F;
        if (opcode == 0x8) return null;
        var masked = (header[1] & 0x80) != 0;
        var length = header[1] & 0x7F;
        if (length == 126) { var data = await ReadExactAsync(stream, 2, cancellationToken); if (data is null) return null; length = (data[0] << 8) | data[1]; }
        else if (length == 127) return null;
        var mask = masked ? await ReadExactAsync(stream, 4, cancellationToken) : null;
        var payload = await ReadExactAsync(stream, length, cancellationToken);
        if (payload is null) return null;
        if (mask is not null) for (var i = 0; i < payload.Length; i++) payload[i] ^= mask[i % 4];
        return Encoding.UTF8.GetString(payload);
    }

    private static async Task<byte[]?> ReadExactAsync(NetworkStream stream, int count, CancellationToken cancellationToken)
    {
        var result = new byte[count];
        var offset = 0;
        while (offset < count)
        {
            var read = await stream.ReadAsync(result.AsMemory(offset, count - offset), cancellationToken);
            if (read == 0) return null;
            offset += read;
        }
        return result;
    }
}
