# 编译 gettext .po 文件为 .mo 文件
$localeRoot = Join-Path $PSScriptRoot "locales"
$babelPath = (Get-Command pybabel -ErrorAction SilentlyContinue)?.Source

if (-not $babelPath) {
    Write-Host "❌ 未找到 pybabel，请先安装：uv add Babel" -ForegroundColor Red
    exit 1
}

$poFiles = Get-ChildItem -Path $localeRoot -Recurse -Filter "messages.po"

if ($poFiles.Count -eq 0) {
    Write-Host "⚠ 未找到任何 .po 文件，目录应类似：locales/zh_CN/LC_MESSAGES/messages.po" -ForegroundColor Yellow
    exit 0
}

foreach ($poFile in $poFiles) {
    # 修正语言代码提取逻辑
    $langDir = $poFile.Directory.Parent  # 应为 locales/zh_CN
    $lang = Split-Path $langDir -Leaf    # 提取 zh_CN、ja_JP 等

    Write-Host "🌐 编译 [$lang]：" -NoNewline

    try {
        & pybabel compile -d $localeRoot -l $lang --use-fuzzy | Out-Null
        Write-Host " ✅ 编译成功" -ForegroundColor Green
    }
    catch {
        Write-Host " ❌ 编译失败：" + $_.Exception.Message -ForegroundColor Red
    }
}

Write-Host "`n🎉 所有翻译文件处理完毕！"
