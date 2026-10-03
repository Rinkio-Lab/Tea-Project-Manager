/* =========================================================
   i18n/languages.js — 语言注册表（单一来源，AGENTS.md §3）
   code 全小写 BCP 47；fallback 链递归落到 zh
   ========================================================= */
(function () {
    'use strict';

    var LANGUAGES = [
        { code: 'zh', native: '简体中文', maintainedBy: 'ai', fallback: null },
        { code: 'en', native: 'English',  maintainedBy: 'ai', fallback: 'zh' },
        { code: 'ja', native: '日本語',   maintainedBy: 'ai', fallback: 'zh' },
    ];

    var dictionaries = {};   // code -> {key: value}
    var current = 'zh';

    function register(code, dict) {
        dictionaries[code] = dict;
    }

    function setLang(code) {
        var ok = LANGUAGES.some(function (l) { return l.code === code; });
        current = ok ? code : 'zh';
        localStorage.setItem('tea-lang', current);
        applyDom();
        // 动态内容重渲染（工具栏/卡片/仪表盘/设置抽屉）
        if (window.App && typeof window.App.render === 'function') window.App.render();
        if (window.SettingsPanel && window.SettingsPanel.isOpen && window.SettingsPanel.isOpen()) {
            // 设置抽屉开着就重画
        }
    }

    function getLang() { return current; }

    function lookup(code, key) {
        var dict = dictionaries[code];
        if (dict && dict[key] !== undefined) return dict[key];
        var meta = LANGUAGES.find(function (l) { return l.code === code; });
        if (meta && meta.fallback) return lookup(meta.fallback, key);
        return null;
    }

    function t(key, vars) {
        var v = lookup(current, key);
        if (v == null) v = lookup('zh', key);
        if (v == null) return key;
        if (vars) {
            Object.keys(vars).forEach(function (k) {
                v = v.replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k]));
            });
        }
        return v;
    }

    function applyDom() {
        document.documentElement.setAttribute('lang', current);
        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            var key = el.getAttribute('data-i18n');
            el.textContent = t(key);
        });
        document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
            el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
        });
    }

    // 启动：localStorage → /api/settings.language → zh
    function init(done) {
        var saved = localStorage.getItem('tea-lang');
        if (saved && dictionaries[saved]) {
            current = saved;
            applyDom();
            if (done) done();
            return;
        }
        fetch('/api/settings').then(function (r) { return r.json(); }).then(function (s) {
            if (s && s.language && dictionaries[s.language]) current = s.language;
        }).catch(function () {}).then(function () {
            applyDom();
            if (done) done();
        });
    }

    window.I18n = {
        LANGUAGES: LANGUAGES,
        register: register,
        setLang: setLang,
        getLang: getLang,
        t: t,
        init: init,
        applyDom: applyDom,
    };
})();
