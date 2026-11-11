namespace GameBuddyBridge.Scripts;

public sealed record RewardSelectionCard(string CardId, bool Upgraded);

public sealed record RewardSelectionResult(string Signature, string CardId, bool Upgraded);

public sealed class GameBuddyRewardSelectionTracker
{
    private string? _signature;
    private Dictionary<RewardSelectionCard, int>? _baseline;
    private HashSet<RewardSelectionCard>? _candidates;
    private Dictionary<RewardSelectionCard, int>? _lastObserved;
    private int _stableObservations;
    private bool _closed;
    private bool _resolved;

    public void Begin(
        string signature,
        IEnumerable<RewardSelectionCard> baseline,
        IEnumerable<RewardSelectionCard> candidates)
    {
        if (string.IsNullOrWhiteSpace(signature))
        {
            Reset();
            return;
        }

        _signature = signature;
        _baseline = CountCards(baseline);
        _candidates = candidates.ToHashSet();
        _lastObserved = null;
        _stableObservations = 0;
        _closed = false;
        _resolved = false;
    }

    public void Close(string signature)
    {
        if (!_resolved && string.Equals(signature, _signature, StringComparison.Ordinal))
        {
            _closed = true;
            _lastObserved = null;
            _stableObservations = 0;
        }
    }

    public RewardSelectionResult? Observe(IEnumerable<RewardSelectionCard> deck)
    {
        if (!_closed || _resolved || _signature is null || _baseline is null || _candidates is null)
        {
            return null;
        }

        var current = CountCards(deck);
        if (_lastObserved is not null && SameCounts(_lastObserved, current))
        {
            _stableObservations += 1;
        }
        else
        {
            _lastObserved = current;
            _stableObservations = 1;
        }

        if (_stableObservations < 2)
        {
            return null;
        }

        _resolved = true;
        var added = _candidates
            .Where(candidate => Count(current, candidate) - Count(_baseline, candidate) == 1)
            .ToList();
        if (added.Count != 1)
        {
            return null;
        }

        var selected = added[0];
        return new RewardSelectionResult(_signature, selected.CardId, selected.Upgraded);
    }

    public void Reset()
    {
        _signature = null;
        _baseline = null;
        _candidates = null;
        _lastObserved = null;
        _stableObservations = 0;
        _closed = false;
        _resolved = false;
    }

    private static Dictionary<RewardSelectionCard, int> CountCards(IEnumerable<RewardSelectionCard> cards)
    {
        var counts = new Dictionary<RewardSelectionCard, int>();
        foreach (var card in cards)
        {
            counts[card] = Count(counts, card) + 1;
        }
        return counts;
    }

    private static int Count(Dictionary<RewardSelectionCard, int> counts, RewardSelectionCard card) =>
        counts.TryGetValue(card, out var count) ? count : 0;

    private static bool SameCounts(
        Dictionary<RewardSelectionCard, int> left,
        Dictionary<RewardSelectionCard, int> right) =>
        left.Count == right.Count && left.All(pair => Count(right, pair.Key) == pair.Value);
}
