/* =========================================================
   ui/views.js — 主视图：侧栏导航 / 网格 / 表格 / 工具条 / 快捷键
   ========================================================= */
(function () {
    'use strict';

    var Lib = window.Lib;
    var Theme = window.Theme;
    var Store = window.Store;
    var Api = window.Api;

    var app = {
        settings: Lib.loadSettings(),
        gKeyBuffer: '',      // g g / g t / g d 双键序列
        gKeyTimer: null,
        searchTimer: null,   // 搜索防抖计时器
    };

    /* ===================== 初始化 ===================== */
    function init() {
        Theme.applyAll(app.settings);
        bindSidebar();
        bindGlobalKeys();
        // 筛选变化 → 只重渲染列表，不重建工具条（否则搜索框失焦）
        Store.on('filter:change', function () {
            if (Store.state.view === 'grid' || Store.state.view === 'table') {
                renderList();
            }
        });
        Store.on('selection:change', function () {
            if (Store.state.view === 'grid' || Store.state.view === 'table') {
                renderList();
            }
        });
        loadProjects();
        // 跟随系统主题时监听变化
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener(
            'change', function () {
                if (app.settings.theme === 'system') Theme.applyAll(app.settings);
            }
        );
    }

    /* ===================== 数据加载 ===================== */
    async function loadProjects() {
        var notice = document.getElementById('serviceNotice');
        var viewContent = document.getElementById('viewContent');
        try {
            var data = await Api.listProjects({ archived: 0 });
            Store.state.projects = Array.isArray(data) ? data : (data.projects || []);
            Store.state.online = true;
            notice.classList.remove('show');
            // 拉一次后端设置（根目录 / 端口）
            try {
                Store.state.serverInfo = await Api.getSettings();
            } catch (_) { /* 展示本地默认即可 */ }
            renderServerInfo();
        } catch (_) {
            Store.state.online = false;
            Store.state.projects = [];
            notice.classList.add('show');
        }
        render();
    }

    /* ===================== 路由：视图切换 ===================== */
    function go(view, projectName) {
        Store.state.view = view;
        Store.state.currentProject = projectName || null;
        Store.clearSelection();
        document.querySelectorAll('.sidebar-btn[data-nav]').forEach(function (b) {
            b.classList.toggle('active', b.dataset.nav === view && !projectName);
        });
        var vc = document.getElementById('viewContent');
        vc.classList.remove('view-anim');
        void vc.offsetWidth; // 重启动画
        vc.classList.add('view-anim');
        render();
    }

    /* ===================== 总渲染 ===================== */
    function render() {
        renderSavedViews();
        var v = Store.state.view;
        if (Store.state.currentProject && window.ProjectDetail) {
            window.ProjectDetail.render(Store.state.currentProject);
            return;
        }
        if (v === 'dashboard') {
            if (window.Dashboard) window.Dashboard.render();
            return;
        }
        renderToolbarArea();
        renderList();
    }

    /* ===================== 工具条（搜索 + 筛选） ===================== */
    function renderToolbarArea() {
        var host = document.getElementById('toolbarHost');
        host.innerHTML =
            '<div class="toolbar">' +
              '<div class="search-box">' +
                '<span class="search-icon">⌕</span>' +
                '<input type="search" id="searchInput" placeholder="搜名称 / 描述 / 标签 / 意图" autocomplete="off">' +
                '<span class="search-key">/</span>' +
              '</div>' +
              '<select class="filter-select" id="fLang"><option value="">全部语言</option></select>' +
              '<select class="filter-select" id="fStatus"><option value="">全部状态</option></select>' +
              '<select class="filter-select" id="fCat"><option value="">全部类别</option></select>' +
              '<select class="filter-select" id="fYear"><option value="">全部年份</option></select>' +
              '<label class="toggle-chip"><input type="checkbox" id="fArchived"' +
                (Store.state.filter.excludeArchived ? ' checked' : '') + '> 排除已归档</label>' +
              '<div class="view-switch">' +
                '<button data-v="grid"' + (Store.state.view === 'grid' ? ' class="active"' : '') + '>网格</button>' +
                '<button data-v="table"' + (Store.state.view === 'table' ? ' class="active"' : '') + '>表格</button>' +
              '</div>' +
              '<button class="btn-secondary small" id="saveViewBtn">存为视图</button>' +
            '</div>' +
            '<div class="batch-bar" id="batchBar"><span class="batch-count"></span>' +
              '<button class="btn-secondary small" data-batch="archive">归档</button>' +
              '<button class="btn-secondary small" data-batch="open">打开</button>' +
              '<button class="btn-danger small" data-batch="delete">删除</button>' +
              '<span class="muted">（点空白处取消选择）</span></div>';

        // 填充下拉选项
        fillSelect('fLang', unique('language'));
        fillSelect('fStatus', unique('status').map(function (s) {
            return { value: s, label: Lib.statusWord(s).word };
        }));
        fillSelect('fCat', unique('category'));
        fillSelect('fYear', unique('last_active').map(function (d) {
            return Lib.yearOf(d);
        }).filter(Boolean));

        // 回显当前筛选
        document.getElementById('searchInput').value = Store.state.filter.q;
        document.getElementById('fLang').value = Store.state.filter.lang;
        document.getElementById('fStatus').value = Store.state.filter.status;
        document.getElementById('fCat').value = Store.state.filter.cat;
        document.getElementById('fYear').value = Store.state.filter.year;

        // 事件绑定
        // 搜索框：150ms 防抖，避免每次按键全量重渲染
        document.getElementById('searchInput').addEventListener('input', function (e) {
            clearTimeout(app.searchTimer);
            var val = e.target.value;
            app.searchTimer = setTimeout(function () {
                Store.setFilter({ q: val });
            }, 150);
        });
        document.getElementById('fLang').addEventListener('change', function (e) {
            Store.setFilter({ lang: e.target.value });
        });
        document.getElementById('fStatus').addEventListener('change', function (e) {
            Store.setFilter({ status: e.target.value });
        });
        document.getElementById('fCat').addEventListener('change', function (e) {
            Store.setFilter({ cat: e.target.value });
        });
        document.getElementById('fYear').addEventListener('change', function (e) {
            Store.setFilter({ year: e.target.value });
        });
        document.getElementById('fArchived').addEventListener('change', function (e) {
            Store.setFilter({ excludeArchived: e.target.checked });
        });
        host.querySelectorAll('.view-switch button').forEach(function (b) {
            b.addEventListener('click', function () { go(b.dataset.v); });
        });
        document.getElementById('saveViewBtn').addEventListener('click', saveCurrentView);
    }

    function unique(field) {
        var seen = {};
        var out = [];
        Store.state.projects.forEach(function (p) {
            var v = p[field];
            if (v && !seen[v]) { seen[v] = 1; out.push(v); }
        });
        return out.sort();
    }

    function fillSelect(id, items) {
        var sel = document.getElementById(id);
        var cur = sel.value;
        items.forEach(function (it) {
            var o = document.createElement('option');
            if (typeof it === 'object') {
                o.value = it.value; o.textContent = it.label;
            } else {
                o.value = it; o.textContent = it;
            }
            sel.appendChild(o);
        });
        sel.value = cur;
    }

    /* ===================== 网格视图 ===================== */
    function cardAccent(p) {
        if (app.settings.followLanguage) {
            var c = Theme.langAccent(p.language);
            if (c) return c;
        }
        return '';
    }

    function renderList() {
        var host = document.getElementById('viewContent');
        var list = Store.filteredProjects();

        if (!Store.state.online) {
            host.innerHTML =
                '<div class="empty-state">' +
                '<div class="empty-title">本地服务没连上</div>' +
                '在项目目录下跑起来 tea serve，再回这里刷新。<br>' +
                '起好后这里会列出 E:\\Projects 下的全部项目。</div>';
            return;
        }
        if (!list.length) {
            host.innerHTML =
                '<div class="empty-state"><div class="empty-title">这里还空着</div>' +
                '调整一下筛选，或者点侧栏的「仪表盘」看看统计。</div>';
            return;
        }

        if (Store.state.view === 'grid') {
            host.innerHTML = '<div class="project-grid" id="gridHost"></div>';
            var grid = document.getElementById('gridHost');
            list.forEach(function (p) {
                grid.appendChild(buildCard(p));
            });
            bindDragSort(grid);
        } else {
            host.innerHTML = buildTable(list);
            bindTable(list);
        }
        renderBatchBar();
    }

    function buildCard(p) {
        var st = Lib.statusWord(p.status);
        var card = document.createElement('div');
        card.className = 'project-card' +
            (Store.state.selection[p.name] ? ' selected' : '');
        card.dataset.name = p.name;
        var accent = cardAccent(p);
        if (accent) card.style.setProperty('--card-accent', accent);
        if (accent) card.style.setProperty('--lang-color', accent);

        var git = p.git || {};
        card.innerHTML =
            '<div class="card-actions">' +
              '<button class="ctrl-btn" data-act="open" title="在终端打开">▶</button>' +
              '<button class="ctrl-btn" data-act="edit" title="编辑">✎</button>' +
              '<button class="ctrl-btn" data-act="archive" title="归档">⤓</button>' +
              '<button class="ctrl-btn" data-act="delete" title="删除">✕</button>' +
            '</div>' +
            '<div class="card-name">' + Lib.esc(p.name) + '</div>' +
            '<div class="card-meta">' +
              '<span class="lang-badge">' + Lib.esc(p.language || '—') + '</span>' +
              '<span class="status-dot ' + st.cls + '" style="--dot-color:var(--status-' +
                st.cls.replace('st-', '') + ')">' + st.word + '</span>' +
              '<span title="' + Lib.esc(Lib.exactDate(p.last_active)) + '">' +
                Lib.esc(Lib.relTime(p.last_active)) + '</span>' +
              '<span>' + Lib.esc(Lib.fmtSize(p.total_size_mb)) + '</span>' +
            '</div>' +
            (git.commits ? '<div class="git-badge">⎇ ' + git.commits + ' commits</div>' : '') +
            (git.remote ? '<span class="remote-corner" title="打开仓库">⬡</span>' : '');

        // 点卡片 → 打开详情
        card.addEventListener('click', function (e) {
            if (e.target.closest('.card-actions') || e.target.closest('.remote-corner')) return;
            go(null, p.name);
        });

        // hover 操作
        card.querySelectorAll('.card-actions [data-act]').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var act = btn.dataset.act;
                if (act === 'open') doOpen(p.name, 'terminal');
                else if (act === 'edit') go(null, p.name);
                else if (act === 'archive') doArchive(p.name);
                else if (act === 'delete') doDelete(p.name);
            });
        });
        var remote = card.querySelector('.remote-corner');
        if (remote) remote.addEventListener('click', function (e) {
            e.stopPropagation();
            window.open(git.remote, '_blank');
        });
        return card;
    }

    /* ===================== 表格视图 ===================== */
    function buildTable(list) {
        var fields = [
            { key: 'name', label: '名称' },
            { key: 'language', label: '语言' },
            { key: 'status', label: '状态' },
            { key: 'category', label: '类别' },
            { key: 'last_active', label: '最后活跃' },
            { key: 'total_size_mb', label: '体积' },
        ];
        var head = fields.map(function (f) {
            var arrow = Store.state.sort.field === f.key
                ? (Store.state.sort.dir === 1 ? '▲' : '▼') : '';
            return '<th data-sort="' + f.key + '">' + f.label +
                '<span class="sort-arrow">' + arrow + '</span></th>';
        }).join('');

        var rows = list.map(function (p) {
            var st = Lib.statusWord(p.status);
            return '<tr data-name="' + Lib.esc(p.name) + '"' +
                (Store.state.selection[p.name] ? ' class="selected"' : '') + '>' +
                '<td><input type="checkbox" class="row-check"' +
                    (Store.state.selection[p.name] ? ' checked' : '') + '></td>' +
                '<td><strong>' + Lib.esc(p.name) + '</strong></td>' +
                '<td>' + Lib.esc(p.language || '—') + '</td>' +
                '<td><span class="status-pill ' + st.cls + '">' +
                    '<span class="dot"></span>' + st.word + '</span></td>' +
                '<td>' + Lib.esc(p.category || '—') + '</td>' +
                '<td title="' + Lib.esc(Lib.exactDate(p.last_active)) + '">' +
                    Lib.esc(Lib.relTime(p.last_active)) + '</td>' +
                '<td>' + Lib.esc(Lib.fmtSize(p.total_size_mb)) + '</td>' +
                '</tr>';
        }).join('');

        return '<div class="project-table-wrap"><table class="project-table">' +
            '<thead><tr><th></th>' + head + '</tr></thead>' +
            '<tbody>' + rows + '</tbody></table></div>';
    }

    function bindTable(list) {
        var wrap = document.querySelector('.project-table-wrap');
        wrap.querySelectorAll('th[data-sort]').forEach(function (th) {
            th.addEventListener('click', function () {
                Store.toggleSort(th.dataset.sort);
                renderList();
            });
        });
        wrap.querySelectorAll('tbody tr').forEach(function (tr) {
            var name = tr.dataset.name;
            tr.addEventListener('click', function (e) {
                if (e.target.classList.contains('row-check')) {
                    Store.toggleSelect(name, e.shiftKey);
                    return;
                }
                if (e.shiftKey) { Store.toggleSelect(name, true); return; }
                go(null, name);
            });
        });
    }

    /* ===================== 拖拽排序（网格） ===================== */
    function bindDragSort(grid) {
        var dragName = null;
        grid.querySelectorAll('.project-card').forEach(function (card) {
            card.setAttribute('draggable', 'true');
            card.addEventListener('dragstart', function () {
                dragName = card.dataset.name;
                card.classList.add('dragging');
            });
            card.addEventListener('dragend', function () {
                card.classList.remove('dragging');
                grid.querySelectorAll('.project-card')
                    .forEach(function (c) { c.classList.remove('drop-target'); });
            });
            card.addEventListener('dragover', function (e) {
                e.preventDefault();
                card.classList.add('drop-target');
            });
            card.addEventListener('dragleave', function () {
                card.classList.remove('drop-target');
            });
            card.addEventListener('drop', function (e) {
                e.preventDefault();
                card.classList.remove('drop-target');
                if (!dragName || dragName === card.dataset.name) return;
                var list = Store.filteredProjects();
                var from = list.findIndex(function (p) { return p.name === dragName; });
                var to = list.findIndex(function (p) { return p.name === card.dataset.name; });
                var moved = list.splice(from, 1)[0];
                list.splice(to, 0, moved);
                // 写后端索引（PUT order）
                Api.saveProject(dragName, { order: to }).then(function () {
                    Lib.toast('顺序已保存', 'success');
                }).catch(function (err) {
                    Lib.toast('顺序没存上：' + err.message, 'error');
                });
                renderList();
            });
        });
    }

    /* ===================== 批量操作条 ===================== */
    function renderBatchBar() {
        var bar = document.getElementById('batchBar');
        var names = Store.selectedNames();
        if (!names.length) { bar.classList.remove('show'); return; }
        bar.classList.add('show');
        bar.querySelector('.batch-count').textContent = '已选 ' + names.length + ' 项';
        bar.querySelectorAll('[data-batch]').forEach(function (btn) {
            btn.onclick = function () {
                var act = btn.dataset.batch;
                if (act === 'archive') batchArchive(names);
                else if (act === 'delete') batchDelete(names);
                else if (act === 'open') names.forEach(function (n) { doOpen(n, 'terminal'); });
            };
        });
    }

    async function batchArchive(names) {
        if (!confirm('把 ' + names.length + ' 个项目归档到 _archive？')) return;
        var ok = 0;
        for (var i = 0; i < names.length; i++) {
            try { await Api.archive(names[i]); ok++; } catch (_) {}
        }
        Lib.toast(ok + ' 个项目已归档', 'success');
        loadProjects();
    }

    async function batchDelete(names) {
        if (!confirm('真删？' + names.length + ' 个项目会被直接移除，不可恢复。\n建议改用归档。')) return;
        if (!confirm('再点一次确认删除（不可恢复）')) return;
        for (var i = 0; i < names.length; i++) {
            try { await Api.remove(names[i]); } catch (_) {}
        }
        Lib.toast('已删除', 'success');
        loadProjects();
    }

    /* ===================== 单个动作 ===================== */
    async function doOpen(name, action) {
        try {
            await Api.open(name, action);
            Lib.toast('已拉起：' + name, 'success');
        } catch (err) {
            Lib.toast('打开失败：' + err.message, 'error');
        }
    }

    async function doArchive(name) {
        if (!confirm('把「' + name + '」归档到 _archive？')) return;
        try {
            await Api.archive(name);
            Lib.toast('已归档', 'success');
            go('grid');
        } catch (err) {
            Lib.toast('归档失败：' + err.message, 'error');
        }
    }

    async function doDelete(name) {
        if (!confirm('删除「' + name + '」？建议先归档。')) return;
        if (!confirm('再点一次：真的要永久删除吗？')) return;
        try {
            await Api.remove(name);
            Lib.toast('已删除', 'success');
            go('grid');
        } catch (err) {
            Lib.toast('删除失败：' + err.message, 'error');
        }
    }

    /* ===================== 保存的筛选视图 ===================== */
    function saveCurrentView() {
        var name = prompt('给这个筛选组合起个名（如：活跃中 / 日语相关）：');
        if (!name) return;
        var view = {
            id: 'v' + Date.now(),
            name: name,
            filter: Object.assign({}, Store.state.filter),
        };
        app.settings.savedViews = app.settings.savedViews || [];
        app.settings.savedViews.push(view);
        Lib.saveSettings(app.settings);
        Store.state.savedViewId = view.id;
        Lib.toast('已存视图：' + name, 'success');
        renderSavedViews();
    }

    function renderSavedViews() {
        var host = document.getElementById('savedViewsHost');
        var views = app.settings.savedViews || [];
        host.innerHTML = '';
        views.forEach(function (v) {
            var btn = document.createElement('button');
            btn.className = 'sidebar-btn' +
                (Store.state.savedViewId === v.id ? ' active' : '');
            btn.innerHTML = '<span class="icon">◆</span><span class="label">' +
                Lib.esc(v.name) + '</span><button class="view-x" title="删除">✕</button>';
            btn.addEventListener('click', function (e) {
                if (e.target.classList.contains('view-x')) {
                    app.settings.savedViews = app.settings.savedViews.filter(
                        function (x) { return x.id !== v.id; });
                    Lib.saveSettings(app.settings);
                    renderSavedViews();
                    return;
                }
                Object.assign(Store.state.filter, v.filter);
                Store.state.savedViewId = v.id;
                go('grid');
            });
            host.appendChild(btn);
        });
    }

    /* ===================== 侧栏 / 顶栏绑定 ===================== */
    function bindSidebar() {
        document.querySelectorAll('[data-nav]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                go(btn.dataset.nav);
            });
        });
        document.getElementById('settingsBtn').addEventListener('click', function () {
            if (window.SettingsPanel) window.SettingsPanel.open();
        });
    }

    function renderServerInfo() {
        var el = document.getElementById('serverInfo');
        var s = Store.state.serverInfo || {};
        el.innerHTML = '项目根：' + Lib.esc(s.projects_root || '—') +
            '<br>端口：' + Lib.esc(String(s.port || '—'));
    }

    /* ===================== 全局快捷键 ===================== */
    function isTyping() {
        var t = document.activeElement;
        return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    }

    function bindGlobalKeys() {
        document.addEventListener('keydown', function (e) {
            // Esc：关闭浮层
            if (e.key === 'Escape') {
                document.querySelectorAll('.overlay.open').forEach(function (o) {
                    o.classList.remove('open');
                });
                if (window.SettingsPanel) window.SettingsPanel.close();
                return;
            }
            if (isTyping()) return;

            // / 聚焦搜索
            if (e.key === '/') {
                e.preventDefault();
                var si = document.getElementById('searchInput');
                if (si) si.focus();
                return;
            }
            // g 序列
            if (e.key === 'g') {
                app.gKeyBuffer = 'g';
                clearTimeout(app.gKeyTimer);
                app.gKeyTimer = setTimeout(function () {
                    app.gKeyBuffer = '';
                }, 800);
                return;
            }
            if (app.gKeyBuffer === 'g') {
                if (e.key === 'g') { go('grid'); app.gKeyBuffer = ''; }
                else if (e.key === 't') { go('table'); app.gKeyBuffer = ''; }
                else if (e.key === 'd') { go('dashboard'); app.gKeyBuffer = ''; }
                else app.gKeyBuffer = '';
                return;
            }
            if (e.key === '?') { openHelp(); return; }
            if (e.key === 'e' && Store.state.currentProject) {
                if (window.ProjectDetail) window.ProjectDetail.editFirstField();
                return;
            }
            if (e.key === 'o' && Store.state.currentProject) {
                doOpen(Store.state.currentProject, 'terminal');
                return;
            }
            if (e.key === 'a' && Store.state.currentProject) {
                doArchive(Store.state.currentProject);
            }
        });
    }

    function openHelp() {
        var overlay = document.getElementById('helpOverlay');
        overlay.classList.add('open');
    }

    /* ===================== 导出 ===================== */
    window.App = {
        init: init,
        go: go,
        render: render,
        loadProjects: loadProjects,
        doOpen: doOpen,
        doArchive: doArchive,
        doDelete: doDelete,
        settings: app.settings,
        saveSettings: function () { Lib.saveSettings(app.settings); },
        refreshTheme: function () {
            Theme.applyAll(app.settings);
            render();
        },
    };
})();
