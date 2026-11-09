using System.Reflection;
using System.Text.Json;
using HarmonyLib;

namespace GameBuddyBridge.Scripts;

public static class GameBuddyCombatFactPatches
{
    public static void Apply(Harmony harmony, string modDirectory)
    {
        var hookType = AccessTools.TypeByName("MegaCrit.Sts2.Core.Hooks.Hook")
            ?? AccessTools.TypeByName("MegaCrit.Sts2.Core.Hook");
        if (hookType is null)
        {
            GameBuddyDiagnostics.Write(modDirectory, "combat fact hook type unavailable");
            return;
        }

        var turnStart = Patch(harmony, hookType, "AfterSideTurnStart", nameof(TurnStartedPostfix), modDirectory);
        Patch(harmony, hookType, "BeforeTurnEnd", nameof(TurnEndingPostfix), modDirectory);
        var turnEnd = Patch(harmony, hookType, "AfterTurnEnd", nameof(TurnEndedPostfix), modDirectory);
        if (turnStart && turnEnd) GameBuddyHookCapabilityRegistry.Available("combat_boundary");
        Patch(harmony, hookType, "BeforeCardPlayed", nameof(BeforeCardPlayedPostfix), modDirectory);
        var cardPlay = Patch(harmony, hookType, "AfterCardPlayed", nameof(CardPlayedPostfix), modDirectory);
        if (cardPlay) GameBuddyHookCapabilityRegistry.Available("card_play");
        var damage = Patch(harmony, hookType, "AfterDamageReceived", nameof(DamagePostfix), modDirectory);
        if (damage) GameBuddyHookCapabilityRegistry.Available("damage");
        var block = Patch(harmony, hookType, "AfterBlockGained", nameof(BlockPostfix), modDirectory);
        var draw = Patch(harmony, hookType, "AfterCardDrawn", nameof(CardDrawnPostfix), modDirectory);
        var discard = Patch(harmony, hookType, "AfterCardDiscarded", nameof(CardDiscardedPostfix), modDirectory);
        var exhaust = Patch(harmony, hookType, "AfterCardExhausted", nameof(CardExhaustedPostfix), modDirectory);
        var generated = Patch(harmony, hookType, "AfterCardGeneratedForCombat", nameof(CardGeneratedPostfix), modDirectory);
        var moved = Patch(harmony, hookType, "AfterCardChangedPiles", nameof(CardMovedPostfix), modDirectory);
        if (draw && discard && exhaust && generated && moved) GameBuddyHookCapabilityRegistry.Available("card_movement");
        else if (draw || discard || exhaust || generated || moved)
            GameBuddyHookCapabilityRegistry.Partial("card_movement", "some card movement hooks are unavailable");
        var power = Patch(harmony, hookType, "AfterPowerAmountChanged", nameof(PowerChangedPostfix), modDirectory);
        var potion = Patch(harmony, hookType, "AfterPotionUsed", nameof(PotionUsedPostfix), modDirectory);
        var heal = PatchCreatureHealing(harmony, modDirectory);
        if (damage && block && heal) GameBuddyHookCapabilityRegistry.Available("combat_resolution");
        else if (damage || block || heal)
            GameBuddyHookCapabilityRegistry.Partial("combat_resolution", "some damage, block, or healing hooks are unavailable");
        if (power && potion) GameBuddyHookCapabilityRegistry.Partial("resources", "health, gold, and generic resource hooks are unavailable");
    }

    public static void TurnStartedPostfix(object[] __args)
    {
        var side = FindSide(__args);
        var turn = FindInteger(__args, "Turn", "TurnNumber", "Round") ?? GameBuddyExporter.CurrentTurn();
        GameBuddyRecapCapture.ObserveTurn(turn, side);
        PublishCombat("turn.started", new { side, turn,
            afterSnapshotId = GameBuddyRecapCapture.Capture("side_turn_start_observed") });
    }

    public static void TurnEndingPostfix(object[] __args)
    {
        PublishCombat("turn.ending", new {
            side = FindSide(__args) ?? GameBuddyRecapCapture.Side,
            turn = GameBuddyExporter.CurrentTurn(),
            endingReason = (string?)null,
            beforeSnapshotId = GameBuddyRecapCapture.Capture("before_turn_end_observed")
        });
    }

    public static void TurnEndedPostfix(object[] __args)
    {
        PublishCombat("turn.ended", new {
            side = FindSide(__args) ?? GameBuddyRecapCapture.Side,
            turn = FindInteger(__args, "Turn", "TurnNumber", "Round") ?? GameBuddyExporter.CurrentTurn(),
            afterSnapshotId = GameBuddyRecapCapture.Capture("turn_end_observed")
        });
    }

    public static void BeforeCardPlayedPostfix(object[] __args)
    {
        var play = FindByType(__args, "CardPlay");
        var card = GameBuddyFactProjection.Read(play, "Card") ?? FindCard(__args);
        GameBuddyRecapCapture.BeginCard(play, card);
    }

    public static void CardPlayedPostfix(object[] __args)
    {
        var play = FindByType(__args, "CardPlay") ?? __args.FirstOrDefault();
        var card = GameBuddyFactProjection.Read(play, "Card") ?? FindCard(__args);
        var target = GameBuddyFactProjection.Read(play, "Target");
        var resources = GameBuddyFactProjection.Read(play, "Resources");
        var context = GameBuddyRecapCapture.EndCard(play, card);
        var actionId = context.ActionId;
        PublishCombat("card.played", new
        {
            cardInstanceId = GameBuddyRecapCapture.InstanceId(card),
            originDeckCardInstanceId = GameBuddyRecapCapture.OriginId(card),
            cardId = GameBuddyFactProjection.ModelId(card),
            cardName = GameBuddyFactProjection.Text(card, "Title", "Name"),
            cardType = GameBuddyFactProjection.Text(card, "Type", "CardType"),
            executed = true,
            turn = GameBuddyRecapCapture.Turn,
            side = GameBuddyRecapCapture.Side,
            beforeSnapshotId = context.BeforeSnapshotId,
            afterSnapshotId = GameBuddyRecapCapture.Capture("after_card_played_observed", actionId: actionId),
            targetEntityId = GameBuddyFactProjection.EntityId(target),
            resultPile = GameBuddyFactProjection.Text(play, "ResultPile"),
            autoPlay = GameBuddyFactProjection.Boolean(play, "IsAutoPlay", "AutoPlay"),
            playIndex = GameBuddyFactProjection.Integer(play, "PlayIndex", "Index"),
            playCount = GameBuddyFactProjection.Integer(play, "Count", "PlayCount"),
            payment = new
            {
                energySpent = GameBuddyFactProjection.Integer(resources, "EnergySpent"),
                energyValue = GameBuddyFactProjection.Integer(resources, "EnergyValue"),
                starsSpent = GameBuddyFactProjection.Integer(resources, "StarsSpent"),
                starValue = GameBuddyFactProjection.Integer(resources, "StarValue")
            }
        }, actionId);
    }

    public static void DamagePostfix(object[] __args)
    {
        var result = FindByType(__args, "DamageResult") ?? __args.LastOrDefault();
        var target = GameBuddyFactProjection.Read(result, "Target", "Receiver", "Creature");
        var source = GameBuddyFactProjection.Read(result, "Source", "Dealer", "Attacker");
        var hpLoss = GameBuddyFactProjection.Integer(result, "HpLoss", "ActualHpLoss");
        var blocked = GameBuddyFactProjection.Integer(result, "Blocked", "BlockLoss", "BlockedDamage");
        var fatal = GameBuddyFactProjection.Boolean(result, "Fatal", "WasFatal", "Killed");
        var targetHpAfter = GameBuddyFactProjection.Integer(target, "CurrentHp", "Hp");
        var sourceSide = GameBuddyRecapCapture.EntitySide(source);
        var targetSide = GameBuddyRecapCapture.EntitySide(target);
        PublishCombat("damage.resolved", new
        {
            hitId = $"hit:{Guid.NewGuid():N}",
            turn = GameBuddyRecapCapture.Turn,
            side = GameBuddyRecapCapture.Side,
            sourceEntityId = GameBuddyRecapCapture.InstanceId(source),
            targetEntityId = GameBuddyRecapCapture.InstanceId(target),
            sourceSide,
            targetSide,
            requested = GameBuddyFactProjection.Integer(result, "RequestedAmount", "OriginalAmount", "Amount"),
            hpLoss,
            blocked,
            targetHpAfter,
            // Do not reconstruct before HP from a possibly requested/unclamped loss.
            targetHpBefore = GameBuddyFactProjection.Integer(result, "TargetHpBefore", "HpBefore"),
            resolvedDamageBeforeHpCap = GameBuddyFactProjection.Integer(result, "ResolvedDamageBeforeHpCap"),
            afterSnapshotId = GameBuddyRecapCapture.Capture("damage_result_observed"),
            damageType = GameBuddyFactProjection.Text(result, "Type", "DamageType"),
            fatal
        });
    }

    public static void BlockPostfix(object[] __args)
    {
        var creature = FindCreature(__args);
        PublishCombat("block.changed", new
        {
            entityId = GameBuddyRecapCapture.InstanceId(creature),
            entitySide = GameBuddyRecapCapture.EntitySide(creature),
            gained = FindInteger(__args, "Amount", "BlockAmount"),
            current = GameBuddyFactProjection.Integer(creature, "Block", "CurrentBlock")
        });
    }

    public static void CardDrawnPostfix(object[] __args) => PublishCardMovement("card.drawn", __args);
    public static void CardDiscardedPostfix(object[] __args) => PublishCardMovement("card.discarded", __args);
    public static void CardExhaustedPostfix(object[] __args) => PublishCardMovement("card.exhausted", __args);
    public static void CardGeneratedPostfix(object[] __args) => PublishCardMovement("card.generated", __args);

    public static void CardMovedPostfix(object[] __args)
    {
        var card = FindCard(__args);
        PublishCombat("card.moved", new
        {
            cardInstanceId = GameBuddyRecapCapture.InstanceId(card),
            originDeckCardInstanceId = GameBuddyRecapCapture.OriginId(card),
            cardId = GameBuddyFactProjection.ModelId(card),
            fromPile = FindText(__args, "From", "FromPile", "SourcePile"),
            toPile = FindText(__args, "To", "ToPile", "DestinationPile"),
            turn = GameBuddyRecapCapture.Turn, side = GameBuddyRecapCapture.Side
        });
    }

    public static void PowerChangedPostfix(object[] __args)
    {
        var power = FindByType(__args, "Power");
        var owner = GameBuddyFactProjection.Read(power, "Owner", "Creature");
        PublishCombat("power.changed", new
        {
            entityId = GameBuddyRecapCapture.InstanceId(owner),
            powerId = GameBuddyFactProjection.ModelId(power),
            amount = GameBuddyFactProjection.Integer(power, "Amount"),
            delta = FindInteger(__args, "Delta", "Amount")
        });
    }

    public static void PotionUsedPostfix(object[] __args)
    {
        var potion = FindByType(__args, "Potion");
        PublishCombat("potion.used", new
        {
            potionInstanceId = GameBuddyRecapCapture.InstanceId(potion),
            potionId = GameBuddyFactProjection.ModelId(potion),
            targetEntityId = GameBuddyRecapCapture.InstanceId(FindCreature(__args))
        });
    }

    public static void HealPostfix(object __instance, object[] __args)
    {
        PublishCombat("heal.resolved", new
        {
            targetEntityId = GameBuddyRecapCapture.InstanceId(__instance),
            amount = __args.Select(ValueAsInteger).FirstOrDefault(value => value.HasValue),
            currentHp = GameBuddyFactProjection.Integer(__instance, "CurrentHp")
        });
    }

    private static void PublishCardMovement(string eventType, object[] arguments)
    {
        var card = FindCard(arguments);
        PublishCombat(eventType, new
        {
            cardInstanceId = GameBuddyRecapCapture.InstanceId(card),
            originDeckCardInstanceId = GameBuddyRecapCapture.OriginId(card),
            cardId = GameBuddyFactProjection.ModelId(card),
            turn = GameBuddyRecapCapture.Turn, side = GameBuddyRecapCapture.Side,
            toPile = eventType == "card.drawn" ? "Hand" : GameBuddyFactProjection.Text(GameBuddyFactProjection.Read(card, "Pile", "CurrentPile"), "Type", "PileType"),
            energyAtDraw = eventType == "card.drawn" ? GameBuddyExporter.CurrentEnergy() : null,
            cost = ReadCost(card),
            playable = GameBuddyFactProjection.Boolean(card, "IsPlayable", "CanPlay"),
            availabilitySource = "runtime_property_or_unknown",
            afterSnapshotId = GameBuddyRecapCapture.Capture(eventType.Replace('.', '_') + "_observed")
        });
    }

    private static int? ReadCost(object? card)
    {
        if (card is not MegaCrit.Sts2.Core.Models.CardModel model || model.EnergyCost.CostsX) return null;
        try { return model.EnergyCost.GetAmountToSpend(); } catch { return null; }
    }
    private static string? FindSide(IEnumerable<object?> arguments)
    {
        foreach (var argument in arguments)
        {
            if (argument?.GetType().IsEnum is true &&
                argument.GetType().Name.Contains("Side", StringComparison.OrdinalIgnoreCase)) return argument.ToString();
        }
        return FindText(arguments, "Side", "Team");
    }

    private static void PublishCombat(string eventType, object payload, string? actionId = null)
    {
        var combatId = GameBuddyFactEmitter.ActiveCombatId;
        if (combatId is null) return;
        var json = JsonSerializer.SerializeToElement(payload);
        var unknown = new Dictionary<string, string>();
        if (eventType.StartsWith("card.", StringComparison.Ordinal) &&
            (!json.TryGetProperty("originDeckCardInstanceId", out var origin) || origin.ValueKind == JsonValueKind.Null))
            unknown["payload.originDeckCardInstanceId"] = "not_observed";
        if (eventType == "damage.resolved")
        {
            foreach (var field in new[] { "sourceSide", "targetSide", "targetHpBefore", "resolvedDamageBeforeHpCap", "hpLoss", "blocked", "fatal" })
                if (!json.TryGetProperty(field, out var value) || value.ValueKind == JsonValueKind.Null)
                    unknown[$"payload.{field}"] = "not_observed";
        }
        GameBuddyFactEmitter.Publish(eventType, payload, combatId,
            GameBuddyFactEmitter.AttemptGeneration, actionId: actionId, unknownReasons: unknown);
    }

    private static bool Patch(Harmony harmony, Type type, string name, string patchName, string modDirectory)
    {
        var methods = type.GetMethods(BindingFlags.Instance | BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)
            .Where(method => method.Name == name)
            .ToArray();
        if (methods.Length == 0)
        {
            GameBuddyDiagnostics.Write(modDirectory, $"fact hook unavailable: {type.FullName}.{name}");
            return false;
        }
        var patch = new HarmonyMethod(typeof(GameBuddyCombatFactPatches), patchName);
        foreach (var method in methods) harmony.Patch(method, postfix: patch);
        GameBuddyDiagnostics.Write(modDirectory, $"fact hook applied: {type.FullName}.{name} x{methods.Length}");
        return true;
    }

    private static bool PatchCreatureHealing(Harmony harmony, string modDirectory)
    {
        var creature = AccessTools.TypeByName("MegaCrit.Sts2.Core.Entities.Creatures.Creature");
        if (creature is null) return false;
        return Patch(harmony, creature, "HealInternal", nameof(HealPostfix), modDirectory);
    }

    private static object? FindByType(IEnumerable<object?> arguments, string fragment)
    {
        return arguments.FirstOrDefault(value => value?.GetType().Name.Contains(fragment, StringComparison.OrdinalIgnoreCase) == true);
    }

    private static object? FindCard(IEnumerable<object?> arguments) => FindByType(arguments, "Card");
    private static object? FindCreature(IEnumerable<object?> arguments) => FindByType(arguments, "Creature");

    private static string? FindText(IEnumerable<object?> arguments, params string[] names)
    {
        foreach (var argument in arguments)
        {
            var value = GameBuddyFactProjection.Text(argument, names);
            if (value is not null) return value;
        }
        return null;
    }

    private static int? FindInteger(IEnumerable<object?> arguments, params string[] names)
    {
        foreach (var argument in arguments)
        {
            var value = GameBuddyFactProjection.Integer(argument, names);
            if (value.HasValue) return value;
        }
        return null;
    }

    private static int? ValueAsInteger(object? value)
    {
        try { return value is null ? null : Convert.ToInt32(value); }
        catch { return null; }
    }
}
