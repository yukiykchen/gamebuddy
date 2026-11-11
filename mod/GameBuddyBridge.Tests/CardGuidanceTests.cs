using System.Text.Json;
using GameBuddyBridge.Scripts;

internal static class CardGuidanceTests
{
    public static void Run()
    {
        static void Check(bool condition, string error) { if (!condition) throw new Exception(error); }
        var row = new { systemId = "silent:shiv", systemName = "小刀流", role = "小刀增伤", shortfall = "缺少小刀来源。", advice = "寻找刀刃之舞。", conflict = false };
        var cards = new[] {
            new { cardId = "ACCURACY", key = "ACCURACY:0", upgraded = false, systems = new[] { row } },
            new { cardId = "ACCURACY", key = "ACCURACY:1", upgraded = true, systems = new[] { row } }
        };
        var json = JsonSerializer.Serialize(new { type = "card_guidance", context = "reward", signature = "offer-1", deckSignature = "deck-1", cards });
        Check(GameBuddyCardGuidanceCodec.TryParse(json, out var parsed) && parsed is not null, "Guidance parse failed");
        Check(parsed!.Cards.Count == 2, "Upgrade variants must remain separate");
        var context = new CardGuidanceContext(); context.Set("reward", "offer-1", ["ACCURACY:0", "ACCURACY:1"]);
        Check(context.Accepts(parsed), "Current context rejected");
        context.Set("reward", "offer-2", ["ACCURACY:0", "ACCURACY:1"]);
        Check(!context.Accepts(parsed), "Old offer accepted");
        context.Set("shop", "offer-1", ["ACCURACY:0", "ACCURACY:1"]);
        Check(!context.Accepts(parsed), "Wrong surface accepted");
        context.Set("reward", "offer-1", ["ACCURACY:0"]);
        Check(!context.Accepts(parsed), "Sold or removed variant accepted");
        context.Clear(); Check(!context.Accepts(parsed), "Closed context accepted");
        var empty = System.Text.Json.Nodes.JsonNode.Parse(json)!;
        empty["cards"]![0]!["systems"]![0]!["shortfall"] = "";
        Check(!GameBuddyCardGuidanceCodec.TryParse(empty.ToJsonString(), out _), "Empty diagnosis accepted");
        Check(!GameBuddyCardGuidanceCodec.TryParse(json.Replace("card_guidance", "draft_impact"), out _), "Old score protocol accepted");
        Check(!GameBuddyCardGuidanceCodec.TryParse("{\"cards\": [null]}", out _), "Malformed protocol accepted");
        var silent = System.Text.Json.Nodes.JsonNode.Parse(json)!;
        silent["cards"]![0]!["systems"] = new System.Text.Json.Nodes.JsonArray();
        Check(GameBuddyCardGuidanceCodec.TryParse(silent.ToJsonString(), out var mixed) && mixed!.Cards.Count == 2, "Empty card must not reject related candidates");
        Check(mixed!.Cards["ACCURACY:0"].Systems.Count == 0, "Silent candidate gained a fake system");
        context.Set("reward", "offer-1", ["ACCURACY:0", "ACCURACY:1"]);
        Check(context.Accepts(mixed), "Silent candidate must remain in context key validation");
        var fixture = Environment.GetEnvironmentVariable("GAMEBUDDY_GUIDANCE_FIXTURE");
        if (!string.IsNullOrEmpty(fixture))
        {
            using var messages = JsonDocument.Parse(File.ReadAllText(fixture));
            foreach (var item in messages.RootElement.EnumerateArray())
            {
                Check(GameBuddyCardGuidanceCodec.TryParse(item.GetRawText(), out var actual) && actual is not null, "Actual JS guidance rejected");
                context.Set(actual!.Context, actual.Signature, actual.Cards.Keys);
                Check(context.Accepts(actual), "Actual JS context rejected");
            }
            Console.WriteLine("Actual five-character JS guidance replay passed.");
        }
        var rewardPosition = GameBuddyGuidancePlacement.Place(800, 500, 300, 450, 420, 200, 0, 0, 1920, 1080);
        Check(rewardPosition == (740f, 282f), "Reward guidance must sit 18px above the visible card");
        var topCard = GameBuddyGuidancePlacement.Place(500, 100, 250, 350, 420, 300, 0, 0, 1920, 1080);
        Check(topCard == (768f, 100f), "Top-row shop card must use available right side");
        var rightCard = GameBuddyGuidancePlacement.Place(1600, 100, 250, 350, 420, 300, 0, 0, 1920, 1080);
        Check(rightCard == (1162f, 100f), "Right edge must use available left side");
        var tallPanel = GameBuddyGuidancePlacement.Place(0, 600, 300, 400, 420, 420, 0, 0, 1280, 720);
        Check(tallPanel == (12f, 162f), "Tall multi-system panel must remain above the card inside screen");
        var narrow = GameBuddyGuidancePlacement.Place(20, 20, 220, 300, 236, 200, 0, 0, 260, 600);
        Check(narrow == (12f, 338f), "Narrow viewport should use space below card before overlapping");
        Console.WriteLine("Card guidance codec/context and placement checks passed.");
    }
}
