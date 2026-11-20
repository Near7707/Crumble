// Crumble — 캐릭터 카드 직원들과 꾸리는 디저트 가게 (SillyTavern 확장)
import { ctx } from './src/util.js';
import { S } from './src/state.js';
import { L } from './src/i18n.js';
import { openWindow, closeWindow } from './src/ui.js';
import { fieldsHtml, bindFields, onSettings, refreshProfileSelects } from './src/settings.js';

function settingsHtml() {
    return `<div class="crumble-settings"><div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header"><b>Crumble</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
<div class="inline-drawer-content">
<button class="menu_button crumble-openbtn" id="crumble_open_btn"><i class="fa-solid fa-cookie-bite"></i> ${L('가게 열기', 'Open shop')}</button>
${fieldsHtml('panel')}
</div></div></div>`;
}

function redrawSettings() {
    const host = document.querySelector('#crumble_settings_host');
    if (!host) return;
    // 접힘·펼침 상태는 그대로 유지
    const wasOpen = host.querySelector('.inline-drawer-content')?.style.display === 'block';
    host.innerHTML = settingsHtml();
    if (wasOpen) {
        host.querySelector('.inline-drawer-content').style.display = 'block';
        host.querySelector('.inline-drawer-icon')?.classList.replace('down', 'up');
        host.querySelector('.inline-drawer-icon')?.classList.replace('fa-circle-chevron-down', 'fa-circle-chevron-up');
    }
    host.querySelector('#crumble_open_btn')?.addEventListener('click', () => openWindow());
    bindFields(host, 'panel');
}

// 게임 창 안에서 바꾸면 여기 설정 칸도 다시 그리고, 여기서 언어를 바꾸면 이 칸 글씨도 바꿈
onSettings((key, scope) => { if (scope !== 'panel' || key === 'lang') redrawSettings(); });

function addMenuButton() {
    const menu = document.querySelector('#extensionsMenu');
    if (!menu || document.querySelector('#crumble_menu_item')) return;
    const item = document.createElement('div');
    item.id = 'crumble_menu_item';
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.tabIndex = 0;
    item.innerHTML = '<div class="fa-solid fa-cookie-bite extensionsMenuExtensionButton"></div><span>Crumble</span>';
    item.addEventListener('click', () => openWindow());
    menu.appendChild(item);
}

// 설정 칸 자리는 파일을 불러오자마자 왼쪽 칸에 잡아 둠 (manifest.json의 loading_order 순서대로 놓이게)
function mountSettingsHost() {
    if (document.querySelector('#crumble_settings_host')) return;
    const host = document.createElement('div');
    host.id = 'crumble_settings_host';
    (document.querySelector('#extensions_settings') || document.querySelector('#extensions_settings2'))?.appendChild(host);
}
mountSettingsHost();

async function init() {
    S(); // 기본 설정 채우기
    mountSettingsHost();
    redrawSettings();
    addMenuButton();
    // 연결 프로필이 늦게 불러와지거나 바뀌면 목록 다시 채우기
    const c = ctx();
    for (const name of ['CONNECTION_PROFILE_LOADED', 'CONNECTION_PROFILE_CREATED', 'CONNECTION_PROFILE_UPDATED', 'CONNECTION_PROFILE_DELETED', 'SETTINGS_LOADED']) {
        const ev = c?.event_types?.[name];
        if (ev) c.eventSource.on(ev, refreshProfileSelects);
    }
    // 확장 메뉴가 늦게 그려지는 경우
    setTimeout(addMenuButton, 1500);
}

// 다른 곳에서 열 수 있게
window.Crumble = { open: openWindow, close: closeWindow };

if (typeof jQuery === 'function') jQuery(() => init());
else document.addEventListener('DOMContentLoaded', init);

