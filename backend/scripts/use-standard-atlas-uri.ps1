param(
  [Parameter(Mandatory = $true)][string]$Hosts,
  [Parameter(Mandatory = $true)][string]$ReplicaSet
)

$ErrorActionPreference = 'Stop'
$environmentPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.env'))
$contents = [System.IO.File]::ReadAllText($environmentPath)
$match = [regex]::Match(
  $contents,
  '(?m)^MONGODB_URI=mongodb(?:\+srv)?://(?<username>[^:]+):(?<password>[^@]+)@[^/]+/(?<database>[^?\r\n]+)\?[^\r\n]*\r?$'
)
if (-not $match.Success) {
  throw 'Expected a MongoDB URI in backend/.env.'
}

$standardUri = 'mongodb://{0}:{1}@{2}/{3}?ssl=true&authSource=admin&replicaSet={4}&retryWrites=true&w=majority' -f `
  $match.Groups['username'].Value,
  $match.Groups['password'].Value,
  $Hosts,
  $match.Groups['database'].Value,
  $ReplicaSet

$updated = [regex]::Replace($contents, '(?m)^MONGODB_URI=.*$', "MONGODB_URI=$standardUri")
[System.IO.File]::WriteAllText($environmentPath, $updated, [System.Text.UTF8Encoding]::new($false))
Write-Output 'Local environment converted to the Atlas standard replica-set URI without exposing its password.'
