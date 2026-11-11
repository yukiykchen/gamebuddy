namespace GameBuddyBridge.Scripts;

internal static class GameBuddyGuidancePlacement
{
    // 独立于Godot的坐标计算，奖励与商店统一使用可见牌面矩形。
    public static (float X, float Y) Place(float cardX, float cardY, float cardWidth, float cardHeight,
        float panelWidth, float panelHeight, float viewportX, float viewportY, float viewportWidth, float viewportHeight)
    {
        const float margin = 12, gap = 18;
        var left = viewportX + margin;
        var top = viewportY + margin;
        var right = Math.Max(left, viewportX + viewportWidth - panelWidth - margin);
        var bottom = Math.Max(top, viewportY + viewportHeight - panelHeight - margin);
        var x = cardX + (cardWidth - panelWidth) / 2;
        var y = cardY - panelHeight - gap;
        if (y < top)
        {
            if (cardX + cardWidth + gap <= right) { x = cardX + cardWidth + gap; y = cardY; }
            else if (cardX - panelWidth - gap >= left) { x = cardX - panelWidth - gap; y = cardY; }
            else if (cardY + cardHeight + gap <= bottom) y = cardY + cardHeight + gap;
        }
        return (Math.Clamp(x, left, right), Math.Clamp(y, top, bottom));
    }
}
