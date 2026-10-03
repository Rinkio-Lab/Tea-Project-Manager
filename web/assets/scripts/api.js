/* =========================================================
   api.js — REST 客户端（设计稿 §5）
   全部相对路径 /api/* 同源 fetch
   ========================================================= */
(function () {
    'use strict';

    var Lib = window.Lib;

    function qs(params) {
        var parts = [];
        Object.keys(params || {}).forEach(function (k) {
            var v = params[k];
            if (v === undefined || v === null || v === '') return;
            parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
        });
        return parts.length ? '?' + parts.join('&') : '';
    }

    var Api = {
        // GET /api/projects?q=&lang=&status=&cat=&archived=&sort=
        listProjects: function (filter) {
            return Lib.request('/api/projects' + qs(filter));
        },

        // GET /api/projects/:name
        getProject: function (name) {
            return Lib.request('/api/projects/' + encodeURIComponent(name));
        },

        // PUT /api/projects/:name（手写区白名单字段 + 可选 order）
        saveProject: function (name, body) {
            return Lib.request('/api/projects/' + encodeURIComponent(name), {
                method: 'PUT',
                body: body,
            });
        },

        // POST /api/scan（?write=1 才写盘；前端默认只读重扫）
        scan: function (write) {
            return Lib.request('/api/scan' + (write ? '?write=1' : ''), {
                method: 'POST',
            });
        },

        // GET /api/stats
        stats: function () {
            return Lib.request('/api/stats');
        },

        // POST /api/projects/:name/open {action}
        open: function (name, action, customName) {
            return Lib.request(
                '/api/projects/' + encodeURIComponent(name) + '/open',
                { method: 'POST', body: { action: action, name: customName } }
            );
        },

        // POST /api/projects  body {name, type, desc, readme}
        createProject: function (body) {
            return Lib.request('/api/projects', { method: 'POST', body: body });
        },

        // POST /api/projects/:name/archive
        archive: function (name) {
            return Lib.request(
                '/api/projects/' + encodeURIComponent(name) + '/archive',
                { method: 'POST' }
            );
        },

        // DELETE /api/projects/:name?force=true
        remove: function (name) {
            return Lib.request(
                '/api/projects/' + encodeURIComponent(name) + '?force=true',
                { method: 'DELETE' }
            );
        },

        // GET /api/settings
        getSettings: function () {
            return Lib.request('/api/settings');
        },

        // PUT /api/settings
        putSettings: function (body) {
            return Lib.request('/api/settings', { method: 'PUT', body: body });
        },

        // POST /api/projects/:name/restore（取消归档）
        restore: function (name) {
            return Lib.request(
                '/api/projects/' + encodeURIComponent(name) + '/restore',
                { method: 'POST' }
            );
        },

        // POST /api/projects/:name/run {name} → {run_id}
        run: function (name, cmd) {
            return Lib.request(
                '/api/projects/' + encodeURIComponent(name) + '/run',
                { method: 'POST', body: { name: cmd } }
            );
        },

        // POST /api/runs/:run_id/terminate
        terminate: function (runId) {
            return Lib.request('/api/runs/' + encodeURIComponent(runId) + '/terminate', { method: 'POST' });
        },

        // GET /api/backups?project=
        backups: function (project) {
            return Lib.request('/api/backups' + qs({ project: project }));
        },

        // POST /api/backups/restore {project, version}
        restoreBackup: function (project, version) {
            return Lib.request('/api/backups/restore', {
                method: 'POST', body: { project: project, version: version },
            });
        },

        // GET /api/export?format=json|csv|md → blob
        exportData: function (format) {
            return fetch('/api/export?format=' + encodeURIComponent(format)).then(function (r) {
                if (!r.ok) throw new Error('导出失败 ' + r.status);
                return r.blob();
            });
        },

        // GET /api/autostart → {enabled}
        getAutostart: function () { return Lib.request('/api/autostart'); },
        // PUT /api/autostart {enabled}
        putAutostart: function (enabled) {
            return Lib.request('/api/autostart', { method: 'PUT', body: { enabled: enabled } });
        },
    };

    window.Api = Api;
})();
