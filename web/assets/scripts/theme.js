/* =========================================================
   theme.js — 主题应用
   亮/暗/跟随系统 + 6 莫兰迪皮肤 + 高对比 + 跟随项目语言 accent
   全部走「写 CSS 变量 / data-* → 样式自动生效」，零类名切换
   ========================================================= */
(function () {
    'use strict';

    var Lib = window.Lib;

    function appEl() {
        return document.getElementById('app');
    }

    /* 皮肤注册表（顺序即色板网格顺序） */
    var SKINS = [
        { id: 'default', label: '暖灰', swatch: '#8a7a6a' },
        { id: 'dusty-rose', label: '烟灰粉', swatch: '#b8958a' },
        { id: 'misty-blue', label: '雾灰蓝', swatch: '#8a9aa8' },
        { id: 'sage-green', label: '鼠尾草绿', swatch: '#8a9e8a' },
        { id: 'warm-taupe', label: '暖灰褐', swatch: '#9a8a7a' },
        { id: 'lavender-gray', label: '薰衣草灰', swatch: '#958aa8' },
        { id: 'warm-apricot', label: '暖杏', swatch: '#b8957a' },
        { id: 'hc', label: '高对比', swatch: '#4cc9f0' },
    ];

    /* 跟随项目语言：语言 → accent 色映射表
       Python 系=蓝、Go=青、JavaScript / 前端=琥珀 */
    var LANG_ACCENT = [
        { match: /^python|jupyter/i, color: '#4a7fb5' },   // Python 系=蓝
        { match: /^go$|\bgolang\b/i, color: '#2f9e97' },  // Go=青
        { match: /^javascript$|^typescript$|^node|frontend|前端/i, color: '#c08a3e' }, // JS/前端=琥珀
        { match: /^rust/i, color: '#b07840' },
        { match: /^java$/i, color: '#8a7a9e' },
    ];

    function langAccent(language) {
        if (!language) return null;
        for (var i = 0; i < LANG_ACCENT.length; i++) {
            if (LANG_ACCENT[i].match.test(language)) return LANG_ACCENT[i].color;
        }
        return null;
    }

    /** 亮/暗/跟随系统三态 */
    function applyTheme(settings) {
        var resolved = Lib.resolveTheme(settings.theme);
        document.documentElement.setAttribute('data-theme', resolved);
        appEl().setAttribute('data-theme', resolved);
    }

    /** 配色皮肤 */
    function applyColorTheme(settings) {
        var app = appEl();
        if (settings.colorTheme && settings.colorTheme !== 'default') {
            Lib.clearCustomAccent(app);
            app.setAttribute('data-color-theme', settings.colorTheme);
        } else {
            Lib.clearCustomAccent(app);
            app.removeAttribute('data-color-theme');
        }
    }

    /** 动效：三档速度 / 关闭冻结 */
    function applyMotion(settings) {
        var app = appEl();
        app.style.setProperty(
            '--transition',
            (settings.animations
                ? { slow: '0.45s', normal: '0.25s', fast: '0.12s' }[
                      settings.animationSpeed
                  ] || '0.25s'
                : '0s') + ' ease'
        );
        app.setAttribute('data-motion', settings.animations ? 'on' : 'off');
    }

    /** 字号（变量化） */
    function applyTypography(settings) {
        appEl().style.setProperty('--ui-size', (settings.uiSize || 14) + 'px');
    }

    /** 全部应用 */
    function applyAll(settings) {
        applyTheme(settings);
        applyColorTheme(settings);
        applyMotion(settings);
        applyTypography(settings);
    }

    /** 导出主题预设 JSON（下载） */
    function exportTheme(settings) {
        var payload = {
            theme: settings.theme,
            colorTheme: settings.colorTheme,
            animations: settings.animations,
            animationSpeed: settings.animationSpeed,
            uiSize: settings.uiSize,
            followLanguage: settings.followLanguage,
        };
        var blob = new Blob([JSON.stringify(payload, null, 2)],
            { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'tea-theme.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    /** 导入主题预设 JSON；返回合并后的 patch 对象，失败返回 null */
    function importTheme(file) {
        return new Promise(function (resolve) {
            var reader = new FileReader();
            reader.onload = function () {
                try {
                    var parsed = JSON.parse(reader.result);
                    resolve(parsed || null);
                } catch (_) {
                    resolve(null);
                }
            };
            reader.onerror = function () { resolve(null); };
            reader.readAsText(file);
        });
    }

    window.Theme = {
        SKINS: SKINS,
        LANG_ACCENT_RULES: LANG_ACCENT,
        langAccent: langAccent,
        applyAll: applyAll,
        applyTheme: applyTheme,
        applyColorTheme: applyColorTheme,
        applyMotion: applyMotion,
        applyTypography: applyTypography,
        exportTheme: exportTheme,
        importTheme: importTheme,
    };
})();
