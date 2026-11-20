param([switch]$SkipDependencies, [switch]$Configure, [switch]$SkipConfiguration)
$ErrorActionPreference = 'Stop'
if ($Configure -and $SkipConfiguration) { throw 'Elige -Configure o -SkipConfiguration.' }
$MercuryRoot = Split-Path -Parent $PSScriptRoot
. "$PSScriptRoot/dotnet.ps1"
$MercuryDotnet = Get-MercuryDotnet -RequireSdk
function CheckExit { if ($LASTEXITCODE -ne 0) { throw "Error en el comando anterior ($LASTEXITCODE)." } }
$MercuryEnv = Join-Path $MercuryRoot '.env'
$venv = Join-Path $MercuryRoot '.venv'
if (-not $SkipDependencies) {
    if (-not (Test-Path "$venv/Scripts/python.exe")) { python -m venv $venv; CheckExit }
    & "$venv/Scripts/python.exe" -m pip install -r "$MercuryRoot/backend/requirements.txt"
    CheckExit
    npm.cmd --prefix "$MercuryRoot/frontend" ci --no-audit --no-fund
    CheckExit
}
& $MercuryDotnet build "$MercuryRoot/ssas-service/Mercury.Ssas.csproj"
CheckExit
if ($Configure -or (-not $SkipConfiguration -and -not (Test-Path $MercuryEnv))) {
    if (-not (Test-Path "$venv/Scripts/python.exe")) { throw 'Ejecuta primero setup.ps1 sin -SkipDependencies.' }
    & "$venv/Scripts/python.exe" "$PSScriptRoot/configure.py" $MercuryDotnet
    CheckExit
} elseif ($SkipConfiguration -and -not (Test-Path $MercuryEnv)) {
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $bytes = [byte[]]::new(32)
        $random.GetBytes($bytes)
        $key = [Convert]::ToBase64String($bytes)
    } finally { $random.Dispose() }
    $example = [IO.File]::ReadAllText((Join-Path $MercuryRoot '.env.example'))
    [IO.File]::WriteAllText($MercuryEnv, $example.Replace('MERCURY_SERVICE_KEY=', "MERCURY_SERVICE_KEY=$key"))
    Write-Host 'Plantilla .env creada. Consulta la configuracion avanzada antes de iniciar Mercury.'
} else {
    Write-Host 'Dependencias listas. Se conserva la configuracion existente.'
}
if (Test-Path $MercuryEnv) { Write-Host 'Ejecuta .\scripts\dev.ps1 para abrir Mercury.' }
