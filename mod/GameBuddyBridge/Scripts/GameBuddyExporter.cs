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
using MegaCrit.Sts2.Core.Models;
using MegaCrit.Sts2.Core.MonsterMoves.Intents;
using MegaCrit.Sts2.Core.Map;
using MegaCrit.Sts2.Core.Nodes.Screens.Map;
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
    private static bool _wasMapVisible;
    private static bool _wasAtRest;

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

            var snapshot = BuildSnapshot(runState, player);
            var json = JsonSerializer.Serialize(new BridgeMessage<GameBuddyState>("state", snapshot), JsonOptions);
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
            Log.Warn($"[GameBuddyBridge] state capture failed: {ex.Message}");
        }
    }

    private static void PublishTransitions(GameBuddyState snapshot)
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

        var atRest = !inCombat
            && string.Equals(snapshot.Run.CurrentNode, "RestSite", StringComparison.OrdinalIgnoreCase)
            && !mapVisible;
        if (atRest && !_wasAtRest) PublishEvent("rest.opened");

        _wasInCombat = inCombat;
        _wasMapVisible = mapVisible;
        _wasAtRest = atRest;
    }

    private static void PublishEvent(string name, object? data = null)
    {
        var message = JsonSerializer.Serialize(new BridgeEvent("event", name, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), data), JsonOptions);
        _server?.BroadcastEvent(message);
    }

    private static GameBuddyState BuildSnapshot(RunState runState, Player player)
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
                coord.HasValue ? $"{coord.Value.row},{coord.Value.col}" : null),
            new PlayerSnapshot(
                player.Creature.CurrentHp,
                player.Creature.MaxHp,
                player.Creature.Block,
                player.Gold,
                combat?.Energy ?? 0,
                combat?.MaxEnergy ?? 0,
                MapCards(player.Deck.Cards),
                player.Relics.Select(relic => relic.Title.GetFormattedText()).ToList(),
                player.Potions.Select(potion => potion.Title.GetFormattedText()).ToList()),
            combatState,
            BuildMapSnapshot(runState));
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

                nodes.Add(new MapNodeSnapshot(
                    CoordId(point.coord),
                    point.coord.row,
                    point.coord.col,
                    MapTypeName(point.PointType),
                    children));
            }

            var byId = new Dictionary<string, MapNodeSnapshot>(StringComparer.Ordinal);
            foreach (var node in nodes)
            {
                byId[node.Id] = node;
            }

            var start = map.StartingMapPoint is { } startPoint ? CoordId(startPoint.coord) : null;
            var boss = map.BossMapPoint is { } bossPoint ? CoordId(bossPoint.coord) : null;
            var secondBoss = map.SecondBossMapPoint is { } secondBossPoint ? CoordId(secondBossPoint.coord) : null;
            var origin = current is not null && byId.ContainsKey(current) ? current : start;
            var routes = EnumerateRoutes(byId, origin, boss, 256, out var truncated);
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

public sealed record GameBuddyState(string Schema, long Timestamp, string Source, RunSnapshot Run, PlayerSnapshot Player, CombatSnapshot? Combat, MapSnapshot Map);
public sealed record RunSnapshot(int Act, int Floor, string? Room, string Character, int TotalFloor, string? CurrentNode, string? CurrentCoord);
public sealed record PlayerSnapshot(int Hp, int MaxHp, int Block, int Gold, int Energy, int MaxEnergy, List<CardSnapshot> Cards, List<string> Relics, List<string> Potions);
public sealed record CombatSnapshot(int Turn, List<CardSnapshot> Hand, List<CardSnapshot> DrawPile, List<CardSnapshot> DiscardPile, List<CardSnapshot> ExhaustPile, List<EnemySnapshot> Enemies);
public sealed record EnemySnapshot(string Name, int Hp, int MaxHp, int Block, string? Intent, int Damage, bool Alive);
public sealed record CardSnapshot(string Id, string Name, string Type, int? Cost, bool Upgraded);
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
public sealed record MapNodeSnapshot(string Id, int Row, int Col, string Type, List<string> Children);

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

            while (!cancellationToken.IsCancellationRequested && client.Connected)
            {
                var message = await WebSocketFrames.ReadTextAsync(stream, cancellationToken);
                if (message is null) break;
                if (message.Contains("request_snapshot", StringComparison.Ordinal))
                {
                    if (_lastStateFrame is not null) await SendAsync(client, _lastStateFrame, cancellationToken);
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
