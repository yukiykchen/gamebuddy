using System.Text.Json;

namespace GameBuddyBridge.Scripts;

internal sealed record DraftFunction(string Id, string Label);
internal sealed record DraftArchetypeImpact(
    string Id,
    int DeltaPoints,
    string? Reason,
    int? BeforeScore = null,
    bool Started = false,
    int? AfterScore = null,
    string? BeforeStage = null,
    string? AfterStage = null,
    IReadOnlyList<string>? CompletedAxes = null,
    int? Readiness = null,
    string? Status = null,
    string? BeforeStatus = null,
    string? AfterStatus = null,
    IReadOnlyList<DraftFunction>? PresentFunctions = null,
    IReadOnlyList<DraftFunction>? MissingFunctions = null,
    IReadOnlyList<DraftFunction>? CompletedFunctions = null,
    string? ReferenceName = null,
    string? BeforeReferenceName = null,
    bool? BeforeIdentity = null,
    bool? AfterIdentity = null,
    IReadOnlyList<DraftFunction>? BeforePresentFunctions = null,
    IReadOnlyList<DraftFunction>? BeforeMissingFunctions = null,
    string? Confidence = null,
    string? BeforeConfidence = null);
internal sealed record DraftCardImpact(
    string CardId,
    int DeltaPoints,
    string? Reason,
    IReadOnlyList<DraftArchetypeImpact> Archetypes);
internal sealed record DraftImpactMessage(string Signature, IReadOnlyDictionary<string, DraftCardImpact> Impacts);

internal static class GameBuddyRewardImpactCodec
{
    internal static readonly string[] ArchetypeIds = ["auto_strike", "exhaust", "strength", "block"];
    private static readonly string[] ChineseNames = ["自动打击", "消耗引擎", "力量叠加", "格挡壁垒"];
    private static readonly string[] EnglishNames = ["Auto Strike", "Exhaust", "Strength", "Block"];
    private static readonly HashSet<string> Stages = ["unformed", "started", "formed"];
    private static readonly HashSet<string> Statuses = ["missing_starter", "incomplete_loop", "operational", "stable"];
    private static readonly Dictionary<string, string> StatusLabels = new()
    {
        ["missing_starter"] = "尚缺启动组件",
        ["incomplete_loop"] = "已有启动，闭环尚未齐备",
        ["operational"] = "可以运转",
        ["stable"] = "稳定成型"
    };

    internal static bool TryParse(string json, out DraftImpactMessage? message)
    {
        message = null;
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (!root.TryGetProperty("type", out var typeElement)
                || typeElement.GetString() != "draft_impact"
                || !root.TryGetProperty("signature", out var signatureElement)
                || !root.TryGetProperty("impacts", out var impactsElement)
                || impactsElement.ValueKind != JsonValueKind.Array
                || impactsElement.GetArrayLength() is < 1 or > 6) return false;

            var signature = signatureElement.GetString();
            if (string.IsNullOrWhiteSpace(signature) || signature.Length > 1024) return false;

            var impacts = new Dictionary<string, DraftCardImpact>(StringComparer.OrdinalIgnoreCase);
            foreach (var item in impactsElement.EnumerateArray())
            {
                if (!TryParseCard(item, out var impact) || impact is null
                    || !impacts.TryAdd(impact.CardId, impact)) return false;
            }

            message = new DraftImpactMessage(signature, impacts);
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
        catch (InvalidOperationException)
        {
            return false;
        }
    }

    internal static string FormatLine(DraftArchetypeImpact impact, bool useChinese)
    {
        var index = Array.IndexOf(ArchetypeIds, impact.Id);
        if (index < 0) throw new ArgumentOutOfRangeException(nameof(impact), "Unknown archetype ID.");
        var name = (useChinese ? ChineseNames : EnglishNames)[index];
        var sign = impact.DeltaPoints > 0 ? "+" : string.Empty;
        if (impact.BeforeScore is int before && impact.AfterScore is int after)
        {
            var transition = StageTransition(impact.BeforeStage, impact.AfterStage, useChinese);
            return $"{name} {before} → {after} ({sign}{impact.DeltaPoints}){transition}";
        }
        if (impact.BeforeScore is int current)
            return $"{name} {FormatProgress(current, impact.DeltaPoints)}";
        return $"{name} {sign}{impact.DeltaPoints}";
    }

    private static bool TryParseCard(JsonElement item, out DraftCardImpact? impact)
    {
        impact = null;
        if (item.ValueKind != JsonValueKind.Object
            || !item.TryGetProperty("cardId", out var cardIdElement)
            || !item.TryGetProperty("deltaPoints", out var deltaElement)
            || !deltaElement.TryGetInt32(out var legacyDelta)
            || !IsAllowedDelta(legacyDelta)
            || !item.TryGetProperty("archetypes", out var archetypesElement)
            || archetypesElement.ValueKind != JsonValueKind.Array
            || archetypesElement.GetArrayLength() != ArchetypeIds.Length) return false;

        var cardId = cardIdElement.GetString();
        if (string.IsNullOrWhiteSpace(cardId) || cardId.Length > 128) return false;

        var byId = new Dictionary<string, DraftArchetypeImpact>(StringComparer.Ordinal);
        foreach (var archetypeElement in archetypesElement.EnumerateArray())
        {
            if (archetypeElement.ValueKind != JsonValueKind.Object
                || !archetypeElement.TryGetProperty("id", out var idElement)
                || !archetypeElement.TryGetProperty("deltaPoints", out var archetypeDeltaElement)
                || !archetypeDeltaElement.TryGetInt32(out var archetypeDelta)
                || !IsAllowedDelta(archetypeDelta)) return false;

            var id = idElement.GetString();
            if (id is null || Array.IndexOf(ArchetypeIds, id) < 0) return false;
            string? reason = null;
            if (archetypeElement.TryGetProperty("reason", out var reasonElement))
            {
                if (reasonElement.ValueKind != JsonValueKind.String) return false;
                reason = reasonElement.GetString();
            }
            if (!archetypeElement.TryGetProperty("beforeScore", out var beforeElement)
                || !beforeElement.TryGetInt32(out var beforeScore)
                || beforeScore is < 0 or > 100
                || !archetypeElement.TryGetProperty("afterScore", out var afterElement)
                || !afterElement.TryGetInt32(out var afterScore)
                || afterScore is < 0 or > 100
                || !archetypeElement.TryGetProperty("beforeStage", out var beforeStageElement)
                || beforeStageElement.ValueKind != JsonValueKind.String
                || !archetypeElement.TryGetProperty("afterStage", out var afterStageElement)
                || afterStageElement.ValueKind != JsonValueKind.String
                || !archetypeElement.TryGetProperty("completedAxes", out var completedAxesElement)
                || completedAxesElement.ValueKind != JsonValueKind.Array
                || completedAxesElement.GetArrayLength() > 8) return false;
            var beforeStage = beforeStageElement.GetString();
            var afterStage = afterStageElement.GetString();
            if (beforeStage is null || afterStage is null
                || !Stages.Contains(beforeStage) || !Stages.Contains(afterStage)) return false;
            var completedAxes = new HashSet<string>(StringComparer.Ordinal);
            foreach (var axisElement in completedAxesElement.EnumerateArray())
            {
                if (axisElement.ValueKind != JsonValueKind.String) return false;
                var axis = axisElement.GetString();
                if (string.IsNullOrWhiteSpace(axis) || axis.Length > 64 || !completedAxes.Add(axis)) return false;
            }
            var started = false;
            if (archetypeElement.TryGetProperty("started", out var startedElement))
            {
                if (startedElement.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return false;
                started = startedElement.GetBoolean();
            }
            int? readiness = null;
            string? status = null;
            string? beforeStatus = null;
            string? afterStatus = null;
            IReadOnlyList<DraftFunction>? presentFunctions = null;
            IReadOnlyList<DraftFunction>? missingFunctions = null;
            IReadOnlyList<DraftFunction>? completedFunctions = null;
            var modernFields = new[] { "readiness", "status", "beforeStatus", "afterStatus", "presentFunctions", "missingFunctions", "completedFunctions" };
            var modernCount = modernFields.Count(field => archetypeElement.TryGetProperty(field, out _));
            if (modernCount is not 0 and not 7) return false;
            if (modernCount == 7)
            {
                if (!archetypeElement.GetProperty("readiness").TryGetInt32(out var readinessValue)
                    || readinessValue != afterScore) return false;
                status = archetypeElement.GetProperty("status").GetString();
                beforeStatus = archetypeElement.GetProperty("beforeStatus").GetString();
                afterStatus = archetypeElement.GetProperty("afterStatus").GetString();
                if (status is null || beforeStatus is null || afterStatus is null
                    || !Statuses.Contains(status) || !Statuses.Contains(beforeStatus) || !Statuses.Contains(afterStatus)) return false;
                if (!TryParseFunctions(archetypeElement.GetProperty("presentFunctions"), out presentFunctions)
                    || !TryParseFunctions(archetypeElement.GetProperty("missingFunctions"), out missingFunctions)
                    || !TryParseFunctions(archetypeElement.GetProperty("completedFunctions"), out completedFunctions)) return false;
                readiness = readinessValue;
            }
            string? referenceName = null, beforeReferenceName = null, confidence = null, beforeConfidence = null;
            bool? beforeIdentity = null, afterIdentity = null;
            IReadOnlyList<DraftFunction>? beforePresentFunctions = null, beforeMissingFunctions = null;
            if (archetypeElement.TryGetProperty("referenceName", out var referenceElement))
            {
                if (referenceElement.ValueKind != JsonValueKind.String
                    || !archetypeElement.TryGetProperty("beforeReferenceName", out var beforeReferenceElement)
                    || beforeReferenceElement.ValueKind != JsonValueKind.String
                    || !archetypeElement.TryGetProperty("beforeIdentity", out var beforeIdentityElement)
                    || beforeIdentityElement.ValueKind is not (JsonValueKind.True or JsonValueKind.False)
                    || !archetypeElement.TryGetProperty("afterIdentity", out var afterIdentityElement)
                    || afterIdentityElement.ValueKind is not (JsonValueKind.True or JsonValueKind.False)
                    || !archetypeElement.TryGetProperty("beforePresentFunctions", out var beforePresentElement)
                    || !TryParseFunctions(beforePresentElement, out beforePresentFunctions)
                    || !archetypeElement.TryGetProperty("beforeMissingFunctions", out var beforeMissingElement)
                    || !TryParseFunctions(beforeMissingElement, out beforeMissingFunctions)
                    || !archetypeElement.TryGetProperty("confidence", out var confidenceElement)
                    || confidenceElement.ValueKind != JsonValueKind.String) return false;
                referenceName = referenceElement.GetString();
                beforeReferenceName = beforeReferenceElement.GetString();
                confidence = confidenceElement.GetString();
                if (referenceName?.Length is < 1 or > 100 || beforeReferenceName?.Length is < 1 or > 100
                    || confidence is not ("partial" or "configured")) return false;
                if (!archetypeElement.TryGetProperty("beforeConfidence", out var beforeConfidenceElement)
                    || beforeConfidenceElement.ValueKind != JsonValueKind.String) return false;
                beforeConfidence = beforeConfidenceElement.GetString();
                if (beforeConfidence is not ("partial" or "configured")) return false;
                beforeIdentity = beforeIdentityElement.GetBoolean();
                afterIdentity = afterIdentityElement.GetBoolean();
            }
            if (!byId.TryAdd(id, new DraftArchetypeImpact(
                id,
                archetypeDelta,
                reason,
                beforeScore,
                started,
                afterScore,
                beforeStage,
                afterStage,
                completedAxes.ToArray(),
                readiness,
                status,
                beforeStatus,
                afterStatus,
                presentFunctions,
                missingFunctions,
                completedFunctions,
                referenceName,
                beforeReferenceName,
                beforeIdentity,
                afterIdentity,
                beforePresentFunctions,
                beforeMissingFunctions,
                confidence,
                beforeConfidence))) return false;
        }

        var ordered = ArchetypeIds.Select(id => byId[id]).ToArray();
        if (legacyDelta != ordered[0].DeltaPoints) return false;

        string? legacyReason = null;
        if (item.TryGetProperty("reason", out var legacyReasonElement))
        {
            if (legacyReasonElement.ValueKind != JsonValueKind.String) return false;
            legacyReason = legacyReasonElement.GetString();
        }
        impact = new DraftCardImpact(cardId, legacyDelta, legacyReason, ordered);
        return true;
    }

    internal static string StatusPhrase(string? status, bool partial)
    {
        if (status is null || !StatusLabels.TryGetValue(status, out var label)) return string.Empty;
        return status == "missing_starter" && partial ? $"{label}；已有部分配套" : label;
    }

    internal static string FormatReadiness(string name, int readiness, string? status, bool partial)
    {
        var phrase = StatusPhrase(status, partial);
        if (phrase.Length == 0) return $"{name} {readiness}";
        return $"{name}：契合度 {readiness} / {phrase}";
    }

    internal static string FormatFunctionLine(IEnumerable<DraftFunction>? present, IEnumerable<DraftFunction>? missing)
    {
        var parts = new List<string>();
        var presentText = string.Join("、", (present ?? []).Select(item => item.Label).Where(label => label.Length > 0));
        var missingText = string.Join("、", (missing ?? []).Select(item => item.Label).Where(label => label.Length > 0));
        if (presentText.Length > 0) parts.Add($"已有：{presentText}");
        if (missingText.Length > 0) parts.Add($"待补足：{missingText}");
        return string.Join("。", parts);
    }

    internal static (IReadOnlyList<DraftFunction> Present, IReadOnlyList<DraftFunction> Missing) CurrentFunctions(DraftArchetypeImpact? impact)
    {
        if (impact is null) return ([], []);
        if (impact.BeforePresentFunctions is not null && impact.BeforeMissingFunctions is not null)
            return (impact.BeforePresentFunctions, impact.BeforeMissingFunctions);
        var completed = new HashSet<string>(impact.CompletedFunctions?.Select(item => item.Id) ?? [], StringComparer.Ordinal);
        var present = (impact.PresentFunctions ?? []).Where(item => !completed.Contains(item.Id)).ToArray();
        var missing = (impact.MissingFunctions ?? []).Concat(impact.CompletedFunctions ?? []).ToArray();
        return (present, missing);
    }

    internal static string FormatDelta(int delta, string? beforeStatus, string? afterStatus)
    {
        var signed = FormatSignedDelta(delta);
        var before = StatusPhrase(beforeStatus, false);
        var after = StatusPhrase(afterStatus, false);
        var transition = before.Length > 0 && after.Length > 0 && beforeStatus != afterStatus
            ? $"{before} → {after}"
            : string.Empty;
        if (signed.Length == 0) return transition.Length == 0 ? string.Empty : " " + transition;
        if (transition.Length == 0) return " " + signed;
        return $" {signed} · {transition}";
    }

    internal static bool HasPartialSupport(DraftArchetypeImpact? impact, bool before = false)
    {
        var functions = before ? CurrentFunctions(impact).Present : impact?.PresentFunctions;
        if (functions is null || functions.Count == 0 || impact is null) return false;
        var starters = impact.Id switch
        {
            "auto_strike" => new[] { "auto_gate" },
            "exhaust" => new[] { "exhaust_pain", "exhaust_draw" },
            "strength" => new[] { "strength_source" },
            "block" => new[] { "block_gate" },
            _ => Array.Empty<string>()
        };
        return functions.Any(item => !starters.Contains(item.Id));
    }

    private static bool TryParseFunctions(JsonElement element, out IReadOnlyList<DraftFunction>? functions)
    {
        functions = null;
        if (element.ValueKind != JsonValueKind.Array || element.GetArrayLength() > 8) return false;
        var parsed = new List<DraftFunction>();
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var entry in element.EnumerateArray())
        {
            if (entry.ValueKind != JsonValueKind.Object
                || !entry.TryGetProperty("id", out var idElement)
                || !entry.TryGetProperty("label", out var labelElement)
                || idElement.ValueKind != JsonValueKind.String
                || labelElement.ValueKind != JsonValueKind.String) return false;
            var id = idElement.GetString();
            var label = labelElement.GetString();
            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(label) || id.Length > 64 || label.Length > 64 || !ids.Add(id)) return false;
            parsed.Add(new DraftFunction(id, label));
        }
        functions = parsed;
        return true;
    }

    internal static string FormatProgress(int before, int delta) =>
        delta == 0 ? before.ToString() : $"{before}{(delta > 0 ? "+" : string.Empty)}{delta}";

    internal static string FormatSignedDelta(int delta) =>
        delta > 0 ? $"+{delta}" : delta.ToString();

    private static string StageTransition(string? before, string? after, bool useChinese)
    {
        if (before == after) return string.Empty;
        if (after == "formed") return useChinese ? " · 成型" : " · Formed";
        if (after == "started") return useChinese ? " · 启动" : " · Started";
        return string.Empty;
    }

    private static bool IsAllowedDelta(int delta) => delta is >= -100 and <= 100;
}
