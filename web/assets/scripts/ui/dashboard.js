/* =========================================================
   ui/dashboard.js — 仪表盘
   顶部统计卡 + 语言环形图 / 状态条形图 / 活跃时间线
   echarts 本地 vendor 引入；加载失败显示降级提示
   点击图表区块 → 跳对应筛选视图
   ========================================================= */
(function () {
    'use strict';

    var Lib = window.Lib;
    var Api = window.Api;
    var Store = window.Store;

    var charts = []; // 实例，切视图时 dispose

    async function render() {
        charts.forEach(function (c) { c.dispose(); });
        charts = [];

        var host = document.getElementById('viewContent');
        if (!Store.state.online) {
            host.innerHTML =
                '<div class="empty-state"><div class="empty-title">仪表盘没数据</div>' +
                '本地服务连上后，这里会显示项目统计。</div>';
            return;
        }

        var list = Store.state.projects;
        // 顶部统计
        var langSet = {};
        var statusCount = {};
        var totalSize = 0;
        list.forEach(function (p) {
            if (p.status === '已归档') return;
            if (p.language) langSet[p.language] = 1;
            statusCount[p.status] = (statusCount[p.status] || 0) + 1;
            totalSize += Number(p.total_size_mb) || 0;
        });

        host.innerHTML =
            '<div class="page-head"><h1>仪表盘</h1>' +
            '<span class="sub">一眼看完手上这些项目</span>' +
            '<button class="btn-secondary small" id="snapshotBtn">' + Lib.icon('download') + ' 存快照</button>' +
            '</div>' +
            '<div class="stat-cards">' +
              statCard(list.length, '项目总数') +
              statCard(Object.keys(langSet).length, '语言数') +
              statCard(statusCount['进行中'] || 0, '在弄的') +
              statCard(list.filter(function (p) { return p.resource_type === 'resource'; }).length, '资源型') +
              statCard(Lib.fmtSize(totalSize), '总占用') +
            '</div>' +
            '<div class="charts-grid">' +
              chartBox('语言分布', 'chartLang') +
              chartBox('状态分布', 'chartStatus') +
              chartBox('活跃时间线（按最后活跃月份）', 'chartTimeline', true) +
            '</div>';

        document.getElementById('snapshotBtn').addEventListener('click', downloadSnapshot);
        drawLangChart(list);
        drawStatusChart(statusCount);
        drawTimeline(list);
    }

    function statCard(num, label) {
        return '<div class="stat-card"><div class="stat-num">' + Lib.esc(String(num)) +
            '</div><div class="stat-label">' + Lib.esc(label) + '</div></div>';
    }

    function chartBox(title, id, wide) {
        return '<div class="chart-box' + (wide ? ' wide' : '') + '">' +
            '<div class="chart-head">' + Lib.esc(title) + '</div>' +
            '<div class="chart-body" id="' + id + '"></div></div>';
    }

    function chartTheme() {
        var cs = getComputedStyle(document.getElementById('app'));
        return {
            text: cs.getPropertyValue('--text-secondary').trim(),
            border: cs.getPropertyValue('--border-color').trim(),
            accent: cs.getPropertyValue('--accent').trim(),
            card: cs.getPropertyValue('--bg-card').trim(),
        };
    }

    function fallback(el, msg) {
        el.innerHTML = '<div class="chart-fallback">' + Lib.esc(msg) + '</div>';
    }

    function ensureChart(el) {
        if (typeof window.echarts === 'undefined') {
            fallback(el, '图表组件没加载出来（echarts 本地文件缺失）。不影响其它页面。');
            return null;
        }
        try {
            var c = window.echarts.init(el);
            charts.push(c);
            return c;
        } catch (_) {
            fallback(el, '图表渲染失败');
            return null;
        }
    }

    function drawLangChart(list) {
        var el = document.getElementById('chartLang');
        var c = ensureChart(el);
        if (!c) return;
        var t = chartTheme();
        var data = {};
        list.forEach(function (p) {
            if (p.status === '已归档') return;
            var l = p.language || '未知';
            data[l] = (data[l] || 0) + 1;
        });
        var pieData = Object.keys(data).map(function (k) {
            return { name: k, value: data[k] };
        });
        c.setOption({
            tooltip: { trigger: 'item' },
            legend: { bottom: 0, textStyle: { color: t.text, fontSize: 11 } },
            series: [{
                type: 'pie',
                radius: ['40%', '68%'],
                top: 10,
                label: { color: t.text },
                data: pieData,
            }],
        });
        c.off('click');
        c.on('click', function (params) {
            Store.setFilter({ lang: params.name });
            window.App.go('grid');
        });
    }

    function drawStatusChart(statusCount) {
        var el = document.getElementById('chartStatus');
        var c = ensureChart(el);
        if (!c) return;
        var t = chartTheme();
        var order = ['草稿', '进行中', '已完成', '无法判断'];
        var names = order.map(function (s) { return Lib.statusWord(s).word; });
        var vals = order.map(function (s) { return statusCount[s] || 0; });
        c.setOption({
            tooltip: { trigger: 'axis' },
            grid: { left: 40, right: 16, top: 20, bottom: 28 },
            xAxis: {
                type: 'category', data: names,
                axisLabel: { color: t.text }, axisLine: { lineStyle: { color: t.border } },
            },
            yAxis: {
                type: 'value', minInterval: 1,
                axisLabel: { color: t.text }, splitLine: { lineStyle: { color: t.border } },
            },
            series: [{
                type: 'bar', data: vals,
                itemStyle: { color: t.accent },
                barWidth: 28,
            }],
        });
        c.off('click');
        c.on('click', function (params) {
            var apiStatus = order[params.dataIndex];
            Store.setFilter({ status: apiStatus });
            window.App.go('grid');
        });
    }

    function drawTimeline(list) {
        var el = document.getElementById('chartTimeline');
        var c = ensureChart(el);
        if (!c) return;
        var t = chartTheme();
        // 聚合到月
        var points = [];
        list.forEach(function (p) {
            if (!p.last_active) return;
            var d = new Date(p.last_active);
            if (isNaN(d.getTime())) return;
            points.push([
                d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
                p.name,
            ]);
        });
        var monthSet = {};
        points.forEach(function (pt) { monthSet[pt[0]] = 1; });
        var months = Object.keys(monthSet).sort();
        c.setOption({
            tooltip: {
                trigger: 'item',
                formatter: function (p) { return p.data[1] + '<br>' + p.data[0]; },
            },
            grid: { left: 40, right: 20, top: 20, bottom: 40 },
            xAxis: {
                type: 'category', data: months,
                axisLabel: { color: t.text, fontSize: 10 },
                axisLine: { lineStyle: { color: t.border } },
            },
            yAxis: {
                type: 'value', minInterval: 1,
                axisLabel: { color: t.text }, splitLine: { lineStyle: { color: t.border } },
            },
            series: [{
                type: 'scatter',
                symbolSize: 14,
                data: points.map(function (pt) {
                    return [months.indexOf(pt[0]), 1, pt[1]];
                }),
                itemStyle: { color: t.accent, opacity: 0.75 },
            }],
        });
        c.off('click');
        c.on('click', function (params) {
            var month = months[params.data[0]];
            Store.setFilter({ month: month });
            window.App.go('grid');
        });
    }

    /* 快照导出（变更 15）：把当前三张图导成 PNG，拼成自包含 HTML 下载 */
    function downloadSnapshot() {
        try {
            var date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            var imgs = charts.map(function (c, i) {
                return '<h3>图 ' + (i + 1) + '</h3><img src="' +
                    c.getDataURL({ type: 'png', backgroundColor: '#f5f2ed' }) + '">';
            }).join('');
            var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tea PM 快照 ' + date +
                '</title><style>body{font-family:sans-serif;background:#f5f2ed;color:#3a3733;padding:24px}' +
                'img{max-width:600px;border:1px solid #ccc}</style></head><body>' +
                '<h1>Tea PM 项目快照 ' + date + '</h1>' + imgs + '</body></html>';
            var blob = new Blob([html], { type: 'text/html' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'dashboard-snapshot-' + date + '.html';
            a.click();
            URL.revokeObjectURL(a.href);
            Lib.toast('快照已下载', 'success');
        } catch (e) {
            Lib.toast('快照导出失败：' + e.message, 'error');
        }
    }

    window.Dashboard = { render: render };
})();
