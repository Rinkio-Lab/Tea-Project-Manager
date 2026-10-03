/* =========================================================
   ui/settings-panel.js — 设置抽屉（右侧滑出）
   主题三态 / 6 皮肤 / 高对比 / 字号 / 跟随语言皮肤 / 导出导入 JSON
   快捷筛选 chips 配置 / 多工作区 CRUD / 端口跟随 /api/settings
   ========================================================= */
(function () {
    'use strict';

    var Lib = window.Lib;
    var Theme = window.Theme;
    var Store = window.Store;
    var Api = window.Api;

    // 莫兰迪工作区色板
    var WS_COLORS = ['#a89f91', '#b8a0a3', '#9aa8b8', '#9cb3a0',
                     '#b8a68f', '#a8a0b8', '#c4a89a', '#8fa3ad'];
    var STATUS_WORDS = ['草稿', '在弄', '完工', '说不清'];
    var STATUS_API = {'草稿':'草稿','在弄':'进行中','完工':'已完成','说不清':'无法判断'};
    var QF_KEY = 'tea-quickfilters-v1';
    var QF_DEFAULT = { show: true, langs: ['Python','JavaScript','Go'], statuses: ['进行中','已完成'] };

    function open() {
        document.getElementById('drawer').classList.add('open');
        document.getElementById('drawerMask').classList.add('show');
        renderBody();
    }

    function close() {
        document.getElementById('drawer').classList.remove('open');
        document.getElementById('drawerMask').classList.remove('show');
    }

    function s() { return window.App.settings; }

    function loadQF() {
        try {
            var raw = JSON.parse(localStorage.getItem(QF_KEY) || 'null');
            if (raw && Array.isArray(raw.langs) && Array.isArray(raw.statuses)) return raw;
        } catch (_) {}
        return JSON.parse(JSON.stringify(QF_DEFAULT));
    }

    function renderBody() {
        var body = document.getElementById('drawerBody');
        var cur = s();
        var qf = loadQF();

        var skinGrid = Theme.SKINS.map(function (skin) {
            return '<button class="color-option' +
                (cur.colorTheme === skin.id ? ' active' : '') +
                ' data-skin="' + skin.id + '">' +
                '<span class="swatch" style="background:' + skin.swatch + '"></span>' +
                '<span>' + skin.label + '</span></button>';
        }).join('');

        // 快捷筛选：语言按钮列表
        var langRows = qf.langs.map(function (l, i) {
            return '<div class="qf-row">' +
                '<span>' + Lib.esc(l) + '</span>' +
                '<span class="qf-ops">' +
                  '<button class="mini-btn" data-qf="lang-up" data-i="' + i + '"' + (i===0?' disabled':'') + '>↑</button>' +
                  '<button class="mini-btn" data-qf="lang-down" data-i="' + i + '"' + (i===qf.langs.length-1?' disabled':'') + '>↓</button>' +
                  '<button class="mini-btn" data-qf="lang-del" data-i="' + i + '">×</button>' +
                '</span></div>';
        }).join('');

        // 快捷筛选：状态按钮列表
        var stRows = qf.statuses.map(function (st, i) {
            return '<div class="qf-row">' +
                '<span>' + Lib.esc(Lib.statusWord(st).word) + '</span>' +
                '<span class="qf-ops">' +
                  '<button class="mini-btn" data-qf="st-up" data-i="' + i + '"' + (i===0?' disabled':'') + '>↑</button>' +
                  '<button class="mini-btn" data-qf="st-down" data-i="' + i + '"' + (i===qf.statuses.length-1?' disabled':'') + '>↓</button>' +
                  '<button class="mini-btn" data-qf="st-del" data-i="' + i + '">×</button>' +
                '</span></div>';
        }).join('');

        // 工作区列表
        var si = Store.state.serverInfo || {};
        var wss = si.workspaces || [];
        var wsRows = wss.map(function (w, i) {
            var cnt = (Store.state.projects || []).filter(function (p) {
                return p.workspace_name === w.name;
            }).length;
            return '<div class="ws-row">' +
                '<span class="ws-swatch" style="background:' + Lib.esc(w.color || '#999') + '"></span>' +
                '<span class="ws-name">' + Lib.esc(w.name) + '</span>' +
                '<span class="ws-count">' + cnt + ' 个项目</span>' +
                '<span class="qf-ops">' +
                  '<button class="mini-btn" data-ws="edit" data-i="' + i + '">编辑</button>' +
                  '<button class="mini-btn" data-ws="del" data-i="' + i + '">删</button>' +
                '</span></div>';
        }).join('');

        body.innerHTML =
            '<div class="settings-section">' +
              '<h3>' + window.I18n.t('set.appearance') + '</h3>' +
              '<div class="setting-row"><span class="setting-label">' + window.I18n.t('set.language') + '</span>' +
                '<select id="setLang">' +
                  window.I18n.LANGUAGES.map(function (l) {
                      return '<option value="' + l.code + '"' +
                          (window.I18n.getLang() === l.code ? ' selected' : '') +
                          '>' + l.native + '</option>';
                  }).join('') +
                '</select></div>' +
              '<div class="setting-row"><span class="setting-label">' + window.I18n.t('set.theme') + '</span>' +
                '<select id="setTheme">' +
                  '<option value="light"' + sel(cur.theme, 'light') + '>' + window.I18n.t('set.theme.light') + '</option>' +
                  '<option value="dark"' + sel(cur.theme, 'dark') + '>' + window.I18n.t('set.theme.dark') + '</option>' +
                  '<option value="system"' + sel(cur.theme, 'system') + '>' + window.I18n.t('set.theme.system') + '</option>' +
                '</select></div>' +
              '<div class="settings-desc">皮肤任选，高对比会自动跟随亮/暗。</div>' +
              '<div class="color-grid">' + skinGrid + '</div>' +
              '<div class="setting-row"><span class="setting-label">' + window.I18n.t('set.size') + '</span>' +
                '<input type="range" id="setSize" min="12" max="18" step="1" value="' +
                cur.uiSize + '">' +
                '<span class="setting-value">' + cur.uiSize + 'px</span></div>' +
            '</div>' +

            '<div class="settings-section">' +
              '<h3>' + window.I18n.t('set.followLang') + '</h3>' +
              '<div class="setting-row"><span class="setting-label">跟随项目语言</span>' +
                '<input type="checkbox" id="setFollowLang"' +
                (cur.followLanguage ? ' checked' : '') + '></div>' +
              '<div class="settings-desc">开了之后，每张卡片按它的语言上色：Python 蓝、Go 青、前端琥珀。</div>' +
            '</div>' +

            '<div class="settings-section">' +
              '<h3>' + window.I18n.t('set.quickFilters') + '</h3>' +
              '<div class="setting-row"><span class="setting-label">' + window.I18n.t('set.qfShow') + '</span>' +
                '<input type="checkbox" id="qfShow"' + (qf.show ? ' checked' : '') + '></div>' +
              '<div class="setting-row"><span class="setting-label">' + window.I18n.t('set.qfLangs') + '</span></div>' +
              langRows +
              '<div class="row" style="display:flex;gap:6px;margin-top:6px">' +
                '<input type="text" id="qfAddLang" placeholder="加语言，如 Python" style="flex:1">' +
                '<button class="btn-secondary small" id="qfAddLangBtn">' + window.I18n.t('set.addExt') + '</button>' +
              '</div>' +
              '<div class="setting-row" style="margin-top:10px"><span class="setting-label">' + window.I18n.t('set.qfStatus') + '</span></div>' +
              stRows +
              '<div class="row" style="display:flex;gap:6px;margin-top:6px">' +
                '<select id="qfAddSt">' + STATUS_WORDS.map(function (w) {
                    return '<option>' + w + '</option>';
                }).join('') + '</select>' +
                '<button class="btn-secondary small" id="qfAddStBtn">' + window.I18n.t('set.addExt') + '</button>' +
              '</div>' +
              '<div class="row" style="margin-top:10px">' +
                '<button class="btn-secondary small" id="qfReset">' + window.I18n.t('set.qfReset') + '</button>' +
              '</div>' +
            '</div>' +

            '<div class="settings-section">' +
              '<h3>' + window.I18n.t('set.workspaces') + '</h3>' +
              '<div class="settings-desc">按目录前缀把项目分组，卡片顶部出对应色条。</div>' +
              wsRows +
              '<div class="row" style="margin-top:10px">' +
                '<button class="btn-secondary small" id="wsNew">' + Lib.icon('plus') + ' ' + window.I18n.t('set.wsNew') + '</button>' +
              '</div>' +
              '<div id="wsEditHost"></div>' +
            '</div>' +

            '<div class="settings-section">' +
              '<h3>' + window.I18n.t('set.anim') + '</h3>' +
              '<div class="setting-row"><span class="setting-label">' + window.I18n.t('set.animOn') + '</span>' +
                '<input type="checkbox" id="setAnim"' + (cur.animations ? ' checked' : '') + '></div>' +
              '<div class="setting-row"><span class="setting-label">' + window.I18n.t('set.speed') + '</span>' +
                '<select id="setSpeed">' +
                  '<option value="slow"' + sel(cur.animationSpeed, 'slow') + '>' + window.I18n.t('set.slow') + '</option>' +
                  '<option value="normal"' + sel(cur.animationSpeed, 'normal') + '>' + window.I18n.t('set.normal') + '</option>' +
                  '<option value="fast"' + sel(cur.animationSpeed, 'fast') + '>' + window.I18n.t('set.fast') + '</option>' +
                '</select></div>' +
            '</div>' +

            '<div class="settings-section">' +
              '<h3>' + window.I18n.t('set.themeBackup') + '</h3>' +
              '<div class="row" style="display:flex;gap:8px;flex-wrap:wrap">' +
                '<button class="btn-secondary small" id="exportTheme">' + window.I18n.t('set.exportTheme') + '</button>' +
                '<button class="btn-secondary small" id="importTheme">' + window.I18n.t('set.importTheme') + '</button>' +
                '<input type="file" id="importFile" accept="application/json" class="hidden">' +
              '</div>' +
            '</div>' +

            '<div class="settings-section">' +
              '<h3>' + window.I18n.t('set.projectService') + '</h3>' +
              '<div class="setting-row"><span class="setting-label">' + window.I18n.t('set.root') + '</span>' +
                '<span class="setting-value">' +
                Lib.esc(si.projects_root || '—') + '</span></div>' +
              '<div class="setting-row"><span class="setting-label">' + window.I18n.t('set.port') + '</span>' +
                '<span class="setting-value">' +
                Lib.esc(String(si.port || '—')) + '</span></div>' +
              '<div class="setting-row"><span class="setting-label">' + window.I18n.t('set.defaultView') + '</span>' +
                '<select id="setDefaultView">' +
                  '<option value="grid"' + sel(si.default_view, 'grid') + '>' + window.I18n.t('nav.grid') + '</option>' +
                  '<option value="table"' + sel(si.default_view, 'table') + '>' + window.I18n.t('nav.table') + '</option>' +
                  '<option value="dashboard"' + sel(si.default_view, 'dashboard') + '>' + window.I18n.t('nav.dashboard') + '</option>' +
                '</select></div>' +
              '<div class="setting-row"><span class="setting-label">' + window.I18n.t('set.autostart') + '</span>' +
                '<input type="checkbox" id="setAutostart"></div>' +
              '<div class="settings-desc" id="autostartHint">' + window.I18n.t('set.autostartLoading') + '</div>' +
            '</div>' +

            configExtensionsSection(si) +

            '<div class="settings-section">' +
              '<h3>' + window.I18n.t('set.backupSnapshots') + '</h3>' +
              '<div class="setting-row"><span class="setting-label">' + window.I18n.t('set.backupProj') + '</span>' +
                '<select id="bkProj">' +
                  '<option value="">' + window.I18n.t('set.backupProjPh') + '</option>' +
                  ((Store.state.projects || []).map(function (p) {
                      return '<option>' + Lib.esc(p.name) + '</option>';
                  }).join('')) +
                '</select></div>' +
              '<div id="bkList"></div>' +
              '<div class="setting-row" style="margin-top:10px"><span class="setting-label">' + window.I18n.t('set.backupKeep') + '</span>' +
                '<input type="number" id="bkKeep" min="1" max="50" value="' +
                Lib.esc(String(si.backup_keep || 5)) + '" style="width:80px"></div>' +
              '<div class="row" style="margin-top:8px"><button class="btn-primary small" id="bkSave">' + window.I18n.t('set.backupSave') + '</button></div>' +
            '</div>' +

            '<div class="settings-section">' +
              '<h3>' + window.I18n.t('set.exportTitle') + '</h3>' +
              '<div class="row" style="display:flex;gap:8px;flex-wrap:wrap">' +
                '<button class="btn-secondary small" data-export="json">' + window.I18n.t('set.expJsonBtn') + '</button>' +
                '<button class="btn-secondary small" data-export="csv">' + window.I18n.t('set.expCsvBtn') + '</button>' +
                '<button class="btn-secondary small" data-export="md">' + window.I18n.t('set.expMdBtn') + '</button>' +
              '</div>' +
            '</div>';

        // === 主题 / 动效绑定（略，与原一致）===
        document.getElementById('setTheme').addEventListener('change', function (e) {
            cur.theme = e.target.value;
            persist(); window.App.refreshTheme(); renderBody();
        });
        body.querySelectorAll('[data-skin]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                cur.colorTheme = btn.dataset.skin;
                persist(); window.App.refreshTheme(); renderBody();
            });
        });
        document.getElementById('setSize').addEventListener('input', function (e) {
            cur.uiSize = Number(e.target.value);
            e.target.nextElementSibling.textContent = cur.uiSize + 'px';
            persist(); Theme.applyTypography(cur);
        });
        document.getElementById('setFollowLang').addEventListener('change', function (e) {
            cur.followLanguage = e.target.checked;
            persist(); window.App.refreshTheme();
        });
        document.getElementById('setAnim').addEventListener('change', function (e) {
            cur.animations = e.target.checked;
            persist(); Theme.applyMotion(cur);
        });
        document.getElementById('setSpeed').addEventListener('change', function (e) {
            cur.animationSpeed = e.target.value;
            persist(); Theme.applyMotion(cur);
        });

        // === 快捷筛选绑定 ===
        document.getElementById('qfShow').addEventListener('change', function (e) {
            qf.show = e.target.checked;
            localStorage.setItem(QF_KEY, JSON.stringify(qf));
            window.App.render();
        });
        body.querySelectorAll('[data-qf]').forEach(function (b) {
            b.addEventListener('click', function () {
                var i = Number(b.dataset.i), act = b.dataset.qf;
                if (act === 'lang-del') qf.langs.splice(i, 1);
                if (act === 'lang-up') { var t = qf.langs[i]; qf.langs[i] = qf.langs[i-1]; qf.langs[i-1] = t; }
                if (act === 'lang-down') { var t = qf.langs[i]; qf.langs[i] = qf.langs[i+1]; qf.langs[i+1] = t; }
                if (act === 'st-del') qf.statuses.splice(i, 1);
                if (act === 'st-up') { var t = qf.statuses[i]; qf.statuses[i] = qf.statuses[i-1]; qf.statuses[i-1] = t; }
                if (act === 'st-down') { var t = qf.statuses[i]; qf.statuses[i] = qf.statuses[i+1]; qf.statuses[i+1] = t; }
                localStorage.setItem(QF_KEY, JSON.stringify(qf));
                renderBody(); window.App.render();
            });
        });
        document.getElementById('qfAddLangBtn').addEventListener('click', function () {
            var v = document.getElementById('qfAddLang').value.trim();
            if (v && qf.langs.indexOf(v) === -1) qf.langs.push(v);
            localStorage.setItem(QF_KEY, JSON.stringify(qf));
            renderBody(); window.App.render();
        });
        document.getElementById('qfAddStBtn').addEventListener('click', function () {
            var w = document.getElementById('qfAddSt').value;
            var api = STATUS_API[w];
            if (api && qf.statuses.indexOf(api) === -1) qf.statuses.push(api);
            localStorage.setItem(QF_KEY, JSON.stringify(qf));
            renderBody(); window.App.render();
        });
        document.getElementById('qfReset').addEventListener('click', function () {
            localStorage.removeItem(QF_KEY);
            renderBody(); window.App.render();
        });

        // === 工作区绑定 ===
        body.querySelectorAll('[data-ws]').forEach(function (b) {
            b.addEventListener('click', async function () {
                var i = Number(b.dataset.i), act = b.dataset.ws;
                var curWss = (Store.state.serverInfo && Store.state.serverInfo.workspaces) || [];
                if (act === 'del') {
                    if (!confirm('删工作区 "' + curWss[i].name + '"？项目不会被删。')) return;
                    curWss.splice(i, 1);
                    await pushWorkspaces(curWss);
                    renderBody();
                } else if (act === 'edit') {
                    renderWsEditor(curWss[i], i);
                }
            });
        });
        document.getElementById('wsNew').addEventListener('click', function () {
            renderWsEditor(null, -1);
        });

        // === 主题导入导出 ===
        document.getElementById('exportTheme').addEventListener('click', function () {
            Theme.exportTheme(cur);
        });
        document.getElementById('importTheme').addEventListener('click', function () {
            document.getElementById('importFile').click();
        });
        document.getElementById('importFile').addEventListener('change', async function (e) {
            var file = e.target.files[0];
            if (!file) return;
            var patch = await Theme.importTheme(file);
            if (!patch) { Lib.toast('主题文件读不出来', 'error'); return; }
            ['theme', 'colorTheme', 'animations', 'animationSpeed',
             'uiSize', 'followLanguage'].forEach(function (k) {
                if (patch[k] !== undefined) cur[k] = patch[k];
            });
            persist(); window.App.refreshTheme();
            renderBody();
            Lib.toast('主题已导入', 'success');
        });

        // === 界面语言 ===
        document.getElementById('setLang').addEventListener('change', function (e) {
            window.I18n.setLang(e.target.value);
            window.App.render();
            renderBody();
        });

        // === 默认首页 / 开机自启 ===
        document.getElementById('setDefaultView').addEventListener('change', function (e) {
            persistSettingsPatch({ default_view: e.target.value })
                .then(function () { Lib.toast('已保存', 'success'); })
                .catch(function (err) { Lib.toast('保存失败：' + err.message, 'error'); });
        });
        Api.getAutostart().then(function (r) {
            var cb = document.getElementById('setAutostart');
            if (cb) { cb.checked = !!r.enabled; }
            var h = document.getElementById('autostartHint');
            if (h) h.textContent = r.enabled ? '当前已开启' : '当前已关闭';
        }).catch(function () {});
        document.getElementById('setAutostart').addEventListener('change', function (e) {
            Api.putAutostart(e.target.checked)
                .then(function () {
                    Lib.toast(e.target.checked ? '已开启自启' : '已关闭自启', 'success');
                    document.getElementById('autostartHint').textContent =
                        e.target.checked ? '当前已开启' : '当前已关闭';
                })
                .catch(function (err) {
                    Lib.toast('操作失败：' + err.message, 'error');
                    e.target.checked = !e.target.checked;
                });
        });

        // === 备份列表 ===
        document.getElementById('bkProj').addEventListener('change', async function (e) {
            var listHost = document.getElementById('bkList');
            if (!e.target.value) { listHost.innerHTML = ''; return; }
            try {
                var r = await Api.backups(e.target.value);
                var arr = r.versions || r || [];
                listHost.innerHTML = arr.map(function (v) {
                    return '<div class="qf-row"><span>' + Lib.esc(String(v)) + '</span>' +
                        '<button class="mini-btn" data-bk-restore="' + Lib.esc(String(v)) + '">' + window.I18n.t('set.backupRestore') + '</button></div>';
                }).join('') || '<div class="settings-desc">' + window.I18n.t('set.backupNone') + '</div>';
                listHost.querySelectorAll('[data-bk-restore]').forEach(function (b) {
                    b.addEventListener('click', function () {
                        if (!confirm(window.I18n.t('set.backupConfirm', { v: b.dataset.bkRestore }))) return;
                        Api.restoreBackup(e.target.value, b.dataset.bkRestore)
                            .then(function () { Lib.toast(window.I18n.t('set.backupRestored'), 'success'); })
                            .catch(function (err) { Lib.toast(window.I18n.t('set.backupRestoreFail') + err.message, 'error'); });
                    });
                });
            } catch (err) {
                listHost.innerHTML = '<div class="settings-desc">' + window.I18n.t('set.backupRestoreFail') + Lib.esc(err.message) + '</div>';
            }
        });
        document.getElementById('bkSave').addEventListener('click', function () {
            persistSettingsPatch({ backup_keep: Number(document.getElementById('bkKeep').value) || 5 })
                .then(function () { Lib.toast('已保存', 'success'); })
                .catch(function (err) { Lib.toast('保存失败：' + err.message, 'error'); });
        });

        // === 导出 ===
        body.querySelectorAll('[data-export]').forEach(function (b) {
            b.addEventListener('click', function () {
                Api.exportData(b.dataset.export).then(function (blob) {
                    var a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = 'tea-pm-export.' + b.dataset.export;
                    a.click();
                    URL.revokeObjectURL(a.href);
                    Lib.toast(window.I18n.t('set.exported'), 'success');
                }).catch(function (err) { Lib.toast(window.I18n.t('set.exportFail') + err.message, 'error'); });
            });
        });

        // === 配置扩展名 ===
        body.querySelectorAll('[data-ext-del]').forEach(function (b) {
            b.addEventListener('click', function () {
                var cur = (Store.state.serverInfo && Store.state.serverInfo.config_extensions) || [];
                var next = cur.slice();
                next.splice(Number(b.dataset.extDel), 1);
                persistSettingsPatch({ config_extensions: next })
                    .then(function () { renderBody(); });
            });
        });
        document.getElementById('extAddBtn').addEventListener('click', function () {
            var v = document.getElementById('extAdd').value.trim();
            var cur = (Store.state.serverInfo && Store.state.serverInfo.config_extensions) || [];
            if (!v.startsWith('.')) { Lib.toast('扩展名要以 . 开头', 'error'); return; }
            if (/[\\\/]/.test(v)) { Lib.toast('不能含路径分隔符', 'error'); return; }
            if (cur.indexOf(v) !== -1) { Lib.toast('已经有了', 'error'); return; }
            persistSettingsPatch({ config_extensions: cur.concat([v]) })
                .then(function () { renderBody(); });
        });
        document.getElementById('extSave').addEventListener('click', function () {
            // 按勾选状态重建列表（保持原顺序）
            var cur = (Store.state.serverInfo && Store.state.serverInfo.config_extensions) || [];
            var next = [];
            body.querySelectorAll('[data-ext]').forEach(function (cb) {
                if (cb.checked) next.push(cb.dataset.ext);
            });
            // 强制 .teaproject 在首位
            next = ['.teaproject'].concat(next.filter(function (x) { return x !== '.teaproject'; }));
            persistSettingsPatch({ config_extensions: next })
                .then(function () {
                    Lib.toast('已保存，共 ' + next.length + ' 个扩展名', 'success');
                    renderBody();
                })
                .catch(function (err) { Lib.toast('保存失败：' + err.message, 'error'); });
        });
    }

    // 工作区内联编辑器
    function renderWsEditor(existing, idx) {
        var host = document.getElementById('wsEditHost');
        var curWss = (Store.state.serverInfo && Store.state.serverInfo.workspaces) || [];
        var projects = Store.state.projects || [];
        var cur = existing || { name: '', color: WS_COLORS[0], paths: [], projects: [] };
        host.innerHTML =
            '<div class="ws-editor">' +
              '<div class="setting-row"><span class="setting-label">名称</span>' +
                '<input type="text" id="wsName" value="' + Lib.esc(cur.name || '') + '"></div>' +
              '<div class="setting-row"><span class="setting-label">颜色</span>' +
                '<div class="ws-color-row">' + WS_COLORS.map(function (c) {
                    return '<span class="ws-color-pick' + (cur.color===c?' active':'') +
                        '" data-wsc="' + c + '" style="background:' + c + '"></span>';
                }).join('') + '</div></div>' +
              '<div class="setting-row"><span class="setting-label">路径前缀</span>' +
                '<textarea id="wsPaths" rows="3" placeholder="每行一个前缀">' +
                Lib.esc((cur.paths || []).join('\n')) + '</textarea></div>' +
              '<div class="setting-row"><span class="setting-label">手动勾选项目</span></div>' +
              '<div class="ws-proj-list">' + projects.map(function (p) {
                  var on = (cur.projects || []).indexOf(p.name) !== -1;
                  return '<label class="ws-proj"><input type="checkbox" data-wsp="' +
                      Lib.esc(p.name) + '"' + (on?' checked':'') + '> ' +
                      Lib.esc(p.name) + '</label>';
              }).join('') + '</div>' +
              '<div class="row" style="margin-top:10px;gap:8px">' +
                '<button class="btn-primary small" id="wsSave">保存</button>' +
                '<button class="btn-secondary small" id="wsCancel">取消</button>' +
              '</div>' +
            '</div>';

        var pickedColor = cur.color || WS_COLORS[0];
        host.querySelectorAll('[data-wsc]').forEach(function (el) {
            el.addEventListener('click', function () {
                pickedColor = el.dataset.wsc;
                host.querySelectorAll('[data-wsc]').forEach(function (x) {
                    x.classList.toggle('active', x === el);
                });
            });
        });
        document.getElementById('wsCancel').addEventListener('click', function () {
            host.innerHTML = '';
        });
        document.getElementById('wsSave').addEventListener('click', async function () {
            var name = document.getElementById('wsName').value.trim();
            if (!name) { Lib.toast('给个名字', 'error'); return; }
            var paths = document.getElementById('wsPaths').value.split('\n')
                .map(function (s) { return s.trim(); }).filter(Boolean);
            var picked = [];
            host.querySelectorAll('[data-wsp]:checked').forEach(function (cb) {
                picked.push(cb.dataset.wsp);
            });
            var entry = { name: name, color: pickedColor, paths: paths, projects: picked };
            var next = curWss.slice();
            if (idx >= 0) next[idx] = entry; else next.push(entry);
            await pushWorkspaces(next);
            Lib.toast('已保存工作区', 'success');
            renderBody();
        });
    }

    // PUT /api/settings 写回，保留原 bind/port/projects_root/theme
    async function pushWorkspaces(wss) {
        try {
            var cur = Store.state.serverInfo || {};
            var payload = {
                bind: cur.bind || '',
                port: cur.port || 0,
                projects_root: cur.projects_root || '',
                theme: cur.theme || '',
                workspaces: wss,
            };
            await Api.putSettings(payload);
            // 变更 5：重新拉取，刷新端口显示
            Store.state.serverInfo = await Api.getSettings();
            window.App.renderServerInfo && window.App.renderServerInfo();
        } catch (e) {
            Lib.toast('保存失败：' + e.message, 'error');
        }
    }

    function sel(cur, v) { return cur === v ? ' selected' : ''; }

    /* 配置扩展名设置组（第四批） */
    var BUILTIN_EXT = ['.teaproject', '.tea', '.teaproj', '.tpm'];
    function configExtensionsSection(si) {
        var list = si.config_extensions || [];
        var rows = list.map(function (ext, i) {
            var locked = ext === '.teaproject';
            var checked = true;
            return '<div class="qf-row">' +
                '<label><input type="checkbox" data-ext="' + Lib.esc(ext) + '"' +
                    (checked ? ' checked' : '') + (locked ? ' disabled' : '') + '> ' +
                    Lib.esc(ext) + (locked ? window.I18n.t('set.configExtLocked') : '') + '</label>' +
                (BUILTIN_EXT.indexOf(ext) === -1
                    ? '<button class="mini-btn" data-ext-del="' + i + '">' + window.I18n.t('action.delete') + '</button>'
                    : '<span></span>') +
                '</div>';
        }).join('');
        return '<div class="settings-section">' +
            '<h3>' + window.I18n.t('set.configExtTitle') + '</h3>' +
            '<div class="settings-desc">' + window.I18n.t('set.configExtDesc') + '</div>' +
            rows +
            '<div class="row" style="display:flex;gap:6px;margin-top:6px">' +
              '<input type="text" id="extAdd" placeholder=".project" style="flex:1">' +
              '<button class="btn-secondary small" id="extAddBtn">' + window.I18n.t('set.addExt') + '</button>' +
            '</div>' +
            '<div class="row" style="margin-top:8px"><button class="btn-primary small" id="extSave">' + window.I18n.t('set.saveExt') + '</button></div>' +
          '</div>';
    }

    function persistSettingsPatch(patch) {
        return (async function () {
            var cur = Store.state.serverInfo || {};
            var body = Object.assign({
                bind: cur.bind || '', port: cur.port || 0,
                projects_root: cur.projects_root || '', theme: cur.theme || '',
                workspaces: cur.workspaces || [],
            }, patch);
            await Api.putSettings(body);
            Store.state.serverInfo = await Api.getSettings();
            window.App.renderServerInfo && window.App.renderServerInfo();
        })();
    }

    function persist() { window.App.saveSettings(); }

    window.SettingsPanel = { open: open, close: close };
})();
