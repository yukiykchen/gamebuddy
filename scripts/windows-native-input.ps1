param(
  [Parameter(Mandatory=$true)][ValidateSet('click','text')][string]$Action,
  [Parameter(Mandatory=$true)][int]$TargetProcessId,
  [int]$X, [int]$Y, [string]$TextBase64
)
$ErrorActionPreference = 'Stop'
# Test-only OS input. Do not use this helper to operate the game.
# https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-sendinput
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ComposerNativeInput {
  [StructLayout(LayoutKind.Sequential)] public struct Mouse {
    public int x, y; public uint data, flags, time; public UIntPtr extra;
  }
  [StructLayout(LayoutKind.Sequential)] public struct Key {
    public ushort vk, scan; public uint flags, time; public UIntPtr extra;
  }
  [StructLayout(LayoutKind.Explicit)] public struct Payload {
    [FieldOffset(0)] public Mouse mouse;
    [FieldOffset(0)] public Key key;
  }
  [StructLayout(LayoutKind.Sequential)] public struct Input { public uint type; public Payload data; }
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int x, y; }
  [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint n, Input[] inputs, int size);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point p);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  static void OwnsWindow(IntPtr window, uint expected) {
    uint actual; GetWindowThreadProcessId(window, out actual);
    if (actual != expected) throw new Exception("OS input target is not the test application; refusing input");
  }
  static void Send(Input[] inputs) {
    if (SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(Input))) != inputs.Length)
      throw new Exception("SendInput failed; native desktop may be unavailable, locked or elevated");
  }
  public static void Click(int x, int y, uint expected) {
    SetThreadDpiAwarenessContext(new IntPtr(-4));
    if (!SetCursorPos(x, y)) throw new Exception("SetCursorPos failed");
    System.Threading.Thread.Sleep(100);
    OwnsWindow(WindowFromPoint(new Point {x=x,y=y}), expected);
    var down = new Input(); down.data.mouse.flags = 0x0002;
    var up = new Input(); up.data.mouse.flags = 0x0004;
    Send(new Input[] {down,up});
  }
  public static void Type(string text, uint expected) {
    OwnsWindow(GetForegroundWindow(), expected);
    foreach (char c in text) {
      var down = new Input { type=1 }; down.data.key.scan=c; down.data.key.flags=0x0004;
      var up = down; up.data.key.flags=0x0004|0x0002;
      Send(new Input[] {down,up});
    }
  }
}
'@
if ($Action -eq 'click') {
  [ComposerNativeInput]::Click($X, $Y, $TargetProcessId)
} else {
  $content = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($TextBase64))
  [ComposerNativeInput]::Type($content, $TargetProcessId)
}

