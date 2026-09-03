[CmdletBinding()]
param(
    [string]$VersionFile
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $VersionFile) {
    $VersionFile = Join-Path $ProjectRoot "version.json"
}

$ResolvedVersionFile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($VersionFile)
$Today = Get-Date -Format "yyyy-MM-dd"
$Sequence = 1

if (Test-Path -LiteralPath $ResolvedVersionFile) {
    try {
        $Current = Get-Content -LiteralPath $ResolvedVersionFile -Raw | ConvertFrom-Json
        if ($Current.date -eq $Today -and $Current.sequence) {
            $Sequence = [int]$Current.sequence + 1
        }
    }
    catch {
        $Sequence = 1
    }
}

$Version = "$($Today.Replace("-", ".")).$Sequence"
$Data = [ordered]@{
    version = $Version
    date = $Today
    sequence = $Sequence
}

$Json = $Data | ConvertTo-Json
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($ResolvedVersionFile, $Json + [Environment]::NewLine, $Utf8NoBom)

Write-Host "Version: $Version"
