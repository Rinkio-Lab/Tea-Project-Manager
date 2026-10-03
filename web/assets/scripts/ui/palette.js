/* =========================================================
   ui/palette.js — Ctrl+K 命令面板（模糊搜索 + 动作列表）
   ========================================================= */
(function () {
    'use strict';

    var Lib = window.Lib;
    var Store = window.Store;

    var selected = 0;
    var items = [];

    function buildItems() {
        var out = [];
        var cur = Store.state.currentProject;
        out.push({ label: '网格视图', hint: '视图', run: function () { window.App.go('grid'); } });
        out.push({ label: '表格视图', hint: '视图', run: function () { window.App.go('table'); } });
        out.push({ label: '仪表盘', hint: '视图', run: function () { window.App.go('dashboard'); } });
        out.push({ label: '打开设置', hint: '应用', run: function () { window.SettingsPanel.open(); } });
        if (cur) {
            out.push({ label: '在终端打开当前：' + cur, hint: '动作', run: function () { window.App.doOpen(cur, 'terminal'); } });
            out.push({ label: '在 VS Code 打开当前：' + cur, hint: '动作', run: function () { window.App.doOpen(cur, 'vscode'); } });
            out.push({ label: '在资源管理器打开当前：' + cur, hint: '动作', run: function () { window.App.doOpen(cur, 'explorer'); } });
            out.push({ label: '归档当前：' + cur, hint: '动作', run: function () { window.App.doArchive(cur); } });
        }
        // 项目列表
        (Store.state.projects || []).forEach(function (p) {
            out.push({
                label: p.name,
                hint: '项目 · ' + (p.language || ''),
                match: [p.name, p.description || '', p.category || ''].join(' '),
                run: function () { window.App.go(null, p.name); },
            });
        });
        return out;
    }

    function open() {
        close();
        var ov = document.createElement('div');
        ov.className = 'palette-overlay';
        ov.id = 'paletteOverlay';
        ov.innerHTML =
            '<div class="palette">' +
              '<input type="text" id="paletteInput" placeholder="搜项目 / 输入命令…" autocomplete="off">' +
              '<div class="palette-list" id="paletteList"></div>' +
              '<div class="palette-hint">↑↓ 选择 · Enter 执行 · Esc 关闭</div>' +
            '</div>';
        document.body.appendChild(ov);
        document.getElementById('paletteInput').focus();
        items = buildItems();
        selected = 0;
        renderList('');
        bind();
    }

    function close() {
        var ov = document.getElementById('paletteOverlay');
        if (ov) ov.remove();
    }

    function filter(q) {
        q = q.toLowerCase();
        return items.filter(function (it) {
            if (!q) return true;
            return (it.label + ' ' + (it.match || '')).toLowerCase().indexOf(q) !== -1;
        }).slice(0, 30);
    }

    function renderList(q) {
        var list = document.getElementById('paletteList');
        var f = filter(q);
        selected = Math.min(selected, f.length - 1);
        if (selected < 0) selected = 0;
        list.innerHTML = f.map(function (it, i) {
            return '<div class="palette-item' + (i === selected ? ' active' : '') +
                '" data-i="' + i + '">' +
                '<span class="palette-label">' + Lib.esc(it.label) + '</span>' +
                '<span class="palette-h-tag">' + Lib.esc(it.hint || '') + '</span>' +
                '</div>';
        }).join('');
        list.querySelectorAll('.palette-item').forEach(function (el) {
            el.addEventListener('click', function () {
                f[Number(el.dataset.i)].run();
                close();
            });
        });
        // 把当前 items 过滤后的列表暂存
        palette._filtered = f;
    }

    function bind() {
        var input = document.getElementById('paletteInput');
        input.addEventListener('input', function () {
            selected = 0;
            renderList(input.value);
        });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { e.preventDefault(); close(); }
            else if (e.key === 'ArrowDown') {
                e.preventDefault();
                selected = Math.min(selected + 1, (palette._filtered || []).length - 1);
                renderList(input.value);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selected = Math.max(selected - 1, 0);
                renderList(input.value);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                var f = palette._filtered || [];
                if (f[selected]) { f[selected].run(); close(); }
            }
        });
        document.getElementById('paletteOverlay').addEventListener('mousedown', function (e) {
            if (e.target === this) close();
        });
    }

    var palette = { open: open, close: close, _filtered: [] };

    // 全局快捷键 Ctrl+K / Ctrl+P
    document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            if (document.getElementById('paletteOverlay')) close(); else open();
        }
    });

    window.Palette = palette;
})();
