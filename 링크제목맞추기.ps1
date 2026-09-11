# =====================================================================
#  링크 제목 맞추기
#
#  카카오톡·문자 등으로 자료 링크를 보내면 상대방 화면에 링크 미리보기(제목·설명·그림)가
#  뜹니다. 이 미리보기는 파일 안에 적힌 <title> 과 og: 태그를 읽어서 만들기 때문에,
#  제어판(Firebase)에서 제목을 바꿔도 파일을 고쳐 올리기 전에는 옛 제목이 보입니다.
#
#  이 스크립트는 초기데이터.json 에 적힌 제어판 제목·설명을 각 자료 HTML 의
#  <title> 과 og: 태그에 그대로 옮겨 적습니다.
#
#  쓰는 법 (제어판에서 제목이나 설명을 바꾼 뒤):
#    1. 초기데이터.json 을 최신으로 받기  (사용법.md 의 curl 한 줄)
#    2. 이 폴더에서  ./링크제목맞추기.ps1  실행
#    3. GitHub Desktop 에서 커밋 → 푸시
# =====================================================================

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$siteName = "정보 수업용 링크 모음"
$siteUrl  = "https://cornsilktea.github.io/"
$image    = $siteUrl + "icon-512.png"

$data  = Get-Content -Raw -Encoding utf8 (Join-Path $root "초기데이터.json") | ConvertFrom-Json
$games = $data.portal.games.PSObject.Properties

function Esc([string]$s) {
  return $s.Replace("&", "&amp;").Replace('"', "&quot;").Replace("<", "&lt;").Replace(">", "&gt;")
}

function Apply([string]$file, [string]$title, [string]$desc, [string]$pageUrl) {
  $path = Join-Path $root $file
  if (-not (Test-Path $path)) { Write-Host "  건너뜀(파일 없음): $file"; return }

  $html = Get-Content -Raw -Encoding utf8 $path
  $nl   = if ($html.Contains("`r`n")) { "`r`n" } else { "`n" }

  $block = @(
    "<!-- 링크 미리보기(제어판 제목) 시작 — 링크제목맞추기.ps1 이 채웁니다. 손으로 고치지 마세요. -->",
    "<title>$(Esc $title)</title>",
    "<meta property=`"og:type`" content=`"website`">",
    "<meta property=`"og:site_name`" content=`"$(Esc $siteName)`">",
    "<meta property=`"og:title`" content=`"$(Esc $title)`">",
    "<meta property=`"og:description`" content=`"$(Esc $desc)`">",
    "<meta property=`"og:url`" content=`"$(Esc $pageUrl)`">",
    "<meta property=`"og:image`" content=`"$(Esc $image)`">",
    "<meta name=`"twitter:card`" content=`"summary`">",
    "<!-- 링크 미리보기 끝 -->"
  ) -join $nl

  $before = $html
  if ($html -match "(?s)<!-- 링크 미리보기\(제어판 제목\) 시작.*?<!-- 링크 미리보기 끝 -->") {
    $html = [regex]::Replace($html, "(?s)<!-- 링크 미리보기\(제어판 제목\) 시작.*?<!-- 링크 미리보기 끝 -->", { param($m) $block })
  } elseif ($html -match "<title>.*?</title>") {
    $html = [regex]::Replace($html, "<title>.*?</title>", { param($m) $block }, 1)
  } else {
    $html = [regex]::Replace($html, "<head>", { param($m) "<head>" + $nl + $block }, 1)
  }

  if ($html -ne $before) {
    [System.IO.File]::WriteAllText($path, $html, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "  고침: $file  →  $title"
  } else {
    Write-Host "  그대로: $file"
  }
}

Write-Host "자료 파일의 링크 제목을 제어판 내용으로 맞춥니다."
foreach ($g in $games) {
  $v = $g.Value
  if (-not $v.title -or -not $v.url) { continue }
  $desc = if ($v.memo) { $v.memo } else { $siteName }
  Apply $v.url $v.title $desc ($siteUrl + $v.url)
}

# 목록 화면(index.html)
Apply "index.html" $siteName "수업 시간에 쓰는 정보 수업 자료 모음입니다." $siteUrl
Write-Host "끝."
