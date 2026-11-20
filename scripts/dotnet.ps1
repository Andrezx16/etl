function Get-MercuryDotnet {
    param([switch]$RequireSdk)
    $command = Get-Command dotnet.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    $workspace = Split-Path -Parent (Split-Path -Parent $MercuryRoot)
    $candidates = @(
        $env:MERCURY_DOTNET_EXE
        $command.Source
        (Join-Path $env:ProgramFiles 'dotnet/dotnet.exe')
        (Join-Path $workspace 'work/dotnet/dotnet.exe')
    )
    foreach ($candidate in $candidates) {
        if (-not $candidate -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
        $pattern = if ($RequireSdk) { '^8\.' } else { '^Microsoft\.AspNetCore\.App 8\.' }
        $option = if ($RequireSdk) { '--list-sdks' } else { '--list-runtimes' }
        if (& $candidate $option | Select-String -Pattern $pattern -Quiet) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    throw 'Mercury requiere .NET 8. Instala el SDK de .NET 8 o configura MERCURY_DOTNET_EXE con la ruta absoluta a dotnet.exe.'
}
