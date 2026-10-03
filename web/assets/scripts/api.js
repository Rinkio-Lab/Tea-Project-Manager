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
    };

    window.Api = Api;
})();
