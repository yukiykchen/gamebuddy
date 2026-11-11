namespace GameBuddyBridge.Scripts;

public sealed record RewardCandidateProbe(
    string CardId,
    bool ExplicitHovered,
    bool Focused,
    bool ContainsPointer,
    float DistanceSquared);

public static class GameBuddyRewardCandidateSelector
{
    public static string? Resolve(IEnumerable<RewardCandidateProbe> probes, string? lastClicked)
    {
        var candidates = probes
            .Where(probe => !string.IsNullOrWhiteSpace(probe.CardId))
            .ToList();
        return Nearest(candidates.Where(probe => probe.ExplicitHovered))
            ?? Nearest(candidates.Where(probe => probe.Focused))
            ?? Nearest(candidates.Where(probe => probe.ContainsPointer))
            ?? candidates.FirstOrDefault(probe =>
                string.Equals(probe.CardId, lastClicked, StringComparison.OrdinalIgnoreCase))?.CardId;
    }

    private static string? Nearest(IEnumerable<RewardCandidateProbe> probes) =>
        probes.OrderBy(probe => probe.DistanceSquared).FirstOrDefault()?.CardId;
}
