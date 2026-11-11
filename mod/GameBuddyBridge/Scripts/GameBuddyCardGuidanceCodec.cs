using System.Text.Json;

namespace GameBuddyBridge.Scripts;

internal sealed record CardSystemGuidance(string SystemId, string SystemName, string Role, string Shortfall, string Advice, bool Conflict);
internal sealed record CardGuidance(string CardId, string Key, bool Upgraded, IReadOnlyList<CardSystemGuidance> Systems);
internal sealed record CardGuidanceMessage(string Context, string Signature, string DeckSignature, IReadOnlyDictionary<string, CardGuidance> Cards);

internal static class GameBuddyCardGuidanceCodec
{
    private static string? Text(JsonElement item, string name, int max)
    {
        if (!item.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.String) return null;
        var text = value.GetString();
        return string.IsNullOrWhiteSpace(text) || text.Length > max || text.Any(char.IsControl) ? null : text;
    }

    public static bool TryParse(string json, out CardGuidanceMessage? message)
    {
        message = null;
        if (json.Length > 512_000) return false;
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object || Text(root, "type", 30) != "card_guidance") return false;
            var context = Text(root, "context", 10);
            var signature = Text(root, "signature", 4096);
            var deck = Text(root, "deckSignature", 128);
            if (context is not ("reward" or "shop") || signature is null || deck is null
                || !root.TryGetProperty("cards", out var cards) || cards.ValueKind != JsonValueKind.Array || cards.GetArrayLength() > 64) return false;
            var parsed = new Dictionary<string, CardGuidance>(StringComparer.OrdinalIgnoreCase);
            foreach (var card in cards.EnumerateArray())
            {
                var id = Text(card, "cardId", 128); var key = Text(card, "key", 140);
                if (id is null || key is null || !card.TryGetProperty("upgraded", out var upgraded)
                    || upgraded.ValueKind is not (JsonValueKind.True or JsonValueKind.False)
                    || !card.TryGetProperty("systems", out var systems) || systems.ValueKind != JsonValueKind.Array
                    || systems.GetArrayLength() > 16) return false;
                var rows = new List<CardSystemGuidance>(); var seen = new HashSet<string>();
                foreach (var system in systems.EnumerateArray())
                {
                    var systemId = Text(system, "systemId", 128); var name = Text(system, "systemName", 80);
                    var role = Text(system, "role", 100); var shortfall = Text(system, "shortfall", 220); var advice = Text(system, "advice", 220);
                    if (systemId is null || name is null || role is null || shortfall is null || advice is null || !seen.Add(systemId)
                        || !system.TryGetProperty("conflict", out var conflict) || conflict.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return false;
                    rows.Add(new(systemId, name, role, shortfall, advice, conflict.GetBoolean()));
                }
                // 同名同升级可出现多个库存槽，它们共享同一条教学。
                var value = new CardGuidance(id, key, upgraded.GetBoolean(), rows);
                if (parsed.TryGetValue(key, out var existing) && JsonSerializer.Serialize(existing) != JsonSerializer.Serialize(value)) return false;
                parsed[key] = value;
            }
            message = new(context, signature, deck, parsed);
            return true;
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or ArgumentException) { return false; }
    }
}

internal sealed class CardGuidanceContext
{
    public string Context { get; private set; } = string.Empty;
    public string Signature { get; private set; } = string.Empty;
    public HashSet<string> Keys { get; private set; } = new(StringComparer.OrdinalIgnoreCase);
    public void Set(string context, string signature, IEnumerable<string> keys)
    { Context = context; Signature = signature; Keys = new(keys, StringComparer.OrdinalIgnoreCase); }
    public void Clear() => Set(string.Empty, string.Empty, []);
    public bool Accepts(CardGuidanceMessage message) => Context == message.Context && Signature == message.Signature
        && message.Cards.Count == Keys.Count && message.Cards.Keys.All(Keys.Contains);
}
