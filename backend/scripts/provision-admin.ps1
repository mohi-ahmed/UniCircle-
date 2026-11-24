param(
  [Parameter(Mandatory = $true)][string]$UniversityEmail,
  [Parameter(Mandatory = $true)][string]$FullName,
  [Parameter(Mandatory = $true)][string]$DisplayName
)

$ErrorActionPreference = 'Stop'
$first = Read-Host 'Enter a new UniCircle admin password' -AsSecureString
$second = Read-Host 'Confirm the new UniCircle admin password' -AsSecureString
$firstPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($first)
$secondPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($second)

try {
  $firstPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($firstPointer)
  $secondPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secondPointer)
  if ($firstPlain -cne $secondPlain) {
    throw 'Passwords do not match.'
  }
  $env:UNICIRCLE_ADMIN_PASSWORD = $firstPlain
  & npx.cmd tsx scripts/provision-admin.ts $UniversityEmail $FullName $DisplayName
  if ($LASTEXITCODE -ne 0) {
    throw 'Administrator provisioning failed.'
  }
} finally {
  Remove-Item Env:UNICIRCLE_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  $firstPlain = $null
  $secondPlain = $null
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($firstPointer)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secondPointer)
}
