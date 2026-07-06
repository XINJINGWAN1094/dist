$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptPath = Join-Path $root 'video-course-helper.user.js'

if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "Missing video-course-helper.user.js"
}

$port = 17821
$url = "http://127.0.0.1:$port/video-course-helper.user.js"

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$port/")

try {
  $listener.Start()
} catch {
  Write-Host "Port $port is already in use. Try closing the other installer window, then run this again."
  Read-Host "Press Enter to exit"
  exit 1
}

Start-Process $url
Write-Host ""
Write-Host "Opened Tampermonkey install URL:"
Write-Host $url
Write-Host ""
Write-Host "Keep this window open until Tampermonkey finishes installing the script."
Write-Host "Press Ctrl+C after installation."
Write-Host ""

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $requestPath = $context.Request.Url.AbsolutePath.TrimStart('/')

  if ($requestPath -eq '' -or $requestPath -eq 'video-course-helper.user.js') {
    $content = Get-Content -Raw -LiteralPath $scriptPath
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
    $context.Response.ContentType = 'application/javascript; charset=utf-8'
    $context.Response.ContentLength64 = $bytes.Length
    $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $context.Response.StatusCode = 404
  }

  $context.Response.OutputStream.Close()
}
