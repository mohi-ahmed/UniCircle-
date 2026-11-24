param([Parameter(Mandatory = $true)][string]$HostName)

$ErrorActionPreference = 'Stop'
$environmentPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.env'))
$contents = [System.IO.File]::ReadAllText($environmentPath)
$match = [regex]::Match(
  $contents,
  '(?m)^MONGODB_URI=mongodb://(?<username>[^:]+):(?<password>[^@]+)@[^/]+/(?<database>[^?\r\n]+)\?[^\r\n]*\r?$'
)
if (-not $match.Success) {
  throw 'Expected a standard MONGODB_URI in backend/.env.'
}

$directUri = 'mongodb://{0}:{1}@{2}:27017/{3}?tls=true&authSource=admin&directConnection=true&retryWrites=true&w=majority' -f `
  $match.Groups['username'].Value,
  $match.Groups['password'].Value,
  $HostName,
  $match.Groups['database'].Value

$updated = [regex]::Replace($contents, '(?m)^MONGODB_URI=.*$', "MONGODB_URI=$directUri")
[System.IO.File]::WriteAllText($environmentPath, $updated, [System.Text.UTF8Encoding]::new($false))
Write-Output 'Local environment converted to a direct Atlas node URI without exposing its password.'
