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
                // 变更 17：默认首页
                var dv = Store.state.serverInfo.default_view;
                if (dv === 'grid' || dv === 'table' || dv === 'dashboard') {
                    Store.state.view = dv;
                }
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
        renderPinnedSidebar();
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
        renderStaleBanner();
        renderList();
    }

    /* ===================== 工具条（搜索 + 筛选） ===================== */
    function renderToolbarArea() {
        var host = document.getElementById('toolbarHost');
        host.innerHTML =
            '<div class="toolbar">' +
              '<div class="search-box">' +
                '<span class="search-icon">' + Lib.icon('search') + '</span>' +
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
            '<div class="chip-row" id="chipHost"></div>' +
            '<div id="staleBanner"></div>' +
            '<div class="batch-bar" id="batchBar"><span class="batch-count"></span>' +
              '<button class="btn-secondary small" data-batch="archive">归档</button>' +
              '<button class="btn-secondary small" data-batch="open">终端</button>' +
              '<button class="btn-secondary small" data-batch="vscode">VS Code</button>' +
              '<button class="btn-secondary small" data-batch="explorer">资源管理器</button>' +
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
        renderChips();
    }

    /* ===================== 快捷筛选 chips（变更 3） ===================== */
    var QF_KEY = 'tea-quickfilters-v1';
    var QF_DEFAULT = {
        show: true,
        langs: ['Python', 'JavaScript', 'Go'],
        statuses: ['进行中', '已完成'],   // 存 API 词，显示自然词
    };
    function loadQF() {
        try {
            var raw = JSON.parse(localStorage.getItem(QF_KEY) || 'null');
            if (raw && Array.isArray(raw.langs) && Array.isArray(raw.statuses)) return raw;
        } catch (_) {}
        return Object.assign({}, QF_DEFAULT);
    }
    function saveQF(qf) { localStorage.setItem(QF_KEY, JSON.stringify(qf)); }

    function renderChips() {
        var host = document.getElementById('chipHost');
        if (!host) return;
        var qf = loadQF();
        var f = Store.state.filter;
        var chips = ['__all__'].concat(qf.langs).concat(qf.statuses);
        var html = chips.map(function (c) {
            var active, label;
            if (c === '__all__') {
                active = !f.lang && !f.status;
                label = '全部';
            } else if (qf.langs.indexOf(c) !== -1) {
                active = f.lang === c;
                label = c;
            } else {
                active = f.status === c;
                label = Lib.statusWord(c).word;
            }
            return '<button class="chip' + (active ? ' active' : '') + '" data-chip="' +
                Lib.esc(c) + '">' + Lib.esc(label) + '</button>';
        }).join('');
        // 月筛选 chip（时间线点选后）
        if (f.month) {
            html += '<button class="chip active" data-chip="__month__">' +
                f.month + ' ' + Lib.icon('x') + '</button>';
        }
        // 陈年 chip
        if (f.stale) {
            html += '<button class="chip active" data-chip="__stale__">陈年项目 ' +
                Lib.icon('x') + '</button>';
        }
        host.innerHTML = html;
        host.querySelectorAll('.chip').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var c = btn.dataset.chip;
                if (c === '__all__') {
                    Store.setFilter({ lang: '', status: '' });
                } else if (c === '__month__') {
                    Store.setFilter({ month: '' });
                } else if (c === '__stale__') {
                    Store.setFilter({ stale: false });
                } else if (qf.langs.indexOf(c) !== -1) {
                    Store.setFilter({ lang: f.lang === c ? '' : c });
                } else {
                    Store.setFilter({ status: f.status === c ? '' : c });
                }
            });
        });
    }

    /* 陈年提醒横幅（变更 2） */
    function renderStaleBanner() {
        var host = document.getElementById('staleBanner');
        if (!host) return;
        var si = Store.state.serverInfo || {};
        var months = si.stale_months || 6;
        var staleList = Store.state.projects.filter(function (p) { return p.stale; });
        if (!staleList.length || Store.state.filter.stale) {
            host.innerHTML = '';
            return;
        }
        host.innerHTML = '<div class="stale-banner">' +
            '<span>' + staleList.length + ' 个项目超过 ' + months +
            ' 个月没动了，该归档了</span>' +
            '<button class="btn-secondary small" id="staleGo">去看看</button></div>';
        document.getElementById('staleGo').addEventListener('click', function () {
            Store.setFilter({ stale: true });
            go('grid');
        });
    }

    // 下拉变化后同步 chips 高亮；filter:change 时只重渲染 chips 激活态 + 列表
    Store.on('filter:change', function () {
        // 同步下拉选中态（不重建 DOM，避免搜索框失焦）
        var fl = document.getElementById('fLang');
        var fs = document.getElementById('fStatus');
        if (fl) fl.value = Store.state.filter.lang || '';
        if (fs) fs.value = Store.state.filter.status || '';
        renderChips();
    });

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
        // 工作区色条（变更 4）
        var wsBar = p.workspace_name && p.workspace_color
            ? '<div class="ws-bar" style="background:' + Lib.esc(p.workspace_color) + '"></div>'
            : '';
        var wsTag = p.workspace_name
            ? '<div class="ws-tag">' + Lib.esc(p.workspace_name) + '</div>'
            : '';
        // 封面缩略图（变更 7）
        var cover = '<div class="card-cover">' +
            '<img src="/api/projects/' + encodeURIComponent(p.name) + '/cover" ' +
            'loading="lazy" onerror="this.parentNode.classList.add(\'cover-fallback\');this.remove()"></div>';
        // 健康度徽章（变更 1）
        var h = p.health_score;
        var healthHtml = '';
        if (typeof h === 'number' && !isNaN(h)) {
            var cls = h >= 70 ? 'h-good' : (h >= 40 ? 'h-mid' : 'h-bad');
            healthHtml = '<span class="health-badge ' + cls + '" title="健康度 ' + h + '">' + h + '</span>';
        }
        // 依赖未装（变更 3）
        var depsHtml = (p.deps_missing && p.deps_missing.length)
            ? '<span class="deps-badge" title="缺：' + Lib.esc(p.deps_missing.join(', ')) + '">' +
                Lib.icon('warning') + ' 缺 ' + p.deps_missing.length + '</span>'
            : '';
        // 资源型（变更 4）
        var resHtml = p.resource_type === 'resource'
            ? '<span class="res-badge">' + Lib.icon('package') + ' 资源型</span>'
            : '';
        // 置顶角标（变更 6）
        var pinHtml = p.pinned ? '<span class="pin-tag" title="已置顶">' + Lib.icon('pin') + '</span>' : '';
        var archived = p.status === '已归档';

        card.innerHTML =
            wsBar +
            cover +
            '<div class="card-actions">' +
              '<button class="ctrl-btn" data-act="open" title="在终端打开">' + Lib.icon('play') + '</button>' +
              '<button class="ctrl-btn" data-act="edit" title="编辑">' + Lib.icon('edit') + '</button>' +
              (archived
                ? '<button class="ctrl-btn" data-act="restore" title="恢复">' + Lib.icon('restore') + '</button>'
                : '<button class="ctrl-btn" data-act="archive" title="归档">' + Lib.icon('archive') + '</button>') +
              '<button class="ctrl-btn" data-act="delete" title="删除">' + Lib.icon('x') + '</button>' +
            '</div>' +
            '<div class="card-name">' + Lib.esc(p.name) + '</div>' +
            '<div class="card-meta">' +
              '<span class="lang-badge">' + Lib.esc(p.language || '—') + '</span>' +
              '<span class="status-dot ' + st.cls + '" style="--dot-color:var(--status-' +
                st.cls.replace('st-', '') + ')">' + st.word + '</span>' +
              '<span title="' + Lib.esc(Lib.exactDate(p.last_active)) + '">' +
                Lib.esc(Lib.relTime(p.last_active)) + '</span>' +
              '<span>' + Lib.esc(Lib.fmtSize(p.total_size_mb)) + '</span>' +
              healthHtml + depsHtml + resHtml +
            '</div>' +
            (git.commits ? '<div class="git-badge">' + Lib.icon('git') + ' ' + git.commits + ' commits</div>' : '') +
            (git.remote ? '<span class="remote-corner" title="打开仓库">' + Lib.icon('github') + '</span>' : '') +
            pinHtml + wsTag;

        // 右键菜单（变更 6）：置顶/取消置顶、归档、打开
        card.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            openContextMenu(e.clientX, e.clientY, p);
        });

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
                else if (act === 'restore') doRestore(p.name);
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
                else if (act === 'vscode') names.forEach(function (n) { doOpen(n, 'vscode'); });
                else if (act === 'explorer') names.forEach(function (n) { doOpen(n, 'explorer'); });
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

    async function doRestore(name) {
        if (!confirm('把「' + name + '」从归档恢复？')) return;
        try {
            await Api.restore(name);
            Lib.toast('已恢复', 'success');
            loadProjects();
        } catch (err) {
            Lib.toast('恢复失败：' + err.message, 'error');
        }
    }

    async function doPin(name, on) {
        try {
            await Api.saveProject(name, { pinned: on });
            Lib.toast(on ? '已置顶' : '已取消置顶', 'success');
            loadProjects();
        } catch (err) {
            Lib.toast('置顶失败：' + err.message, 'error');
        }
    }

    /* 右键菜单（变更 6） */
    var ctxEl = null;
    function closeCtx() { if (ctxEl) { ctxEl.remove(); ctxEl = null; } }
    function openContextMenu(x, y, p) {
        closeCtx();
        ctxEl = document.createElement('div');
        ctxEl.className = 'ctx-menu';
        var items = [
            { label: '在终端打开', act: 'open' },
            { label: '在 VS Code 打开', act: 'vscode' },
            { label: p.pinned ? '取消置顶' : '置顶', act: 'pin' },
            { label: p.status === '已归档' ? '恢复' : '归档', act: 'archive' },
            { label: '删除', act: 'del', danger: true },
        ];
        ctxEl.innerHTML = items.map(function (it) {
            return '<button class="ctx-item' + (it.danger ? ' danger' : '') + '" data-act="' +
                it.act + '">' + it.label + '</button>';
        }).join('');
        ctxEl.style.left = x + 'px';
        ctxEl.style.top = y + 'px';
        document.body.appendChild(ctxEl);
        ctxEl.querySelectorAll('.ctx-item').forEach(function (b) {
            b.addEventListener('click', function () {
                var act = b.dataset.act;
                if (act === 'open') doOpen(p.name, 'terminal');
                else if (act === 'vscode') doOpen(p.name, 'vscode');
                else if (act === 'pin') doPin(p.name, !p.pinned);
                else if (act === 'archive') {
                    if (p.status === '已归档') doRestore(p.name); else doArchive(p.name);
                } else if (act === 'del') doDelete(p.name);
                closeCtx();
            });
        });
        setTimeout(function () {
            document.addEventListener('click', closeCtx, { once: true });
            window.addEventListener('scroll', closeCtx, { once: true });
        }, 0);
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
            btn.innerHTML = '<span class="icon"><span class="view-dot"></span></span><span class="label">' +
                Lib.esc(v.name) + '</span><button class="view-x" title="删除">' + Lib.icon('x') + '</button>';
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

    /* 侧栏"置顶"分组（变更 6） */
    function renderPinnedSidebar() {
        var host = document.getElementById('pinnedHost');
        if (!host) return;
        var pinned = (Store.state.projects || []).filter(function (p) { return p.pinned; });
        host.innerHTML = '';
        pinned.forEach(function (p) {
            var btn = document.createElement('button');
            btn.className = 'sidebar-btn';
            btn.innerHTML = '<span class="icon">' + Lib.icon('pin') + '</span><span class="label">' +
                Lib.esc(p.name) + '</span>';
            btn.addEventListener('click', function () { go(null, p.name); });
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
                else if (e.key === 's') { window.SettingsPanel.open(); app.gKeyBuffer = ''; }
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
        renderServerInfo: renderServerInfo,
        refreshTheme: function () {
            Theme.applyAll(app.settings);
            render();
        },
    };
})();
