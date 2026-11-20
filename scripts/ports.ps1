function Get-MercuryFreePort {
    param([int]$PreferredPort, [int[]]$Reserved = @())
    if ($PreferredPort -lt 1 -or $PreferredPort -gt 65535) {
        throw 'El puerto debe estar entre 1 y 65535.'
    }
    for ($port = $PreferredPort; $port -le [Math]::Min(65535, $PreferredPort + 20); $port++) {
        if ($port -in $Reserved) { continue }
        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
        try {
            $listener.ExclusiveAddressUse = $true
            $listener.Start()
            return $port
        }
        catch [Net.Sockets.SocketException] {
            if ($_.Exception.SocketErrorCode -notin @('AddressAlreadyInUse', 'AccessDenied')) { throw }
        }
        finally { $listener.Stop() }
    }
    throw "No hay un puerto libre a partir de $PreferredPort. Revisa los puertos de Mercury en .env."
}
