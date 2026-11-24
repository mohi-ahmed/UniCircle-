param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [Parameter(Mandatory = $true)][string]$ClusterHost,
  [string]$DatabaseName = 'UniCircle',
  [string]$DatabaseUsername = 'unicircle_app',
  [string]$UniversityName = 'Southeast University'
)

$ErrorActionPreference = 'Stop'

$passwordBytes = New-Object byte[] 32
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$random.GetBytes($passwordBytes)
$random.Dispose()
$databasePassword = ([BitConverter]::ToString($passwordBytes) -replace '-', '').ToLowerInvariant()

& atlas dbusers create `
  --projectId $ProjectId `
  --username $DatabaseUsername `
  --password $databasePassword `
  --role "readWrite@$DatabaseName" `
  --desc 'UniCircle application backend' `
  --output json | Out-Null

if ($LASTEXITCODE -ne 0) {
  throw 'Atlas database user creation failed.'
}

$uri = "mongodb+srv://${DatabaseUsername}:${databasePassword}@${ClusterHost}/${DatabaseName}?retryWrites=true&w=majority"
$environment = @(
  'NODE_ENV=development'
  'PORT=3000'
  "MONGODB_URI=$uri"
  "MONGODB_DB_NAME=$DatabaseName"
  "UNIVERSITY_NAME=$UniversityName"
  'INITIAL_APPROVED_DOMAIN=seu.edu.bd'
) -join [Environment]::NewLine

$environmentPath = Join-Path $PSScriptRoot '..\.env'
[System.IO.File]::WriteAllText(
  [System.IO.Path]::GetFullPath($environmentPath),
  $environment + [Environment]::NewLine,
  [System.Text.UTF8Encoding]::new($false)
)

$databasePassword = $null
$passwordBytes = $null
Write-Output 'Atlas application user and local untracked environment configured.'
