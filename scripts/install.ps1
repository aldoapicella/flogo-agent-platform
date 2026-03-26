$ErrorActionPreference = "Stop"

$Repo = if ($env:FLOGO_AGENT_REPO) { $env:FLOGO_AGENT_REPO } else { "aldoapicella/flogo-agent-platform" }
$BaseUrl = if ($env:FLOGO_AGENT_BASE_URL) { $env:FLOGO_AGENT_BASE_URL } else { "https://github.com/$Repo/releases/latest/download" }
$InstallDir = if ($env:FLOGO_AGENT_INSTALL_DIR) { $env:FLOGO_AGENT_INSTALL_DIR } else { Join-Path $HOME ".local\bin" }
$BinaryName = "flogo-agent.exe"

switch ($env:PROCESSOR_ARCHITECTURE) {
  "AMD64" { $Arch = "amd64" }
  "ARM64" { $Arch = "arm64" }
  default { throw "Unsupported architecture: $env:PROCESSOR_ARCHITECTURE" }
}

$AssetName = "flogo-agent_windows_${Arch}.zip"
$ChecksumName = "flogo-agent_checksums.txt"
$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("flogo-agent-install-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $TempDir | Out-Null

try {
  $ZipPath = Join-Path $TempDir $AssetName
  $ChecksumPath = Join-Path $TempDir $ChecksumName
  Invoke-WebRequest -Uri "$BaseUrl/$AssetName" -OutFile $ZipPath
  Invoke-WebRequest -Uri "$BaseUrl/$ChecksumName" -OutFile $ChecksumPath

  $Expected = (Select-String -Path $ChecksumPath -Pattern " $AssetName$").Line.Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries)[0]
  $Actual = (Get-FileHash -Algorithm SHA256 -Path $ZipPath).Hash.ToLowerInvariant()
  if ($Expected.ToLowerInvariant() -ne $Actual) {
    throw "Checksum mismatch for $AssetName"
  }

  $ExtractDir = Join-Path $TempDir "extract"
  Expand-Archive -Path $ZipPath -DestinationPath $ExtractDir -Force
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  Copy-Item -Path (Join-Path $ExtractDir $BinaryName) -Destination (Join-Path $InstallDir $BinaryName) -Force

  Write-Host "Installed $BinaryName to $(Join-Path $InstallDir $BinaryName)"
  Write-Host ""
  Write-Host "Add $InstallDir to PATH if needed."
  Write-Host "Next step:"
  Write-Host "  flogo-agent"
}
finally {
  Remove-Item -Recurse -Force $TempDir
}
