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
        if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
        if (mb >= 1) return Number(mb.toFixed(1)) + ' MB';
        return Math.round(mb * 1024) + ' KB';
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
    };
});
