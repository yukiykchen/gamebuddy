using System.Reflection;
using HarmonyLib;

namespace GameBuddyBridge.Scripts;

public static class GameBuddyBuildFactPatches
{
    public static void Apply(Harmony harmony, string modDirectory)
    {
        PatchType(harmony, "MegaCrit.Sts2.Core.Entities.Cards.CardPile", "AddInternal", nameof(CardAddedPostfix), modDirectory);
        PatchType(harmony, "MegaCrit.Sts2.Core.Entities.Cards.CardPile", "RemoveInternal", nameof(CardRemovedPostfix), modDirectory);
        PatchType(harmony, "MegaCrit.Sts2.Core.Models.CardModel", "UpgradeInternal", nameof(CardUpgradedPostfix), modDirectory);
        PatchType(harmony, "MegaCrit.Sts2.Core.Commands.CardCmd", "Transform", nameof(CardTransformedPostfix), modDirectory);
        PatchType(harmony, "MegaCrit.Sts2.Core.Entities.Players.Player", "AddRelicInternal", nameof(RelicGainedPostfix), modDirectory);
        PatchType(harmony, "MegaCrit.Sts2.Core.Entities.Players.Player", "RemoveRelicInternal", nameof(RelicLostPostfix), modDirectory);
        PatchType(harmony, "MegaCrit.Sts2.Core.Entities.Players.Player", "MeltRelicInternal", nameof(RelicChangedPostfix), modDirectory);
        GameBuddyHookCapabilityRegistry.Partial("build", "deck, relic, and potion hooks installed; source attribution may be partial");

        var hook = AccessTools.TypeByName("MegaCrit.Sts2.Core.Hooks.Hook")
            ?? AccessTools.TypeByName("MegaCrit.Sts2.Core.Hook");
        if (hook is null) return;
        Patch(harmony, hook, "AfterPotionProcured", nameof(PotionGainedPostfix), modDirectory);
        Patch(harmony, hook, "AfterPotionDiscarded", nameof(PotionDiscardedPostfix), modDirectory);
    }

    public static void CardAddedPostfix(object __instance, object[] __args)
    {
        if (!IsPermanentDeck(__instance)) return;
        var card = FindModel(__args, "Card");
        PublishCard("deck.card_added", card);
    }

    public static void CardRemovedPostfix(object __instance, object[] __args)
    {
        if (!IsPermanentDeck(__instance)) return;
        var card = FindModel(__args, "Card");
        PublishCard("deck.card_removed", card);
    }

    public static void CardUpgradedPostfix(object __instance)
    {
        var pile = GameBuddyFactProjection.Read(__instance, "Pile", "CurrentPile", "OwnerPile");
        if (pile is not null && !IsPermanentDeck(pile)) return;
        PublishCard("deck.card_upgraded", __instance);
    }

    public static void CardTransformedPostfix(object[] __args)
    {
        var cards = __args.Where(value => value?.GetType().Name.Contains("Card", StringComparison.OrdinalIgnoreCase) == true).ToArray();
        GameBuddyFactEmitter.Publish("deck.card_transformed", new
        {
            fromCardInstanceId = GameBuddyRecapCapture.InstanceId(cards.ElementAtOrDefault(0)),
            fromCardId = GameBuddyFactProjection.ModelId(cards.ElementAtOrDefault(0)),
            toCardInstanceId = GameBuddyRecapCapture.InstanceId(cards.ElementAtOrDefault(1)),
            toCardId = GameBuddyFactProjection.ModelId(cards.ElementAtOrDefault(1))
        }, actionId: $"transform:{Guid.NewGuid():N}", observationMethod: "direct_hook");
    }

    public static void RelicGainedPostfix(object[] __args) => PublishRelic("relic.gained", __args);
    public static void RelicLostPostfix(object[] __args) => PublishRelic("relic.lost", __args);
    public static void RelicChangedPostfix(object[] __args) => PublishRelic("relic.changed", __args);
    public static void PotionGainedPostfix(object[] __args) => PublishPotion("potion.gained", __args);
    public static void PotionDiscardedPostfix(object[] __args) => PublishPotion("potion.discarded", __args);

    private static void PublishCard(string eventType, object? card)
    {
        GameBuddyFactEmitter.Publish(eventType, new
        {
            cardInstanceId = GameBuddyRecapCapture.InstanceId(card),
            originDeckCardInstanceId = GameBuddyRecapCapture.OriginId(card),
            cardId = GameBuddyFactProjection.ModelId(card),
            upgraded = GameBuddyFactProjection.Boolean(card, "IsUpgraded", "Upgraded")
        }, actionId: $"deck:{Guid.NewGuid():N}", observationMethod: "direct_hook");
    }

    private static void PublishRelic(string eventType, object[] arguments)
    {
        var relic = FindModel(arguments, "Relic");
        GameBuddyFactEmitter.Publish(eventType, new
        {
            relicInstanceId = GameBuddyRecapCapture.InstanceId(relic),
            relicId = GameBuddyFactProjection.ModelId(relic)
        }, actionId: $"relic:{Guid.NewGuid():N}", observationMethod: "direct_hook");
    }

    private static void PublishPotion(string eventType, object[] arguments)
    {
        var potion = FindModel(arguments, "Potion");
        GameBuddyFactEmitter.Publish(eventType, new
        {
            potionInstanceId = GameBuddyRecapCapture.InstanceId(potion),
            potionId = GameBuddyFactProjection.ModelId(potion)
        }, actionId: $"potion:{Guid.NewGuid():N}", observationMethod: "direct_hook");
    }

    private static bool IsPermanentDeck(object pile)
    {
        return string.Equals(GameBuddyFactProjection.Text(pile, "PileType", "Type"), "Deck",
            StringComparison.OrdinalIgnoreCase);
    }

    private static object? FindModel(IEnumerable<object?> values, string fragment)
    {
        return values.FirstOrDefault(value => value?.GetType().Name.Contains(fragment, StringComparison.OrdinalIgnoreCase) == true);
    }

    private static void PatchType(Harmony harmony, string typeName, string method, string patch, string modDirectory)
    {
        var type = AccessTools.TypeByName(typeName);
        if (type is null)
        {
            GameBuddyDiagnostics.Write(modDirectory, $"build hook type unavailable: {typeName}");
            return;
        }
        Patch(harmony, type, method, patch, modDirectory);
    }

    private static void Patch(Harmony harmony, Type type, string name, string patchName, string modDirectory)
    {
        var methods = type.GetMethods(BindingFlags.Instance | BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)
            .Where(method => method.Name == name)
            .ToArray();
        if (methods.Length == 0)
        {
            GameBuddyDiagnostics.Write(modDirectory, $"build hook unavailable: {type.FullName}.{name}");
            return;
        }
        var patch = new HarmonyMethod(typeof(GameBuddyBuildFactPatches), patchName);
        foreach (var method in methods) harmony.Patch(method, postfix: patch);
        GameBuddyDiagnostics.Write(modDirectory, $"build hook applied: {type.FullName}.{name} x{methods.Length}");
    }
}
