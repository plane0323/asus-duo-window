# List the connected displays for the pair's screen pickers.
# Physical pixels (the script declares DPI awareness), one object per screen.
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class DshScreens {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@
[void][DshScreens]::SetProcessDPIAware()
Add-Type -AssemblyName System.Windows.Forms

$list = @()
foreach ($s in [System.Windows.Forms.Screen]::AllScreens) {
  $b = $s.Bounds
  $list += [pscustomobject]@{
    device = $s.DeviceName
    primary = [bool]$s.Primary
    x = $b.X
    y = $b.Y
    width = $b.Width
    height = $b.Height
  }
}
[pscustomobject]@{ displays = $list } | ConvertTo-Json -Depth 4 -Compress
