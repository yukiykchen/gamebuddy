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
using MegaCrit.Sts2.Core.Entities.Players;
using MegaCrit.Sts2.Core.Logging;
using MegaCrit.Sts2.Core.Map;
using MegaCrit.Sts2.Core.MonsterMoves.Intents;
using MegaCrit.Sts2.Core.Models;
using MegaCrit.Sts2.Core.Nodes.Screens;
using MegaCrit.Sts2.Core.Nodes.Screens.Map;
using MegaCrit.Sts2.Core.Nodes.Rewards;
using MegaCrit.Sts2.Core.Rooms;
using MegaCrit.Sts2.Core.Rewards;
using MegaCrit.Sts2.Core.Runs;

namespace RunmateBridge.Scripts;

public static class RunmateExporter
{
    private const int Port = 27182;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never
    };

    private static readonly object Gate = new();
    private static RunmateWebSocketServer? _server;
    private static string _lastSignature = string.Empty;
    private static bool _wasInCombat;
    private static int _lastTurn = -1;
    private static bool _wasMapVisible;

    public static void Initialize(string modDirectory)
    {
        lock (Gate)
        {
            if (_server is not null)
            {
                return;
            }

            _server = new RunmateWebSocketServer(Port);
            _server.Start();
            Log.Info($"[RunmateBridge] WebSocket server listening on 127.0.0.1:{Port}");
        }
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

            var snapshot = BuildSnapshot(runState, player);
            var json = JsonSerializer.Serialize(new BridgeMessage<RunmateState>("state", snapshot), JsonOptions);
            var signature = JsonSerializer.Serialize(snapshot with { Timestamp = 0 }, JsonOptions);
            if (!string.Equals(signature, _lastSignature, StringComparison.Ordinal))
            {
                _lastSignature = signature;
                _server?.BroadcastState(json);
            }

            PublishTransitions(snapshot);
        }
        catch (Exception ex)
        {
            Log.Warn($"[RunmateBridge] state capture failed: {ex.Message}");
        }
    }

    private static void PublishTransitions(RunmateState snapshot)
    {
        var inCombat = snapshot.Combat is not null;
        var mapVisible = NMapScreen.Instance?.IsVisibleInTree() == true;

        if (inCombat && !_wasInCombat) PublishEvent("combat.started");
        if (!inCombat && _wasInCombat) PublishEvent("combat.ended");
        if (inCombat && snapshot.Combat?.Turn is int turn && turn != _lastTurn)
        {
            PublishEvent("turn.started", new { turn });
            _lastTurn = turn;
        }
        if (mapVisible && !_wasMapVisible) PublishEvent("map.opened");

        _wasInCombat = inCombat;
        _wasMapVisible = mapVisible;
    }

    private static void PublishEvent(string name, object? data = null)
    {
        var message = JsonSerializer.Serialize(new BridgeEvent("event", name, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), data), JsonOptions);
        _server?.BroadcastEvent(message);
    }

    private static RunmateState BuildSnapshot(RunState runState, Player player)
    {
        var combat = player.PlayerCombatState;
        var combatState = CombatManager.Instance.IsInProgress && combat is not null
            ? new CombatSnapshot(
                player.Creature.CombatState?.RoundNumber ?? 0,
                MapCards(combat.Hand.Cards),
                MapCards(combat.DrawPile.Cards),
                MapCards(combat.DiscardPile.Cards),
                MapCards(combat.ExhaustPile.Cards),
                player.Creature.CombatState?.HittableEnemies.Where(enemy => enemy.IsAlive).Select(MapEnemy).ToList() ?? new List<EnemySnapshot>())
            : null;

        var currentPoint = runState.CurrentMapPoint;
        var coord = runState.CurrentMapCoord;
        var eventId = ExtractEventId(runState);
        var rewards = ExtractVisibleRewards();
        var mapNodes = ExtractTravelableMapNodes(runState, coord);
        return new RunmateState(
            "runmate.state.v1",
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
                eventId),
            new PlayerSnapshot(
                player.Creature.CurrentHp,
                player.Creature.MaxHp,
                player.Creature.Block,
                player.Gold,
                combat?.Energy ?? 0,
                combat?.MaxEnergy ?? 0,
                MapCards(player.Deck.Cards),
                player.Relics.Select(relic => relic.Title?.ToString()).Where(v => v != null).Select(v => v!).ToList(),
                player.Potions.Select(potion => potion.Title?.ToString()).Where(v => v != null).Select(v => v!).ToList()),
            combatState,
            rewards,
            new MapSnapshot(
                runState.VisitedMapCoords.Select(value => $"{value.row},{value.col}").ToList(),
                mapNodes));
    }

    private static string? ExtractEventId(RunState runState)
    {
        try
        {
            var room = runState.CurrentRoom;
            if (room is not EventRoom eventRoom) return null;
            return eventRoom.CanonicalEvent?.Id?.Entry;
        }
        catch { return null; }
    }

    private static T? FindScreen<T>() where T : Godot.GodotObject
    {
        var tree = Godot.Engine.GetMainLoop() as Godot.SceneTree;
        var root = tree?.Root;
        if (root is null) return null;
        return root.FindChildren("*", nameof(T), true, false).OfType<T>().FirstOrDefault();
    }

    private static object? GetLinkedReward(NLinkedRewardSet setNode)
    {
        var method = setNode.GetType().GetMethod("GetReward", System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        return method?.Invoke(setNode, null);
    }

    private static List<RewardSnapshot> ExtractVisibleRewards()
    {
        var list = new List<RewardSnapshot>();
        try
        {
            var screen = FindScreen<NRewardsScreen>();
            if (screen is null || !screen.IsVisibleInTree()) return list;
            foreach (var setNode in screen.GetChildren().OfType<NLinkedRewardSet>())
            {
                var reward = GetLinkedReward(setNode);
                if (reward is null) continue;
                var typeName = reward.GetType().Name;
                var kind = typeName.Replace("Reward", "").ToLowerInvariant();
                string? id = null;
                string? name = null;
                switch (reward)
                {
                    case CardReward:
                        kind = "card";
                        (id, name) = DescribeCardReward(reward);
                        break;
                    case RelicReward:
                        kind = "relic";
                        (id, name) = DescribeRelicReward(reward);
                        break;
                }
                list.Add(new RewardSnapshot(id, name, kind));
            }
        }
        catch { }
        return list;
    }

    private static (string? Id, string? Name) DescribeCardReward(object reward)
    {
        try
        {
            var prop = reward.GetType().GetProperty("Cards")
                ?? reward.GetType().GetProperty("CardsList")
                ?? reward.GetType().GetProperty("Options");
            if (prop?.GetValue(reward) is not System.Collections.IEnumerable cards) return (null, null);
            var ids = new List<string>();
            foreach (var card in cards)
            {
                if (card is null) continue;
                var idProp = card.GetType().GetProperty("Id");
                var idValue = idProp?.GetValue(card);
                var entry = idValue?.GetType().GetProperty("Entry")?.GetValue(idValue) as string;
                if (!string.IsNullOrEmpty(entry)) ids.Add(entry);
            }
            if (ids.Count == 0) return (null, null);
            return (ids[0], string.Join("|", ids));
        }
        catch { return (null, null); }
    }

    private static (string? Id, string? Name) DescribeRelicReward(object reward)
    {
        try
        {
            foreach (var fieldName in new[] { "_relic", "_predeterminedRelic", "_relicModel" })
            {
                var field = reward.GetType().GetField(fieldName, System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Public);
                var relic = field?.GetValue(reward);
                if (relic is null) continue;
                var idProp = relic.GetType().GetProperty("Id");
                var idValue = idProp?.GetValue(relic);
                var entry = idValue?.GetType().GetProperty("Entry")?.GetValue(idValue) as string;
                if (!string.IsNullOrEmpty(entry)) return (entry, entry);
            }
            return (null, null);
        }
        catch { return (null, null); }
    }

    private static List<MapNodeSnapshot> ExtractTravelableMapNodes(RunState runState, MapCoord? currentCoord)
    {
        var nodes = new List<MapNodeSnapshot>();
        try
        {
            if (!currentCoord.HasValue) return nodes;
            var currentPoint = runState.CurrentMapPoint;
            if (currentPoint is null) return nodes;
            var travelable = MapTravel.GetTravelablePointsFrom(runState, currentPoint);
            if (travelable is null) return nodes;
            foreach (var point in travelable)
            {
                var coordProp = point.GetType().GetProperty("Coord") ?? point.GetType().GetProperty("MapCoord");
                var pointCoord = coordProp?.GetValue(point);
                var row = pointCoord?.GetType().GetField("row")?.GetValue(pointCoord) ?? pointCoord?.GetType().GetProperty("row")?.GetValue(pointCoord);
                var col = pointCoord?.GetType().GetField("col")?.GetValue(pointCoord) ?? pointCoord?.GetType().GetProperty("col")?.GetValue(pointCoord);
                var roomTypeProp = point.GetType().GetProperty("RoomType");
                var roomType = roomTypeProp?.GetValue(point) as System.Enum;
                nodes.Add(new MapNodeSnapshot(
                    $"{row},{col}",
                    point.PointType.ToString(),
                    roomType?.ToString()));
            }
        }
        catch { }
        return nodes;
    }

    private static List<CardSnapshot> MapCards(IEnumerable<CardModel> cards)
    {
        return cards.Select(card => new CardSnapshot(
            card.Id.Entry,
            card.Title,
            card.Type.ToString(),
            card.EnergyCost.CostsX ? null : card.EnergyCost.GetAmountToSpend(),
            card.IsUpgraded)).ToList();
    }

    private static EnemySnapshot MapEnemy(Creature enemy)
    {
        var intent = "none";
        var damage = 0;
        if (enemy.IsMonster && enemy.Monster?.NextMove is not null)
        {
            intent = string.Join(" | ", enemy.Monster.NextMove.Intents.Select(item => item.GetType().Name));
            var allies = enemy.CombatState?.Allies;
            if (allies is not null)
            {
                foreach (var item in enemy.Monster.NextMove.Intents.OfType<AttackIntent>())
                {
                    try { damage += item.GetTotalDamage(allies, enemy); }
                    catch { /* The game may not have finished applying modifiers yet. */ }
                }
            }
        }

        return new EnemySnapshot(enemy.Name, enemy.CurrentHp, enemy.MaxHp, enemy.Block, intent, damage, enemy.IsAlive);
    }
}

public sealed record BridgeMessage<T>(string Type, T Data);
public sealed record BridgeEvent(string Type, string Name, long Timestamp, object? Data);

public sealed record RunmateState(string Schema, long Timestamp, string Source, RunSnapshot Run, PlayerSnapshot Player, CombatSnapshot? Combat, List<RewardSnapshot> Rewards, MapSnapshot Map);
public sealed record RunSnapshot(int Act, int Floor, string? Room, string Character, int TotalFloor, string? CurrentNode, string? CurrentCoord, string? EventId);
public sealed record PlayerSnapshot(int Hp, int MaxHp, int Block, int Gold, int Energy, int MaxEnergy, List<CardSnapshot> Cards, List<string> Relics, List<string> Potions);
public sealed record CombatSnapshot(int Turn, List<CardSnapshot> Hand, List<CardSnapshot> DrawPile, List<CardSnapshot> DiscardPile, List<CardSnapshot> ExhaustPile, List<EnemySnapshot> Enemies);
public sealed record EnemySnapshot(string Name, int Hp, int MaxHp, int Block, string? Intent, int Damage, bool Alive);
public sealed record CardSnapshot(string Id, string Name, string Type, int? Cost, bool Upgraded);
public sealed record MapSnapshot(List<string> Visited, List<MapNodeSnapshot>? Nodes);
public sealed record RewardSnapshot(string? Id, string? Name, string Kind);
public sealed record MapNodeSnapshot(string Coord, string PointType, string? RoomType);

internal sealed class RunmateWebSocketServer
{
    private readonly TcpListener _listener;
    private readonly List<TcpClient> _clients = new();
    private readonly Dictionary<TcpClient, SemaphoreSlim> _sendLocks = new();
    private readonly object _gate = new();
    private CancellationTokenSource _cts = new();
    private byte[]? _lastStateFrame;

    public RunmateWebSocketServer(int port)
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
            catch (Exception ex) { Log.Warn($"[RunmateBridge] accept failed: {ex.Message}"); }
        }
    }

    private static void HandleHighlightMapNodes(string json)
    {
        try
        {
            var doc = System.Text.Json.JsonDocument.Parse(json);
            var coords = doc.RootElement.GetProperty("coords").EnumerateArray()
                .Select(v => v.GetString())
                .Where(v => !string.IsNullOrEmpty(v))
                .Select(v =>
                {
                    var parts = v!.Split(',');
                    return (row: int.Parse(parts[0]), col: int.Parse(parts[1]));
                })
                .ToHashSet();
            HighlightMapCoords(coords);
        }
        catch (Exception ex)
        {
            Log.Warn($"[RunmateBridge] highlight failed: {ex.Message}");
        }
    }

    private static void HighlightMapCoords(HashSet<(int row, int col)> coords)
    {
        if (!coords.Any()) return;
        var screen = FindMapScreen();
        if (screen is null) return;
        // The NMapScreen stores map point nodes in a private dictionary keyed by MapCoord.
        // We reflect over all instance fields to find one whose key type matches MapCoord.
        var fields = screen.GetType().GetFields(System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Public);
        foreach (var field in fields)
        {
            var fieldType = field.FieldType;
            if (!fieldType.IsGenericType || fieldType.GetGenericTypeDefinition() != typeof(System.Collections.Generic.Dictionary<,>)) continue;
            var args = fieldType.GetGenericArguments();
            if (args[0] != typeof(MapCoord)) continue;
            var dict = field.GetValue(screen);
            if (dict is null) continue;
            var keysProp = fieldType.GetProperty("Keys");
            var indexer = fieldType.GetProperty("Item");
            if (keysProp?.GetValue(dict) is not System.Collections.IEnumerable keys || indexer is null) continue;
            foreach (var key in keys)
            {
                var rowField = key.GetType().GetField("row");
                var rowProperty = key.GetType().GetProperty("row");
                var colField = key.GetType().GetField("col");
                var colProperty = key.GetType().GetProperty("col");
                var rowObj = rowField?.GetValue(key) ?? rowProperty?.GetValue(key);
                var colObj = colField?.GetValue(key) ?? colProperty?.GetValue(key);
                if (rowObj is null || colObj is null) continue;
                var row = Convert.ToInt32(rowObj);
                var col = Convert.ToInt32(colObj);
                if (!coords.Contains((row, col))) continue;
                var point = indexer.GetValue(dict, new object[] { key });
                if (point is null) continue;
                TryHighlightPoint(point);
            }
            return;
        }
        Log.Info("[RunmateBridge] no map point dictionary field found on NMapScreen");
    }

    private static void TryHighlightPoint(object point)
    {
        // Prefer the game's own highlight mechanism, then fall back to the State property.
        try
        {
            var screen = FindMapScreen();
            if (screen is not null)
            {
                var highlightMethod = screen.GetType().GetMethod("HighlightPointType", System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
                // HighlightPointType highlights by type, not coord, so only use it when we cannot set State.
            }
        }
        catch { }
        try
        {
            var stateProp = point.GetType().GetProperty("State");
            if (stateProp is null || !stateProp.CanWrite) return;
            var enumType = stateProp.PropertyType;
            if (!enumType.IsEnum) return;
            var names = System.Enum.GetNames(enumType);
            var preferred = new[] { "Highlighted", "Travelable", "Selectable", "Recommended", "Available" };
            foreach (var name in preferred)
            {
                if (!names.Contains(name, StringComparer.OrdinalIgnoreCase)) continue;
                var value = System.Enum.Parse(enumType, name);
                stateProp.SetValue(point, value);
                return;
            }
        }
        catch (Exception ex)
        {
            Log.Warn($"[RunmateBridge] point highlight failed: {ex.Message}");
        }
    }

    private static NMapScreen? FindMapScreen()
    {
        var tree = Engine.GetMainLoop() as SceneTree;
        var root = tree?.Root;
        if (root is null) return null;
        return root.FindChildren("*", nameof(NMapScreen), true, false).OfType<NMapScreen>().FirstOrDefault();
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

            while (!cancellationToken.IsCancellationRequested && client.Connected)
            {
                var message = await WebSocketFrames.ReadTextAsync(stream, cancellationToken);
                if (message is null) break;
                if (message.Contains("request_snapshot", StringComparison.Ordinal))
                {
                    if (_lastStateFrame is not null) await SendAsync(client, _lastStateFrame, cancellationToken);
                }
                else if (message.Contains("highlight_map_nodes", StringComparison.Ordinal))
                {
                    HandleHighlightMapNodes(message);
                }
            }
        }
        catch (Exception ex) when (ex is IOException or SocketException or OperationCanceledException)
        {
            Log.Debug($"[RunmateBridge] client disconnected: {ex.Message}");
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
