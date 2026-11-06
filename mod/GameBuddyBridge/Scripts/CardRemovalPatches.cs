using System;
using System.Collections.Generic;
using HarmonyLib;
using MegaCrit.Sts2.Core.CardSelection;
using MegaCrit.Sts2.Core.Commands;
using MegaCrit.Sts2.Core.Entities.Players;
using MegaCrit.Sts2.Core.Models;
using MegaCrit.Sts2.Core.Nodes.Screens.CardSelection;

namespace GameBuddyBridge.Scripts;

// Every card removal in the game funnels through CardSelectCmd.FromDeckForRemoval, while transform
// and copy reach the same selection screen through other callers. Hooking the removal entry point
// therefore identifies the purpose without reading any localized text, and covers events, relics,
// rest sites, rewards and the merchant service in one place.
[HarmonyPatch(typeof(CardSelectCmd), nameof(CardSelectCmd.FromDeckForRemoval))]
public static class CardRemovalRequestedPatch
{
    [HarmonyPrefix]
    public static void BeforeRemoval(Player player, CardSelectorPrefs prefs, Func<CardModel, bool>? filter)
    {
        GameBuddyExporter.BeginCardRemoval(player, prefs, filter);
    }
}

// The entry point only proves a selection is about to be offered; the screen itself reports the end.
// This postfix also runs for the sibling selection screens, so the exporter ignores anything that is
// not the deck picker or has no removal in flight.
[HarmonyPatch(typeof(NCardGridSelectionScreen), nameof(NCardGridSelectionScreen.AfterOverlayClosed))]
public static class CardRemovalScreenClosedPatch
{
    [HarmonyPostfix]
    public static void AfterClosed(NCardGridSelectionScreen __instance)
    {
        GameBuddyExporter.EndCardRemoval(__instance);
    }
}
