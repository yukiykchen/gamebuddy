using System.Collections.Concurrent;
using System.Reflection;
using Godot;
using MegaCrit.Sts2.Core.Localization.Fonts;
using MegaCrit.Sts2.Core.Models;
using MegaCrit.Sts2.Core.Nodes.Cards.Holders;
using MegaCrit.Sts2.Core.Nodes.Screens.CardSelection;

namespace GameBuddyBridge.Scripts;

// 奖励与商店共用的只读三行教学；不接收旧构筑评分消息。
internal static class GameBuddyRewardOverlay
{
    private static readonly ConcurrentQueue<CardGuidanceMessage> Pending = new();
    private static readonly CardGuidanceContext Context = new();
    private static NCardRewardSelectionScreen? _screen;
    private static PanelContainer? _panel;
    private static VBoxContainer? _body;
    private static IReadOnlyDictionary<string, CardGuidance>? _cards;
    private static string? _shownKey;
    private static long _version;
    private static long _shownVersion = -1;
    private static (Control Control, CardModel Model, Control? Visual)[] _targets = [];
    private static string _shopFingerprint = string.Empty;
    private static string _shopToken = string.Empty;
    private static ulong _lastScan;

    public static void TrackScreen(NCardRewardSelectionScreen screen)
    {
        if (ReferenceEquals(_screen, screen)) return;
        Reset(); _screen = screen;
    }
    public static void SetOffer(NCardRewardSelectionScreen screen, string signature, IEnumerable<string> candidateKeys)
    {
        if (!ReferenceEquals(_screen, screen)) TrackScreen(screen);
        if (Context.Context == "reward" && Context.Signature == signature) return;
        _cards = null; Hide();
        Context.Set("reward", signature, candidateKeys.Distinct(StringComparer.OrdinalIgnoreCase));
        _targets = []; _lastScan = 0;
    }
    public static void ClearScreen(NCardRewardSelectionScreen screen)
    {
        if (!ReferenceEquals(_screen, screen)) return;
        Reset(); _screen = null;
    }
    public static string SetShop(string fingerprint, IEnumerable<string> keys)
    {
        if (_screen is not null && GodotObject.IsInstanceValid(_screen) && _screen.IsInsideTree()) return string.Empty;
        _screen = null;
        if (fingerprint != _shopFingerprint || Context.Context != "shop")
        {
            _shopFingerprint = fingerprint; _shopToken = Guid.NewGuid().ToString("N");
            Context.Set("shop", _shopToken, keys); _cards = null; _targets = []; _lastScan = 0; Hide();
        }
        return _shopToken;
    }
    public static void ClearShop()
    {
        if (Context.Context == "shop") Reset();
        _shopFingerprint = string.Empty; _shopToken = string.Empty;
    }
    public static void QueueImpactMessage(string json)
    {
        if (GameBuddyCardGuidanceCodec.TryParse(json, out var message) && message is not null) Pending.Enqueue(message);
    }
    public static void ProcessFrame()
    {
        if (_screen is not null && (!GodotObject.IsInstanceValid(_screen) || !_screen.IsInsideTree())) { Reset(); _screen = null; }
        while (Pending.TryDequeue(out var message))
        {
            if (!Context.Accepts(message)) continue;
            _cards = message.Cards; _version++;
        }
        if (_cards is null || Context.Signature.Length == 0) { Hide(); return; }
        var tree = Engine.GetMainLoop() as SceneTree;
        var root = Context.Context == "reward" ? (Node?)_screen : tree?.Root;
        if (root is null) { Hide(); return; }
        var now = Time.GetTicksMsec();
        if (_targets.Length == 0 || now - _lastScan > 250)
        {
            _targets = FindCards(root, 0).Where(x => Context.Keys.Contains(Key(x.Model))).ToArray();
            _lastScan = now;
        }
        if (_panel is not null && GodotObject.IsInstanceValid(_panel) && _panel.Visible
            && _shownVersion == _version && _shownKey is not null && _cards.TryGetValue(_shownKey, out var shown) && shown.Systems.Count > 0
            && _panel.GetGlobalRect().HasPoint(_panel.GetGlobalMousePosition())) return;
        var visible = _targets.Where(x => GodotObject.IsInstanceValid(x.Control) && x.Control.IsVisibleInTree()).ToArray();
        var probes = visible.Select(x => new RewardCandidateProbe(Key(x.Model), false, x.Control.HasFocus() || Alive(x.Visual) && x.Visual!.HasFocus(),
            ContainsPointer(x.Control) || Alive(x.Visual) && ContainsPointer(x.Visual!),
            x.Control.GetGlobalMousePosition().DistanceSquaredTo(x.Control.GetGlobalRect().GetCenter())));
        var hit = GameBuddyRewardCandidateSelector.Resolve(probes, null);
        var found = visible.FirstOrDefault(x => Key(x.Model) == hit);
        if (found.Model is null || !_cards.TryGetValue(Key(found.Model), out var card) || card.Systems.Count == 0) { Hide(); return; }
        if (_panel is null || !GodotObject.IsInstanceValid(_panel)) CreatePanel(root);
        if (_shownKey != card.Key || _shownVersion != _version) Render(card);
        var viewport = found.Control.GetViewport().GetVisibleRect();
        var width = Math.Min(420f, viewport.Size.X - 24f);
        _body!.CustomMinimumSize = new(width - 32f, 0);
        var maxHeight = Math.Min(420f, viewport.Size.Y - 40f);
        _panel!.Size = new(width, Math.Min(maxHeight, Math.Max(132f, _body.GetCombinedMinimumSize().Y + 30f)));
        var cardRect = Alive(found.Visual) && found.Visual!.IsVisibleInTree()
            ? found.Visual.GetGlobalRect() : found.Control.GetGlobalRect();
        var position = GameBuddyGuidancePlacement.Place(cardRect.Position.X, cardRect.Position.Y, cardRect.Size.X, cardRect.Size.Y,
            _panel.Size.X, _panel.Size.Y, viewport.Position.X, viewport.Position.Y, viewport.Size.X, viewport.Size.Y);
        _panel.GlobalPosition = new(position.X, position.Y);
        _panel.Visible = true;
    }
    private static string Key(CardModel card) => $"{card.Id.Entry}:{(card.IsUpgraded ? "1" : "0")}";
    private static CardModel? ModelOf(Control control)
    {
        if (control is NCardHolder holder) return holder.CardModel;
        // 商店的卡牌节点不是奖励 holder；只读取已显示节点的公开模型。
        foreach (var name in new[] { "Model", "CardModel", "Card" })
        {
            var property = control.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance);
            if (property?.GetIndexParameters().Length == 0 && typeof(CardModel).IsAssignableFrom(property.PropertyType))
            { try { if (property.GetValue(control) is CardModel model) return model; } catch { } }
        }
        return null;
    }
    private static bool Alive(Control? control) => control is not null && GodotObject.IsInstanceValid(control);
    private static bool ContainsPointer(Control control) => control.GetGlobalRect().HasPoint(control.GetGlobalMousePosition());
    private static IEnumerable<(Control Control, CardModel Model, Control? Visual)> FindCards(Node node, int depth)
    {
        if (depth > 20) yield break;
        if (node is Control control && ModelOf(control) is CardModel model)
        {
            // Holder布局可为零尺寸；真正的奖励交互区域是Hitbox，CardNode提供放大后的可见区域。
            var holder = control as NCardHolder;
            var visual = holder?.CardNode as Control;
            var target = Alive(holder?.Hitbox) ? holder!.Hitbox : Alive(visual) ? visual! : control;
            yield return (target, model, visual);
            yield break; // 不把同一张牌的外层和内层重复作为悬停候选。
        }
        foreach (var child in node.GetChildren()) foreach (var item in FindCards(child, depth + 1)) yield return item;
    }
    private static void CreatePanel(Node root)
    {
        _panel = new PanelContainer { Name = "GameBuddyCardGuidance", MouseFilter = Control.MouseFilterEnum.Ignore, FocusMode = Control.FocusModeEnum.None, TopLevel = true, ZIndex = 100, Visible = false };
        _panel.AddThemeStyleboxOverride("panel", new StyleBoxFlat { BgColor = new Color(0.105f, 0.118f, 0.11f, 0.98f), BorderColor = new Color(0.65f, 0.49f, 0.30f, 0.72f), BorderWidthTop = 1, BorderWidthLeft = 1, BorderWidthRight = 1, BorderWidthBottom = 1, CornerRadiusTopLeft = 10, CornerRadiusTopRight = 10, CornerRadiusBottomLeft = 10, CornerRadiusBottomRight = 10, ShadowColor = new Color(0, 0, 0, 0.40f), ShadowSize = 10, ShadowOffset = new Vector2(0, 5), ContentMarginLeft = 15, ContentMarginRight = 15, ContentMarginTop = 14, ContentMarginBottom = 14 });
        var scroll = new ScrollContainer { HorizontalScrollMode = ScrollContainer.ScrollMode.Disabled, MouseFilter = Control.MouseFilterEnum.Pass };
        _body = new VBoxContainer { SizeFlagsHorizontal = Control.SizeFlags.ExpandFill, MouseFilter = Control.MouseFilterEnum.Ignore };
        _body.AddThemeConstantOverride("separation", 12); scroll.AddChild(_body); _panel.AddChild(scroll); root.AddChild(_panel);
    }
    private static void Render(CardGuidance card)
    {
        foreach (var child in _body!.GetChildren()) { _body.RemoveChild(child); child.QueueFree(); }
        foreach (var system in card.Systems)
        {
            if (_body.GetChildCount() > 0)
            {
                var separator = new HSeparator { MouseFilter = Control.MouseFilterEnum.Ignore };
                separator.AddThemeStyleboxOverride("separator", new StyleBoxLine { Color = new Color(0.67f, 0.52f, 0.33f, 0.23f), Thickness = 1 });
                _body.AddChild(separator);
            }
            var block = new VBoxContainer { MouseFilter = Control.MouseFilterEnum.Ignore };
            block.AddThemeConstantOverride("separation", 9);
            var heading = new HBoxContainer { MouseFilter = Control.MouseFilterEnum.Ignore };
            heading.AddThemeConstantOverride("separation", 12);
            var accent = system.Conflict ? new Color(0.92f, 0.70f, 0.61f) : new Color(0.94f, 0.83f, 0.65f);
            heading.AddChild(MakeLabel(system.SystemName, 17, accent));
            var badge = new PanelContainer { MouseFilter = Control.MouseFilterEnum.Ignore, SizeFlagsHorizontal = Control.SizeFlags.ExpandFill, SizeFlagsVertical = Control.SizeFlags.ShrinkCenter };
            badge.AddThemeStyleboxOverride("panel", new StyleBoxFlat { BgColor = system.Conflict ? new Color(0.57f, 0.28f, 0.19f, 0.17f) : new Color(0.72f, 0.53f, 0.28f, 0.13f), BorderColor = new Color(accent, 0.22f), BorderWidthTop = 1, BorderWidthBottom = 1, BorderWidthLeft = 1, BorderWidthRight = 1, CornerRadiusTopLeft = 4, CornerRadiusTopRight = 4, CornerRadiusBottomLeft = 4, CornerRadiusBottomRight = 4, ContentMarginLeft = 7, ContentMarginRight = 7, ContentMarginTop = 3, ContentMarginBottom = 3 });
            badge.AddChild(MakeLabel(system.Role, 12, accent)); heading.AddChild(badge); block.AddChild(heading);
            block.AddChild(MakeLine("短板", system.Shortfall, new Color(0.62f, 0.59f, 0.54f), new Color(0.79f, 0.77f, 0.72f)));
            block.AddChild(MakeLine("建议", system.Advice, new Color(0.84f, 0.70f, 0.48f), new Color(0.93f, 0.89f, 0.81f)));
            _body.AddChild(block);
        }
        _shownKey = card.Key; _shownVersion = _version;
    }
    private static Label MakeLabel(string text, int size, Color color)
    {
        var label = new Label { Text = text, MouseFilter = Control.MouseFilterEnum.Ignore, AutowrapMode = TextServer.AutowrapMode.WordSmart, SizeFlagsHorizontal = Control.SizeFlags.ExpandFill };
        label.AddThemeFontSizeOverride("font_size", size); label.AddThemeColorOverride("font_color", color);
        try { FontControlUtils.ApplyLocaleFontSubstitution(label, FontType.Regular, "font"); } catch { }
        return label;
    }
    private static HBoxContainer MakeLine(string caption, string text, Color captionColor, Color textColor)
    {
        var line = new HBoxContainer { MouseFilter = Control.MouseFilterEnum.Ignore };
        line.AddThemeConstantOverride("separation", 10);
        var label = MakeLabel(caption, 12, captionColor);
        label.CustomMinimumSize = new(28, 0); label.SizeFlagsHorizontal = Control.SizeFlags.ShrinkBegin;
        line.AddChild(label); line.AddChild(MakeLabel(text, 14, textColor)); return line;
    }
    private static void Hide() { if (_panel is not null && GodotObject.IsInstanceValid(_panel)) _panel.Visible = false; }
    private static void Reset()
    {
        Context.Clear(); _cards = null; _targets = []; _shownKey = null;
        if (_panel is not null && GodotObject.IsInstanceValid(_panel)) _panel.QueueFree();
        _panel = null; _body = null;
    }
}
