/* =========================================================
   lib.js — 纯函数库：fetch 封装 / 时间格式化 / 颜色工具 / 主题工具
   全部相对路径 /api/* 同源请求；网络失败抛错由上层兜底
   ========================================================= */
(function (root, factory) {
    'use strict';
    root.Lib = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /* ===================== fetch 封装 ===================== */
    async function request(path, options) {
        options = options || {};
        var init = {
            method: options.method || 'GET',
            headers: {},
        };
        if (options.body !== undefined) {
            init.headers['Content-Type'] = 'application/json';
            init.body = JSON.stringify(options.body);
        }
        var res = await fetch(path, init);
        if (res.status === 204) return null;
        var data = null;
        var text = await res.text();
        if (text) {
            try { data = JSON.parse(text); } catch (_) { data = text; }
        }
        if (!res.ok) {
            var msg = (data && data.error) || ('请求失败 ' + res.status);
            var err = new Error(msg);
            err.status = res.status;
            throw err;
        }
        return data;
    }

    /* ===================== 时间 / 数字格式化 ===================== */
    // 相对时间：刚刚 / n 分钟前 / n 小时前 / n 天前 / n 个月前 / n 年前
    function relTime(dateStr) {
        if (!dateStr) return '—';
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateStr);
        var diff = Date.now() - d.getTime();
        var min = Math.floor(diff / 60000);
        if (min < 1) return '刚刚';
        if (min < 60) return min + ' 分钟前';
        var hour = Math.floor(min / 60);
        if (hour < 24) return hour + ' 小时前';
        var day = Math.floor(hour / 24);
        if (day < 30) return day + ' 天前';
        var month = Math.floor(day / 30);
        if (month < 12) return month + ' 个月前';
        return Math.floor(month / 12) + ' 年前';
    }

    function exactDate(dateStr) {
        if (!dateStr) return '';
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateStr);
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function yearOf(dateStr) {
        if (!dateStr) return '';
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        return String(d.getFullYear());
    }

    function fmtSize(mb) {
        if (mb === null || mb === undefined || isNaN(mb)) return '—';
        function trim(s) { return String(s).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''); }
        if (mb >= 1024) return trim((mb / 1024).toFixed(2)) + ' GB';
        if (mb >= 1) return trim(mb.toFixed(1)) + ' MB';
        return mb.toFixed(2) + ' MB';
    }

    /* ===================== 状态词映射（反 AI 味硬要求） =====================
       API 返回：草稿 / 进行中 / 已完成 / 无法判断
       显示层：草稿 / 在弄 / 完工 / 说不清                                  */
    var STATUS_DISPLAY = {
        '草稿': { word: '草稿', cls: 'st-draft' },
        '进行中': { word: '在弄', cls: 'st-active' },
        '已完成': { word: '完工', cls: 'st-done' },
        '无法判断': { word: '说不清', cls: 'st-unsure' },
        '已归档': { word: '已归档', cls: 'st-draft' },
    };

    function statusWord(apiStatus) {
        var s = STATUS_DISPLAY[apiStatus] || { word: apiStatus || '草稿', cls: 'st-draft' };
        return s;
    }

    /* ===================== HTML 转义 ===================== */
    function esc(s) {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* ===================== 颜色工具（§2.2） ===================== */
    function hexToRgb(hex) {
        var m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim()) ||
                /^#?([0-9a-f]{3})$/i.exec(String(hex).trim());
        if (!m) return null;
        var h = m[1];
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        return [
            parseInt(h.slice(0, 2), 16),
            parseInt(h.slice(2, 4), 16),
            parseInt(h.slice(4, 6), 16),
        ];
    }

    function darken(hex, amt) {
        var rgb = hexToRgb(hex);
        if (!rgb) return hex;
        var f = Math.max(0, Math.min(1, 1 - amt));
        var ch = function (v) {
            return Math.round(v * f).toString(16).padStart(2, '0');
        };
        return '#' + ch(rgb[0]) + ch(rgb[1]) + ch(rgb[2]);
    }

    function hexToRgba(hex, alpha) {
        var rgb = hexToRgb(hex);
        if (!rgb) return hex;
        return 'rgba(' + rgb.join(', ') + ', ' +
            Math.max(0, Math.min(1, alpha)) + ')';
    }

    /* ===================== 主题工具（§2.1） ===================== */
    var THEME_CYCLE = ['light', 'dark', 'system'];

    function nextTheme(t) {
        return THEME_CYCLE[(THEME_CYCLE.indexOf(t) + 1) % THEME_CYCLE.length];
    }

    function systemPrefersDark() {
        try {
            return !!window.matchMedia('(prefers-color-scheme: dark)').matches;
        } catch (_) {
            return false;
        }
    }

    function resolveTheme(t) {
        if (t === 'system') return systemPrefersDark() ? 'dark' : 'light';
        return t === 'dark' ? 'dark' : 'light';
    }

    function applyCustomAccent(el, hex) {
        if (!hexToRgb(hex)) return;
        el.style.setProperty('--accent', hex);
        el.style.setProperty('--accent-hover', darken(hex, 0.18));
        el.style.setProperty('--accent-bg', hexToRgba(hex, 0.14));
    }

    function clearCustomAccent(el) {
        ['--accent', '--accent-hover', '--accent-bg'].forEach(function (p) {
            el.style.removeProperty(p);
        });
    }

    /* ===================== localStorage 设置读写 ===================== */
    var SETTINGS_KEY = 'tea-settings-v1';

    var DEFAULT_SETTINGS = {
        theme: 'light',          // light / dark / system
        colorTheme: 'default',    // default / 6 皮肤 / hc
        animations: true,
        animationSpeed: 'normal', // slow / normal / fast
        uiSize: 14,               // 字号 px
        followLanguage: false,     // 跟随项目语言派生 accent
        savedViews: [],           // 保存的筛选视图 [{id,name,filter}]
    };

    function loadSettings() {
        var out = Object.assign({}, DEFAULT_SETTINGS);
        try {
            var raw = localStorage.getItem(SETTINGS_KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                Object.keys(parsed).forEach(function (k) {
                    out[k] = parsed[k];
                });
            }
        } catch (_) { /* 损坏则用默认 */ }
        return out;
    }

    function saveSettings(s) {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
        } catch (_) { /* 隐私模式静默失败 */ }
    }

    /* ===================== Toast ===================== */
    function toast(msg, type) {
        var region = document.querySelector('.toast-region');
        if (!region) {
            region = document.createElement('div');
            region.className = 'toast-region';
            document.body.appendChild(region);
        }
        var el = document.createElement('div');
        el.className = 'toast ' + (type || '');
        el.textContent = msg;
        region.appendChild(el);
        setTimeout(function () {
            el.style.opacity = '0';
            setTimeout(function () { el.remove(); }, 250);
        }, 2400);
    }

    /* ===================== SVG 图标集（stroke 风格，currentColor） =====================
       viewBox 0 0 24 24；尺寸由 .icon-svg CSS 控制；方形锐利 */
    function svg(inner) {
        return '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" ' +
            'stroke="currentColor" stroke-width="1.6" stroke-linecap="square" ' +
            'stroke-linejoin="miter">' + inner + '</svg>';
    }

    var ICONS = {
        grid: svg('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>'),
        list: svg('<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>'),
        dashboard: svg('<rect x="3" y="3" width="8" height="10"/><rect x="13" y="3" width="8" height="6"/><rect x="13" y="11" width="8" height="10"/><rect x="3" y="15" width="8" height="6"/>'),
        gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
        search: svg('<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/>'),
        refresh: svg('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/>'),
        sparkle: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>'),
        play: svg('<polygon points="6 4 20 12 6 20 6 4"/>'),
        edit: svg('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>'),
        x: svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
        check: svg('<polyline points="20 6 9 17 4 12"/>'),
        git: svg('<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 8.5v7"/><path d="M18 10.5a6 6 0 0 1-6 6h-3"/>'),
        external: svg('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>'),
        folder: svg('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'),
        globe: svg('<circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/>'),
        github: svg('<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1.5S18.73 1.13 16 3.15a13.38 13.38 0 0 0-7 0C6.27 1.13 5.09 1.5 5.09 1.5A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>'),
        terminal: svg('<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>'),
        code: svg('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'),
        archive: svg('<rect x="3" y="4" width="18" height="4"/><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><line x1="10" y1="12" x2="14" y2="12"/>'),
        trash: svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
        plus: svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
        minus: svg('<line x1="5" y1="12" x2="19" y2="12"/>'),
        up: svg('<polyline points="18 15 12 9 6 15"/>'),
        down: svg('<polyline points="6 9 12 15 18 9"/>'),
        filter: svg('<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>'),
        drag: svg('<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>'),
        close: svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
        pin: svg('<path d="M12 17v5"/><path d="M9 3h6l1 7 3 3H5l3-3z"/>'),
        unpin: svg('<path d="M12 22v-5"/><path d="M9 3h6l1 5 3 3H5l3-3z"/>'),
        restore: svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 10 9 10"/>'),
        package: svg('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>'),
        warning: svg('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
        camera: svg('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>'),
        download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
    };

    function icon(name) {
        return ICONS[name] || '';
    }

    return {
        request: request,
        relTime: relTime,
        exactDate: exactDate,
        yearOf: yearOf,
        fmtSize: fmtSize,
        statusWord: statusWord,
        esc: esc,
        hexToRgb: hexToRgb,
        darken: darken,
        hexToRgba: hexToRgba,
        THEME_CYCLE: THEME_CYCLE,
        nextTheme: nextTheme,
        systemPrefersDark: systemPrefersDark,
        resolveTheme: resolveTheme,
        applyCustomAccent: applyCustomAccent,
        clearCustomAccent: clearCustomAccent,
        loadSettings: loadSettings,
        saveSettings: saveSettings,
        DEFAULT_SETTINGS: DEFAULT_SETTINGS,
        toast: toast,
        ICONS: ICONS,
        icon: icon,
    };
});
