[CmdletBinding()]
param(
    [string]$GithubOwner,
    [string]$RemoteUrl,
    [string]$RepoName = "cryptus",
    [string]$Branch = "main",
    [string]$Message = "Update cryptus",
    [switch]$CreateRepo
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git was not found in PATH."
}

function Invoke-External {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command,

        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$Arguments
    )

    $OldErrorActionPreference = $ErrorActionPreference

    try {
        # Native Programme wie git/gh schreiben auch Warnungen auf STDERR.
        # Diese Warnungen sollen das Skript nicht automatisch abbrechen.
        $ErrorActionPreference = "Continue"

        & $Command @Arguments
        $ExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $OldErrorActionPreference
    }

    if ($ExitCode -ne 0) {
        throw "$Command $Arguments failed with exit code $ExitCode"
    }
}

function Invoke-Git {
    $OldErrorActionPreference = $ErrorActionPreference

    try {
        # Git-Warnungen auf STDERR nicht als PowerShell-Abbruch behandeln.
        $ErrorActionPreference = "Continue"

        & git @args
        $ExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $OldErrorActionPreference
    }

    if ($ExitCode -ne 0) {
        throw "git $args failed with exit code $ExitCode"
    }
}

function Get-GithubOwnerFromGh {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        return ""
    }

    $OldErrorActionPreference = $ErrorActionPreference

    try {
        $ErrorActionPreference = "Continue"

        $Owner = (& gh api user --jq ".login" 2>$null)
        $ExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $OldErrorActionPreference
    }

    if ($ExitCode -eq 0 -and $Owner) {
        return $Owner.Trim()
    }

    return ""
}

if (-not $RemoteUrl) {

    if (-not $GithubOwner) {
        $GithubOwner = Get-GithubOwnerFromGh
    }

    if (-not $GithubOwner) {
        $GithubOwner = Read-Host "GitHub username or organization"
    }

    if (-not $GithubOwner) {
        throw "No GitHub owner was provided."
    }

    $RemoteUrl = "https://github.com/$GithubOwner/$RepoName.git"
}

Write-Host "Using remote: $RemoteUrl"

if ($CreateRepo) {

    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw "GitHub CLI 'gh' is required for -CreateRepo. Install it or create the repo manually on GitHub."
    }

    $RepoRef = "$GithubOwner/$RepoName"

    $OldErrorActionPreference = $ErrorActionPreference

    try {
        $ErrorActionPreference = "Continue"

        & gh repo view $RepoRef *> $null
        $RepoExistsExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $OldErrorActionPreference
    }

    if ($RepoExistsExitCode -ne 0) {
        Write-Host "Creating GitHub repository: $RepoRef"

        Invoke-External gh repo create `
            $RepoRef `
            --private `
            --source "." `
            --remote "origin"
    }
}

if (-not (Test-Path -LiteralPath ".git")) {

    Write-Host "Initializing Git repository..."

    Invoke-Git init
    Invoke-Git branch -M $Branch
}
else {

    $OldErrorActionPreference = $ErrorActionPreference

    try {
        $ErrorActionPreference = "Continue"

        $CurrentBranch = (& git branch --show-current).Trim()
        $BranchExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $OldErrorActionPreference
    }

    if ($BranchExitCode -ne 0) {
        throw "Could not determine current Git branch."
    }

    if ($CurrentBranch -and $CurrentBranch -ne $Branch) {
        Write-Host "Renaming branch '$CurrentBranch' to '$Branch'..."
        Invoke-Git branch -M $Branch
    }
}

Write-Host "Adding files..."

Invoke-Git add -A

$OldErrorActionPreference = $ErrorActionPreference

try {
    $ErrorActionPreference = "Continue"

    $Status = (& git status --porcelain)
    $StatusExitCode = $LASTEXITCODE
}
finally {
    $ErrorActionPreference = $OldErrorActionPreference
}

if ($StatusExitCode -ne 0) {
    throw "Could not determine Git status."
}

if ($Status) {

    Write-Host "Creating commit..."

    Invoke-Git commit -m $Message
}
else {
    Write-Host "No changes to commit."
}

$OldErrorActionPreference = $ErrorActionPreference

try {
    $ErrorActionPreference = "Continue"

    $ExistingOrigin = (& git remote get-url origin 2>$null)
    $RemoteExitCode = $LASTEXITCODE
}
finally {
    $ErrorActionPreference = $OldErrorActionPreference
}

$HasOrigin = ($RemoteExitCode -eq 0)

if ($HasOrigin) {

    Write-Host "Updating origin remote..."

    Invoke-Git remote set-url origin $RemoteUrl
}
else {

    Write-Host "Adding origin remote..."

    Invoke-Git remote add origin $RemoteUrl
}

Write-Host "Pushing branch '$Branch'..."

Invoke-Git push -u origin $Branch

Write-Host ""
Write-Host "Pushed $RepoName to GitHub successfully."