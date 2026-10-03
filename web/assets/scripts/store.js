/* =========================================================
   store.js — 前端状态：视图 / 筛选 / 排序 / 多选 / 保存的视图
   + 极简事件总线
   ========================================================= */
(function () {
    'use strict';

    var Lib = window.Lib;

    var state = {
        view: 'grid',            // grid / table / dashboard
        projects: [],            // 当前列表缓存
        currentProject: null,    // 当前打开的项目 name
        filter: {
            q: '',
            lang: '',
            status: '',
            cat: '',
            year: '',
            excludeArchived: true,
        },
        sort: { field: 'last_active', dir: -1 },
        selection: {},           // {name: true}
        online: true,            // 后端是否可达
        serverInfo: null,        // /api/settings 返回的根目录/端口
        savedViewId: null,       // 当前套用的保存视图
    };

    var listeners = {};

    function on(evt, fn) {
        (listeners[evt] = listeners[evt] || []).push(fn);
    }

    function emit(evt, payload) {
        (listeners[evt] || []).forEach(function (fn) {
            try { fn(payload); } catch (e) { console.error(e); }
        });
    }

    /* 应用筛选（前端过滤 + 后端兜底） */
    function matchesFilter(p, f) {
        if (f.excludeArchived && p.status === '已归档') return false;
        if (f.lang && p.language !== f.lang) return false;
        if (f.status && p.status !== f.status) return false;
        if (f.cat && p.category !== f.cat) return false;
        if (f.year && Lib.yearOf(p.last_active) !== f.year) return false;
        if (f.q) {
            var q = f.q.toLowerCase();
            var hay = [
                p.name, p.description, p.intent,
                (p.tags || []).join(' '), p.category,
            ].join(' ').toLowerCase();
            if (hay.indexOf(q) === -1) return false;
        }
        return true;
    }

    function filteredProjects() {
        var list = state.projects.filter(function (p) {
            return matchesFilter(p, state.filter);
        });
        var field = state.sort.field;
        var dir = state.sort.dir;
        list.sort(function (a, b) {
            var av = a[field]; var bv = b[field];
            if (field === 'last_active' || field === 'created') {
                av = av ? new Date(av).getTime() : 0;
                bv = bv ? new Date(bv).getTime() : 0;
            } else {
                av = av || ''; bv = bv || '';
            }
            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;
            return 0;
        });
        return list;
    }

    function setFilter(patch) {
        Object.assign(state.filter, patch);
        state.savedViewId = null;
        emit('filter:change', state.filter);
    }

    function toggleSort(field) {
        if (state.sort.field === field) {
            state.sort.dir *= -1;
        } else {
            state.sort.field = field;
            state.sort.dir = field === 'name' ? 1 : -1;
        }
        emit('filter:change', state.filter);
    }

    function toggleSelect(name, additive) {
        if (additive) {
            state.selection[name] = !state.selection[name];
            if (!state.selection[name]) delete state.selection[name];
        } else {
            state.selection = {};
            state.selection[name] = true;
        }
        emit('selection:change', state.selection);
    }

    function clearSelection() {
        state.selection = {};
        emit('selection:change', state.selection);
    }

    function selectedNames() {
        return Object.keys(state.selection);
    }

    window.Store = {
        state: state,
        on: on,
        emit: emit,
        filteredProjects: filteredProjects,
        setFilter: setFilter,
        toggleSort: toggleSort,
        toggleSelect: toggleSelect,
        clearSelection: clearSelection,
        selectedNames: selectedNames,
    };
})();
