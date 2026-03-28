param(
  [string]$BackupPath = "C:\Users\Sigfarm\Desktop\1password\1PasswordExport-366VMDPYJZDENJC77Z4HJN7ELY-20260311-102927.1pux",
  [string]$OutputBase = "C:\Users\Sigfarm\Desktop\1password",
  [int]$IconSize = 64,
  [int]$TimeoutSec = 20
)

$ErrorActionPreference = "Stop"

function Get-ExportDataFrom1pux {
  param([string]$Path)
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($Path)
  try {
    $entry = $zip.GetEntry("export.data")
    if (-not $entry) { throw "Arquivo export.data nao encontrado em $Path" }
    $reader = New-Object System.IO.StreamReader($entry.Open())
    try {
      return $reader.ReadToEnd()
    } finally {
      $reader.Dispose()
    }
  } finally {
    $zip.Dispose()
  }
}

function Get-UrlValues {
  param([object]$Node)
  $results = New-Object System.Collections.Generic.List[string]
  function Walk([object]$Current) {
    if ($null -eq $Current) { return }
    if ($Current -is [System.Collections.IEnumerable] -and -not ($Current -is [string])) {
      foreach ($item in $Current) { Walk $item }
      return
    }
    $props = $Current.PSObject.Properties
    if ($props) {
      foreach ($prop in $props) {
        $name = [string]$prop.Name
        $value = $prop.Value
        if ([string]::Equals($name, "url", [System.StringComparison]::OrdinalIgnoreCase)) {
          if ($value -is [string] -and $value.Trim().Length -gt 0) {
            [void]$results.Add($value.Trim())
          }
        }
        Walk $value
      }
    }
  }
  Walk $Node
  return $results
}

function Normalize-Domain {
  param([string]$Raw)
  if ([string]::IsNullOrWhiteSpace($Raw)) { return $null }
  $candidate = $Raw.Trim()
  if (-not ($candidate -match "^[a-zA-Z][a-zA-Z0-9+.-]*://")) {
    $candidate = "https://$candidate"
  }
  try {
    $uri = [Uri]$candidate
    if (-not $uri.Host) { return $null }
    return $uri.Host.ToLowerInvariant().Trim(".")
  } catch {
    return $null
  }
}

function Get-ApexDomain {
  param([string]$HostName)
  if ([string]::IsNullOrWhiteSpace($HostName)) { return $null }
  $h = $HostName.Trim().ToLowerInvariant().Trim(".")
  if ($h -match "^\d{1,3}(\.\d{1,3}){3}$") { return $h }
  if ($h.Contains(":")) { return $h }
  $parts = $h.Split(".")
  if ($parts.Count -le 2) { return $h }
  $commonSecondLevel = @("co", "com", "org", "net", "gov", "edu", "ac")
  $last = $parts[$parts.Count - 1]
  $penultimate = $parts[$parts.Count - 2]
  if ($last.Length -eq 2 -and $parts.Count -ge 3 -and $commonSecondLevel -contains $penultimate) {
    return ($parts[($parts.Count - 3)..($parts.Count - 1)] -join ".")
  }
  return ($parts[($parts.Count - 2)..($parts.Count - 1)] -join ".")
}

function Safe-FileBase {
  param([string]$Value)
  return ($Value -replace "[^a-zA-Z0-9._-]", "_")
}

function Get-StatusCodeSafe {
  param($Response)
  try {
    if ($Response -and $Response.StatusCode) { return [int]$Response.StatusCode }
  } catch {}
  try {
    if ($Response -and $Response.BaseResponse -and $Response.BaseResponse.StatusCode) {
      return [int]$Response.BaseResponse.StatusCode
    }
  } catch {}
  return $null
}

function Get-FinalUrlSafe {
  param($Response, [string]$Fallback)
  try {
    if ($Response -and $Response.BaseResponse -and $Response.BaseResponse.ResponseUri) {
      return [string]$Response.BaseResponse.ResponseUri.AbsoluteUri
    }
  } catch {}
  return $Fallback
}

function Get-ContentTypeSafe {
  param($Response)
  try {
    if ($Response -and $Response.Headers -and $Response.Headers["Content-Type"]) {
      return [string]$Response.Headers["Content-Type"]
    }
  } catch {}
  try {
    if (
      $Response -and
      $Response.BaseResponse -and
      $Response.BaseResponse.Content -and
      $Response.BaseResponse.Content.Headers -and
      $Response.BaseResponse.Content.Headers.ContentType
    ) {
      return [string]$Response.BaseResponse.Content.Headers.ContentType.MediaType
    }
  } catch {}
  return ""
}

function Ext-FromContentType {
  param([string]$ContentType, [string]$Uri)
  if ($ContentType) {
    $clean = $ContentType.ToLowerInvariant().Split(";")[0].Trim()
    switch ($clean) {
      "image/png" { return ".png" }
      "image/x-icon" { return ".ico" }
      "image/vnd.microsoft.icon" { return ".ico" }
      "image/svg+xml" { return ".svg" }
      "image/webp" { return ".webp" }
      "image/jpeg" { return ".jpg" }
      "image/gif" { return ".gif" }
    }
  }
  if ($Uri -match "\.ico($|\?)") { return ".ico" }
  return ".img"
}

function Test-ImagePayload {
  param(
    [byte[]]$Bytes,
    [string]$ContentType
  )
  if ($Bytes.Length -lt 4) { return $false }
  $isPng = $Bytes.Length -ge 8 -and $Bytes[0] -eq 0x89 -and $Bytes[1] -eq 0x50 -and $Bytes[2] -eq 0x4E -and $Bytes[3] -eq 0x47
  $isJpeg = $Bytes[0] -eq 0xFF -and $Bytes[1] -eq 0xD8
  $isGif = $Bytes[0] -eq 0x47 -and $Bytes[1] -eq 0x49 -and $Bytes[2] -eq 0x46
  $isIco = $Bytes[0] -eq 0x00 -and $Bytes[1] -eq 0x00 -and $Bytes[2] -eq 0x01 -and $Bytes[3] -eq 0x00
  $hasImageSignature = $isPng -or $isJpeg -or $isGif -or $isIco

  $headText = ""
  try {
    $headText = [System.Text.Encoding]::UTF8.GetString($Bytes, 0, [Math]::Min($Bytes.Length, 180)).ToLowerInvariant()
  } catch {}
  $looksLikeHtml = $headText.Contains("<!doctype html") -or $headText.Contains("<html") -or $headText.Contains("<script")

  $hasImageContentType = $false
  if (-not [string]::IsNullOrWhiteSpace($ContentType)) {
    $hasImageContentType = $ContentType.ToLowerInvariant().StartsWith("image/")
  }

  if ($hasImageContentType) { return $true }
  if ($hasImageSignature -and -not $looksLikeHtml) { return $true }
  return $false
}

function New-FailRecord {
  param(
    [string]$SourceHost,
    [string]$Variant,
    [string]$QueryDomain,
    [string]$ApiName,
    [string]$Reason,
    [double]$LatencyMs = 0,
    [int]$CandidateCount = 0,
    [int]$AttemptCount = 0,
    [string]$ResolvedBy = "",
    [string]$ReasonCode = ""
  )
  return [pscustomobject]@{
    sourceHost = $SourceHost
    variant = $Variant
    queryDomain = $QueryDomain
    api = $ApiName
    ok = $false
    status = $null
    contentType = ""
    file = ""
    error = $Reason
    latencyMs = [Math]::Round($LatencyMs, 2)
    sourceUrl = ""
    finalUrl = ""
    candidateCount = $CandidateCount
    attemptCount = $AttemptCount
    resolvedBy = $ResolvedBy
    reasonCode = $ReasonCode
  }
}

function Invoke-DownloadImage {
  param(
    [string]$Uri,
    [string]$OutDir,
    [string]$ApiName,
    [string]$SourceHost,
    [string]$Variant,
    [string]$QueryDomain,
    [string]$FileStem,
    [hashtable]$Headers = @{}
  )
  $timer = [System.Diagnostics.Stopwatch]::StartNew()
  $tmpFile = Join-Path $env:TEMP ([Guid]::NewGuid().ToString("N") + ".tmp")
  try {
    $response = Invoke-WebRequest -Uri $Uri -OutFile $tmpFile -TimeoutSec $TimeoutSec -MaximumRedirection 8 -Headers $Headers
    $contentType = Get-ContentTypeSafe $response
    $bytes = [System.IO.File]::ReadAllBytes($tmpFile)
    if (-not (Test-ImagePayload -Bytes $bytes -ContentType $contentType)) {
      throw "non_image_payload_detected"
    }
    $ext = Ext-FromContentType -ContentType $contentType -Uri $Uri
    if ($ext -eq ".img") {
      if ($bytes.Length -ge 8 -and $bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50 -and $bytes[2] -eq 0x4E -and $bytes[3] -eq 0x47) { $ext = ".png" }
      elseif ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xD8) { $ext = ".jpg" }
      elseif ($bytes[0] -eq 0x00 -and $bytes[1] -eq 0x00 -and $bytes[2] -eq 0x01 -and $bytes[3] -eq 0x00) { $ext = ".ico" }
    }
    $target = Join-Path $OutDir ((Safe-FileBase $FileStem) + $ext)
    Move-Item -Force -LiteralPath $tmpFile -Destination $target
    $timer.Stop()
    return [pscustomobject]@{
      sourceHost = $SourceHost
      variant = $Variant
      queryDomain = $QueryDomain
      api = $ApiName
      ok = $true
      status = Get-StatusCodeSafe $response
      contentType = $contentType
      file = $target
      error = ""
      latencyMs = [Math]::Round($timer.Elapsed.TotalMilliseconds, 2)
      sourceUrl = $Uri
      finalUrl = Get-FinalUrlSafe -Response $response -Fallback $Uri
      candidateCount = 0
      attemptCount = 1
      resolvedBy = ""
      reasonCode = ""
    }
  } catch {
    if (Test-Path $tmpFile) {
      Remove-Item -Force -LiteralPath $tmpFile -ErrorAction SilentlyContinue
    }
    $timer.Stop()
    $status = $null
    try {
      if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
        $status = [int]$_.Exception.Response.StatusCode
      }
    } catch {}
    return [pscustomobject]@{
      sourceHost = $SourceHost
      variant = $Variant
      queryDomain = $QueryDomain
      api = $ApiName
      ok = $false
      status = $status
      contentType = ""
      file = ""
      error = $_.Exception.Message
      latencyMs = [Math]::Round($timer.Elapsed.TotalMilliseconds, 2)
      sourceUrl = $Uri
      finalUrl = ""
      candidateCount = 0
      attemptCount = 1
      resolvedBy = ""
      reasonCode = ""
    }
  }
}

function Resolve-RelativeUrl {
  param([string]$Href, [string]$BaseUrl)
  if ([string]::IsNullOrWhiteSpace($Href)) { return $null }
  try {
    return [Uri]::new([Uri]$BaseUrl, $Href).AbsoluteUri
  } catch {
    return $null
  }
}

function Get-AttributeValue {
  param(
    [string]$Tag,
    [string]$Name
  )
  $pattern = "(?i)\b$Name\s*=\s*(?:""([^""]*)""|'([^']*)'|([^\s>]+))"
  $m = [regex]::Match($Tag, $pattern)
  if (-not $m.Success) { return "" }
  foreach ($idx in 1..3) {
    $v = [string]$m.Groups[$idx].Value
    if (-not [string]::IsNullOrWhiteSpace($v)) { return $v.Trim() }
  }
  return ""
}

function Get-IconSizeBonus {
  param([string]$SizesRaw)
  $sizes = [string]$SizesRaw
  if ([string]::IsNullOrWhiteSpace($sizes)) { return 0 }
  $sizes = $sizes.Trim().ToLowerInvariant()
  if ($sizes.Contains("any")) { return 10 }
  $maxSize = 0
  foreach ($entry in ($sizes -split "\s+")) {
    $m = [regex]::Match($entry, "^(\d{1,4})x(\d{1,4})$")
    if (-not $m.Success) { continue }
    $w = [int]$m.Groups[1].Value
    $h = [int]$m.Groups[2].Value
    $maxSize = [Math]::Max($maxSize, [Math]::Min($w, $h))
  }
  if ($maxSize -ge 192) { return 24 }
  if ($maxSize -ge 128) { return 20 }
  if ($maxSize -ge 64) { return 14 }
  if ($maxSize -ge 32) { return 8 }
  if ($maxSize -gt 0) { return 4 }
  return 0
}

function Get-IconTypeBonus {
  param([string]$TypeRaw)
  $mime = [string]$TypeRaw
  if ([string]::IsNullOrWhiteSpace($mime)) { return 0 }
  $mime = $mime.Trim().ToLowerInvariant()
  if ($mime -eq "image/svg+xml") { return 8 }
  if ($mime -eq "image/png" -or $mime -eq "image/webp") { return 6 }
  if ($mime -eq "image/x-icon" -or $mime -eq "image/vnd.microsoft.icon") { return 4 }
  if ($mime.StartsWith("image/")) { return 2 }
  return 0
}

function Get-CurrentFlowCandidates {
  param([string]$Domain)
  $normalizedDomain = Normalize-Domain $Domain
  if (-not $normalizedDomain) { return @() }
  $homepageUrl = "https://$normalizedDomain/"
  $candidates = New-Object System.Collections.Generic.List[object]
  $manifests = New-Object System.Collections.Generic.List[string]

  try {
    $home = Invoke-WebRequest -Uri $homepageUrl -TimeoutSec $TimeoutSec -MaximumRedirection 4
    $baseUrl = if ($home.BaseResponse.ResponseUri) { [string]$home.BaseResponse.ResponseUri.AbsoluteUri } else { $homepageUrl }
    $html = [string]$home.Content
    if ($html.Length -gt 0) {
      $linkTags = [regex]::Matches($html, "<link\b[^>]*>", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
      foreach ($match in $linkTags) {
        $tag = [string]$match.Value
        $rel = (Get-AttributeValue -Tag $tag -Name "rel").ToLowerInvariant()
        $href = Get-AttributeValue -Tag $tag -Name "href"
        $sizes = Get-AttributeValue -Tag $tag -Name "sizes"
        $type = Get-AttributeValue -Tag $tag -Name "type"
        if ([string]::IsNullOrWhiteSpace($href)) { continue }
        $candidateUrl = Resolve-RelativeUrl -Href $href -BaseUrl $baseUrl
        if (-not $candidateUrl) { continue }
        if ($rel -match "(^|\s)manifest(\s|$)") {
          [void]$manifests.Add($candidateUrl)
          continue
        }
        $sizeBonus = Get-IconSizeBonus $sizes
        $typeBonus = Get-IconTypeBonus $type
        if ($rel -match "(^|\s)icon(\s|$)" -or $rel -eq "shortcut icon") {
          [void]$candidates.Add([pscustomobject]@{
            url = $candidateUrl
            score = 120 + $sizeBonus + $typeBonus
            resolvedBy = "html_link_icon"
            reasonCode = "head_link_icon"
          })
          continue
        }
        if ($rel -match "apple-touch-icon") {
          [void]$candidates.Add([pscustomobject]@{
            url = $candidateUrl
            score = 100 + $sizeBonus + $typeBonus
            resolvedBy = "apple_touch_icon"
            reasonCode = "head_apple_touch_icon"
          })
          continue
        }
        if ($rel -match "(^|\s)mask-icon(\s|$)") {
          [void]$candidates.Add([pscustomobject]@{
            url = $candidateUrl
            score = 60 + $sizeBonus + $typeBonus
            resolvedBy = "mask_icon"
            reasonCode = "head_mask_icon"
          })
        }
      }
    }
  } catch {}

  foreach ($manifestUrl in ($manifests | Select-Object -Unique)) {
    try {
      $manifestResponse = Invoke-WebRequest -Uri $manifestUrl -TimeoutSec $TimeoutSec -MaximumRedirection 3
      $manifestPayload = [string]$manifestResponse.Content
      $manifest = $manifestPayload | ConvertFrom-Json -Depth 8
      if ($manifest -and $manifest.icons -is [System.Collections.IEnumerable]) {
        foreach ($icon in $manifest.icons) {
          if (-not $icon -or -not $icon.src) { continue }
          $candidateUrl = Resolve-RelativeUrl -Href ([string]$icon.src) -BaseUrl $manifestUrl
          if (-not $candidateUrl) { continue }
          $sizeBonus = Get-IconSizeBonus ([string]$icon.sizes)
          $typeBonus = Get-IconTypeBonus ([string]$icon.type)
          $purposeBonus = if ([string]$icon.purpose -match "maskable") { 6 } else { 0 }
          [void]$candidates.Add([pscustomobject]@{
            url = $candidateUrl
            score = 80 + $sizeBonus + $typeBonus + $purposeBonus
            resolvedBy = "manifest_icon"
            reasonCode = "manifest_icon"
          })
        }
      }
    } catch {}
  }

  $candidateHosts = New-Object System.Collections.Generic.HashSet[string]
  [void]$candidateHosts.Add($normalizedDomain)
  if ($normalizedDomain.StartsWith("www.") -and $normalizedDomain.Length -gt 4) {
    [void]$candidateHosts.Add($normalizedDomain.Substring(4))
  }
  $apex = Get-ApexDomain $normalizedDomain
  if ($apex) {
    [void]$candidateHosts.Add($apex)
    [void]$candidateHosts.Add("www.$apex")
  }

  foreach ($candidateHost in $candidateHosts) {
    if ([string]::IsNullOrWhiteSpace($candidateHost)) { continue }
    $penalty = if ($candidateHost -eq $normalizedDomain) { 0 } else { 8 }
    [void]$candidates.Add([pscustomobject]@{ url = "https://$candidateHost/favicon.ico"; score = 70 - $penalty; resolvedBy = "conventional_path"; reasonCode = "conventional_favicon_ico" })
    [void]$candidates.Add([pscustomobject]@{ url = "https://$candidateHost/apple-touch-icon.png"; score = 65 - $penalty; resolvedBy = "conventional_path"; reasonCode = "conventional_apple_touch_icon" })
    [void]$candidates.Add([pscustomobject]@{ url = "https://$candidateHost/favicon.svg"; score = 62 - $penalty; resolvedBy = "conventional_path"; reasonCode = "conventional_favicon_svg" })
    [void]$candidates.Add([pscustomobject]@{ url = "https://$candidateHost/favicon.png"; score = 60 - $penalty; resolvedBy = "conventional_path"; reasonCode = "conventional_favicon_png" })
    [void]$candidates.Add([pscustomobject]@{ url = "https://$candidateHost/favicon.jpg"; score = 58 - $penalty; resolvedBy = "conventional_path"; reasonCode = "conventional_favicon_jpg" })
    [void]$candidates.Add([pscustomobject]@{ url = "https://$candidateHost/favicon.jpeg"; score = 57 - $penalty; resolvedBy = "conventional_path"; reasonCode = "conventional_favicon_jpeg" })
    [void]$candidates.Add([pscustomobject]@{ url = "https://$candidateHost/favicon.webp"; score = 56 - $penalty; resolvedBy = "conventional_path"; reasonCode = "conventional_favicon_webp" })
    [void]$candidates.Add([pscustomobject]@{ url = "https://$candidateHost/apple-touch-icon-precomposed.png"; score = 55 - $penalty; resolvedBy = "conventional_path"; reasonCode = "conventional_apple_touch_icon_precomposed" })
  }

  [void]$candidates.Add([pscustomobject]@{
    url = "https://www.google.com/s2/favicons?domain=$([uri]::EscapeDataString($normalizedDomain))&sz=64"
    score = 30
    resolvedBy = "s2_fallback"
    reasonCode = "fallback_s2_host"
  })
  if ($apex -and $apex -ne $normalizedDomain) {
    [void]$candidates.Add([pscustomobject]@{
      url = "https://www.google.com/s2/favicons?domain=$([uri]::EscapeDataString($apex))&sz=64"
      score = 20
      resolvedBy = "s2_fallback"
      reasonCode = "fallback_s2_apex"
    })
  }

  $bestByUrl = @{}
  foreach ($candidate in $candidates) {
    try {
      $u = [Uri]$candidate.url
      if ($u.Scheme -ne "https") { continue }
    } catch { continue }
    $existing = $bestByUrl[$candidate.url]
    if ($null -eq $existing -or [int]$existing.score -lt [int]$candidate.score) {
      $bestByUrl[$candidate.url] = $candidate
    }
  }
  return @($bestByUrl.Values | Sort-Object -Property score -Descending)
}

function Invoke-ResolveCurrentFlowIcon {
  param(
    [string]$OutDir,
    [string]$SourceHost,
    [string]$Variant,
    [string]$QueryDomain,
    [string]$FileStem
  )
  $apiName = "vaultlite-current-flow"
  $timer = [System.Diagnostics.Stopwatch]::StartNew()
  $candidates = Get-CurrentFlowCandidates -Domain $QueryDomain
  if (-not $candidates -or $candidates.Count -eq 0) {
    $timer.Stop()
    return New-FailRecord -SourceHost $SourceHost -Variant $Variant -QueryDomain $QueryDomain -ApiName $apiName -Reason "no_candidates" -LatencyMs $timer.Elapsed.TotalMilliseconds
  }
  $attempt = 0
  foreach ($candidate in $candidates) {
    $attempt++
    $result = Invoke-DownloadImage -Uri $candidate.url -OutDir $OutDir -ApiName $apiName -SourceHost $SourceHost -Variant $Variant -QueryDomain $QueryDomain -FileStem $FileStem
    if ($result.ok) {
      $timer.Stop()
      $result.latencyMs = [Math]::Round($timer.Elapsed.TotalMilliseconds, 2)
      $result.candidateCount = $candidates.Count
      $result.attemptCount = $attempt
      $result.resolvedBy = $candidate.resolvedBy
      $result.reasonCode = $candidate.reasonCode
      return $result
    }
  }
  $timer.Stop()
  return New-FailRecord -SourceHost $SourceHost -Variant $Variant -QueryDomain $QueryDomain -ApiName $apiName -Reason "no_candidate_succeeded" -LatencyMs $timer.Elapsed.TotalMilliseconds -CandidateCount $candidates.Count -AttemptCount $attempt
}

function Get-Percentile {
  param([double[]]$Values, [double]$Percent)
  if (-not $Values -or $Values.Count -eq 0) { return $null }
  $sorted = @($Values | Sort-Object)
  if ($sorted.Count -eq 1) { return [double]$sorted[0] }
  $rank = ($Percent / 100.0) * ($sorted.Count - 1)
  $low = [Math]::Floor($rank)
  $high = [Math]::Ceiling($rank)
  if ($low -eq $high) { return [double]$sorted[$low] }
  $weight = $rank - $low
  return ([double]$sorted[$low] * (1 - $weight)) + ([double]$sorted[$high] * $weight)
}

function Get-LatencyStats {
  param([array]$Rows)
  if (-not $Rows -or $Rows.Count -eq 0) {
    return [pscustomobject]@{ count = 0; min = $null; avg = $null; p50 = $null; p95 = $null; max = $null }
  }
  $latencies = @(
    $Rows |
      ForEach-Object {
        if ($null -eq $_.latencyMs) { 0.0 } else { [double]$_.latencyMs }
      } |
      Where-Object { $_ -ge 0 }
  )
  if ($latencies.Count -eq 0) {
    return [pscustomobject]@{ count = 0; min = $null; avg = $null; p50 = $null; p95 = $null; max = $null }
  }
  return [pscustomobject]@{
    count = $latencies.Count
    min = [Math]::Round(($latencies | Measure-Object -Minimum).Minimum, 2)
    avg = [Math]::Round(($latencies | Measure-Object -Average).Average, 2)
    p50 = [Math]::Round((Get-Percentile -Values $latencies -Percent 50), 2)
    p95 = [Math]::Round((Get-Percentile -Values $latencies -Percent 95), 2)
    max = [Math]::Round(($latencies | Measure-Object -Maximum).Maximum, 2)
  }
}

function Build-CompareHtml {
  param(
    [string]$Root,
    [array]$SummaryRows,
    [array]$ApiNames
  )
  Add-Type -AssemblyName System.Web
  $grouped = $SummaryRows | Group-Object sourceHost | Sort-Object Name
  $stats = @{}
  foreach ($api in $ApiNames) {
    $rows = @($SummaryRows | Where-Object { $_.api -eq $api })
    $hostRows = @($rows | Where-Object { $_.variant -eq "host" })
    $apexRows = @($rows | Where-Object { $_.variant -eq "apex" })
    $hostOk = @($hostRows | Where-Object { $_.ok -eq $true })
    $apexOk = @($apexRows | Where-Object { $_.ok -eq $true })
    $allOk = @($rows | Where-Object { $_.ok -eq $true })
    $stats[$api] = [pscustomobject]@{
      hostOk = $hostOk.Count
      hostTotal = $hostRows.Count
      apexOk = $apexOk.Count
      apexTotal = $apexRows.Count
      totalOk = $allOk.Count
      total = $rows.Count
      latencyHost = Get-LatencyStats $hostOk
      latencyApex = Get-LatencyStats $apexOk
      latencyAll = Get-LatencyStats $allOk
    }
  }

  function RecordInnerHtml {
    param($Record)
    if (-not $Record) {
      return "<div class='cell fail'><div class='bad'>sem registro</div></div>"
    }
    $status = if ($null -eq $Record.status) { "-" } else { [string]$Record.status }
    $queryLabel = if ([string]::IsNullOrWhiteSpace($Record.queryDomain)) { "-" } else { [System.Web.HttpUtility]::HtmlEncode($Record.queryDomain) }
    $lat = [System.Web.HttpUtility]::HtmlEncode([string]$Record.latencyMs)
    if ($Record.ok -eq $true) {
      $leaf = [System.IO.Path]::GetFileName($Record.file)
      $apiDir = [System.Web.HttpUtility]::HtmlEncode($Record.api)
      $leafEsc = [System.Uri]::EscapeDataString($leaf)
      $resolvedBy = if ([string]::IsNullOrWhiteSpace($Record.resolvedBy)) { "-" } else { [System.Web.HttpUtility]::HtmlEncode($Record.resolvedBy) }
      return @"
<div class='cell ok'>
  <img loading='lazy' src='./$apiDir/$leafEsc' alt='$apiDir icon' />
  <div class='meta'>query: $queryLabel</div>
  <div class='meta'>latency: $lat ms</div>
  <div class='meta'>status: $status</div>
  <div class='meta'>resolvedBy: $resolvedBy</div>
</div>
"@
    }
    $err = if ([string]::IsNullOrWhiteSpace($Record.error)) { "-" } else { [System.Web.HttpUtility]::HtmlEncode($Record.error) }
    return @"
<div class='cell fail'>
  <div class='bad'>falhou</div>
  <div class='meta'>query: $queryLabel</div>
  <div class='meta'>latency: $lat ms</div>
  <div class='meta'>status: $status</div>
  <div class='meta'>erro: $err</div>
</div>
"@
  }

  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine("<!doctype html>")
  [void]$sb.AppendLine("<html lang='pt-BR'><head><meta charset='utf-8'/><meta name='viewport' content='width=device-width,initial-scale=1'/>")
  [void]$sb.AppendLine("<title>Favicon API Compare</title>")
  [void]$sb.AppendLine("<style>body{font-family:Segoe UI,Arial,sans-serif;background:#0f1115;color:#e8eaf0;margin:0}.wrap{max-width:2400px;margin:0 auto;padding:20px}h1{margin:0 0 6px 0;font-size:22px}.sub{opacity:.8;margin-bottom:12px}.stats{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0 18px}.card{background:#171a21;border:1px solid #2c3240;border-radius:10px;padding:8px 12px;min-width:300px}table{width:100%;border-collapse:collapse;background:#171a21;border:1px solid #2c3240}th,td{border-bottom:1px solid #252b38;vertical-align:top;padding:8px}th{position:sticky;top:0;background:#1d2230;z-index:1;text-align:left}.domain{font-family:Consolas,monospace;font-size:12px;word-break:break-all;max-width:340px}.split{display:grid;grid-template-columns:1fr 1fr;gap:8px}.variant{border:1px solid #252b38;border-radius:8px;padding:6px;background:#121722}.variant .vtitle{font-size:11px;opacity:.85;margin-bottom:4px;text-transform:uppercase;letter-spacing:.3px}.cell{min-height:100px}.cell img{width:64px;height:64px;display:block;background:#fff;border-radius:8px;border:1px solid #c9d0e0}.cell .meta{font-size:11px;opacity:.8;margin-top:4px;word-break:break-word}.bad{display:inline-block;background:#4a1f24;color:#ffb3b9;border:1px solid #7f333c;border-radius:999px;padding:2px 8px;font-size:11px}</style></head><body><div class='wrap'>")
  [void]$sb.AppendLine("<h1>Comparativo de Favicon APIs (host vs apex)</h1>")
  [void]$sb.AppendLine("<div class='sub'>Pasta: <code>$([System.Web.HttpUtility]::HtmlEncode($Root))</code></div>")
  [void]$sb.AppendLine("<div class='sub'>Gerado em: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")</div>")
  [void]$sb.AppendLine("<div class='stats'>")
  foreach ($api in $ApiNames) {
    $st = $stats[$api]
    $la = $st.latencyAll
    [void]$sb.AppendLine("<div class='card'><strong>$api</strong><br/>host: $($st.hostOk)/$($st.hostTotal) | apex: $($st.apexOk)/$($st.apexTotal)<br/>total: $($st.totalOk)/$($st.total)<br/>lat(ms) avg/p50/p95: $($la.avg)/$($la.p50)/$($la.p95)</div>")
  }
  [void]$sb.AppendLine("</div>")
  [void]$sb.Append("<table><thead><tr><th>domain</th>")
  foreach ($api in $ApiNames) { [void]$sb.Append("<th>$([System.Web.HttpUtility]::HtmlEncode($api))</th>") }
  [void]$sb.AppendLine("</tr></thead><tbody>")

  foreach ($group in $grouped) {
    $domain = [System.Web.HttpUtility]::HtmlEncode($group.Name)
    $map = @{}
    foreach ($record in $group.Group) { $map["$($record.api)|$($record.variant)"] = $record }
    [void]$sb.AppendLine("<tr><td class='domain'>$domain</td>")
    foreach ($api in $ApiNames) {
      $hostRecord = $map["$api|host"]
      $apexRecord = $map["$api|apex"]
      [void]$sb.AppendLine("<td><div class='split'><div class='variant'><div class='vtitle'>host</div>$(RecordInnerHtml $hostRecord)</div><div class='variant'><div class='vtitle'>apex</div>$(RecordInnerHtml $apexRecord)</div></div></td>")
    }
    [void]$sb.AppendLine("</tr>")
  }
  [void]$sb.AppendLine("</tbody></table></div></body></html>")
  $htmlPath = Join-Path $Root "compare.html"
  Set-Content -Path $htmlPath -Encoding UTF8 -Value $sb.ToString()
  return $htmlPath
}

if (-not (Test-Path $BackupPath)) {
  throw "Arquivo nao encontrado: $BackupPath"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outRoot = Join-Path $OutputBase ("favicon-api-compare-$stamp")
New-Item -ItemType Directory -Force -Path $outRoot | Out-Null

$apiSpecs = @(
  @{ name = "google-s2"; dir = "google-s2"; type = "direct"; build = { param($d, $s) "https://www.google.com/s2/favicons?domain=$d&sz=$s" } },
  @{ name = "duckduckgo-ip3"; dir = "duckduckgo-ip3"; type = "direct"; build = { param($d, $s) "https://icons.duckduckgo.com/ip3/$d.ico" } },
  @{ name = "icon-horse"; dir = "icon-horse"; type = "direct"; build = { param($d, $s) "https://icon.horse/icon/$d" } },
  @{ name = "faviconextractor"; dir = "faviconextractor"; type = "direct"; build = { param($d, $s) "https://www.faviconextractor.com/favicon/$d" } },
  @{ name = "favicon-vemetric"; dir = "favicon-vemetric"; type = "direct"; build = { param($d, $s) "https://favicon.vemetric.com/$d" } },
  @{ name = "vaultlite-current-flow"; dir = "vaultlite-current-flow"; type = "current_flow" }
)

foreach ($api in $apiSpecs) {
  New-Item -ItemType Directory -Force -Path (Join-Path $outRoot $api.dir) | Out-Null
}

$jsonText = Get-ExportDataFrom1pux -Path $BackupPath
$data = $jsonText | ConvertFrom-Json
$hosts = Get-UrlValues $data |
  ForEach-Object { Normalize-Domain $_ } |
  Where-Object { $_ -and $_.Length -gt 0 } |
  Sort-Object -Unique

$targets = New-Object System.Collections.Generic.List[object]
foreach ($source in $hosts) {
  $apex = Get-ApexDomain -HostName $source
  [void]$targets.Add([pscustomobject]@{ sourceHost = $source; variant = "host"; queryDomain = $source })
  [void]$targets.Add([pscustomobject]@{ sourceHost = $source; variant = "apex"; queryDomain = $apex })
}

$summary = New-Object System.Collections.Generic.List[object]
$index = 0
foreach ($target in $targets) {
  $index++
  $sourceHost = [string]$target.sourceHost
  $variant = [string]$target.variant
  $queryDomain = [string]$target.queryDomain
  $fileStem = "{0}__{1}__{2}" -f $sourceHost, $variant, $queryDomain

  if ([string]::IsNullOrWhiteSpace($queryDomain)) {
    foreach ($api in $apiSpecs) {
      [void]$summary.Add((New-FailRecord -SourceHost $sourceHost -Variant $variant -QueryDomain $queryDomain -ApiName $api.name -Reason "invalid_query_domain"))
    }
    continue
  }

  foreach ($api in $apiSpecs) {
    $apiName = $api.name
    $apiOutDir = Join-Path $outRoot $api.dir
    switch ($api.type) {
      "direct" {
        $uri = & $api.build $queryDomain $IconSize
        $result = Invoke-DownloadImage -Uri $uri -OutDir $apiOutDir -ApiName $apiName -SourceHost $sourceHost -Variant $variant -QueryDomain $queryDomain -FileStem $fileStem
        [void]$summary.Add($result)
      }
      "current_flow" {
        $result = Invoke-ResolveCurrentFlowIcon -OutDir $apiOutDir -SourceHost $sourceHost -Variant $variant -QueryDomain $queryDomain -FileStem $fileStem
        [void]$summary.Add($result)
      }
      default {
        [void]$summary.Add((New-FailRecord -SourceHost $sourceHost -Variant $variant -QueryDomain $queryDomain -ApiName $apiName -Reason "unsupported_api_type"))
      }
    }
    Start-Sleep -Milliseconds 60
  }

  if (($index % 20) -eq 0 -or $index -eq $targets.Count) {
    Write-Output ("Progress: {0}/{1} targets" -f $index, $targets.Count)
  }
}

$hostsPath = Join-Path $outRoot "hosts.txt"
$targetsCsvPath = Join-Path $outRoot "targets.csv"
$summaryCsvPath = Join-Path $outRoot "summary.csv"
$summaryJsonPath = Join-Path $outRoot "summary.json"
$statsJsonPath = Join-Path $outRoot "stats.json"

$hosts | Set-Content -Path $hostsPath -Encoding UTF8
$targets | Export-Csv -Path $targetsCsvPath -NoTypeInformation -Encoding UTF8
$summary | Export-Csv -Path $summaryCsvPath -NoTypeInformation -Encoding UTF8
$summary | ConvertTo-Json -Depth 10 | Set-Content -Path $summaryJsonPath -Encoding UTF8

$stats = foreach ($api in $apiSpecs) {
  $rows = @($summary | Where-Object { $_.api -eq $api.name })
  $okRows = @($rows | Where-Object { $_.ok -eq $true })
  $lat = Get-LatencyStats $okRows
  [pscustomobject]@{
    api = $api.name
    total = $rows.Count
    success = $okRows.Count
    fail = $rows.Count - $okRows.Count
    successRate = if ($rows.Count -gt 0) { [Math]::Round(($okRows.Count / $rows.Count) * 100, 2) } else { 0 }
    latencyAvgMs = $lat.avg
    latencyP50Ms = $lat.p50
    latencyP95Ms = $lat.p95
    latencyMinMs = $lat.min
    latencyMaxMs = $lat.max
  }
}
$stats | ConvertTo-Json -Depth 10 | Set-Content -Path $statsJsonPath -Encoding UTF8

$comparePath = Build-CompareHtml -Root $outRoot -SummaryRows $summary -ApiNames ($apiSpecs | ForEach-Object { $_.name })

Write-Output "OUT_ROOT=$outRoot"
Write-Output "HOSTS_COUNT=$($hosts.Count)"
Write-Output "TARGETS_COUNT=$($targets.Count)"
Write-Output "COMPARE_HTML=$comparePath"
Write-Output "STATS:"
$stats | Format-Table -AutoSize | Out-String | Write-Output
