<#
.SYNOPSIS
    Publish docs/wiki/ to the Alex_ACT_Extension GitHub wiki.

.DESCRIPTION
    Source of truth for wiki content is `docs/wiki/` in this repo, versioned
    alongside the extension. GitHub serves the wiki from a separate repo
    (`<repo>.wiki.git`) on the `master` branch. This script:

      1. Clones the wiki repo to a temp folder.
      2. Mirrors `docs/wiki/*.md` into it (overwrite + delete-extra).
      3. Commits any diff and pushes to `master`.
      4. Cleans up the temp clone.

    Idempotent: a no-diff run exits cleanly without committing.

.PARAMETER WikiRemote
    Git URL of the wiki repo. Defaults to the Alex_ACT_Extension wiki.

.PARAMETER Message
    Commit message. Defaults to "docs: sync wiki from docs/wiki (<utc-date>)".

.PARAMETER DryRun
    Show what would be committed without pushing.

.EXAMPLE
    pwsh ./scripts/publish-wiki.ps1
    pwsh ./scripts/publish-wiki.ps1 -Message "docs: fix Plugin Mall slash command"
    pwsh ./scripts/publish-wiki.ps1 -DryRun
#>
[CmdletBinding()]
param(
    [string]$WikiRemote = 'https://github.com/fabioc-aloha/Alex_ACT_Extension.wiki.git',
    [string]$Message,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# Resolve source dir relative to this script (scripts/ -> repo root -> docs/wiki).
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$srcDir = Join-Path $repoRoot 'docs/wiki'
if (-not (Test-Path $srcDir)) {
    throw "Source folder not found: $srcDir"
}

$wikiDir = Join-Path $env:TEMP ("Alex_ACT_Extension.wiki." + [Guid]::NewGuid().ToString('N').Substring(0, 8))

try {
    Write-Host "Cloning wiki to $wikiDir ..." -ForegroundColor Cyan
    git clone --quiet $WikiRemote $wikiDir
    if ($LASTEXITCODE -ne 0) { throw "git clone failed" }

    # Mirror: copy all source .md files, then remove wiki files that no longer exist in source.
    $srcFiles = Get-ChildItem -Path $srcDir -Filter *.md -File
    $srcNames = $srcFiles | ForEach-Object { $_.Name }

    foreach ($f in $srcFiles) {
        Copy-Item -Path $f.FullName -Destination (Join-Path $wikiDir $f.Name) -Force
    }

    Get-ChildItem -Path $wikiDir -Filter *.md -File | Where-Object {
        $srcNames -notcontains $_.Name
    } | ForEach-Object {
        Write-Host "  Removing stale: $($_.Name)" -ForegroundColor Yellow
        Remove-Item $_.FullName -Force
    }

    Push-Location $wikiDir
    try {
        $status = git status --porcelain
        if (-not $status) {
            Write-Host "Wiki already up to date. Nothing to publish." -ForegroundColor Green
            return
        }

        Write-Host "Pending wiki changes:" -ForegroundColor Cyan
        $status | ForEach-Object { Write-Host "  $_" }

        if ($DryRun) {
            Write-Host "[DryRun] Skipping commit and push." -ForegroundColor Yellow
            return
        }

        if (-not $Message) {
            $stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')
            $Message = "docs: sync wiki from docs/wiki ($stamp)"
        }

        $msgFile = Join-Path $env:TEMP ("wiki-commit-msg." + [Guid]::NewGuid().ToString('N').Substring(0, 8) + ".txt")
        Set-Content -Path $msgFile -Value $Message -NoNewline -Encoding UTF8

        git add -A
        if ($LASTEXITCODE -ne 0) { throw "git add failed" }

        git commit -F $msgFile
        if ($LASTEXITCODE -ne 0) { throw "git commit failed" }

        Remove-Item $msgFile -Force

        git push origin master
        if ($LASTEXITCODE -ne 0) { throw "git push failed" }

        Write-Host "Wiki published." -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}
finally {
    if (Test-Path $wikiDir) {
        Remove-Item -Recurse -Force $wikiDir -ErrorAction SilentlyContinue
    }
}
