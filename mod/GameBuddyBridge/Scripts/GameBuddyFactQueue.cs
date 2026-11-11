namespace GameBuddyBridge.Scripts;

public sealed record GameBuddyPendingFact(long SourceSeq, string Json);
public sealed record GameBuddyFactGap(long FromSourceSeq, long ToSourceSeq);

public sealed class GameBuddyFactQueue
{
    private readonly int _capacity;
    private readonly LinkedList<GameBuddyPendingFact> _pending = new();
    private readonly object _gate = new();
    private GameBuddyPendingFact? _gapDeclaration;

    public GameBuddyFactQueue(int capacity = 10_000)
    {
        if (capacity < 1) throw new ArgumentOutOfRangeException(nameof(capacity));
        _capacity = capacity;
    }

    public int Capacity => _capacity;
    public int Count { get { lock (_gate) return _pending.Count; } }

    public GameBuddyFactGap? Enqueue(long sourceSeq, string json)
    {
        lock (_gate)
        {
            _pending.AddLast(new GameBuddyPendingFact(sourceSeq, json));
            if (_pending.Count <= _capacity) return null;

            long from = _pending.First!.Value.SourceSeq;
            long to = from;
            while (_pending.Count > _capacity)
            {
                to = _pending.First!.Value.SourceSeq;
                _pending.RemoveFirst();
            }
            return new GameBuddyFactGap(from, to);
        }
    }

    public void DeclareGap(long sourceSeq, string json)
    {
        if (sourceSeq < 1) throw new ArgumentOutOfRangeException(nameof(sourceSeq));
        ArgumentException.ThrowIfNullOrEmpty(json);
        lock (_gate) _gapDeclaration = new GameBuddyPendingFact(sourceSeq, json);
    }

    public void Acknowledge(long sourceSeq)
    {
        lock (_gate)
        {
            while (_pending.First is not null && _pending.First.Value.SourceSeq <= sourceSeq)
                _pending.RemoveFirst();
            if (_gapDeclaration is not null && _gapDeclaration.SourceSeq <= sourceSeq)
                _gapDeclaration = null;
        }
    }

    public IReadOnlyList<GameBuddyPendingFact> Snapshot()
    {
        lock (_gate)
        {
            if (_gapDeclaration is null) return _pending.ToArray();
            var items = new List<GameBuddyPendingFact>(_pending.Count + 1);
            var inserted = false;
            foreach (var item in _pending)
            {
                if (!inserted && _gapDeclaration.SourceSeq <= item.SourceSeq)
                {
                    items.Add(_gapDeclaration);
                    inserted = true;
                }
                items.Add(item);
            }
            if (!inserted) items.Add(_gapDeclaration);
            return items;
        }
    }
}
