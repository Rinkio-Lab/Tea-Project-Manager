/* =========================================================
   ui/settings-panel.js — 设置抽屉（右侧滑出）
   主题三态 / 6 皮肤 / 高对比 / 字号 / 跟随语言皮肤 / 导出导入 JSON
   ========================================================= */
(function () {
    'use strict';

    var Lib = window.Lib;
    var Theme = window.Theme;
    var Store = window.Store;

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

    function renderBody() {
        var body = document.getElementById('drawerBody');
        var cur = s();

        var skinGrid = Theme.SKINS.map(function (skin) {
            return '<button class="color-option' +
                (cur.colorTheme === skin.id ? ' active' : '') +
                ' data-skin="' + skin.id + '">' +
                '<span class="swatch" style="background:' + skin.swatch + '"></span>' +
                '<span>' + skin.label + '</span></button>';
        }).join('');

        body.innerHTML =
            '<div class="settings-section">' +
              '<h3>外观</h3>' +
              '<div class="setting-row"><span class="setting-label">主题</span>' +
                '<select id="setTheme">' +
                  '<option value="light"' + sel(cur.theme, 'light') + '>亮色</option>' +
                  '<option value="dark"' + sel(cur.theme, 'dark') + '>暗色</option>' +
                  '<option value="system"' + sel(cur.theme, 'system') + '>跟随系统</option>' +
                '</select></div>' +
              '<div class="settings-desc">皮肤任选，高对比会自动跟随亮/暗。</div>' +
              '<div class="color-grid">' + skinGrid + '</div>' +
              '<div class="setting-row"><span class="setting-label">字号</span>' +
                '<input type="range" id="setSize" min="12" max="18" step="1" value="' +
                cur.uiSize + '">' +
                '<span class="setting-value">' + cur.uiSize + 'px</span></div>' +
            '</div>' +

            '<div class="settings-section">' +
              '<h3>卡片强调色</h3>' +
              '<div class="setting-row"><span class="setting-label">跟随项目语言</span>' +
                '<input type="checkbox" id="setFollowLang"' +
                (cur.followLanguage ? ' checked' : '') + '></div>' +
              '<div class="settings-desc">开了之后，每张卡片按它的语言上色：Python 蓝、Go 青、前端琥珀。</div>' +
            '</div>' +

            '<div class="settings-section">' +
              '<h3>动效</h3>' +
              '<div class="setting-row"><span class="setting-label">开启动画</span>' +
                '<input type="checkbox" id="setAnim"' + (cur.animations ? ' checked' : '') + '></div>' +
              '<div class="setting-row"><span class="setting-label">速度</span>' +
                '<select id="setSpeed">' +
                  '<option value="slow"' + sel(cur.animationSpeed, 'slow') + '>慢</option>' +
                  '<option value="normal"' + sel(cur.animationSpeed, 'normal') + '>正常</option>' +
                  '<option value="fast"' + sel(cur.animationSpeed, 'fast') + '>快</option>' +
                '</select></div>' +
            '</div>' +

            '<div class="settings-section">' +
              '<h3>主题备份</h3>' +
              '<div class="row" style="display:flex;gap:8px;flex-wrap:wrap">' +
                '<button class="btn-secondary small" id="exportTheme">导出主题 JSON</button>' +
                '<button class="btn-secondary small" id="importTheme">导入主题</button>' +
                '<input type="file" id="importFile" accept="application/json" class="hidden">' +
              '</div>' +
            '</div>' +

            '<div class="settings-section">' +
              '<h3>项目服务</h3>' +
              '<div class="setting-row"><span class="setting-label">根目录</span>' +
                '<span class="setting-value">' +
                Lib.esc((Store.state.serverInfo || {}).projects_root || '—') + '</span></div>' +
              '<div class="setting-row"><span class="setting-label">端口</span>' +
                '<span class="setting-value">' +
                Lib.esc(String((Store.state.serverInfo || {}).port || '—')) + '</span></div>' +
            '</div>';

        // 绑定
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
    }

    function sel(cur, v) { return cur === v ? ' selected' : ''; }

    function persist() { window.App.saveSettings(); }

    window.SettingsPanel = { open: open, close: close };
})();
