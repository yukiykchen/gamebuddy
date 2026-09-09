using HarmonyLib;
using MegaCrit.Sts2.Core.Nodes.Screens.CardSelection;

namespace GameBuddyBridge.Scripts;

[HarmonyPatch(typeof(NCardRewardSelectionScreen), nameof(NCardRewardSelectionScreen.AfterOverlayOpened))]
public static class CardRewardOpenedPatch
{
    [HarmonyPostfix]
    public static void AfterOpened(NCardRewardSelectionScreen __instance)
    {
        GameBuddyExporter.TrackCardRewardScreen(__instance);
    }
}

[HarmonyPatch(typeof(NCardRewardSelectionScreen), nameof(NCardRewardSelectionScreen.RefreshOptions))]
public static class CardRewardRefreshedPatch
{
    [HarmonyPostfix]
    public static void AfterRefresh(NCardRewardSelectionScreen __instance)
    {
        GameBuddyExporter.TrackCardRewardScreen(__instance);
    }
}

[HarmonyPatch(typeof(NCardRewardSelectionScreen), nameof(NCardRewardSelectionScreen.AfterOverlayClosed))]
public static class CardRewardClosedPatch
{
    [HarmonyPostfix]
    public static void AfterClosed(NCardRewardSelectionScreen __instance)
    {
        GameBuddyExporter.ClearCardRewardScreen(__instance);
    }
}
