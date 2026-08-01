# sync-new-images.ps1
# Drop new files into "new image\" then run this script.
# It syncs the folder contents into the <!-- new image --> block in index.html.

$htmlFile   = Join-Path $PSScriptRoot "index.html"
$folder     = Join-Path $PSScriptRoot "new image"
$startTag   = "<!-- new image -->"
$endTag     = "<!-- /new image -->"

$imgExts  = @('.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif')
$vidExts  = @('.mp4', '.mov', '.webm', '.ogg')

$files = Get-ChildItem -Path $folder -File | Sort-Object Name

$lines = @($startTag)
foreach ($f in $files) {
    $ext  = $f.Extension.ToLower()
    $name = $f.Name -replace '"', '&quot;'
    $src  = "./new image/$name"
    if ($vidExts -contains $ext) {
        $lines += "            <div class=`"item`"><video loading=`"lazy`" src=`"$src`" onclick=`"openModal(this)`" muted loop autoplay playsinline></video></div>"
    } elseif ($imgExts -contains $ext) {
        $lines += "            <div class=`"item`"><img loading=`"lazy`" src=`"$src`" onclick=`"openModal(this)`"></div>"
    }
}
$lines += $endTag

$content  = Get-Content $htmlFile -Raw
$pattern  = "(?s)$([regex]::Escape($startTag)).*?$([regex]::Escape($endTag))"
$replacement = $lines -join "`n"

if ($content -match $pattern) {
    $new = $content -replace $pattern, $replacement
    Set-Content $htmlFile $new -NoNewline
    Write-Host "Synced $($files.Count) files from 'new image' into index.html"
} else {
    Write-Warning "Markers '$startTag' / '$endTag' not found in index.html"
}
