#Requires -Version 5.1
<#
.SYNOPSIS
  Login ל-ECR, בונה את app ו-frontend, ודוחף לפי BACKEND_IMAGE / FRONTEND_IMAGE ב-.env

.DESCRIPTION
  דורש AWS CLI מוגדר (`aws`) ו-Docker.
  הגדר ב-.env (או בסביבה) את שני ה-URI המלאים למאגרי ECR, למשל:
    BACKEND_IMAGE=123456789012.dkr.ecr.eu-west-1.amazonaws.com/game-backend:latest
    FRONTEND_IMAGE=123456789012.dkr.ecr.eu-west-1.amazonaws.com/game-frontend:latest
#>
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repoRoot

if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]*)=(.*)$') {
            $key = $matches[1].Trim()
            $val = $matches[2].Trim().Trim('"')
            [Environment]::SetEnvironmentVariable($key, $val, "Process")
        }
    }
}

$backend = $env:BACKEND_IMAGE
$frontend = $env:FRONTEND_IMAGE
$region = if ($env:AWS_REGION) { $env:AWS_REGION } elseif ($env:AWS_DEFAULT_REGION) { $env:AWS_DEFAULT_REGION } else { "" }

if (-not $backend -or -not $frontend) {
    Write-Error "הגדר BACKEND_IMAGE ו-FRONTEND_IMAGE ב-.env (URI מלא של ECR לכל תמונה)."
}

if (-not $region) {
    Write-Error "הגדר AWS_REGION (או AWS_DEFAULT_REGION), למשל eu-west-1."
}

$account = aws sts get-caller-identity --query Account --output text
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$registry = "${account}.dkr.ecr.${region}.amazonaws.com"
Write-Host "Logging in to $registry ..."
aws ecr get-login-password --region $region | docker login --username AWS --password-stdin $registry
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Building app + frontend ..."
docker compose build app frontend
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Pushing $backend ..."
docker push $backend
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Pushing $frontend ..."
docker push $frontend
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Done."
