$root = "C:\Users\Pruni\.gemini\antigravity\scratch\wms-app"
$port = 8080

# Registrar la URL para cualquier hostname (requiere admin)
netsh http add urlacl url=http://+:$port/ user=Everyone | Out-Null

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$port/")
$listener.Start()
Write-Host "Servidor corriendo en el puerto $port (acepta cualquier hostname)" -ForegroundColor Green

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    $path = $request.Url.LocalPath
    if ($path -eq "/") { $path = "/index.html" }

    $localPath = Join-Path $root $path.TrimStart("/")

    try {
        if (Test-Path $localPath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($localPath)
            switch ($ext) {
                ".html" { $response.ContentType = "text/html; charset=utf-8" }
                ".css"  { $response.ContentType = "text/css; charset=utf-8" }
                ".js"   { $response.ContentType = "application/javascript; charset=utf-8" }
                ".csv"  { $response.ContentType = "text/csv; charset=utf-8" }
                default { $response.ContentType = "application/octet-stream" }
            }
            $content = [System.IO.File]::ReadAllBytes($localPath)
            $response.ContentLength64 = $content.Length
            $response.OutputStream.Write($content, 0, $content.Length)
        } else {
            $response.StatusCode = 404
        }
    } catch {
        $response.StatusCode = 500
    }
    $response.Close()
}
