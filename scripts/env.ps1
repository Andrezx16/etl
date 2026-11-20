$MercuryRoot = Split-Path -Parent $PSScriptRoot
$MercuryEnv = Join-Path $MercuryRoot '.env'
if (-not (Test-Path $MercuryEnv)) { throw 'Ejecuta scripts/setup.ps1 y configura el archivo .env.' }
foreach ($line in [IO.File]::ReadAllLines($MercuryEnv)) {
    if ($line -match '^([A-Z][A-Z0-9_]*)=(.*)$') {
        [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
    }
}
if ($env:MERCURY_SERVICE_KEY.Length -lt 24) { throw 'MERCURY_SERVICE_KEY debe tener 24 caracteres o más.' }
if ($env:MERCURY_SSAS_URL -notmatch '^http://127[.]0[.]0[.]1:[0-9]+$') { throw 'MERCURY_SSAS_URL requiere una dirección HTTP de loopback.' }
