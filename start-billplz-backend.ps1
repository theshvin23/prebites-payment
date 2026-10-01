$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$credentialPath = Read-Host 'Path to the NEW local Firebase Admin service-account JSON'
$credentialPath = (Resolve-Path -LiteralPath $credentialPath).Path
$collectionId = Read-Host 'Billplz Sandbox collection ID'
$publicBaseUrl = (Read-Host 'Current ngrok HTTPS forwarding URL').TrimEnd('/')
$secureKey = Read-Host 'Billplz Sandbox secret key (masked)' -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)

try {
    $env:BILLPLZ_SECRET_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
}

$env:BILLPLZ_COLLECTION_ID = $collectionId
$env:PUBLIC_BASE_URL = $publicBaseUrl
$env:FRONTEND_BASE_URL = 'https://pre-order-fyp.web.app'
$env:FIREBASE_PROJECT_ID = 'pre-order-fyp'
$env:GOOGLE_APPLICATION_CREDENTIALS = $credentialPath

Push-Location $projectRoot
try {
    node .\demo-billplz-server.js
} finally {
    Pop-Location
    Remove-Item Env:BILLPLZ_SECRET_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:BILLPLZ_COLLECTION_ID -ErrorAction SilentlyContinue
    Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS -ErrorAction SilentlyContinue
}