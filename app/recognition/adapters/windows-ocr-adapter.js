import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";

const OCR_SCRIPT = String.raw`
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing
if ($env:ARK_OCR_TEMPLATE_REGIONS_JSON -and $env:ARK_OCR_TEMPLATE_REGIONS_JSON -ne "[]") {
$rhodesTemplateMatcherSource = @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public class RhodesTemplateMatch
{
    public int X;
    public int Y;
    public int Width;
    public int Height;
    public double Score;
}

public static class RhodesTemplateMatcher
{
    private static Bitmap ToArgb(Bitmap source)
    {
        Bitmap bitmap = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
        using (Graphics graphics = Graphics.FromImage(bitmap))
        {
            graphics.DrawImage(source, 0, 0, source.Width, source.Height);
        }
        return bitmap;
    }

    private static Bitmap Resize(Bitmap source, int width, int height)
    {
        Bitmap resized = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        using (Graphics graphics = Graphics.FromImage(resized))
        {
            graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
            graphics.DrawImage(source, new Rectangle(0, 0, width, height));
        }
        return resized;
    }

    private static byte[] Gray(Bitmap source)
    {
        using (Bitmap bitmap = ToArgb(source))
        {
            Rectangle rect = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
            BitmapData data = bitmap.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            try
            {
                int byteCount = Math.Abs(data.Stride) * bitmap.Height;
                byte[] bytes = new byte[byteCount];
                Marshal.Copy(data.Scan0, bytes, 0, byteCount);
                byte[] gray = new byte[bitmap.Width * bitmap.Height];
                for (int y = 0; y < bitmap.Height; y++)
                {
                    int row = y * data.Stride;
                    for (int x = 0; x < bitmap.Width; x++)
                    {
                        int offset = row + x * 4;
                        byte b = bytes[offset];
                        byte g = bytes[offset + 1];
                        byte r = bytes[offset + 2];
                        gray[y * bitmap.Width + x] = (byte)((r * 299 + g * 587 + b * 114) / 1000);
                    }
                }
                return gray;
            }
            finally
            {
                bitmap.UnlockBits(data);
            }
        }
    }

    public static List<RhodesTemplateMatch> Find(
        string imagePath,
        string templatePath,
        int searchX,
        int searchY,
        int searchWidth,
        int searchHeight,
        double templateScaleX,
        double templateScaleY,
        double threshold,
        int maxMatches,
        int step,
        int sampleStride)
    {
        List<RhodesTemplateMatch> raw = new List<RhodesTemplateMatch>();
        if (String.IsNullOrWhiteSpace(templatePath) || !System.IO.File.Exists(templatePath)) return raw;
        using (Bitmap image = new Bitmap(imagePath))
        using (Bitmap templateSource = new Bitmap(templatePath))
        {
            int templateWidth = Math.Max(1, (int)Math.Round(templateSource.Width * Math.Max(0.1, templateScaleX)));
            int templateHeight = Math.Max(1, (int)Math.Round(templateSource.Height * Math.Max(0.1, templateScaleY)));
            using (Bitmap template = Resize(templateSource, templateWidth, templateHeight))
            {
                byte[] imageGray = Gray(image);
                byte[] templateGray = Gray(template);
                int stride = Math.Max(1, sampleStride);
                List<int> sampleXs = new List<int>();
                List<int> sampleYs = new List<int>();
                List<double> sampleValues = new List<double>();
                for (int y = 0; y < templateHeight; y += stride)
                {
                    for (int x = 0; x < templateWidth; x += stride)
                    {
                        sampleXs.Add(x);
                        sampleYs.Add(y);
                        sampleValues.Add(templateGray[y * templateWidth + x]);
                    }
                }
                if (sampleValues.Count < 8) return raw;

                double templateMean = 0;
                foreach (double value in sampleValues) templateMean += value;
                templateMean /= sampleValues.Count;
                double templateDenom = 0;
                foreach (double value in sampleValues)
                {
                    double d = value - templateMean;
                    templateDenom += d * d;
                }
                if (templateDenom <= 0.0001) return raw;

                int startX = Math.Max(0, searchX);
                int startY = Math.Max(0, searchY);
                int endX = Math.Min(image.Width - templateWidth, searchX + searchWidth - templateWidth);
                int endY = Math.Min(image.Height - templateHeight, searchY + searchHeight - templateHeight);
                int scanStep = Math.Max(1, step);
                for (int y = startY; y <= endY; y += scanStep)
                {
                    for (int x = startX; x <= endX; x += scanStep)
                    {
                        double imageMean = 0;
                        for (int i = 0; i < sampleValues.Count; i++)
                        {
                            imageMean += imageGray[(y + sampleYs[i]) * image.Width + (x + sampleXs[i])];
                        }
                        imageMean /= sampleValues.Count;

                        double numerator = 0;
                        double imageDenom = 0;
                        for (int i = 0; i < sampleValues.Count; i++)
                        {
                            double tv = sampleValues[i] - templateMean;
                            double iv = imageGray[(y + sampleYs[i]) * image.Width + (x + sampleXs[i])] - imageMean;
                            numerator += tv * iv;
                            imageDenom += iv * iv;
                        }
                        if (imageDenom <= 0.0001) continue;
                        double score = numerator / Math.Sqrt(templateDenom * imageDenom);
                        if (score >= threshold)
                        {
                            raw.Add(new RhodesTemplateMatch { X = x, Y = y, Width = templateWidth, Height = templateHeight, Score = score });
                        }
                    }
                }
            }
        }

        raw.Sort((a, b) => b.Score.CompareTo(a.Score));
        List<RhodesTemplateMatch> kept = new List<RhodesTemplateMatch>();
        int limit = Math.Max(1, maxMatches);
        foreach (RhodesTemplateMatch candidate in raw)
        {
            bool overlaps = false;
            foreach (RhodesTemplateMatch previous in kept)
            {
                if (Math.Abs(candidate.X - previous.X) < Math.Max(8, candidate.Width / 2) &&
                    Math.Abs(candidate.Y - previous.Y) < Math.Max(8, candidate.Height / 2))
                {
                    overlaps = true;
                    break;
                }
            }
            if (overlaps) continue;
            kept.Add(candidate);
            if (kept.Count >= limit) break;
        }
        kept.Sort((a, b) => a.Y == b.Y ? a.X.CompareTo(b.X) : a.Y.CompareTo(b.Y));
        return kept;
    }
}
"@
$rhodesTemplateMatcherDll = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "rhodes-template-matcher-v1.dll")
if (Test-Path -LiteralPath $rhodesTemplateMatcherDll) {
  Add-Type -Path $rhodesTemplateMatcherDll
} else {
  Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition $rhodesTemplateMatcherSource -OutputAssembly $rhodesTemplateMatcherDll -OutputType Library
  Add-Type -Path $rhodesTemplateMatcherDll
}
}
$null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Storage.Streams,ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrResult,Windows.Foundation,ContentType=WindowsRuntime]

function Await-Op($Operation, [Type]$ResultType) {
  $methods = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq "AsTask" -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 }
  $asyncName = "IAsyncOperation" + [char]96 + "1"
  $method = $methods | Where-Object { $_.GetParameters()[0].ParameterType.Name -eq $asyncName } | Select-Object -First 1
  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  $task.Result
}

function Invoke-Ocr($ImagePath, $RegionId, $Region) {
  $file = Await-Op ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) ([Windows.Storage.StorageFile])
  $stream = Await-Op ($file.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  $decoder = Await-Op ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await-Op ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if ($null -eq $engine) { throw "Windows OCR engine is unavailable for current user profile languages." }
  $result = Await-Op ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $items = @()
  foreach ($line in $result.Lines) {
    $minX = 999999; $minY = 999999; $maxX = 0; $maxY = 0
    foreach ($word in $line.Words) {
      $r = $word.BoundingRect
      $minX = [Math]::Min($minX, $r.X); $minY = [Math]::Min($minY, $r.Y)
      $maxX = [Math]::Max($maxX, $r.X + $r.Width); $maxY = [Math]::Max($maxY, $r.Y + $r.Height)
    }
    $roi = $Region
    if ($maxX -gt 0 -and $maxY -gt 0) {
      if ($RegionId -eq "full" -or $null -eq $Region) {
        $roi = @{ x = [Math]::Round($minX, 1); y = [Math]::Round($minY, 1); width = [Math]::Round($maxX - $minX, 1); height = [Math]::Round($maxY - $minY, 1) }
      } else {
        $scale = [Math]::Max(1, [double](Get-RegionValue $Region "scale" 1))
        $offsetX = [double](Get-RegionValue $Region "x" 0)
        $offsetY = [double](Get-RegionValue $Region "y" 0)
        $roi = @{
          x = [Math]::Round($offsetX + ($minX / $scale), 1)
          y = [Math]::Round($offsetY + ($minY / $scale), 1)
          width = [Math]::Round(($maxX - $minX) / $scale, 1)
          height = [Math]::Round(($maxY - $minY) / $scale, 1)
        }
      }
    }
    $items += @{ text = $line.Text; regionId = $RegionId; roi = $roi; confidence = 0.7 }
  }
  @{ text = $result.Text; results = $items }
}

function Unwrap-Value($Value) {
  $current = $Value
  while ($current -is [array]) {
    if ($current.Length -eq 0) { return $null }
    $current = $current[0]
  }
  return $current
}

function Get-RegionValue($Region, $Name, $Default) {
  if ($null -eq $Region) { return $Default }
  if ($Region -is [System.Collections.IDictionary] -and $Region.Contains($Name)) {
    $value = Unwrap-Value $Region[$Name]
    if ($null -eq $value) { return $Default }
    return $value
  }
  $prop = $Region.PSObject.Properties[$Name]
  if ($null -eq $prop -or $null -eq $prop.Value) { return $Default }
  $value = Unwrap-Value $prop.Value
  if ($null -eq $value) { return $Default }
  return $value
}


function Test-DigitPixel($Image, [int]$X, [int]$Y) {
  if ($X -lt 0 -or $Y -lt 0 -or $X -ge $Image.Width -or $Y -ge $Image.Height) { return $false }
  $c = $Image.GetPixel($X, $Y)
  $luma = (($c.R * 299) + ($c.G * 587) + ($c.B * 114)) / 1000.0
  $nearNeutral = [Math]::Abs($c.R - $c.G) -lt 95 -and [Math]::Abs($c.G - $c.B) -lt 95
  $hopeYellow = $c.R -gt 150 -and $c.G -gt 105 -and $c.B -lt 120
  return $luma -gt 115 -and ($nearNeutral -or $hopeYellow)
}

function Classify-DigitComponent($Xs, $Ys) {
  if ($Xs.Count -eq 0) { return $null }
  $minX = ($Xs | Measure-Object -Minimum).Minimum
  $maxX = ($Xs | Measure-Object -Maximum).Maximum
  $minY = ($Ys | Measure-Object -Minimum).Minimum
  $maxY = ($Ys | Measure-Object -Maximum).Maximum
  $width = [Math]::Max(1, [int]($maxX - $minX + 1))
  $height = [Math]::Max(1, [int]($maxY - $minY + 1))
  if ($width -lt 5 -or $height -lt 12) { return $null }

  $counts = New-Object 'int[]' 63
  for ($i = 0; $i -lt $Xs.Count; $i++) {
    $gx = [Math]::Min(6, [int][Math]::Floor((([double]($Xs[$i] - $minX) * 7.0) / [double]$width)))
    $gy = [Math]::Min(8, [int][Math]::Floor((([double]($Ys[$i] - $minY) * 9.0) / [double]$height)))
    $counts[$gy * 7 + $gx] += 1
  }
  $bits = @()
  for ($gy = 0; $gy -lt 9; $gy++) {
    $row = ""
    for ($gx = 0; $gx -lt 7; $gx++) {
      $row += $(if ($counts[$gy * 7 + $gx] -gt 0) { "1" } else { "0" })
    }
    $bits += $row
  }

  if ($width -ge 9 -and $height -ge 12) {
    $topLeft = 0; $topRight = 0; $bottomLeft = 0; $bottomRight = 0
    for ($gy = 0; $gy -lt 9; $gy++) {
      for ($gx = 0; $gx -lt 7; $gx++) {
        if ($counts[$gy * 7 + $gx] -le 0) { continue }
        if ($gy -le 2 -and $gx -le 2) { $topLeft += 1 }
        if ($gy -le 2 -and $gx -ge 4) { $topRight += 1 }
        if ($gy -ge 5 -and $gx -le 2) { $bottomLeft += 1 }
        if ($gy -ge 5 -and $gx -ge 4) { $bottomRight += 1 }
      }
    }
    if ($topLeft -le 1 -and $topRight -gt 0 -and $bottomLeft -gt 0 -and $bottomRight -gt 0) { return "2" }
  }

  if ($width -le 8 -and $height -ge 12) {
    $topXs = New-Object 'System.Collections.Generic.List[int]'
    $bottomXs = New-Object 'System.Collections.Generic.List[int]'
    for ($gy = 0; $gy -lt 9; $gy++) {
      for ($gx = 0; $gx -lt 7; $gx++) {
        if ($counts[$gy * 7 + $gx] -le 0) { continue }
        if ($gy -le 2) { $topXs.Add($gx) }
        if ($gy -ge 6) { $bottomXs.Add($gx) }
      }
    }
    if ($topXs.Count -gt 0 -and $bottomXs.Count -gt 0) {
      $topMean = ($topXs | Measure-Object -Average).Average
      $bottomMean = ($bottomXs | Measure-Object -Average).Average
      if ($bottomMean -lt ($topMean - 2.0)) { return "7" }
      return "1"
    }
  }

  $templates = @{
    "0" = @("0111110","1100011","1100011","1100011","1100011","1100011","1100011","1100011","0111110")
    "1" = @("0001100","0011100","0001100","0001100","0001100","0001100","0001100","0001100","0111110")
    "2" = @("0111110","1100011","0000011","0000110","0001100","0011000","0110000","1100000","1111111")
    "3" = @("0111110","1100011","0000011","0001110","0001110","0000011","0000011","1100011","0111110")
    "4" = @("0000110","0001110","0011110","0110110","1100110","1111111","0000110","0000110","0000110")
    "5" = @("1111111","1100000","1100000","1111110","0000011","0000011","0000011","1100011","0111110")
    "6" = @("0011110","0110000","1100000","1111110","1100011","1100011","1100011","1100011","0111110")
    "7" = @("1111111","0000011","0000110","0000110","0001100","0001100","0011000","0011000","0011000")
    "8" = @("0111110","1100011","1100011","0111110","0111110","1100011","1100011","1100011","0111110")
    "9" = @("0111110","1100011","1100011","1100011","0111111","0000011","0000011","0000110","0111100")
  }

  $bestDigit = $null
  $bestScore = -999
  foreach ($digit in $templates.Keys) {
    $score = 0
    $template = $templates[$digit]
    for ($y = 0; $y -lt 9; $y++) {
      for ($x = 0; $x -lt 7; $x++) {
        if ($bits[$y][$x] -eq $template[$y][$x]) { $score += 1 } else { $score -= 1 }
      }
    }
    if ($score -gt $bestScore) { $bestScore = $score; $bestDigit = $digit }
  }
  if ($bestScore -lt 18) { return $null }
  return $bestDigit
}

function Read-IdeaDigitText($Image, $Region) {
  $x0 = [Math]::Max(0, [int][double](Get-RegionValue $Region "x" 0))
  $y0 = [Math]::Max(0, [int][double](Get-RegionValue $Region "y" 0))
  $w = [Math]::Max(1, [int][double](Get-RegionValue $Region "width" 1))
  $h = [Math]::Max(1, [int][double](Get-RegionValue $Region "height" 1))
  if ($x0 + $w -gt $Image.Width) { $w = [int]($Image.Width - $x0) }
  if ($y0 + $h -gt $Image.Height) { $h = [int]($Image.Height - $y0) }
  $startY = [int][Math]::Floor($h * 0.25)
  $visited = New-Object 'bool[]' ($w * $h)
  $components = @()
  for ($ly = $startY; $ly -lt $h; $ly++) {
    for ($lx = 0; $lx -lt $w; $lx++) {
      $index = $ly * $w + $lx
      if ($visited[$index]) { continue }
      if (-not (Test-DigitPixel $Image ($x0 + $lx) ($y0 + $ly))) { continue }

      $queueX = New-Object 'int[]' ($w * $h)
      $queueY = New-Object 'int[]' ($w * $h)
      $head = 0; $tail = 0
      $queueX[$tail] = $lx; $queueY[$tail] = $ly; $tail += 1
      $visited[$index] = $true
      $xs = New-Object 'System.Collections.Generic.List[int]'
      $ys = New-Object 'System.Collections.Generic.List[int]'
      while ($head -lt $tail) {
        $cx = $queueX[$head]; $cy = $queueY[$head]; $head += 1
        $xs.Add($x0 + $cx); $ys.Add($y0 + $cy)
        for ($dy = -1; $dy -le 1; $dy++) {
          for ($dx = -1; $dx -le 1; $dx++) {
            if ($dx -eq 0 -and $dy -eq 0) { continue }
            $nx = $cx + $dx; $ny = $cy + $dy
            if ($nx -lt 0 -or $ny -lt $startY -or $nx -ge $w -or $ny -ge $h) { continue }
            $nidx = $ny * $w + $nx
            if ($visited[$nidx]) { continue }
            if (-not (Test-DigitPixel $Image ($x0 + $nx) ($y0 + $ny))) { continue }
            $visited[$nidx] = $true
            $queueX[$tail] = $nx; $queueY[$tail] = $ny; $tail += 1
          }
        }
      }
      if ($xs.Count -lt 12) { continue }
      $minX = ($xs | Measure-Object -Minimum).Minimum
      $maxX = ($xs | Measure-Object -Maximum).Maximum
      $minY = ($ys | Measure-Object -Minimum).Minimum
      $maxY = ($ys | Measure-Object -Maximum).Maximum
      $cw = $maxX - $minX + 1
      $ch = $maxY - $minY + 1
      $centerY = (($minY + $maxY) / 2.0) - $y0
      if ($cw -lt 5 -or $ch -lt 12 -or $centerY -lt ($h * 0.30)) { continue }
      $digit = Classify-DigitComponent $xs $ys
      if ($null -ne $digit) {
        $components += @{ digit = $digit; x = $minX; y = $minY; width = $cw; height = $ch; area = $xs.Count }
      }
    }
  }
  if ($components.Count -eq 0) { return $null }
  $digits = $components | Sort-Object x | Select-Object -First 3
  return (($digits | ForEach-Object { $_.digit }) -join "")
}

function New-Crop($Image, $Region, $OutputPath) {
  $x = [Math]::Max(0, [int][double](Get-RegionValue $Region "x" 0))
  $y = [Math]::Max(0, [int][double](Get-RegionValue $Region "y" 0))
  $w = [Math]::Max(1, [int][double](Get-RegionValue $Region "width" 1))
  $h = [Math]::Max(1, [int][double](Get-RegionValue $Region "height" 1))
  if ($x + $w -gt $Image.Width) { $w = [int]($Image.Width - $x) }
  if ($y + $h -gt $Image.Height) { $h = [int]($Image.Height - $y) }
  $scaleValue = [int][double](Get-RegionValue $Region "scale" 3)
  $scale = [Math]::Max(1, $scaleValue)
  $cropWidth = [int]($w * $scale)
  $cropHeight = [int]($h * $scale)
  $crop = New-Object System.Drawing.Bitmap($cropWidth, $cropHeight)
  $graphics = [System.Drawing.Graphics]::FromImage($crop)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.DrawImage($Image, (New-Object System.Drawing.Rectangle(0, 0, $cropWidth, $cropHeight)), (New-Object System.Drawing.Rectangle($x, $y, $w, $h)), [System.Drawing.GraphicsUnit]::Pixel)
  $crop.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $crop.Dispose()
}

function Rect-Map($Rect, [bool]$AllowNegativePosition = $false) {
  $rawX = [int][double](Get-RegionValue $Rect "x" 0)
  $rawY = [int][double](Get-RegionValue $Rect "y" 0)
  @{
    x = if ($AllowNegativePosition) { $rawX } else { [Math]::Max(0, $rawX) }
    y = if ($AllowNegativePosition) { $rawY } else { [Math]::Max(0, $rawY) }
    width = [Math]::Max(1, [int][double](Get-RegionValue $Rect "width" 1))
    height = [Math]::Max(1, [int][double](Get-RegionValue $Rect "height" 1))
  }
}

function New-TemplateOcrRegions($ImagePath, $TemplateConfigs, [ref]$StaticRegions) {
  $dynamicRegions = @()
  foreach ($config in @($TemplateConfigs)) {
    $templatePath = [string](Get-RegionValue $config "templatePath" "")
    if (-not $templatePath -or -not (Test-Path -LiteralPath $templatePath)) { continue }
    $search = Rect-Map (Get-RegionValue $config "searchRoi" $null)
    $offset = Rect-Map (Get-RegionValue $config "ocrOffset" $null) $true
    $threshold = [double](Get-RegionValue $config "threshold" 0.9)
    $maxMatches = [int][double](Get-RegionValue $config "maxMatches" 8)
    $step = [int][double](Get-RegionValue $config "step" 2)
    $sampleStride = [int][double](Get-RegionValue $config "sampleStride" 4)
    $templateScaleX = [double](Get-RegionValue $config "templateScaleX" 1)
    $templateScaleY = [double](Get-RegionValue $config "templateScaleY" 1)
    $matches = [RhodesTemplateMatcher]::Find(
      $ImagePath,
      $templatePath,
      [int]$search.x,
      [int]$search.y,
      [int]$search.width,
      [int]$search.height,
      $templateScaleX,
      $templateScaleY,
      $threshold,
      $maxMatches,
      $step,
      $sampleStride)
    if ($matches.Count -eq 0) { continue }
    $idPrefix = [string](Get-RegionValue $config "idPrefix" "template.region")
    $ocrScale = [int][double](Get-RegionValue $config "scale" 3)
    $index = 0
    foreach ($match in $matches) {
      $dynamicRegions += @{
        id = "$idPrefix.$index"
        x = [int]($match.X + $offset.x)
        y = [int]($match.Y + $offset.y)
        width = [int]$offset.width
        height = [int]$offset.height
        scale = $ocrScale
        numericFallback = [bool](Get-RegionValue $config "numericFallback" $false)
        templateScore = [Math]::Round($match.Score, 4)
      }
      $index += 1
    }
    $suppressPattern = [string](Get-RegionValue $config "suppressStaticRegionIdPattern" "")
    if ($suppressPattern) {
      $StaticRegions.Value = @($StaticRegions.Value | Where-Object {
        $regionId = [string](Get-RegionValue $_ "id" "")
        $regionId -notmatch $suppressPattern
      })
    }
  }
  $dynamicRegions
}

$imagePath = $env:ARK_OCR_IMAGE
$regionsJson = if ($env:ARK_OCR_REGIONS_JSON) { $env:ARK_OCR_REGIONS_JSON } else { "[]" }
$templateRegionsJson = if ($env:ARK_OCR_TEMPLATE_REGIONS_JSON) { $env:ARK_OCR_TEMPLATE_REGIONS_JSON } else { "[]" }
$includeFullFrame = if ($env:ARK_OCR_INCLUDE_FULL_FRAME) { $env:ARK_OCR_INCLUDE_FULL_FRAME -ne "0" } else { $true }
$regions = @((ConvertFrom-Json -InputObject $regionsJson))
$templateRegions = @((ConvertFrom-Json -InputObject $templateRegionsJson))
$allResults = @()
$texts = @()
if ($includeFullFrame) {
  $full = Invoke-Ocr $imagePath "full" $null
  $texts += $full.text
  $allResults += $full.results
}
$image = [System.Drawing.Bitmap]::FromFile($imagePath)
try {
  $regionsRef = [ref]$regions
  $dynamicRegions = New-TemplateOcrRegions $imagePath $templateRegions $regionsRef
  $regions = @($dynamicRegions) + @($regionsRef.Value)
  foreach ($region in $regions) {
    $tmp = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "rhodes-ocr-" + [Guid]::NewGuid().ToString("N") + ".png")
    New-Crop $image $region $tmp
    try {
      $regionId = Get-RegionValue $region "id" "region"
      $regionMap = @{ x = (Get-RegionValue $region "x" 0); y = (Get-RegionValue $region "y" 0); width = (Get-RegionValue $region "width" 1); height = (Get-RegionValue $region "height" 1); scale = (Get-RegionValue $region "scale" 1) }
      $regionResult = Invoke-Ocr $tmp $regionId $regionMap
      $hasNumericText = $regionResult.text -match "[0-9０-９Oo図IiLl一丨イィ]"
      $numericFallback = [bool](Get-RegionValue $region "numericFallback" $false)
      $digitText = $null
      if ($numericFallback -or ($regionId -eq "run.idea" -and -not $hasNumericText)) {
        $digitText = Read-IdeaDigitText $image $regionMap
      }
      if ($digitText) {
        $texts += $digitText
        $allResults += @{ text = $digitText; regionId = $regionId; roi = $regionMap; confidence = 0.76 }
      } else {
        $texts += $regionResult.text
        $allResults += $regionResult.results
      }
    } finally {
      Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue
    }
  }
} finally {
  $image.Dispose()
}
$json = @{ text = ($texts -join " "); ocrResults = $allResults } | ConvertTo-Json -Depth 8 -Compress
[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($json))
`;

function encodedPowerShell(script) {
  return Buffer.from(script, "utf16le").toString("base64");
}

export function shouldIncludeFullFrameOcr(context = {}) {
  return context.profile?.ocrFullFrame !== false;
}

function rectFrom(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    const [x, y, width, height] = value.map(Number);
    if (![x, y, width, height].every(Number.isFinite)) return null;
    return { x, y, width, height };
  }
  const x = Number(value.x);
  const y = Number(value.y);
  const width = Number(value.width);
  const height = Number(value.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return { x, y, width, height };
}

function scaleRect(rect, scaleX, scaleY) {
  return {
    x: Math.round(rect.x * scaleX),
    y: Math.round(rect.y * scaleY),
    width: Math.round(rect.width * scaleX),
    height: Math.round(rect.height * scaleY),
  };
}

function resolveTemplatePath(templatePath, cwd = process.cwd()) {
  if (!templatePath) return null;
  return path.isAbsolute(templatePath) ? templatePath : path.join(cwd, templatePath);
}

export function resolveWindowsTemplateOcrRegions(context = {}, cwd = process.cwd()) {
  const configs = Array.isArray(context.profile?.templateOcrRegions) ? context.profile.templateOcrRegions : [];
  if (!configs.length) return [];
  const scaleX = Number(context.scale?.scaleX ?? context.scale?.x ?? 1) || 1;
  const scaleY = Number(context.scale?.scaleY ?? context.scale?.y ?? 1) || 1;
  return configs
    .map((config) => {
      const searchRoi = rectFrom(config.searchRoi || config.roi);
      const ocrOffset = rectFrom(config.ocrOffset || config.rectMove);
      const templatePath = resolveTemplatePath(config.templatePath, cwd);
      if (!searchRoi || !ocrOffset || !templatePath) return null;
      return {
        idPrefix: config.idPrefix || "template.region",
        templatePath,
        searchRoi: scaleRect(searchRoi, scaleX, scaleY),
        ocrOffset: scaleRect(ocrOffset, scaleX, scaleY),
        templateScaleX: scaleX,
        templateScaleY: scaleY,
        threshold: Number(config.threshold ?? config.templThreshold ?? 0.9),
        maxMatches: Math.max(1, Number(config.maxMatches ?? 8)),
        step: Math.max(1, Number(config.step ?? 2)),
        sampleStride: Math.max(1, Number(config.sampleStride ?? 4)),
        scale: Math.max(1, Number(config.scale ?? 3)),
        numericFallback: Boolean(config.numericFallback),
        suppressStaticRegionIdPattern: config.suppressStaticRegionIdPattern || "",
      };
    })
    .filter(Boolean);
}

function runPowerShellOcr({ imagePath, regions = [], templateOcrRegions = [], includeFullFrame = true, timeoutMs = 30000 }) {
  return new Promise((resolve, reject) => {
    const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), "rhodes-ocr-script-"));
    const scriptPath = path.join(dir, "ocr.ps1");
    fsSync.writeFileSync(scriptPath, `\uFEFF${OCR_SCRIPT}`, "utf8");
    execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
      encoding: "utf8",
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
      env: {
        ...process.env,
        ARK_OCR_IMAGE: imagePath,
        ARK_OCR_REGIONS_JSON: JSON.stringify(regions),
        ARK_OCR_TEMPLATE_REGIONS_JSON: JSON.stringify(templateOcrRegions),
        ARK_OCR_INCLUDE_FULL_FRAME: includeFullFrame ? "1" : "0",
      },
    }, (error, stdout, stderr) => {
      fsSync.rmSync(dir, { recursive: true, force: true });
      if (error) {
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

export function normalizeWindowsOcrPayload(payload = {}) {
  const ocrResults = Array.isArray(payload.ocrResults) ? payload.ocrResults : [];
  return {
    text: String(payload.text || ocrResults.map((item) => item.text).join(" ")),
    ocrResults: ocrResults
      .filter((item) => item && typeof item.text === "string" && item.text.trim())
      .map((item) => ({
        text: item.text,
        regionId: item.regionId || null,
        roi: item.roi || null,
        confidence: item.confidence ?? 0.7,
      })),
  };
}

export function parseWindowsOcrStdout(stdout) {
  const lines = String(stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const encoded = lines.at(-1) || "";
  const json = Buffer.from(encoded, "base64").toString("utf8");
  return JSON.parse(json);
}

export function createWindowsOcrTextExtractor({ enabled = process.platform === "win32", timeoutMs = 30000 } = {}) {
  return {
    async extract(frame, context = {}) {
      if (!enabled || !Buffer.isBuffer(frame?.bytes)) return frame;
      const regions = Array.isArray(context.regions) ? context.regions : [];
      const templateOcrRegions = resolveWindowsTemplateOcrRegions(context);
      const includeFullFrame = shouldIncludeFullFrameOcr(context);
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rhodes-ocr-"));
      const imagePath = path.join(dir, `${randomUUID()}.png`);
      try {
        await fs.writeFile(imagePath, frame.bytes);
        const stdout = await runPowerShellOcr({ imagePath, regions, templateOcrRegions, includeFullFrame, timeoutMs });
        const payload = normalizeWindowsOcrPayload(parseWindowsOcrStdout(stdout));
        return {
          ...frame,
          text: payload.text,
          ocrResults: payload.ocrResults,
        };
      } finally {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    },
  };
}
