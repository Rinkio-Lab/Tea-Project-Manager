/* =========================================================
   ui/project-detail.js — 详情面板 = 可编辑控制台
   左卡片右面板；手写区/自动区视觉分隔；inline 编辑
   Ctrl+S 保存 / Esc 取消；自动区单字段重扫；AI 采纳/替换（SVG 图标）
   ========================================================= */
(function () {
    'use strict';

    var Lib = window.Lib;
    var Api = window.Api;
    var Store = window.Store;

    var editing = null; // {field, original}

    // 手写区可编辑字段（PUT 白名单）
    var HANDWRITTEN = [
        { key: 'name', label: window.I18n.t('field.name'), type: 'text', full: true },
        { key: 'type', label: window.I18n.t('field.type'), type: 'text' },
        { key: 'category', label: window.I18n.t('field.category'), type: 'text' },
        { key: 'language', label: window.I18n.t('field.language'), type: 'text' },
        { key: 'status', label: window.I18n.t('field.status'), type: 'select', options: ['草稿', '进行中', '已完成', '无法判断'] },
        { key: 'quality', label: window.I18n.t('field.quality'), type: 'text' },
        { key: 'description', label: window.I18n.t('field.description'), type: 'textarea', full: true, ai: true },
        { key: 'intent', label: window.I18n.t('field.intent'), type: 'textarea', full: true, ai: true },
        { key: 'tags', label: window.I18n.t('field.tags'), type: 'tags', full: true },
        { key: 'tech_stack', label: window.I18n.t('field.techStack'), type: 'tags', full: true },
        { key: 'notes', label: window.I18n.t('field.notes'), type: 'textarea', full: true },
    ];

    var AUTO = [
        { key: 'last_active', label: window.I18n.t('field.lastActive') },
        { key: 'created', label: window.I18n.t('field.created') },
        { key: 'code_files', label: window.I18n.t('field.codeFiles') },
        { key: 'total_size_mb', label: window.I18n.t('field.totalSize') },
        { key: 'commits', label: window.I18n.t('field.commits') },
        { key: 'remote', label: window.I18n.t('field.remote') },
        { key: 'deps', label: window.I18n.t('field.deps') },
    ];

    async function render(name) {
        var host = document.getElementById('viewContent');
        editing = null;
        var p;
        try {
            p = await Api.getProject(name);
        } catch (err) {
            host.innerHTML = '<div class="empty-state"><div class="empty-title">没读到「' +
                Lib.esc(name) + '」</div>' + Lib.esc(err.message) + '</div>';
            return;
        }
        Store.state.currentProject = name;
        var st = Lib.statusWord(p.status);
        var accent = (window.App.settings.followLanguage && window.Theme.langAccent(p.language)) || '';

        host.innerHTML =
            '<div class="page-head">' +
              '<button class="btn-secondary small" id="backBtn">返回列表</button>' +
              '<h1>' + Lib.esc(p.name) + '</h1>' +
              '<span class="status-pill ' + st.cls + '"><span class="dot"></span>' + st.word + '</span>' +
            '</div>' +
            '<div class="detail-layout">' +
              buildLeftCard(p) +
              '<div class="detail-panel">' +
                buildFieldGroups(p) +
                '<div class="edit-hint" id="editHint">Ctrl+S 保存 · Esc 取消</div>' +
              '</div>' +
            '</div>';

        if (accent) host.style.setProperty('--card-accent', accent);

        document.getElementById('backBtn').addEventListener('click', function () {
            window.App.go(Store.state.view === 'dashboard' ? 'dashboard' : 'grid');
        });
        bindLeftCard(p);
        bindFields(p);
    }

    function buildLeftCard(p) {
        var git = p.git || {};
        var rows = [
            ['语言', p.language || '—'],
            ['状态', Lib.statusWord(p.status).word],
            ['类别', p.category || '—'],
            ['体积', Lib.fmtSize(p.total_size_mb)],
            ['最后活跃', Lib.relTime(p.last_active) + '（' + Lib.exactDate(p.last_active) + '）'],
            ['创建', Lib.exactDate(p.created)],
            ['提交数', git.commits != null ? String(git.commits) : '—'],
        ];
        var rowsHtml = rows.map(function (r) {
            return '<div class="meta-row"><span>' + Lib.esc(r[0]) + '</span>' +
                '<span class="v">' + Lib.esc(r[1]) + '</span></div>';
        }).join('');

        var actionBtns = [
            ['terminal', window.I18n.t('action.terminal')],
            ['vscode', window.I18n.t('action.vscode')],
            ['explorer', window.I18n.t('action.explorer')],
            ['browser', window.I18n.t('action.browser')],
        ];
        if (git.remote) actionBtns.push(['github', window.I18n.t('action.github')]);
        (p.actions || []).forEach(function (a) {
            actionBtns.push(['custom:' + Lib.esc(a.name), Lib.esc(a.name)]);
        });
        var btnsHtml = actionBtns.map(function (b) {
            return '<button class="btn-secondary" data-act="' + b[0] + '">' + b[1] + '</button>';
        }).join('');

        return '<div class="detail-card">' +
            '<div class="card-title">' + Lib.esc(p.name) + '</div>' +
            '<div class="path">' + Lib.esc(p.path || '') + '</div>' +
            rowsHtml +
            '<div class="action-bar">' + btnsHtml + '</div>' +
            '<div class="danger-row">' +
              (p.status === '已归档'
                ? '<button class="btn-secondary small" id="arcBtn">' + window.I18n.t('action.restore') + '</button>'
                : '<button class="btn-secondary small" id="arcBtn">' + window.I18n.t('action.archive') + '</button>') +
              '<button class="btn-danger small" id="delBtn">' + window.I18n.t('action.delete') + '</button>' +
            '</div></div>';
    }

    function bindLeftCard(p) {
        document.querySelectorAll('.action-bar [data-act]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var act = btn.dataset.act;
                if (act === 'github') { window.open((p.git || {}).remote, '_blank'); return; }
                if (act.indexOf('custom:') === 0) {
                    window.App.doOpen(p.name, 'custom', act.slice(7));
                    return;
                }
                window.App.doOpen(p.name, act);
            });
        });
        document.getElementById('arcBtn').addEventListener('click', function () {
            window.App.doArchive(p.name);
        });
        document.getElementById('delBtn').addEventListener('click', function () {
            window.App.doDelete(p.name);
        });
    }

    /* ---------- 字段区 ---------- */
    function buildFieldGroups(p) {
        var hand = HANDWRITTEN.map(function (f) {
            return fieldHtml(p, f, false);
        }).join('');

        var auto = AUTO.map(function (f) {
            var val;
            if (f.key === 'commits') val = (p.git && p.git.commits) != null ? String(p.git.commits) : '—';
            else if (f.key === 'remote') val = (p.git && p.git.remote) || '—';
            else if (f.key === 'deps') val = (p.deps || []).join(', ') || '—';
            else if (f.key === 'total_size_mb') val = Lib.fmtSize(p.total_size_mb);
            else val = p[f.key] != null ? String(p[f.key]) : '—';
            return '<div class="field"><div class="field-label">' +
                Lib.esc(f.label) +
                '<button class="field-refresh" data-refresh="' + f.key + '" title="' + window.I18n.t('field.refresh') + '">' + Lib.icon('refresh') + '</button></div>' +
                '<div class="field-value readonly" data-key="' + f.key + '">' +
                Lib.esc(val) + '</div></div>';
        }).join('');

        return '<div class="field-group">' +
                '<div class="field-group-title">' + window.I18n.t('field.handGroup') + '</div>' +
                '<div class="field-grid">' + hand + '</div>' +
              '</div>' +
              '<div class="field-group">' +
                '<div class="field-group-title">' + window.I18n.t('field.autoGroup') + '</div>' +
                '<div class="field-grid">' + auto + '</div>' +
              '</div>' +
              commandsHtml(p);
    }

    /* 常用命令区（变更 8） */
    function commandsHtml(p) {
        var cmds = p.commands || [];
        if (!cmds.length) return '';
        var buttons = cmds.map(function (c) {
            var name = typeof c === 'string' ? c : c.name;
            return '<button class="btn-secondary small cmd-btn" data-cmd="' +
                Lib.esc(name) + '">' + Lib.esc(name) + '</button>';
        }).join('');
        return '<div class="field-group">' +
            '<div class="field-group-title">' + window.I18n.t('detail.commands') + '</div>' +
            '<div class="cmd-buttons">' + buttons + '</div>' +
            '<pre class="cmd-output" id="cmdOutput" hidden></pre>' +
            '<button class="btn-secondary small" id="cmdTerminate" hidden>' + Lib.icon('x') + ' ' + window.I18n.t('detail.terminate') + '</button>' +
            '</div>';
    }

    function bindCommands(p) {
        var output = document.getElementById('cmdOutput');
        var termBtn = document.getElementById('cmdTerminate');
        if (!output) return;
        var es = null;
        document.querySelectorAll('.cmd-btn').forEach(function (btn) {
            btn.addEventListener('click', async function () {
                var cmd = btn.dataset.cmd;
                output.hidden = false;
                termBtn.hidden = false;
                output.textContent = '$ ' + cmd + '\n';
                try {
                    var r = await Api.run(p.name, cmd);
                    var runId = r.run_id;
                    if (typeof EventSource !== 'undefined') {
                        es = new EventSource('/api/runs/' + encodeURIComponent(runId) + '/stream');
                        var finishRun = function (code) {
                            if (code !== undefined && code !== null) {
                                output.textContent += '\n[退出码 ' + code + ']';
                            }
                            output.scrollTop = output.scrollHeight;
                            es.close();
                            termBtn.hidden = true;
                        };
                        // 后端具名事件：output（纯文本行）/ exit（纯文本退出码）
                        es.addEventListener('output', function (e) {
                            output.textContent += e.data + '\n';
                            output.scrollTop = output.scrollHeight;
                        });
                        es.addEventListener('exit', function (e) {
                            finishRun(parseInt(e.data, 10));
                        });
                        // 兜底：普通 message 事件追加原文
                        es.onmessage = function (e) {
                            output.textContent += e.data + '\n';
                            output.scrollTop = output.scrollHeight;
                        };
                        es.onerror = function () { finishRun(); };
                        termBtn.onclick = function () {
                            Api.terminate(runId).catch(function () {});
                            // 后端 terminate 后会发 exit 事件，无需特判
                        };
                    }
                } catch (e) {
                    output.textContent += '启动失败：' + e.message + '\n';
                }
            });
        });
    }

    function fieldHtml(p, f, _auto) {
        var v = p[f.key];
        var display;
        var aiMark = p.ai && (f.key === 'description' || f.key === 'intent');
        if (f.type === 'tags') {
            display = (v || []).join('，') || '—';
        } else {
            display = (v !== undefined && v !== null && v !== '') ? String(v) : '—';
        }
        return '<div class="field' + (f.full ? ' full' : '') + '">' +
            '<div class="field-label">' + Lib.esc(f.label) +
            (f.ai ? '<span class="ai-mark" title="' + window.I18n.t('field.aiMark') + '">' + Lib.icon('sparkle') + '</span>' : '') +
            (aiMark ? '<span class="ai-actions">' +
                '<button class="btn-secondary small" data-ai="adopt">' + window.I18n.t('field.adopt') + '</button>' +
                '<button class="btn-secondary small" data-ai="regen">' + window.I18n.t('field.replace') + '</button>' +
                '</span>' : '') +
            '</div>' +
            '<div class="field-value" data-key="' + f.key + '" data-type="' + f.type + '">' +
            Lib.esc(display) + '</div></div>';
    }

    function bindFields(p) {
        var hint = document.getElementById('editHint');
        bindCommands(p);
        document.querySelectorAll('.detail-panel .field-value[data-type]').forEach(function (el) {
            el.addEventListener('click', function () {
                startEdit(p, el, hint);
            });
        });
        // 自动区刷新
        document.querySelectorAll('[data-refresh]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                refreshField(p, btn.dataset.refresh);
            });
        });
        // AI 采纳 / 替换
        document.querySelectorAll('[data-ai]').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var act = btn.dataset.ai;
                if (act === 'adopt') {
                    Api.saveProject(p.name, { ai: false }).then(function () {
                        Lib.toast('已采纳，AI 标记清除', 'success');
                        render(p.name);
                    }).catch(function (err) { Lib.toast(err.message, 'error'); });
                } else {
                    Lib.toast('重新生成文案（等后端 AI 接入）', 'success');
                }
            });
        });
        // Ctrl+S / Esc
        hostKeyHandler(p, hint);
    }

    function startEdit(p, el, hint) {
        if (el.classList.contains('editing')) return;
        var key = el.dataset.key;
        var type = el.dataset.type;
        var original = el.textContent;
        el.classList.add('editing');
        hint.classList.add('show');

        if (type === 'select') {
            var sel = document.createElement('select');
            ['草稿', '进行中', '已完成', '无法判断'].forEach(function (o) {
                var opt = document.createElement('option');
                opt.value = o; opt.textContent = Lib.statusWord(o).word;
                if (o === p.status) opt.selected = true;
                sel.appendChild(opt);
            });
            el.innerHTML = '';
            el.appendChild(sel);
            sel.focus();
            finishEdit(p, el, key, original, sel, hint, function () { return sel.value; });
        } else {
            var input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
            input.value = original === '—' ? '' : original;
            el.innerHTML = '';
            el.appendChild(input);
            input.focus();
            finishEdit(p, el, key, original, input, hint, function () { return input.value; });
        }
    }

    function finishEdit(p, el, key, original, input, hint, getVal) {
        function commit() {
            var val = getVal();
            var fieldDef = HANDWRITTEN.find(function (f) { return f.key === key; });
            var body = {};
            if (fieldDef && fieldDef.type === 'tags') {
                body[key] = val.split(/[,，\s]+/).filter(Boolean);
            } else {
                body[key] = val;
            }
            Api.saveProject(p.name, body).then(function () {
                p[key] = body[key];
                Lib.toast('已保存：' + key, 'success');
                render(p.name);
            }).catch(function (err) {
                Lib.toast('保存失败：' + err.message, 'error');
                render(p.name);
            });
        }
        function cancel() { render(p.name); }
        input.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault(); commit();
            } else if (e.key === 'Escape') {
                e.preventDefault(); cancel();
            }
        });
        input.addEventListener('blur', function () {
            // 失焦不自动保存，避免误触；Esc / Ctrl+S 负责退出
        });
    }

    var hostKeyHandlerBound = false;
    function hostKeyHandler(p, hint) {
        // Esc 已在 views.js 全局处理（关闭浮层）；这里处理编辑态 Esc 已由 input 捕获
    }

    async function refreshField(p, key) {
        Lib.toast('重扫 ' + key + ' …');
        try {
            await Api.scan(false);
            var fresh = await Api.getProject(p.name);
            p = fresh;
            render(p.name);
            Lib.toast('已刷新', 'success');
        } catch (err) {
            Lib.toast('刷新失败：' + err.message, 'error');
        }
    }

    function editFirstField() {
        var el = document.querySelector('.detail-panel .field-value[data-type]');
        if (el) {
            var evt = new Event('click');
            el.dispatchEvent(evt);
        }
    }

    window.ProjectDetail = {
        render: render,
        editFirstField: editFirstField,
    };
})();
