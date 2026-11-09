using System.Reflection;
using HarmonyLib;

namespace GameBuddyBridge.Scripts;

public static class GameBuddySelectionFactPatches
{
    public static void Apply(Harmony harmony, string modDirectory)
    {
        PatchFirstType(harmony, [
            "MegaCrit.Sts2.Core.Rewards.CardReward",
            "MegaCrit.Sts2.Core.Models.Rewards.CardReward"
        ], "OnSkipped", nameof(CardRewardSkippedPostfix), modDirectory);

        var hook = AccessTools.TypeByName("MegaCrit.Sts2.Core.Hooks.Hook")
            ?? AccessTools.TypeByName("MegaCrit.Sts2.Core.Hook");
        if (hook is not null)
        {
            PatchNamed(harmony, hook, "AfterRewardTaken", nameof(RewardTakenPostfix), modDirectory);
            PatchNamed(harmony, hook, "AfterItemPurchased", nameof(ItemPurchasedPostfix), modDirectory);
            PatchNamed(harmony, hook, "AfterRestSiteHeal", nameof(RestHealPostfix), modDirectory);
            PatchNamed(harmony, hook, "AfterRestSiteSmith", nameof(RestSmithPostfix), modDirectory);
        }

        var runManager = AccessTools.TypeByName("MegaCrit.Sts2.Core.Runs.RunManager");
        if (runManager is not null)
            PatchNamed(harmony, runManager, "EnterMapCoord", nameof(RouteSelectedPostfix), modDirectory);

        PatchFirstType(harmony, [
            "MegaCrit.Sts2.Core.Models.Events.EventOption",
            "MegaCrit.Sts2.Core.Events.EventOption"
        ], "Chosen", nameof(EventOptionChosenPostfix), modDirectory);
        GameBuddyHookCapabilityRegistry.Partial("decisions", "choice offers are captured; some result details may be unknown");
    }

    public static void CardRewardSkippedPostfix() => GameBuddyExporter.ResolveCardRewardSkipped();

    public static void RewardTakenPostfix(object[] __args)
    {
        GameBuddyExporter.ResolveCardRewardTaken(__args.FirstOrDefault());
    }

    public static void RouteSelectedPostfix(object[] __args)
    {
        GameBuddyExporter.PublishRouteSelected(__args.FirstOrDefault());
    }

    public static void ItemPurchasedPostfix(object[] __args)
    {
        var item = __args.FirstOrDefault(value => value is not null && new[] { "Card", "Relic", "Potion", "ShopEntry" }.Any(kind => value.GetType().Name.Contains(kind, StringComparison.OrdinalIgnoreCase)));
        var decisionId = GameBuddyExporter.CurrentShopDecisionId;
        var actionId = $"shop:{Guid.NewGuid():N}";
        GameBuddyFactEmitter.Publish("shop.transaction_completed", new
        {
            shopVisitId = decisionId,
            beforeSnapshotId = GameBuddyRecapCapture.BeforeDecision(decisionId),
            afterSnapshotId = GameBuddyRecapCapture.Capture("shop_purchase_observed", actionId, decisionId),
            itemInstanceId = GameBuddyRecapCapture.InstanceId(item),
            itemId = GameBuddyFactProjection.ModelId(item),
            itemType = item?.GetType().Name,
            price = FindInteger(__args),
            status = "completed"
        }, decisionId: decisionId, actionId: actionId, observationMethod: "direct_hook");
    }

    public static void RestHealPostfix(object[] __args) => PublishRestResult("heal", null, FindInteger(__args));

    public static void RestSmithPostfix(object[] __args)
    {
        var card = __args.FirstOrDefault(value => value?.GetType().Name.Contains("Card", StringComparison.OrdinalIgnoreCase) == true);
        PublishRestResult("smith", card, null);
    }

    private static void PublishRestResult(string action, object? card, int? amount)
    {
        var decisionId = GameBuddyRecapCapture.RestDecisionId;
        var actionId = $"rest:{Guid.NewGuid():N}";
        GameBuddyFactEmitter.Publish("rest.action_completed", new {
            action, amount,
            cardInstanceId = GameBuddyRecapCapture.InstanceId(card),
            originDeckCardInstanceId = GameBuddyRecapCapture.OriginId(card),
            cardId = GameBuddyFactProjection.ModelId(card),
            cardName = GameBuddyFactProjection.Text(card, "Title", "Name"),
            upgradedAfter = GameBuddyFactProjection.Boolean(card, "IsUpgraded", "Upgraded"),
            beforeSnapshotId = GameBuddyRecapCapture.BeforeDecision(decisionId),
            afterSnapshotId = GameBuddyRecapCapture.Capture("after_rest_choice_observed", actionId, decisionId)
        }, decisionId: decisionId, actionId: actionId, observationMethod: "direct_hook");
        GameBuddyRecapCapture.FinishDecision(decisionId);
    }

    public static void EventOptionChosenPostfix(object __instance)
    {
        GameBuddyExporter.PublishEventOptionSelected(__instance);
    }

    private static void PatchFirstType(
        Harmony harmony,
        IEnumerable<string> typeNames,
        string methodName,
        string patchName,
        string modDirectory)
    {
        var type = typeNames.Select(AccessTools.TypeByName).FirstOrDefault(candidate => candidate is not null);
        if (type is null)
        {
            GameBuddyDiagnostics.Write(modDirectory, $"selection hook type unavailable: {string.Join(",", typeNames)}");
            return;
        }
        PatchNamed(harmony, type, methodName, patchName, modDirectory);
    }

    private static void PatchNamed(Harmony harmony, Type type, string name, string patchName, string modDirectory)
    {
        var methods = type.GetMethods(BindingFlags.Instance | BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)
            .Where(method => method.Name == name)
            .ToArray();
        if (methods.Length == 0)
        {
            GameBuddyDiagnostics.Write(modDirectory, $"selection hook unavailable: {type.FullName}.{name}");
            return;
        }
        var patch = new HarmonyMethod(typeof(GameBuddySelectionFactPatches), patchName);
        foreach (var method in methods) harmony.Patch(method, postfix: patch);
        GameBuddyDiagnostics.Write(modDirectory, $"selection hook applied: {type.FullName}.{name} x{methods.Length}");
    }

    private static int? FindInteger(IEnumerable<object?> values)
    {
        foreach (var value in values)
        {
            try
            {
                if (value is not null && IsPrimitive(value) && value is not bool && value is not char) return Convert.ToInt32(value);
            }
            catch
            {
                // Continue looking for a numeric price or amount.
            }
        }
        return null;
    }

    private static bool IsPrimitive(object value)
    {
        var type = value.GetType();
        return type.IsPrimitive || type == typeof(decimal);
    }
}
