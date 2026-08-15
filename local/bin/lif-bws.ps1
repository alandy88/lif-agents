# Profile-independent BWS entrypoint for Windows scripts.
$ErrorActionPreference = 'Stop'
Remove-Item Env:BWS_ACCESS_TOKEN -ErrorAction SilentlyContinue
$path = Join-Path $env:USERPROFILE '.bws\token.dpapi'
if (-not (Test-Path $path)) { throw 'lif-bws: token is not configured' }
$secure = Get-Content $path | ConvertTo-SecureString
try {
    $env:BWS_ACCESS_TOKEN = [System.Net.NetworkCredential]::new('', $secure).Password
    $exe = @(Get-Command bws.exe -CommandType Application -ErrorAction Stop | Sort-Object Source -Unique)[0].Source
    & $exe @args
    exit $LASTEXITCODE
} finally {
    Remove-Item Env:BWS_ACCESS_TOKEN -ErrorAction SilentlyContinue
    Remove-Variable secure -ErrorAction SilentlyContinue
}
