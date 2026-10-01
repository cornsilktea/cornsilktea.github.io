param(
  [int]$Games = 5000,
  [int]$Seed = 5000,
  [int]$Shards = 4,
  [int]$Port = 8791,
  [int]$TimeoutMinutes = 40
)
# 30번 아레나 시뮬레이션을 크롬 창 여러 개(headless)에 나눠 돌린다. 판마다 시드가 정해져 있어 한 번에 돌린 결과와 같다.
# 로컬 서버(.claude/serve.ps1, 포트 $Port)가 켜져 있어야 하고, 조각 결과는 sim-reports/ 에 저장된다.
# 다 끝나면 브라우저에서 TB_SIM.loadShards($Shards, $Games, $Seed) 로 합쳐 TB_SIM.saveReport(...) 한다.
$chrome = @('C:\Program Files\Google\Chrome\Application\chrome.exe', 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe', 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', 'C:\Program Files\Microsoft\Edge\Application\msedge.exe') | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { Write-Error '크롬 또는 엣지를 찾지 못했어요.'; exit 1 }
$dir = Join-Path $PSScriptRoot 'sim-reports'
New-Item -ItemType Directory -Force $dir | Out-Null
$names = 0..($Shards - 1) | ForEach-Object { "sim-shard-$Games-$Seed-$Shards-$_.html" }
$names | ForEach-Object { Remove-Item (Join-Path $dir $_) -ErrorAction SilentlyContinue }
$profiles = Join-Path $env:TEMP 'tb-sim-profiles'
$procs = @()
$started = Get-Date
for ($i = 0; $i -lt $Shards; $i++) {
  $url = "http://localhost:$Port/30.team-battle-arena.html?c=test&sim&shard=$i/$Shards&games=$Games&seed=$Seed&upload=1"
  $procs += Start-Process $chrome -PassThru -ArgumentList @('--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', "--user-data-dir=$profiles\$i", $url)
}
$deadline = $started.AddMinutes($TimeoutMinutes)
while ((Get-Date) -lt $deadline) {
  $ready = @($names | Where-Object { Test-Path (Join-Path $dir $_) }).Count
  if ($ready -eq $Shards) { break }
  Start-Sleep -Seconds 3
}
Start-Sleep -Seconds 2
$procs | ForEach-Object { & taskkill.exe /PID $_.Id /T /F | Out-Null }
Remove-Item $profiles -Recurse -Force -ErrorAction SilentlyContinue
$ready = @($names | Where-Object { Test-Path (Join-Path $dir $_) }).Count
$seconds = [int]((Get-Date) - $started).TotalSeconds
if ($ready -ne $Shards) { Write-Error "조각 $ready/$Shards 개만 끝났어요(${seconds}초)."; exit 1 }
Write-Output "조각 $Shards 개 완료(${seconds}초): sim-reports/sim-shard-$Games-$Seed-$Shards-*.html"
