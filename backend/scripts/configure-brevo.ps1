param(
    [string]$EnvFile = (Join-Path $PSScriptRoot '..\.env')
)

$ErrorActionPreference = 'Stop'

$securePassword = Read-Host 'Paste the Brevo SMTP key' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
    $smtpPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)

    if ([string]::IsNullOrWhiteSpace($smtpPassword)) {
        throw 'Brevo SMTP key cannot be empty.'
    }

    $settings = [ordered]@{
        APP_BASE_URL = 'http://localhost:5173'
        EMAIL_FROM  = 'unicircleproject@gmail.com'
        SMTP_HOST   = 'smtp-relay.brevo.com'
        SMTP_PORT   = '587'
        SMTP_USER   = 'c4cecf001@smtp-brevo.com'
        SMTP_PASS   = $smtpPassword
    }

    $lines = [Collections.Generic.List[string]]::new()
    if (Test-Path -LiteralPath $EnvFile) {
        foreach ($line in Get-Content -LiteralPath $EnvFile) {
            $lines.Add($line)
        }
    }

    foreach ($entry in $settings.GetEnumerator()) {
        $prefix = "$($entry.Key)="
        $replacement = "$prefix$($entry.Value)"
        $matchIndex = -1

        for ($index = 0; $index -lt $lines.Count; $index++) {
            if ($lines[$index].StartsWith($prefix, [StringComparison]::Ordinal)) {
                $matchIndex = $index
                break
            }
        }

        if ($matchIndex -ge 0) {
            $lines[$matchIndex] = $replacement
        } else {
            $lines.Add($replacement)
        }
    }

    Set-Content -LiteralPath $EnvFile -Value $lines -Encoding utf8
    Write-Host 'Brevo SMTP settings saved to backend/.env.'
} finally {
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    $smtpPassword = $null
}
