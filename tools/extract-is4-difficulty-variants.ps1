param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

& (Join-Path $PSScriptRoot 'extract-difficulty-variants.ps1') -ProjectRoot $ProjectRoot