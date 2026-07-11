Add-Type -AssemblyName System.Drawing

function Resize-Image {
    param (
        [string]$inputPath,
        [string]$outputPath,
        [int]$maxWidth
    )

    $image = [System.Drawing.Image]::FromFile($inputPath)
    $ratio = $maxWidth / $image.Width
    $newHeight = [int]($image.Height * $ratio)

    $bitmap = New-Object System.Drawing.Bitmap($maxWidth, $newHeight)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($image, 0, 0, $maxWidth, $newHeight)

    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
    $image.Dispose()

    Write-Host "Created: $outputPath"
}

$basePath = "assets"

$images = @(
    @{src="erc\Logo_Gradien.png"; name="Logo_Gradien"},
    @{src="erc\Logo_Base.png"; name="Logo_Base"},
    @{src="erc\Logo_Bolong.png"; name="Logo_Bolong"},
    @{src="erc\INTI_KOMET.png"; name="INTI_KOMET"},
    @{src="ic\KEMENAG.png"; name="KEMENAG"},
    @{src="os\OS Black.png"; name="OS_Black"},
    @{src="os\OS White.png"; name="OS_White"}
)

$sizes = @(490, 980, 1960, 3920)

foreach ($img in $images) {
    $inputFile = Join-Path $basePath $img.src
    if (Test-Path $inputFile) {
        foreach ($size in $sizes) {
            $dir = Join-Path $basePath ("resized\" + $size)
            if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
            $outputFile = Join-Path $dir ($img.name + "_" + $size + ".png")
            Resize-Image -inputPath $inputFile -outputPath $outputFile -maxWidth $size
        }
    } else {
        Write-Host "Not found: $inputFile"
    }
}

Write-Host "Done!"