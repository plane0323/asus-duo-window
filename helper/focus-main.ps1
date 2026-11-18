# Move the DSH main window onto a chosen display and maximize it.
# Spawned by the input-window helper when the pair opens. Runs with the same
# token as the app, so the window messages are not blocked by UIPI.
#
# -Bounds "x,y,w,h"  target display bounds in physical pixels
#                    (omitted: the primary display's full screen)
param([string]$Bounds = '')
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class DshMain {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  public static List<string> All() {
    var list = new List<string>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(512);
      GetWindowTextW(h, sb, 512);
      string t = sb.ToString();
      if (t.Length == 0) return true;
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      RECT r;
      GetWindowRect(h, out r);
      list.Add(h.ToInt64() + "|" + pid + "|" + r.Left + "|" + r.Top + "|" + r.Right + "|" + r.Bottom + "|" + t);
      return true;
    }, IntPtr.Zero);
    return list;
  }
}
'@

[void][DshMain]::SetProcessDPIAware()

$tx = 0
$ty = 0
$tw = [DshMain]::GetSystemMetrics(0)
$th = [DshMain]::GetSystemMetrics(1)
$parts = @($Bounds -split ',')
if ($parts.Count -eq 4) {
  $px = 0
  if ([int]::TryParse($parts[0], [ref]$px) -and [int]::TryParse($parts[1], [ref]$px) -and [int]::TryParse($parts[2], [ref]$px) -and [int]::TryParse($parts[3], [ref]$px)) {
    $tx = [int]$parts[0]
    $ty = [int]$parts[1]
    $tw = [int]$parts[2]
    $th = [int]$parts[3]
  }
}
if ($tw -le 0 -or $th -le 0) { exit 1 }

# The desktop shell's process owns the main window; the input helper is electron.exe,
# so filtering by the app's process name keeps this off our own window.
$pids = @(Get-Process -Name 'DeepSeek Harness' | Select-Object -ExpandProperty Id)
if ($pids.Count -eq 0) { exit 1 }

$target = [IntPtr]::Zero
$targetArea = 0
foreach ($row in [DshMain]::All()) {
  $rowParts = $row -split '\|'
  $procId = [int]$rowParts[1]
  if ($pids -notcontains $procId) { continue }
  $w = [int]$rowParts[4] - [int]$rowParts[2]
  $h = [int]$rowParts[5] - [int]$rowParts[3]
  $area = $w * $h
  if ($area -gt $targetArea) {
    $target = [IntPtr][long]$rowParts[0]
    $targetArea = $area
  }
}
if ($target -eq [IntPtr]::Zero) { exit 1 }

$r = New-Object DshMain+RECT
[void][DshMain]::GetWindowRect($target, [ref]$r)
$zoomed = [DshMain]::IsZoomed($target)
$onTarget = ($r.Left -ge $tx - 24) -and ($r.Top -ge $ty - 24) -and ($r.Right -le $tx + $tw + 24) -and ($r.Bottom -le $ty + $th + 24)

# Already maximized on that screen: leave it alone (no flicker).
if ($zoomed -and $onTarget) { exit 0 }

if ($zoomed) { [void][DshMain]::ShowWindow($target, 9) }
[void][DshMain]::SetWindowPos($target, [IntPtr]::Zero, $tx, $ty, $tw, $th, 0x0040)
[void][DshMain]::ShowWindow($target, 3)
exit 0
