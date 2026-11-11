namespace GameBuddyBridge.Scripts;

public static class GameBuddyClearFacts
{
    public static string? GameModeText(object? value)
    {
        if (value is null) return null;
        if (value is string text)
        {
            var trimmed = text.Trim();
            return trimmed.Length == 0 ? null : trimmed;
        }

        var rendered = Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture);
        if (string.IsNullOrWhiteSpace(rendered)) return null;
        return rendered.Trim();
    }

    public static EventSelectedFact? EventSelected(string? eventId, string? pageId, string? optionId)
    {
        if (string.IsNullOrWhiteSpace(eventId) || string.IsNullOrWhiteSpace(pageId) || string.IsNullOrWhiteSpace(optionId))
        {
            return null;
        }
        return new EventSelectedFact(eventId.Trim(), pageId.Trim(), optionId.Trim());
    }
}

public sealed record EventSelectedFact(string EventId, string PageId, string OptionId);
