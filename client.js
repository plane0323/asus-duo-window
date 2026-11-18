/**
 * dsh-dualscreen — Client half.
 *
 * Pure re-layout of the shipped Web GUI. No new panels, boards or consoles: the
 * existing conversation and the existing composer are re-partitioned.
 *
 *   form 1  default    — no override at all (no data-ds-mode → no rule applies)
 *   form 2  secondary  — 3840×1100: output on the left, the shipped composer
 *                        moved to a full-height input column on the right
 *   form 3  dual       — two same-origin windows: `prompt` keeps only the
 *                        composer, `flow` keeps only the conversation
 *   form 4  span       — 2560×2334: conversation on top, the bottom 734px is
 *                        entirely the composer
 *
 * Every rule anchors on the shell's documented data-* seams and CSS custom
 * properties; no build-hashed class name and no shell DOM node is moved.
 */
window.__ModuleLoader__.load({
  id: 'dsh-dualscreen',
  factory(require) {
    const React = require('react');
    const { useCallback, useEffect, useRef, useState } = React;
    const h = React.createElement;

    const NS = 'dsh-dualscreen';
    const PREF_KEY = 'dsh.dualscreen.prefs.v1';
    const ROLE_KEY = 'dsh.dualscreen.role';
    const STYLE_ID = NS + '/layout.css';
    // The stacked form reserves the physical height of the secondary screen's
    // strip for the composer. It is a PHYSICAL pixel count: the plugin converts it
    // with window.devicePixelRatio, because a 150% window reports 734 physical
    // pixels as 489.33 CSS pixels. Using 734 as a CSS length made the band 1.5x
    // too tall on the 150% main display.
    const SPAN_COMPOSER = 734;

    // ---------------------------------------------------------------- locale

    const ZH = {
      'title': '窗口布局',
      'subtitle': '重新排布现有区域，不新增面板',
      'openPanel': '窗口布局',
      'control': '布局',
      'close': '关闭',
      'reset': '恢复默认',
      'detected': '当前窗口',
      'ratio': '宽高比',
      'autoPick': '自动判定',
      'exit': '退出',
      'split': '拖动调整对话 / 输入框宽度',
      'auto': '自动适配',
      'autoHint': '按窗口尺寸自动选形态',
      'titleBtn': '双屏',
      'titleBtnOn': '关闭双屏协同',
      'titleBtnOff': '开启双屏协同：主屏看过程，副屏只输入',
      'dualWindow': '双屏协同',
      'dualWindowOpen': '打开副屏输入窗',
      'dualWindowClose': '关闭副屏输入窗',
      'dualWindowHint': '主窗只看对话，副屏只留侧栏和输入框；关掉副屏即结束',
      'screens': '屏幕',
      'screen': '屏幕',
      'screensHint': '点「双屏」时两个窗口自动最大化到选中的屏幕',
      'mainScreen': '主窗屏幕',
      'promptScreen': '输入窗屏幕',
      'screenAuto': '自动（主屏 / 另一块屏）',
      'screenLoading': '正在读取屏幕…',
      'screenUnavailable': '读不到屏幕列表（只在桌面窗口里可用）',
      'screenPrimary': '主屏',
      'peakTitle': '峰时段发送',
      'peakPrefix': '现在是',
      'peakWord': '峰',
      'peakSuffix': '时段，距离下一个谷时段还有 ',
      'peakCancel': '取消',
      'peakSend': '发送',
      'dualWindowOpened': '已打开副屏输入窗',
      'dualWindowFailed': '副屏输入窗打开失败',
      'm1': '① 默认形态',
      'm1Hint': '原生布局，不做任何改动',
      'm2': '② 右输左出',
      'm2Hint': '3840×1100：左侧对话，右侧整列输入框',
      'm3': '协同模式',
      'm4': '③ 上下分栏',
      'm4Hint': '2560×2334：上半全部对话，下面 734 全部输入框',
      'roleFlow': '流程模式',
      'rolePrompt': '输入模式',
    };
    const EN = {
      'title': 'Window layout',
      'subtitle': 'Re-layout of the existing regions, no new panels',
      'openPanel': 'Window layout',
      'control': 'Layout',
      'close': 'Close',
      'reset': 'Reset',
      'detected': 'Window',
      'ratio': 'Ratio',
      'autoPick': 'Detected form',
      'exit': 'Exit',
      'split': 'Drag to resize conversation / input',
      'auto': 'Adaptive',
      'autoHint': 'Pick a form from the window size',
      'titleBtn': 'Dual',
      'titleBtnOn': 'Turn the dual-screen pair off',
      'titleBtnOff': 'Turn the dual-screen pair on: the main window watches, the other one types',
      'dualWindow': 'Dual screen',
      'dualWindowOpen': 'Open the input window',
      'dualWindowClose': 'Close the input window',
      'dualWindowHint': 'The main window keeps the conversation; the other screen keeps the sidebar and the composer',
      'screens': 'Screens',
      'screen': 'Screen',
      'screensHint': 'The pair opens maximized on these screens',
      'mainScreen': 'Main window screen',
      'promptScreen': 'Input window screen',
      'screenAuto': 'Auto (primary / the other screen)',
      'screenLoading': 'Reading screens…',
      'screenUnavailable': 'No screen list in this window',
      'screenPrimary': 'primary',
      'peakTitle': 'Peak-hour send',
      'peakPrefix': 'It is now ',
      'peakWord': 'peak',
      'peakSuffix': ' hours — the next off-peak window starts in ',
      'peakCancel': 'Cancel',
      'peakSend': 'Send',
      'dualWindowOpened': 'Input window opened',
      'dualWindowFailed': 'Could not open the input window',
      'm1': '① Default',
      'm1Hint': 'Shipped layout, untouched',
      'm2': '② Output left, input right',
      'm2Hint': '3840×1100: conversation left, composer as a right column',
      'm3': 'Collaboration',
      'm4': '③ Stacked',
      'm4Hint': '2560×2334: conversation on top, 734px composer below',
      'roleFlow': 'Flow view',
      'rolePrompt': 'Input view',
    };

    // ------------------------------------------------------------------- css

    const CSS = `
/* ============================ dsh-dualscreen ============================ */
/* Plugin-owned tokens. Inert on their own; only the rules below consume them. */
:root {
  --dsd-ease: var(--ds-ease-in-out, cubic-bezier(.4, 0, .2, 1));
  --dsd-dur: var(--ds-transition-duration-slow, .3s);
  --dsd-hair: var(--dsh-hairline-width, 1px);
  --dsd-rule: color-mix(in srgb, currentColor 14%, transparent);
  --dsd-rule-soft: color-mix(in srgb, currentColor 9%, transparent);
  --dsd-hover: color-mix(in srgb, currentColor 7%, transparent);
  --dsd-panel-w: clamp(420px, 26vw, 920px);
  /* --dsd-panel-eff is written by the plugin's geometry effect: it accounts for
     the sidebar, the shipped right sidebar and the user's drag ratio. */
}

/* ---- slightly larger text; only inside an adaptive form ---- */
html[data-ds-mode] body {
  --dsh-content-font-size: var(--dsd-content-font, 15px) !important;
  --dsh-code-font-size: var(--dsd-code-font, 12px) !important;
}

/* Reclaim the reserved caption band for the secondary form's transcript column.
   The 应用/编辑 menubar (page DOM injected by the desktop preload) and the native
   window controls stay exactly where they are: they sit over the sidebar and over
   the input column, both of which keep their band.
   The offset has to go on the COLUMN, not on [data-conversation-content]: the
   column clips its content (overflow: hidden), so a negative margin further down
   is simply cut away. The stacked form (span) deliberately keeps the shipped
   conversation header, so it must NOT be lifted into the band. */
html[data-ds-mode="secondary"]:not([data-dsd-hero="1"]) [data-slot="root"] > * > div:has(> div > [data-slot="main"]) {
  margin-top: calc(-1 * var(--dsd-band, 0px));
}

/* The caption menubar buttons (应用 / 编辑) are page DOM with a transparent
   background, so with the transcript running to y=0 text would show through
   them — give the whole host an opaque plate of its own. */
/* Applies in EVERY form, including the default one: the menubar host must never
   carry a decorative plate or border of its own. The rail-scoped rule below is
   the only thing allowed to paint one. */
[data-windows-menu] {
  background: transparent;
  padding: 0;
  border: 0;
  box-shadow: none;
}

/* ---- form switching ---- */
html[data-ds-mode][data-dsd-animate="on"]::view-transition-old(root) {
  animation: dsd-vt-out .2s var(--dsd-ease) both;
}
html[data-ds-mode][data-dsd-animate="on"]::view-transition-new(root) {
  animation: dsd-vt-in .3s var(--dsd-ease) both;
}
@keyframes dsd-vt-out { from { opacity: 1 } to { opacity: 0 } }
@keyframes dsd-vt-in { from { opacity: 0; transform: scale(1.004) } to { opacity: 1; transform: none } }

/* ---- messages enter instead of popping ---- */
html[data-ds-mode][data-dsd-animate="on"] [data-chat-flow]:not([data-step-process-content]) > * {
  transition: opacity .24s var(--dsd-ease), transform .24s var(--dsd-ease);
}
@starting-style {
  html[data-ds-mode][data-dsd-animate="on"] [data-chat-flow]:not([data-step-process-content]) > * {
    opacity: 0;
    transform: translateY(5px);
  }
}

/* the layout owns the column width in every adaptive form */
html[data-ds-mode] [data-width-handle] { display: none; }

/* ========== form ② — output left, input right (structural) ============= */
/* ONE scroll owner: the shipped [data-conversation-scroll] keeps the scroll.
   ChatView resolves its scrollport through list.closest('[data-conversation-scroll]')
   and so does the turn rail, so taking the scroll away from this element (by
   giving the inner .scroll its own scrollport) silently disables jump-to-turn,
   active-turn tracking and follow-tail. The layout therefore changes only
   *inside* that scrollport: two grid columns, the transcript in column 1, and
   the shipped composer seat pinned in column 2 with position: sticky. */
html[data-ds-mode="secondary"]:not([data-dsd-hero="1"]) [data-conversation-scroll] {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--dsd-panel-eff, var(--dsd-panel-w));
  /* The single row must be at least one viewport tall: it is the sticky seat's
     containing block, and a short transcript would otherwise leave the seat no
     room to slide down past the caption band and the docked header. */
  grid-template-rows: minmax(var(--dsd-band-h, 100dvh), auto);
  align-items: start;
  align-content: start;
  margin-right: 0;
  /* The seat sits beside the flow instead of over it, so the transcript is not
     covered: the rail's band is the whole scrollport. The shell writes both
     values inline here, hence !important. */
  --dsh-composer-height: 0px !important;
  --dsh-conversation-viewport-height: var(--dsd-band-h, 100dvh) !important;
}
/* column 1: the transcript keeps the shipped host-scroll posture (tall frame,
   visible overflow). This wrapper must NOT clip: an overflow clip here becomes
   the turn rail slot's sticky container and drags the rail off-screen with the
   content instead of pinning it to the scrollport. */
html[data-ds-mode="secondary"]:not([data-dsd-hero="1"]) [data-conversation-scroll] > [data-slot="conversation.session"] > * {
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
  max-width: 100%;
  overflow: visible;
}
html[data-ds-mode="secondary"]:not([data-dsd-hero="1"]) [data-conversation-scroll] [data-slot="conversation.view"] > *,
html[data-ds-mode="secondary"]:not([data-dsd-hero="1"]) [data-conversation-scroll] [data-slot="conversation.view"] > * > *,
html[data-ds-mode="secondary"]:not([data-dsd-hero="1"]) [data-conversation-scroll] [data-slot="conversation.view"] > * > * > *,
html[data-ds-mode="secondary"]:not([data-dsd-hero="1"]) [data-conversation-scroll] [data-chat-flow] {
  min-width: 0;
  max-width: 100%;
}
/* column 2: the shipped composer seat, pinned beside the transcript while the
   transcript scrolls under the body's own scrollbar */
html[data-ds-mode="secondary"]:not([data-dsd-hero="1"]) [data-conversation-scroll] > [data-composer-seat] {
  grid-column: 2;
  grid-row: 1;
  /* NOTE the order: the inset reset must come BEFORE top, or it wipes the
     sticky offset out and the panel scrolls away with the transcript. */
  position: sticky !important;
  inset: auto;
  top: calc(var(--dsd-band, 0px) + var(--dsd-header-h, 76px));
  align-self: start;
  width: auto;
  height: max(0px, calc(var(--dsd-band-h, 100dvh) - var(--dsd-band, 0px) - var(--dsd-header-h, 76px)));
  margin: 0 !important;
  padding: 14px;
  box-sizing: border-box;
  z-index: 1;
  display: flex;
  flex-direction: column;
  border-left: var(--dsd-hair) solid var(--dsd-rule-soft);
  background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base, transparent));
  --dsh-composer-side-clearance: 0px;
  --dsh-composer-stack-gap: 8px;
  --dsh-composer-text-max-height: none;
}
/* The shipped turn rail hides itself below a 900px transcript container (a
   deliberate "no rail on a narrow transcript" breakpoint). In this two-column
   form the transcript can be narrower than that, so drop the nearest size
   container from the query chain: the rail slot is the frame's first child. */
html[data-ds-mode="secondary"]:not([data-dsd-hero="1"]) [data-conversation-scroll] [data-slot="conversation.view"] > * > div:first-child:has(> nav) {
  container-type: normal;
  container-name: none;
}

/* the divider runs above the panel, through the header and the caption band */
html[data-ds-mode="secondary"]:not([data-dsd-hero="1"]) [data-composer-seat]::before {
  content: '';
  position: absolute;
  left: -1px;
  top: calc(-1 * (var(--dsd-band, 0px) + var(--dsd-header-h, 76px)));
  bottom: 0;
  width: var(--dsd-hair);
  background: var(--dsd-rule-soft);
  pointer-events: none;
}
/* the header docks above the input column; the body's scrollbar gutter sits to
   its right, so the offset keeps the header's left edge on the divider */
html[data-ds-mode="secondary"]:not([data-dsd-hero="1"]) [data-slot="conversation.header"] > header {
  position: fixed;
  top: var(--dsd-band, 0px);
  right: calc(var(--dsd-rightbar-w, 0px) + var(--dsd-gutter, 0px));
  left: auto;
  width: var(--dsd-panel-eff, var(--dsd-panel-w));
  height: auto;
  min-height: 0;
  z-index: 10;
  box-sizing: border-box;
  border-bottom: var(--dsd-hair) solid var(--dsd-rule-soft);
  border-left: var(--dsd-hair) solid var(--dsd-rule-soft);
  background: var(--dsw-alias-bg-base, transparent);
  padding-bottom: 12px;
}
html[data-ds-mode="secondary"]:not([data-dsd-hero="1"]) [data-conversation-content] {
  position: relative;
  --dsh-chat-content-width: max(420px, min(calc(100% - 64px), 2100px));
  --dsh-composer-card-max-width: 100%;
}
/* a blank session keeps its hero posture instead of a pinned full-height card */
html[data-ds-mode="secondary"]:not([data-dsd-hero="1"]) [data-conversation-content][data-content-phase="hero"] [data-composer-seat] {
  height: auto;
  --dsh-composer-text-max-height: 336px;
}
html[data-ds-mode="secondary"]:not([data-dsd-hero="1"]) [data-composer-seat] div:has([data-composer-card]) {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
}
html[data-ds-mode="secondary"]:not([data-dsd-hero="1"]) [data-composer-card] {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
}
html[data-ds-mode="secondary"]:not([data-dsd-hero="1"]) [data-composer-card] > div:has([contenteditable]) {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
  display: flex;
  flex-direction: column;
}
html[data-ds-mode="secondary"]:not([data-dsd-hero="1"]) [data-composer-card] > div:has([contenteditable]) > div {
  flex: 1 1 auto;
  min-height: 0;
}
html[data-ds-mode="secondary"]:not([data-dsd-hero="1"]) [data-composer-card] [contenteditable] { min-height: 100%; }

/* ========== the pair — the context side keeps the conversation ========== */
/* One real DSH window per side. The context side drops the left sidebar and
   the composer; the conversation takes the freed width and the shipped right
   sidebar keeps its own track. Nothing is cloned, nothing is redrawn. */
html[data-ds-mode="flow"] [data-composer-seat] { display: none !important; }
html[data-ds-mode="flow"] [data-conversation-content] {
  --dsh-chat-content-width: max(420px, min(calc(100% - 96px), 1400px));
}
/* The shell writes the three tracks as an inline pixel template, so the whole
   template has to be restated to collapse the sidebar. The third track mirrors
   the shipped right-sidebar width, read back from that inline template by
   measure(); a closed panel is 0px and keeps the conversation edge to edge. */
html[data-ds-mode="flow"] [data-slot="root"] > * {
  grid-template-columns: var(--dsd-flow-tracks, 0 minmax(0px, 1fr) minmax(0px, 0px)) !important;
}
html[data-ds-mode="flow"] [data-slot="root"] > * > :first-child { display: none !important; }
/* Position alone is not a contract: hide the column by the slot it holds too, so
   an expanded sidebar can never keep painting over the transcript. */
html[data-ds-mode="flow"] [data-slot="root"] > * > :has([data-slot="sidebar"]) { display: none !important; }
/* The centre column rounds its top-left corner against the sidebar seam. With
   the sidebar gone that round corner is a stray notch over the frame. */
html[data-ds-mode="flow"] [data-slot="root"] > * > :nth-child(2) {
  border-top-left-radius: 0 !important;
  border-bottom-left-radius: 0 !important;
}
/* the sidebar resize handle would leave an invisible 8px strip over the transcript */
html[data-ds-mode="flow"] [data-slot="root"] > * > [data-side="sidebar"] { display: none !important; }
html[data-ds-mode="flow"] [data-width-handle] { display: none !important; }

/* ========== the pair — the input side keeps sidebar and composer ======== */
/* The conversation header would make this window a second, half-empty reader;
   this side only types. The tabs, the title row and the transcript go, and the
   composer seat that lives in the same scroller is the only survivor. */
html[data-ds-mode="prompt"] [data-slot="conversation.header"] { display: none !important; }
html[data-ds-mode="prompt"] [data-conversation-tabs] { display: none !important; }
html[data-ds-mode="prompt"] [data-conversation-scroll] > *:not([data-composer-seat]):not(:has([data-composer-seat])) {
  display: none !important;
}
html[data-ds-mode="prompt"] [data-conversation-scroll] { overflow: hidden; }
/* The right panel belongs to the context side; this side never widens for it,
   and its own sidebar track still follows the shipped (resizable) width. */
html[data-ds-mode="prompt"] [data-slot="root"] > * {
  grid-template-columns: var(--dsd-sidebar-w, 280px) minmax(0, 1fr) 0 !important;
}
html[data-ds-mode="prompt"] [data-rightbar-col] { display: none !important; }
/* A blank session paints the hero headline and its workspace row above the
   composer; both are siblings of the input bar inside the seat, and the bar is
   the only one holding an editor, so keep exactly that one. */
html[data-ds-mode="prompt"] [data-conversation-content][data-content-phase="hero"] [data-composer-seat] > * > *:not(:has([contenteditable])) {
  display: none !important;
}
/* The blank-session composer stack also carries the hero headline and its
   workspace row; together with the full-height card they pushed it off screen. */
html[data-ds-mode="prompt"] [data-conversation-content][data-content-phase="hero"] [data-composer-seat] [class*="composerStack"] > *:not(:has([contenteditable])) {
  display: none !important;
}
html[data-ds-mode="prompt"] [data-conversation-content] {
  --dsh-chat-content-width: max(420px, min(calc(100% - 160px), 1600px));
  --dsh-composer-card-max-width: max(420px, min(calc(100% - 160px), 1680px));
}
/* The prompt card now fills the pane, so the shipped menu (anchored above the
   card, clamped to the gap above it) would be a sliver. Drop it over the card's
   top edge instead: the card is a big empty typing surface, and the list keeps
   the card's width. */
html[data-ds-mode="prompt"] [data-trigger-menu] {
  /* Under the first text line, measured: an attachment row pushes that line down
     and a fixed offset would sit on top of the typed '@'. */
  top: var(--dsd-menu-top, 52px) !important;
  bottom: auto !important;
  left: 8px !important;
  right: 8px !important;
  /* The card now spans the band, so the candidate list can too: everything
     under the first editor line, down to the toolbar. */
  max-height: clamp(140px, calc(100dvh - 2 * var(--dsd-vgap, 72px) - 96px - var(--dsd-menu-shift, 0px)), 70vh) !important;
}

html[data-ds-mode="prompt"] [data-composer-seat] {
  margin-top: auto;
  margin-bottom: auto;
  background: none !important;
  --dsh-composer-text-max-height: min(46vh, 520px);
  /* This window is the typing surface: the card grows until the white space
     above and below it equals the side gutters (--dsd-composer-gap is measured). */
  height: calc(100% - 2 * var(--dsd-vgap, 72px));
  min-height: 128px;
}
html[data-ds-mode="prompt"] { --dsd-vgap: min(var(--dsd-composer-gap, 96px), 72px); }
html[data-ds-mode="prompt"] [data-composer-seat] :has(> [data-composer-card]) { flex: 1 1 auto; min-height: 0; height: 100%; }
html[data-ds-mode="prompt"] [data-composer-seat] [data-composer-card] {
  flex: 1 1 auto;
  min-height: calc(100dvh - 2 * var(--dsd-vgap, 72px) - 30px);
  /* A long draft scrolls inside the card; its borders never leave the screen. */
  max-height: calc(100dvh - 2 * var(--dsd-vgap, 72px));
  overflow: hidden;
}
html[data-ds-mode="prompt"] [data-composer-seat] [data-composer-card] > div:has([contenteditable]) {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
  overflow-y: auto;
}

/* The @ / slash candidate menu is owned by the composer card: it opens above
   the card, clamped to the space above it. In the left/right form the card is
   the whole right column and starts at the top of the window, so that menu
   collapses to a sliver. Float it over the conversation pane instead, where the
   list has the reading width it was designed for. */
/* The seat carries will-change: transform, so it — not the viewport — is the
   containing block of a fixed descendant. offsetLeft is the seat's left edge
   (--dsd-divider-x) and the seat fills the panel column, so these two insets
   put the menu edge to edge across the conversation pane, clear of the
   composer column on the right. */
html[data-ds-mode="secondary"] [data-trigger-menu] {
  position: fixed !important;
  left: calc(-1 * (var(--dsd-divider-x, 0px) - var(--dsd-sidebar-w, 280px) - 20px)) !important;
  right: calc(var(--dsd-panel-eff, 340px) + 20px) !important;
  bottom: 20px !important;
  width: auto !important;
  min-width: 240px !important;
  max-height: min(420px, calc(100dvh - 120px)) !important;
  z-index: 60 !important;
}

/* The stacked form's transcript is the upper (main) screen. The shipped menu
   is bottom-anchored 4px above the composer card, which lands a few dozen
   physical pixels inside the composer band; lift it clear so the whole list
   stays above the 1600px line. */
html[data-ds-mode="span"] [data-trigger-menu] {
  bottom: calc(100% + 32px) !important;
}

/* ========== form ③ 2560×2334 — conversation above, composer below ======= */
/* The stacked form keeps the shipped conversation header (title, view tabs and
   its controls). It used to hide it and lift the whole column into the caption
   band; that left the window without a header, so the column now starts at the
   band like any other non-secondary form. */
/* The transcript can overflow by a hair horizontally; the shipped body is a
   vertical scroller, so that hair becomes a horizontal scrollbar strip under the
   composer (and steals 4px from the scrollport, making the band look taller).
   Clip the inline axis: the stacked form never scrolls sideways. */
html[data-ds-mode="span"] [data-conversation-scroll] {
  overflow-x: clip;
}
/* The stacked window spans the main screen and the secondary strip: the right
   sidebar belongs to the main screen, so it stops at the composer band's top
   edge (1600 physical on this setup) instead of running under the input area. */
html[data-ds-mode="span"] [data-sidebar-right-panel] {
  bottom: auto !important;
  height: calc(100dvh - var(--dsd-span-composer, 734px) - var(--dsd-band, 0px)) !important;
  max-height: calc(100dvh - var(--dsd-span-composer, 734px) - var(--dsd-band, 0px)) !important;
}
/* The original-image lightbox is a body portal with a full-viewport flex
   stage. In the stacked window that centers the image over both screens; stop
   the stage at the composer band plus the 40px its top inset and padding
   already leave, so the image centers inside the upper 1600px screen instead.
   Target only the stage child (the one holding the image): the backdrop's mask
   sibling must stay full-height. */
html[data-ds-mode="span"] body > [role="dialog"][aria-modal="true"]:has(> div > img) > div:has(> img) {
  bottom: calc(var(--dsd-span-composer, 0px) + 40px) !important;
}
html[data-ds-mode="span"] [data-conversation-content] {
  --dsh-chat-content-width: max(420px, min(calc(100% - 88px), 1600px));
  --dsh-composer-card-max-width: max(420px, min(calc(100% - 88px), 1600px));
}
html[data-ds-mode="span"] [data-conversation-content][data-content-phase="active"] [data-composer-seat] {
  /* --dsd-span-composer is already in CSS px (734 physical / dpr); border-box
     keeps the hairline out of the band so it lands on exactly 734 physical px. */
  height: min(var(--dsd-span-composer, 734px), 68%);
  box-sizing: border-box;
  /* More air above the input card than below it; the pair still keeps the card
     off the divider and the status row off the window edge. */
  padding: 28px 0 14px;
  /* Opaque plate: the transcript scrolls under the sticky seat, and its text must
     not show through the bottom band (the shipped gradient starts transparent). */
  background: var(--dsw-alias-bg-base, #151517) !important;
  --dsh-composer-text-max-height: none;
  border-top: var(--dsd-hair) solid var(--dsd-rule-soft);
  transition: height var(--dsd-dur) var(--dsd-ease);
}
html[data-ds-mode="span"] [data-composer-seat] div:has([data-composer-card]) {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
}
html[data-ds-mode="span"] [data-composer-card] {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
}
html[data-ds-mode="span"] [data-composer-card] > div:has([contenteditable]) {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
  display: flex;
  flex-direction: column;
}
html[data-ds-mode="span"] [data-composer-card] > div:has([contenteditable]) > div {
  flex: 1 1 auto;
  min-height: 0;
}
html[data-ds-mode="span"] [data-composer-card] [contenteditable] { min-height: 100%; }

/* ============================== plugin chrome =========================== */
/* The only additions: one sidebar-foot button, one overlay pill and the
   layout list. All inherit the shipped theme tokens. */
.dsd-ui {
  color: var(--dsw-alias-label-primary, inherit);
  font-family: var(--dsw-font-family, inherit);
  font-size: 13px;
  line-height: 1.5;
  --dsd-muted: var(--dsw-alias-label-secondary, color-mix(in srgb, currentColor 62%, transparent));
  --dsd-accent: var(--dsw-alias-brand-primary, #4d6bfe);
}
.dsd-overlay { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
[data-shell-overlay] .dsd-overlay { pointer-events: none; }
.dsd-overlay .dsd-split,
.dsd-overlay .dsd-scrim { pointer-events: auto; }

/* The transcript now occupies the caption band, so the shell's own drag surface
   (painted under the columns) no longer receives the pointer there. This strip
   sits in the overlay above the columns and gives that strip back to the window. */
.dsd-dragstrip {
  position: fixed;
  top: 0;
  /* start right after the caption buttons + menubar plate so their clicks survive */
  left: max(var(--dsd-sidebar-w, 0px), var(--dsd-menu-end, 222px));
  /* and stay clear of the transcript scrollbar, whose thumb lives at the right edge */
  right: calc(var(--dsd-rightbar-w, 0px) + var(--dsd-panel-eff, var(--dsd-panel-w)) + 24px);
  height: var(--dsd-band, 0px);
  background: transparent;
  -webkit-app-region: drag;
  z-index: 0;
}
/* Caption corner plate: only meaningful while the sidebar is a collapsed rail,
   where its fixed toggle/new-session buttons float over the transcript. */
.dsd-cornerplate {
  display: block;
  position: fixed;
  top: 0;
  left: 0;
  width: max(calc(var(--dsd-sidebar-w, 0px) + 26px), 104px);
  height: var(--dsd-band, 0px);
  /* the same fill the caption band paints under the window controls */
  background: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-layer-1, #1b1b1c));
  border-right: var(--dsd-hair) solid var(--dsd-rule-soft);
  border-bottom: var(--dsd-hair) solid var(--dsd-rule-soft);
  border-bottom-right-radius: 10px;
  /* a pure occluder: it must never become a drag region over the buttons */
  pointer-events: none;
  z-index: 1;
}
/* Caption plate for the 双屏 button. Left/right form has a transparent band
   over the transcript, so the button needs the same plate as the corner
   buttons and the menubar; it also covers the 6px gap after the menubar. */
.dsd-titleplate {
  position: fixed;
  top: 0;
  left: calc(var(--dsd-menu-end, 222px) - 6px);
  width: calc(var(--dsd-titlebtn-w, 46px) + 6px);
  height: var(--dsd-band, 0px);
  background: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-layer-1, #1b1b1c));
  border-right: var(--dsd-hair) solid var(--dsd-rule-soft);
  border-bottom: var(--dsd-hair) solid var(--dsd-rule-soft);
  border-bottom-right-radius: 10px;
  pointer-events: none;
  z-index: 1;
}
/* Titlebar quick toggle, to the right of the desktop menubar (应用 / 编辑).
   That menubar is page DOM injected by the preload; this button is plugin
   chrome pinned into the same caption band. */
.dsd-titlebtn {
  position: fixed;
  top: 6px;
  left: var(--dsd-menu-end, 222px);
  z-index: 12;
  display: inline-flex; align-items: center; justify-content: center;
  height: 28px; padding: 0 10px;
  border: 0; border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 13px; line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  transition: background .16s var(--dsd-ease), color .16s var(--dsd-ease), transform .12s var(--dsd-ease);
}
.dsd-titlebtn:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
.dsd-titlebtn:active { transform: scale(.97); }
.dsd-titlebtn[data-on="1"] {
  color: var(--dsw-alias-brand-primary, #4d6bfe);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4d6bfe) 12%, transparent);
}
/* the menubar only exists in the desktop window; the web GUI has no 应用/编辑 */
html:not([data-dsd-menu="1"]) .dsd-titlebtn { display: none; }

/* only while the sidebar is a collapsed rail does the menubar float over the
   transcript and need an opaque plate of its own */
html[data-ds-mode][data-dsd-rail="1"] [data-windows-menu] {
  background: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-layer-1, #1b1b1c));
  padding: 0 10px 0 8px;
  border-right: var(--dsd-hair) solid var(--dsd-rule-soft);
  border-bottom: var(--dsd-hair) solid var(--dsd-rule-soft);
  border-bottom-right-radius: 10px;
}
/* The stacked form shows the conversation header right below the band, so the
   band no longer floats over scrolling content: drop the caption plates there. */
html[data-ds-mode="span"][data-dsd-rail="1"] [data-windows-menu] {
  background: transparent;
  padding: 0;
  border: 0;
  border-bottom-right-radius: 0;
}
/* The pair hides the sidebar entirely, so the menubar plate has no rail to sit
   on: its L-shaped border and rounded corner became a stray notch. */
html[data-ds-mode="flow"][data-dsd-rail="1"] [data-windows-menu] {
  background: transparent;
  padding: 0;
  border: 0;
  border-bottom-right-radius: 0;
}

/* drag handle between the transcript and the input column */
.dsd-split {
  /* The transcript's scrollbar sits exactly on the divider (the last 5px of the
     transcript column), so a strip that reaches left of the line makes that
     scrollbar undraggable. This one starts ON the line and extends into the
     composer panel: 0px of scrollbar covered, and the grab edge is the line
     itself rather than a few pixels to its right. */
  position: fixed;
  top: 0;
  bottom: 0;
  left: var(--dsd-divider-x, 50%);
  right: auto;
  width: 20px;
  z-index: 11;
  cursor: col-resize;
  touch-action: none;
  background: transparent;
}



.dsd-peak { color: #ff5c5c; }
.dsd-valley { color: #39c56f; }
.dsd-confirm-scrim {
  position: fixed; inset: 0;
  z-index: 80;
  display: flex; align-items: center; justify-content: center;
  padding: 24px; box-sizing: border-box;
  background: var(--dsw-alias-bg-mask-1, rgba(0,0,0,.32));
  backdrop-filter: blur(6px);
}
.dsd-confirm {
  width: min(420px, 100%);
  display: flex; flex-direction: column;
  border: var(--dsd-hair) solid var(--dsd-rule);
  border-radius: 18px;
  background: #2c2c2e;
  box-shadow: 0 24px 60px rgba(0,0,0,.35);
  overflow: hidden;
}
.dsd-confirm-text { font-size: 12.5px; line-height: 1.75; color: var(--dsw-alias-label-secondary, inherit); }
.dsd-peak-big { color: #ff5c5c; font-size: 15px; font-weight: 700; padding: 0 1px; }
.dsd-confirm-countdown { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--dsw-alias-label-primary, inherit); }
.dsd-btn-primary {
  background: #2f6fed;
  border-color: transparent;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  padding: 7px 18px;
}
.dsd-btn-primary:hover { background: #3b7bf5; }

/* One-shot notice for the dual-window entry (desktop shell / blocked popup). */
.dsd-toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translate(-50%, 6px);
  z-index: 40;
  max-width: min(560px, calc(100vw - 32px));
  padding: 10px 14px;
  box-sizing: border-box;
  border: var(--dsd-hair) solid var(--dsd-rule);
  border-radius: 12px;
  background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1, #1b1b1c));
  color: var(--dsw-alias-label-primary, inherit);
  box-shadow: var(--dsw-elevation-panel, 0 10px 30px rgba(0, 0, 0, .3));
  font-size: 13px;
  line-height: 1.5;
  opacity: 0;
  pointer-events: none;
  transition: opacity .18s var(--dsd-ease), transform .18s var(--dsd-ease);
}
.dsd-toast[data-show="1"] { opacity: 1; transform: translate(-50%, 0); }

.dsd-btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 24px; padding: 2px 9px;
  border: var(--dsd-hair) solid var(--dsd-rule); border-radius: 999px;
  background: transparent; color: inherit; font: inherit; font-size: 11.5px;
  cursor: pointer; white-space: nowrap;
  transition: background .16s var(--dsd-ease), border-color .16s var(--dsd-ease), transform .12s var(--dsd-ease);
}
.dsd-btn:hover { background: var(--dsd-hover, color-mix(in srgb, currentColor 7%, transparent)); }
.dsd-btn:active { transform: scale(.97); }
.dsd-btn[data-on="1"] {
  border-color: var(--dsd-accent);
  background: color-mix(in srgb, var(--dsd-accent) 14%, transparent);
  font-weight: 600;
}
.dsd-btn-ghost { border-color: transparent; }

.dsd-scrim {
  position: absolute; inset: 0;
  z-index: 30;
  display: flex; align-items: center; justify-content: center;
  padding: 24px; box-sizing: border-box;
  background: var(--dsw-alias-bg-mask-1, rgba(0,0,0,.24));
  backdrop-filter: blur(6px);
  animation: dsd-fade .18s var(--dsd-ease) both;
}
@keyframes dsd-fade { from { opacity: 0 } to { opacity: 1 } }
.dsd-palette {
  width: min(480px, 100%);
  max-height: min(80vh, 640px);
  display: flex; flex-direction: column;
  border: var(--dsd-hair) solid var(--dsd-rule);
  border-radius: 20px;
  background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1, #fff));
  box-shadow: 0 24px 60px rgba(0,0,0,.24);
  overflow: hidden;
  animation: dsd-pop .22s var(--dsd-ease) both;
}
@keyframes dsd-pop {
  from { opacity: 0; transform: translateY(10px) scale(.985) }
  to { opacity: 1; transform: none }
}
.dsd-palette-head {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 13px 15px 10px;
  border-bottom: var(--dsd-hair) solid var(--dsd-rule-soft);
}
.dsd-palette-title { font-size: 14px; font-weight: 600; }
.dsd-palette-sub { font-size: 11.5px; color: var(--dsd-muted); }
.dsd-palette-body { padding: 8px 10px 10px; overflow: auto; display: flex; flex-direction: column; gap: 8px; }
.dsd-palette-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 10px 15px 13px;
  border-top: var(--dsd-hair) solid var(--dsd-rule-soft);
}

.dsd-list { display: flex; flex-direction: column; gap: 2px; }
.dsd-item {
  display: grid; grid-template-columns: 16px 1fr auto; gap: 8px; align-items: center;
  width: 100%; padding: 7px 8px;
  border: 0; border-radius: 10px; background: transparent; color: inherit;
  font: inherit; text-align: left; cursor: pointer;
  transition: background .16s var(--dsd-ease);
}
.dsd-item:hover { background: var(--dsd-hover, color-mix(in srgb, currentColor 7%, transparent)); }
.dsd-item[data-on="1"] { background: color-mix(in srgb, currentColor 10%, transparent); }
.dsd-item-idx { font-size: 11px; color: var(--dsd-muted); font-variant-numeric: tabular-nums; }
.dsd-item-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.dsd-item-title { font-size: 12.5px; }
.dsd-item-hint { font-size: 11px; color: var(--dsd-muted); }
.dsd-item-mark { font-size: 10px; color: var(--dsd-accent); }

.dsd-card {
  border: var(--dsd-hair) solid var(--dsd-rule-soft);
  border-radius: 12px;
  background: color-mix(in srgb, currentColor 3%, transparent);
  padding: 9px 10px;
  display: flex; flex-direction: column; gap: 7px;
}
.dsd-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.dsd-label { font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--dsd-muted); }
.dsd-hint { font-size: 11px; line-height: 1.55; color: var(--dsd-muted); margin: 0; }
.dsd-kv { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; font-size: 11.5px; margin: 0; }
.dsd-kv dt { color: var(--dsd-muted); }
.dsd-kv dd { margin: 0; font-variant-numeric: tabular-nums; }

.dsd-settings { display: flex; flex-direction: column; gap: 12px; padding: 2px 0 12px; }
.dsd-screens { display: flex; flex-wrap: wrap; gap: 14px; }
.dsd-screen { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.dsd-screen-label { color: var(--dsw-alias-label-secondary, inherit); opacity: .85; }
.dsd-select {
  appearance: auto;
  max-width: 320px;
  padding: 4px 8px;
  border: var(--dsd-hair) solid var(--dsd-rule);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, transparent);
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dsd-settings-block {
  border: var(--dsd-hair) solid var(--dsd-rule-soft);
  border-radius: 14px; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 8px;
}
.dsd-settings-title { font-size: 13px; font-weight: 600; }

@media (prefers-reduced-motion: reduce) {
  html[data-ds-mode][data-dsd-animate="on"]::view-transition-old(root),
  html[data-ds-mode][data-dsd-animate="on"]::view-transition-new(root) { animation: none; }
  .dsd-scrim, .dsd-palette, .dsd-btn, .dsd-toast { transition: none; animation: none; }
  html[data-ds-mode="secondary"]:not([data-dsd-hero="1"]) [data-composer-seat],
  html[data-ds-mode="secondary"]:not([data-dsd-hero="1"]) [data-conversation-scroll],
  html[data-ds-mode="span"] [data-composer-seat] { transition: none; }
}
`;

    // ----------------------------------------------------------------- state

    function createStore(initial) {
      let state = initial;
      const listeners = new Set();
      return {
        get() { return state; },
        set(patch) {
          const next = typeof patch === 'function' ? patch(state) : Object.assign({}, state, patch);
          if (next === undefined || next === state) return;
          state = next;
          for (const fn of listeners) fn();
        },
        subscribe(fn) {
          listeners.add(fn);
          return () => { listeners.delete(fn); };
        },
      };
    }

    function useStore(store) {
      const [value, setValue] = useState(store.get);
      useEffect(() => store.subscribe(() => setValue(store.get())), [store]);
      return value;
    }

    function createPrefsStore() {
      let stored = {};
      try { stored = JSON.parse(window.localStorage.getItem(PREF_KEY) || '{}') || {}; } catch { stored = {}; }
      const mode = ['auto', 'default', 'secondary', 'dual', 'span'].indexOf(stored.mode) === -1 ? 'auto' : stored.mode;
      const mainDisplay = typeof stored.mainDisplay === 'string' ? stored.mainDisplay : '';
      const promptDisplay = typeof stored.promptDisplay === 'string' ? stored.promptDisplay : '';
      const store = createStore({
        mode,
        split: Number.isFinite(stored.split) ? stored.split : 0.26,
        mainDisplay,
        promptDisplay,
      });
      store.persist = () => {
        try { window.localStorage.setItem(PREF_KEY, JSON.stringify(store.get())); } catch { /* private mode */ }
      };
      store.patch = (patch) => { store.set(patch); store.persist(); };
      return store;
    }

    function readRole() {
      try {
        const direct = new URLSearchParams(window.location.search).get('dshds');
        if (direct === 'prompt') {
          // The prompt window drops its query when the sidebar navigates; keep
          // the prompt role across that reload only. `flow` is deliberately not
          // persisted: a stale flow role made the main window start up with its
          // sidebar and composer hidden, which reads as a blank window.
          try { window.sessionStorage.setItem(ROLE_KEY, 'prompt'); } catch { /* private mode */ }
          return 'prompt';
        }
      } catch { /* no location */ }
      try {
        const raw = window.sessionStorage.getItem(ROLE_KEY);
        if (raw === 'prompt') return 'prompt';
      } catch { /* private mode */ }
      return null;
    }

    function createRoleStore() {
      const store = createStore(readRole());
      store.setRole = (role) => {
        const next = role === 'prompt' || role === 'flow' ? role : null;
        // createStore merges object patches; a bare string would be spread into
        // index keys ("flow" -> {0:'f',...}), which resolveMode never matches.
        // Hand it a reducer so the store keeps the raw role string (or null).
        store.set(() => next);
        try {
          if (next) window.sessionStorage.setItem(ROLE_KEY, next);
          else window.sessionStorage.removeItem(ROLE_KEY);
        } catch { /* private mode */ }
      };
      return store;
    }

    // ------------------------------------------------------------- mode logic

    function detectMode() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (!w || !h) return 'default';
      const ratio = w / h;
      // The stacked form exists for a window that spans the Duo's two screens.
      // The main screen is 1600 PHYSICAL pixels tall, but a maximized window
      // already measures 1599, so the threshold sits well above it: only a
      // window that really reaches onto the secondary strip qualifies.
      const physicalHeight = h * (window.devicePixelRatio || 1);
      if (physicalHeight > 2000) return 'span';
      // Aspect ratio only for the left/right form — a scaled panel (150%/200%
      // DPI) reports far fewer CSS pixels than its physical resolution, so
      // absolute sizes must not gate this one.
      if (ratio >= 2.2) return 'secondary';       // wide and short: output left / input right
      return 'default';
    }

    function resolveMode(prefs, role) {
      if (role === 'prompt') return 'prompt';
      if (role === 'flow') return 'flow';
      if (prefs.mode === 'dual') return 'default';
      if (prefs.mode === 'auto') return detectMode();
      return prefs.mode;
    }

    function labelMode(mode, t) {
      if (mode === 'secondary') return t('m2');
      if (mode === 'span') return t('m4');
      if (mode === 'flow') return t('m3') + ' · ' + t('roleFlow');
      if (mode === 'prompt') return t('m3') + ' · ' + t('rolePrompt');
      return t('m1');
    }

    function publishFontVars(root) {
      const inline = (document.body && document.body.style) || null;
      const read = (name, fallback) => {
        const value = inline ? parseFloat(inline.getPropertyValue(name)) : NaN;
        return Number.isFinite(value) && value > 0 ? value : fallback;
      };
      root.style.setProperty('--dsd-content-font', (read('--dsh-content-font-size', 14) + 1) + 'px');
      root.style.setProperty('--dsd-code-font', (read('--dsh-code-font-size', 11) + 1) + 'px');
    }

    function prefersReducedMotion() {
      try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
    }

    /** Whether the page runs inside the single-window Desktop shell. */
    function isDesktopShell() {
      try { return window.location.protocol === 'dsh-app:'; } catch { return false; }
    }

    let toastTimer = 0;
    /** Bounded, self-dismissing notice owned by the plugin (never a shipped toast). */
    function showToast(text) {
      if (!document.body) return;
      let node = document.querySelector('.dsd-toast');
      if (!node) {
        node = document.createElement('div');
        node.className = 'dsd-toast dsd-ui';
        document.body.appendChild(node);
      }
      node.textContent = text;
      node.setAttribute('data-show', '1');
      if (toastTimer) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => { node.setAttribute('data-show', '0'); }, 5200);
    }

    // ---------------------------------------------------- peak / valley send
    // Off-peak price is half the peak price. Peak hours are Beijing time,
    // Monday–Friday, 09:00–12:00 and 14:00–18:00, excluding Chinese statutory
    // holidays; everything else — weekends and holidays included — is off-peak.
    const BEIJING_OFFSET = 8 * 3600 * 1000;
    const PEAK_ACK_KEY = 'dsh.dualscreen.peak-ack';
    // State Council holiday notices: 2026 = 国办发明电〔2025〕7号,
    // 2027 = 国办发明电〔2026〕10号. Add the next year's notice here.
    const CN_HOLIDAYS = new Set([
      // 2026
      '2026-01-01', '2026-01-02', '2026-01-03',
      '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
      '2026-04-04', '2026-04-05', '2026-04-06',
      '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
      '2026-06-19', '2026-06-20', '2026-06-21',
      '2026-09-25', '2026-09-26', '2026-09-27',
      '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07',
      // 2027
      '2027-01-01', '2027-01-02', '2027-01-03',
      '2027-02-05', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-02-10', '2027-02-11', '2027-02-12', '2027-02-13',
      '2027-04-03', '2027-04-04', '2027-04-05',
      '2027-05-01', '2027-05-02', '2027-05-03', '2027-05-04', '2027-05-05',
      '2027-06-09',
      '2027-09-15',
      '2027-10-01', '2027-10-02', '2027-10-03', '2027-10-04', '2027-10-05', '2027-10-06', '2027-10-07',
    ]);

    function beijingDate(now) {
      return new Date((now || Date.now()) + BEIJING_OFFSET);
    }

    function beijingKey(now) {
      const bj = beijingDate(now);
      const month = String(bj.getUTCMonth() + 1).padStart(2, '0');
      const day = String(bj.getUTCDate()).padStart(2, '0');
      return bj.getUTCFullYear() + '-' + month + '-' + day;
    }

    function isPeakTime(now) {
      const bj = beijingDate(now);
      const weekday = bj.getUTCDay();
      if (weekday === 0 || weekday === 6) return false;
      if (CN_HOLIDAYS.has(beijingKey(now))) return false;
      const minutes = bj.getUTCHours() * 60 + bj.getUTCMinutes();
      return (minutes >= 540 && minutes < 720) || (minutes >= 840 && minutes < 1080);
    }

    function isValleyTime(now) {
      return !isPeakTime(now);
    }

    /** End of the current peak window (only meaningful while it is peak). */
    function nextValleyAt(now) {
      const stamp = now || Date.now();
      const bj = beijingDate(stamp);
      const minutes = bj.getUTCHours() * 60 + bj.getUTCMinutes();
      const end = minutes < 720 ? 720 : 1080;
      const midnightUtc = Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), bj.getUTCDate());
      return midnightUtc + end * 60000 - BEIJING_OFFSET;
    }

    function formatCountdown(ms) {
      const total = Math.max(0, Math.floor(ms / 1000));
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const seconds = total % 60;
      return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    }

    /** The composer's round primary button: the last visible button in the card. */
    function primarySendButton() {
      const card = document.querySelector('[data-composer-card]');
      if (!card) return null;
      const buttons = card.querySelectorAll('button');
      for (let i = buttons.length - 1; i >= 0; i -= 1) {
        const box = buttons[i].getBoundingClientRect();
        if (box.width > 0 && box.height > 0) return buttons[i];
      }
      return null;
    }

    /** While a turn runs the same button stops it, and stop draws a square. */
    function isSendAction(button) {
      if (!button) return false;
      const svg = button.querySelector('svg');
      if (!svg) return false;
      return svg.querySelector('rect') === null;
    }

    function peakAcknowledged() {
      try { return window.sessionStorage.getItem(PEAK_ACK_KEY) === '1'; } catch { return false; }
    }

    function acknowledgePeak() {
      try { window.sessionStorage.setItem(PEAK_ACK_KEY, '1'); } catch { /* private mode */ }
    }

    /** Append （峰）/（谷） to the shipped send tooltip, coloured by the period. */
    function decorateSendTooltip(tooltip) {
      const button = primarySendButton();
      if (!button || !isSendAction(button)) return;
      const label = button.getAttribute('aria-label') || '';
      if (!label || (tooltip.textContent || '').trim() !== label) return;
      const valley = isValleyTime();
      if (tooltip.getAttribute('data-dsd-period') === (valley ? 'valley' : 'peak')) return;
      tooltip.setAttribute('data-dsd-period', valley ? 'valley' : 'peak');
      tooltip.textContent = '';
      tooltip.appendChild(document.createTextNode(label + '（'));
      const mark = document.createElement('span');
      mark.className = valley ? 'dsd-valley' : 'dsd-peak';
      mark.textContent = valley ? '谷' : '峰';
      tooltip.appendChild(mark);
      tooltip.appendChild(document.createTextNode('）'));
    }

    /** Modal second confirmation for the first peak-time send of this launch. */
    function openPeakConfirm(t, onConfirm, onCancel) {
      if (!document.body || document.querySelector('[data-dsd-confirm]')) return null;
      const scrim = document.createElement('div');
      scrim.className = 'dsd-confirm-scrim dsd-ui';
      scrim.setAttribute('data-dsd-confirm', '');
      const box = document.createElement('div');
      box.className = 'dsd-confirm dsd-ui';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-labelledby', 'dsd-confirm-title');
      const head = document.createElement('div');
      head.className = 'dsd-palette-head';
      const titles = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'dsd-palette-title';
      title.id = 'dsd-confirm-title';
      title.textContent = t('peakTitle');
      titles.appendChild(title);
      head.appendChild(titles);
      const body = document.createElement('div');
      body.className = 'dsd-palette-body';
      const copy = document.createElement('div');
      copy.className = 'dsd-confirm-text';
      copy.appendChild(document.createTextNode(t('peakPrefix')));
      const peakMark = document.createElement('span');
      peakMark.className = 'dsd-peak-big';
      peakMark.textContent = t('peakWord');
      copy.appendChild(peakMark);
      copy.appendChild(document.createTextNode(t('peakSuffix')));
      const countdown = document.createElement('span');
      countdown.className = 'dsd-confirm-countdown';
      copy.appendChild(countdown);
      body.appendChild(copy);
      // Live countdown to the next off-peak window, refreshed every second.
      const tick = () => { countdown.textContent = formatCountdown(nextValleyAt() - Date.now()); };
      tick();
      const timer = window.setInterval(tick, 1000);
      const foot = document.createElement('div');
      foot.className = 'dsd-palette-foot';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'dsd-btn dsd-btn-ghost';
      cancel.textContent = t('peakCancel');
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'dsd-btn dsd-btn-primary';
      go.textContent = t('peakSend');
      foot.appendChild(cancel);
      foot.appendChild(go);
      box.appendChild(head);
      box.appendChild(body);
      box.appendChild(foot);
      scrim.appendChild(box);
      document.body.appendChild(scrim);

      let done = false;
      const close = () => {
        if (scrim.parentNode) scrim.parentNode.removeChild(scrim);
        window.clearInterval(timer);
        document.removeEventListener('keydown', onKey, true);
      };
      const finish = (confirmed) => {
        if (done) return;
        done = true;
        close();
        if (confirmed) { if (onConfirm) onConfirm(); } else if (onCancel) onCancel();
      };
      const onKey = (ev) => {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          ev.stopPropagation();
          finish(false);
        }
      };
      cancel.addEventListener('click', (ev) => { ev.stopPropagation(); finish(false); });
      go.addEventListener('click', (ev) => { ev.stopPropagation(); finish(true); });
      scrim.addEventListener('click', (ev) => { if (ev.target === scrim) finish(false); });
      document.addEventListener('keydown', onKey, true);
      // Enter is the send key in the composer: default the focus to Cancel so a
      // stray Enter dismisses the prompt instead of sending.
      try { cancel.focus(); } catch { /* not focusable */ }
      return () => finish(false);
    }

    // ------------------------------------------------------------- components

    function ModeList(props) {
      const { t, prefs, mode, onPick, compact } = props;
      const rows = [
        { id: 'auto', index: '◇', title: t('auto'), hint: t('autoHint') },
        { id: 'default', index: '1', title: t('m1'), hint: t('m1Hint') },
        { id: 'secondary', index: '2', title: t('m2'), hint: t('m2Hint') },
        { id: 'span', index: '3', title: t('m4'), hint: t('m4Hint') },
      ];

      const items = [];
      for (const row of rows) {
        const active = prefs.mode === row.id || (prefs.mode === 'auto' && mode === row.id);
        items.push(h('button', {
          key: row.id,
          type: 'button',
          className: 'dsd-item',
          'data-on': active ? '1' : '0',
          'aria-pressed': active,
          onClick: () => onPick(row.id),
        },
          h('span', { className: 'dsd-item-idx' }, row.index),
          h('span', { className: 'dsd-item-main' },
            h('span', { className: 'dsd-item-title' }, row.title),
            compact ? null : h('span', { className: 'dsd-item-hint' }, row.hint)),
          active ? h('span', { className: 'dsd-item-mark' }, '●') : null));
      }
      return h('div', { className: 'dsd-list' }, items);
    }

    function Palette(props) {
      const { t, prefs, mode, onPick, onRole, onClose, api } = props;
      useEffect(() => {
        const onKey = (ev) => { if (ev.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [onClose]);
      const size = api.size();
      return h('div', { className: 'dsd-scrim', onClick: onClose },
        h('div', {
          className: 'dsd-palette dsd-ui',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': t('control'),
          onClick: (ev) => ev.stopPropagation(),
        },
          h('div', { className: 'dsd-palette-head' },
            h('div', null,
              h('div', { className: 'dsd-palette-title' }, t('control')),
              h('div', { className: 'dsd-palette-sub' }, t('subtitle'))),
            h('button', { type: 'button', className: 'dsd-btn dsd-btn-ghost', onClick: onClose }, t('close'))),
          h('div', { className: 'dsd-palette-body' },
            h('dl', { className: 'dsd-kv' },
              h('dt', null, t('detected')), h('dd', null, size.w + ' × ' + size.h),
              h('dt', null, t('ratio')), h('dd', null, (size.h ? (size.w / size.h) : 0).toFixed(2)),
              h('dt', null, t('autoPick')), h('dd', null, labelMode(detectMode(), t))),
            h(ModeList, { t, prefs, mode, onPick })),
          h('div', { className: 'dsd-palette-foot' },
            h('button', {
              type: 'button', className: 'dsd-btn dsd-btn-ghost',
              onClick: () => { onPick('auto'); onRole(null); },
            }, t('reset')),
            h('span', { className: 'dsd-hint' }, labelMode(mode, t)))));
    }

    function TitleButton(props) {
      // One-click pair: this window becomes the context side and the Host opens
      // the native prompt window on the other display.
      const { api, on } = props;
      return h('button', {
        type: 'button',
        className: 'dsd-titlebtn dsd-ui',
        'data-on': on ? '1' : '0',
        'aria-pressed': on,
        'aria-label': api.t('titleBtn'),
        title: on ? api.t('titleBtnOn') : api.t('titleBtnOff'),
        onClick: () => {
          if (on) api.resetDual();
          else void api.openDualWindow();
        },
      }, api.t('titleBtn'));
    }

    function TitlePlate() {
      // Caption occluder for the 双屏 button; covers the 6px gap after the menubar.
      return h('div', { className: 'dsd-titleplate', 'aria-hidden': 'true' });
    }

    function SettingsSection(props) {
      const { api } = props;
      const prefs = useStore(api.prefs);
      const role = useStore(api.role);
      const ui = useStore(api.ui);
      const mode = ui.mode || resolveMode(prefs, role);
      const size = api.size();
      const dualActive = prefs.mode === 'dual' || role === 'flow' || role === 'prompt';
      const toggleDual = () => {
        if (dualActive) api.resetDual();
        else void api.openDualWindow();
      };
      // Screen list comes from the Host (PowerShell enumerates the real displays,
      // physical pixels); the choices are stored by device name.
      const [displays, setDisplays] = useState(null);
      useEffect(() => {
        let alive = true;
        api.listDisplays().then((list) => { if (alive) setDisplays(list); }).catch(() => { if (alive) setDisplays([]); });
        return () => { alive = false; };
      }, [api]);
      const screenLabel = (display, index) => api.t('screen') + ' ' + (index + 1) + ' · '
        + display.width + '×' + display.height
        + (display.primary ? ' · ' + api.t('screenPrimary') : '');
      const screenSelect = (field, labelKey) => h('label', { className: 'dsd-screen', key: field },
        h('span', { className: 'dsd-screen-label' }, api.t(labelKey)),
        h('select', {
          className: 'dsd-select',
          value: prefs[field] || '',
          onChange: (ev) => api.patchPrefs({ [field]: ev.target.value }),
        },
          h('option', { value: '' }, api.t('screenAuto')),
          (displays || []).map((display, index) => h('option', { value: display.device, key: display.device },
            screenLabel(display, index)))));
      const screenHint = displays === null
        ? api.t('screenLoading')
        : (displays.length ? api.t('screensHint') : api.t('screenUnavailable'));
      return h('div', { className: 'dsd-settings dsd-ui' },
        h('div', { className: 'dsd-settings-block' },
          h('div', { className: 'dsd-row' },
            h('div', { className: 'dsd-settings-title' }, api.t('control')),
            h('span', { className: 'dsd-hint' }, size.w + ' × ' + size.h + ' · ' + labelMode(mode, api.t))),
          h(ModeList, {
            t: api.t, prefs, mode,
            onPick: (next) => {
              api.patchPrefs({ mode: next });
              if (next !== 'dual') {
                api.setRole(null);
                void api.closeDualWindow();
              }
            },
          })),
        h('div', { className: 'dsd-settings-block' },
          h('div', { className: 'dsd-row' },
            h('div', { className: 'dsd-settings-title' }, api.t('dualWindow')),
            h('button', { type: 'button', className: 'dsd-btn', onClick: toggleDual },
              api.t(dualActive ? 'dualWindowClose' : 'dualWindowOpen'))),
          h('span', { className: 'dsd-hint' }, api.t('dualWindowHint'))),
        h('div', { className: 'dsd-settings-block' },
          h('div', { className: 'dsd-row' },
            h('div', { className: 'dsd-settings-title' }, api.t('screens')),
            h('span', { className: 'dsd-hint' }, screenHint)),
          h('div', { className: 'dsd-screens' },
            screenSelect('mainDisplay', 'mainScreen'),
            screenSelect('promptDisplay', 'promptScreen'))));
    }

    function DragStrip() {
      return h('div', { className: 'dsd-dragstrip', 'aria-hidden': 'true' });
    }

    function CornerPlate() {
      // opaque strip under the collapsed rail's fixed buttons (sidebar toggle and
      // new-session): they have no background of their own, so the transcript
      // would otherwise show through them. The overlay layer sits at z-index 20,
      // below those buttons (30) and above the columns, which is exactly here.
      return h('div', { className: 'dsd-cornerplate', 'aria-hidden': 'true' });
    }

    function SplitHandle(props) {
      const { t, api } = props;
      const [active, setActive] = useState(false);
      const onPointerDown = useCallback((ev) => {
        if (ev.button !== undefined && ev.button !== 0) return;
        ev.preventDefault();
        const avail = api.avail || window.innerWidth || 1;
        setActive(true);
        // keep receiving moves even if the pointer leaves the strip
        try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* unsupported */ }
        const move = (moveEv) => {
          // absolute: the divider's left edge sits under the pointer, so there is
          // no accumulated delta to drift and the direction can never invert
          const panel = window.innerWidth - (api.rightbar || 0) - moveEv.clientX;
          const clamped = Math.min(Math.round(avail * 0.7), Math.max(300, panel));
          // Drive the layout directly as well: the drag must not depend on the
          // measurement pass landing in time, or it looks like nothing happens.
          document.documentElement.style.setProperty('--dsd-panel-eff', clamped + 'px');
          // store only — localStorage is written once on release, not per frame
          api.prefs.set({ split: Math.min(0.62, Math.max(0.16, clamped / avail)) });
        };
        const stop = () => {
          setActive(false);
          api.prefs.persist();
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', stop);
          window.removeEventListener('pointercancel', stop);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop);
        window.addEventListener('pointercancel', stop);
      }, [api]);

      return h('div', {
        className: 'dsd-split',
        'data-active': active ? '1' : '0',
        role: 'separator',
        'aria-orientation': 'vertical',
        'aria-label': t('split'),
        title: t('split'),
        onPointerDown,
      });
    }

    function OverlayRoot(props) {
      const { api } = props;
      const prefs = useStore(api.prefs);
      const role = useStore(api.role);
      const ui = useStore(api.ui);
      const mode = ui.mode || resolveMode(prefs, role);
      const t = api.t;
      const close = useCallback(() => api.ui.set({ palette: false }), [api]);
      const onPick = useCallback((next) => {
        api.patchPrefs({ mode: next });
        if (next !== 'dual') {
          api.setRole(null);
          void api.closeDualWindow();
        }
      }, [api]);
      const onRole = useCallback((next) => api.setRole(next), [api]);
      const onOpen = useCallback(() => api.ui.set({ palette: true }), [api]);
      const onReset = useCallback(() => api.resetDual(), [api]);

      const parts = [];
      const dualActive = prefs.mode === 'dual' || role === 'flow' || role === 'prompt';
      // The native input window has no titlebar switch; the main/context side does.
      if (role !== 'prompt') parts.push(h(TitleButton, { key: 'title', api, on: dualActive }));
      if (mode === 'secondary' || mode === 'span') {
        parts.push(h(DragStrip, { key: 'drag' }));
        // The stacked form keeps the conversation header under the band, so its
        // caption no longer floats over the transcript and needs no plates.
        if (mode === 'secondary' && ui.rail) {
          parts.push(h(TitlePlate, { key: 'titleplate' }));
          parts.push(h(CornerPlate, { key: 'corner' }));
        }
      }
      if (mode === 'secondary') {
        parts.push(h(SplitHandle, { key: 'split', t, api }));
      }
      if (ui.palette) {
        parts.push(h(Palette, {
          key: 'palette', t, prefs, mode, onPick, onRole, onClose: close, api,
        }));
      }
      if (parts.length === 0) return null;
      return h('div', { className: 'dsd-overlay' }, parts);
    }

    // -------------------------------------------------------------- plugin

    return {
      name: NS,
      inject: ['slots', 'locale'],
      apply(ctx) {
        const prefs = createPrefsStore();
        const role = createRoleStore();
        const ui = createStore({ palette: false, rail: false, mode: 'default' });

        ctx.effect(() => ctx.locale.register(NS, 'zh', ZH), NS + ': zh');
        ctx.effect(() => ctx.locale.register(NS, 'en', EN), NS + ': en');
        const t = ctx.locale && ctx.locale.bind ? ctx.locale.bind(NS) : (key) => (ZH[key] || key);

        const api = {
          prefs,
          role,
          ui,
          t,
          size: () => ({ w: window.innerWidth, h: window.innerHeight }),
          avail: 0,
          dualWatch: 0,
          patchPrefs: (patch) => prefs.patch(patch),
          setRole: (next) => role.setRole(next),

          /** Screens the Host can see, for the two screen pickers. */
          listDisplays: async () => {
            try {
              const res = await fetch('/dsh-ds-window/displays', { cache: 'no-store' });
              const body = await res.json().catch(() => ({}));
              return Array.isArray(body.displays) ? body.displays : [];
            } catch {
              return [];
            }
          },

          /** Session the conversation shows right now ('' before it mounts). */
          currentSession: () => {
            const content = document.querySelector('[data-conversation-content]');
            return content ? (content.getAttribute('data-conversation-session') || '') : '';
          },

          /** Open the native input window on the other display; this side becomes the context side. */
          openDualWindow: async () => {
            if (!isDesktopShell()) {
              showToast(t('dualWindowFailed'));
              return false;
            }
            try {
              const res = await fetch('/dsh-ds-window/open', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                // Seed the Host before the window boots: the input side reads this
                // id on its first tick, so the blank session it boots with can
                // never take the pair over.
                body: JSON.stringify({
                  session: api.currentSession(),
                  mainDisplay: prefs.get().mainDisplay || '',
                  promptDisplay: prefs.get().promptDisplay || '',
                }),
              });
              const body = await res.json().catch(() => ({}));
              if (!res.ok || body.ok !== true) throw new Error((body && body.error) || ('HTTP ' + res.status));
            } catch {
              showToast(t('dualWindowFailed'));
              return false;
            }
            role.setRole('flow');
            prefs.patch({ mode: 'dual' });
            api.watchDualWindow();
            showToast(t('dualWindowOpened'));
            return true;
          },

          /** Watch the Host until the input window is gone, then leave the pair. */
          watchDualWindow: () => {
            if (api.dualWatch) { window.clearInterval(api.dualWatch); api.dualWatch = 0; }
            // The event stream reports the close; polling is only the fallback
            // for a Host whose stream is not up.
            if (api.sseStatus) return;
            api.dualWatch = window.setInterval(() => {
              void (async () => {
                try {
                  const res = await fetch('/dsh-ds-window/status', { cache: 'no-store' });
                  const body = await res.json().catch(() => ({}));
                  if (body.open === true) return;
                } catch { /* Host restarting: keep watching for one more beat */ }
                window.clearInterval(api.dualWatch);
                api.dualWatch = 0;
                // Closing the input window ends the pair.
                if (role.get() === 'flow') api.resetDual();
              })();
            }, 1400);
          },

          /** Ask the Host to close the native input window. */
          closeDualWindow: async () => {
            if (api.dualWatch) {
              window.clearInterval(api.dualWatch);
              api.dualWatch = 0;
            }
            if (!isDesktopShell()) return;
            try {
              await fetch('/dsh-ds-window/close', { method: 'POST' });
            } catch { /* already gone */ }
          },

          /** Leave the pair from the context side and restore the normal layout. */
          resetDual: () => {
            if (api.dualWatch) {
              window.clearInterval(api.dualWatch);
              api.dualWatch = 0;
            }
            role.setRole(null);
            prefs.patch({ mode: 'auto' });
            void api.closeDualWindow();
            try {
              const url = new URL(window.location.href);
              if (url.searchParams.get('dshds')) {
                url.searchParams.delete('dshds');
                window.history.replaceState(null, '', url.href);
              }
            } catch { /* no location */ }
          },
        };

        ctx.effect(() => () => {
          if (api.dualWatch) window.clearInterval(api.dualWatch);
          api.dualWatch = 0;
        }, NS + ': dual window watch');

        // A reload (HMR, or the shell restarting) drops the in-memory role. When
        // the pair is still up, the context side takes its role back instead of
        // leaving a working input window bound to a normal main window.
        ctx.effect(() => {
          if (!isDesktopShell() || role.get()) return undefined;
          let cancelled = false;
          void (async () => {
            // A Host restart can make the first check fail while the input window
            // is still up; retry briefly before dropping the pair, otherwise one
            // page reload during a restart leaves a half-broken pair behind.
            let open = false;
            for (let attempt = 0; attempt < 6 && !cancelled; attempt += 1) {
              if (role.get()) return;
              try {
                const res = await fetch('/dsh-ds-window/status', { cache: 'no-store' });
                const body = await res.json().catch(() => ({}));
                if (body.open === true) { open = true; break; }
              } catch { /* Host still starting */ }
              if (attempt < 5) await new Promise((resolve) => { window.setTimeout(resolve, 400); });
            }
            if (cancelled || role.get()) return;
            if (open) {
              role.setRole('flow');
              api.watchDualWindow();
            } else if (prefs.get().mode === 'dual') {
              // The window is gone: a stale switch would read as an active pair.
              prefs.patch({ mode: 'auto' });
            }
          })();
          return () => { cancelled = true; };
        }, NS + ': dual recovery');

        // ------------------------------------------------------------ session sync
        // One session, two windows. The context side owns it: it publishes the
        // session it shows and only follows a session the input side published.
        // The input side follows the context first and only starts publishing
        // after it has applied that session, so the blank session its window
        // boots with can never take the pair over. The Host stamps every publish
        // with a sequence number, so neither side mistakes an echo for a command.
        // Plain effect (not ctx.inject): waiting on uiWorkspace with an injected
        // child scope could stall the client plugin and leave the main window
        // blank. Resolve the service lazily in open(); if it is not there yet,
        // the sync simply skips this tick instead of blocking the UI.
        ctx.effect(() => {
          let timer = 0;
          let busy = false;
          let ready = false;
          let ownSeq = 0;
          let followSeq = 0;
          let flowPublished = '';
          let promptPublished = '';
          let applying = false;

          const currentId = () => {
            const content = document.querySelector('[data-conversation-content]');
            return content ? (content.getAttribute('data-conversation-session') || '') : '';
          };
          const readHost = async () => {
            const res = await fetch('/dsh-ds-window/session', { cache: 'no-store' });
            const body = await res.json().catch(() => ({}));
            return {
              id: body && typeof body.id === 'string' ? body.id : '',
              source: body && body.source === 'prompt' ? 'prompt' : 'flow',
              seq: body && Number.isFinite(body.seq) ? body.seq : 0,
            };
          };
          const writeHost = async (id, source) => {
            if (!id) return 0;
            const res = await fetch('/dsh-ds-window/session', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ id, source }),
            });
            const body = await res.json().catch(() => ({}));
            return body && Number.isFinite(body.seq) ? body.seq : 0;
          };
          // openSession() swaps the main view before the transcript re-renders.
          // Wait for the new id to land in the DOM: a follow that publishes the
          // id still on screen would bounce the two windows back and forth.
          const open = async (id) => {
            if (!id || applying) return false;
            const workspace = ctx.get('uiWorkspace');
            if (!workspace || typeof workspace.openSession !== 'function') return false;
            applying = true;
            try { await workspace.openSession(id); } catch { /* keep the current view */ }
            applying = false;
            for (let i = 0; i < 40; i += 1) {
              if (currentId() === id) return true;
              await new Promise((resolve) => { window.setTimeout(resolve, 50); });
            }
            return currentId() === id;
          };
          const run = async () => {
            const roleNow = role.get();
            if (!roleNow) return;
            try {
              if (roleNow === 'flow') {
                const id = currentId();
                if (id && id !== flowPublished) {
                  flowPublished = id;
                  ownSeq = await writeHost(id, 'flow');
                }
                const host = await readHost();
                if (host.source === 'prompt' && host.id && host.seq > ownSeq) {
                  ownSeq = host.seq;
                  if (host.id !== currentId()) await open(host.id);
                  flowPublished = currentId();
                  // Re-stamp the applied session as the context side's own publish,
                  // so a reloaded input window reads a flow publish and follows it.
                  ownSeq = await writeHost(flowPublished, 'flow');
                }
                return;
              }
              if (roleNow !== 'prompt') return;
              const host = await readHost();
              if (!ready) {
                // Nothing to follow yet: keep the window in its boot session and
                // stay silent until the context side names one.
                if (!host.id) return;
                if (host.id !== currentId() && !(await open(host.id))) return;
                ready = true;
                followSeq = host.seq;
                promptPublished = currentId();
                return;
              }
              if (host.source === 'flow' && host.seq > followSeq) {
                followSeq = host.seq;
                if (host.id && host.id !== currentId()) await open(host.id);
                promptPublished = currentId();
                return;
              }
              const id = currentId();
              if (id && id !== promptPublished) {
                promptPublished = id;
                await writeHost(id, 'prompt');
              }
            } catch { /* Host not ready */ }
          };
          const tick = () => {
            if (busy) return;
            busy = true;
            void run().finally(() => { busy = false; });
          };
          // Push first: the Host streams every publish, so the pair follows on an
          // event instead of a clock. The interval below is only a safety net —
          // fast while the stream is down, slow (and nearly silent) once it is up.
          const POLL_FAST = 300;
          const POLL_SLOW = 8000;
          const setPoll = (ms) => {
            if (timer) window.clearInterval(timer);
            timer = window.setInterval(tick, ms);
          };
          setPoll(POLL_FAST);
          tick();

          // A freshly spawned input window has to find the pair's session fast:
          // poll at 20ms for the first four seconds, then the normal cadence takes
          // over (the SSE push usually lands within the first few ticks).
          let fastTimer = 0;
          const fastFrom = Date.now();
          const fastTick = () => {
            tick();
            if (Date.now() - fastFrom < 4000) fastTimer = window.setTimeout(fastTick, 20);
          };
          if (role.get() === 'prompt') fastTick();

          let events = null;
          try { events = new EventSource('/dsh-ds-window/events'); } catch { events = null; }
          if (events) {
            events.onopen = () => {
              api.sseLive = true;
              setPoll(POLL_SLOW);
              if (api.sseStatus && api.dualWatch) { window.clearInterval(api.dualWatch); api.dualWatch = 0; }
            };
            events.onmessage = (event) => {
              let message = null;
              try { message = JSON.parse(event.data); } catch { message = null; }
              if (message && message.type === 'snapshot') {
                // Only a Host that advertises the status event may drop the
                // close-watch poll; an older one still relies on it.
                api.sseStatus = Array.isArray(message.features) && message.features.indexOf('status') !== -1;
                if (api.sseStatus && api.dualWatch) { window.clearInterval(api.dualWatch); api.dualWatch = 0; }
                tick();
                return;
              }
              if (message && message.type === 'status') {
                // The Host pushes the close: the pair ends without a poll.
                if (message.open === false && role.get() === 'flow') api.resetDual();
                return;
              }
              tick();
            };
            events.onerror = () => {
              api.sseLive = false;
              api.sseStatus = false;
              setPoll(POLL_FAST);
              if (role.get() === 'flow' && !api.dualWatch) api.watchDualWindow();
            };
          }

          // A session switch in this window is published right away — waiting for
          // the next tick used to add a full interval of visible lag.
          let debounce = 0;
          let seen = currentId();
          const onDom = () => {
            const id = currentId();
            if (id === seen) return;
            seen = id;
            if (debounce || !id) return;
            debounce = window.setTimeout(() => { debounce = 0; tick(); }, 30);
          };
          const dom = new MutationObserver(onDom);
          if (document.body) {
            dom.observe(document.body, {
              childList: true,
              subtree: true,
              attributes: true,
              attributeFilter: ['data-conversation-session'],
            });
          }
          return () => {
            if (timer) window.clearInterval(timer);
            if (fastTimer) window.clearTimeout(fastTimer);
            if (debounce) window.clearTimeout(debounce);
            dom.disconnect();
            if (events) { try { events.close(); } catch { /* closed */ } }
          };
        }, NS + ': session sync');

        // ---------------------------------------------------- peak send guard
        // Two jobs: colour the shipped send tooltip with the current period, and
        // put a one-time second confirmation in front of the first peak-time send
        // of this launch. The flag lives in sessionStorage, so a UI reload keeps
        // it but restarting the client resets it.
        ctx.effect(() => {
          if (!document.body) return undefined;
          let bypass = false;
          let closeDialog = null;

          const decorate = (node) => {
            if (!(node instanceof Element)) return;
            const tips = node.matches('[role="tooltip"]') ? [node] : Array.from(node.querySelectorAll('[role="tooltip"]'));
            for (const tip of tips) decorateSendTooltip(tip);
          };
          const observer = new MutationObserver((records) => {
            for (const record of records) {
              for (const node of record.addedNodes) decorate(node);
            }
          });
          observer.observe(document.body, { childList: true, subtree: true });

          const replay = (action) => {
            bypass = true;
            try {
              if (action.type === 'click') action.button.click();
              else action.target.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true,
              }));
            } catch { /* the draft stays */ } finally {
              bypass = false;
            }
          };

          const guard = (action) => {
            if (closeDialog) return;
            closeDialog = openPeakConfirm(t,
              () => { closeDialog = null; acknowledgePeak(); replay(action); },
              () => { closeDialog = null; });
          };

          const onClickCapture = (ev) => {
            if (bypass || closeDialog) return;
            const button = ev.target instanceof Element ? ev.target.closest('button') : null;
            if (!button) return;
            const primary = primarySendButton();
            if (!primary || button !== primary || !isSendAction(primary)) return;
            if (isValleyTime() || peakAcknowledged()) return;
            ev.preventDefault();
            ev.stopImmediatePropagation();
            guard({ type: 'click', button: primary });
          };

          const onKeyDownCapture = (ev) => {
            if (bypass || closeDialog) return;
            if (ev.key !== 'Enter' || ev.shiftKey || ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) return;
            const target = ev.target;
            if (!(target instanceof Element) || !target.closest('[data-composer-seat]')) return;
            const primary = primarySendButton();
            if (!primary || primary.disabled || !isSendAction(primary)) return;
            if (isValleyTime() || peakAcknowledged()) return;
            ev.preventDefault();
            ev.stopImmediatePropagation();
            guard({ type: 'key', target });
          };

          document.addEventListener('click', onClickCapture, true);
          document.addEventListener('keydown', onKeyDownCapture, true);
          return () => {
            observer.disconnect();
            document.removeEventListener('click', onClickCapture, true);
            document.removeEventListener('keydown', onKeyDownCapture, true);
            if (closeDialog) { try { closeDialog(); } catch { /* gone */ } }
          };
        }, NS + ': peak send guard');

        // the one stylesheet this plugin owns; removed when the plugin unloads
        ctx.effect(() => {
          let tag = document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]');
          if (!tag) {
            tag = document.createElement('style');
            tag.dataset.plugin = NS;
            tag.dataset.pluginCss = STYLE_ID;
            tag.textContent = CSS;
            document.head.appendChild(tag);
          }
          return () => { if (tag && tag.parentNode) tag.remove(); };
        }, NS + ': layout');

        // owns data-ds-mode / data-dsd-animate and the font-size bump
        ctx.effect(() => {
          const root = document.documentElement;
          let frame = 0;
          let current = null;


          const write = () => {
            const mode = resolveMode(prefs.get(), role.get());
            publishFontVars(root);
            root.setAttribute('data-dsd-animate', prefersReducedMotion() ? 'off' : 'on');
            // SPAN_COMPOSER is the secondary strip in PHYSICAL pixels; CSS lengths
            // live in device-independent pixels, so divide by the current scale.
            root.style.setProperty('--dsd-span-composer', (SPAN_COMPOSER / (window.devicePixelRatio || 1)).toFixed(2) + 'px');
            if (ui.get().mode !== mode) ui.set({ mode });
            if (mode === 'default') root.removeAttribute('data-ds-mode');
            else root.setAttribute('data-ds-mode', mode);
            current = mode;
          };

          const applyNow = (animated) => {
            const next = resolveMode(prefs.get(), role.get());
            const canAnimate = animated && !prefersReducedMotion()
              && typeof document.startViewTransition === 'function'
              && document.visibilityState === 'visible';
            if (!canAnimate || next === current) { write(); return; }
            try { document.startViewTransition(() => write()); } catch { write(); }
          };

          write();

          const schedule = (animated) => {
            if (frame) return;
            frame = window.requestAnimationFrame(() => { frame = 0; applyNow(animated); });
          };

          const offPrefs = prefs.subscribe(() => schedule(true));
          const offRole = role.subscribe(() => schedule(true));
          const onResize = () => schedule(false);
          window.addEventListener('resize', onResize);

          // the theme presenter writes the base sizes inline on <body>; follow it
          let observer = null;
          if (typeof MutationObserver === 'function' && document.body) {
            observer = new MutationObserver(() => publishFontVars(root));
            observer.observe(document.body, { attributes: true, attributeFilter: ['style'] });
          }

          return () => {
            if (frame) window.cancelAnimationFrame(frame);
            offPrefs();
            offRole();
            window.removeEventListener('resize', onResize);
            if (observer) observer.disconnect();
            root.removeAttribute('data-ds-mode');
            root.removeAttribute('data-dsd-animate');
            root.style.removeProperty('--dsd-content-font');
            root.style.removeProperty('--dsd-code-font');
            root.style.removeProperty('--dsd-span-composer');
            root.style.removeProperty('--dsd-titlebtn-w');
          };
        }, NS + ': mode driver');

        // The input side exists to be typed into. Put the caret in the editor as
        // soon as the prompt role has rendered, but never pull focus away from a
        // window the user is already typing in.
        ctx.effect(() => {
          let timer = 0;
          let tries = 0;
          const attempt = () => {
            if (role.get() !== 'prompt') return;
            const editor = document.querySelector('[data-composer-seat] [contenteditable]');
            if (editor && document.hasFocus()) {
              try { editor.focus(); } catch { /* not focusable */ }
              return;
            }
            if (tries < 24) {
              tries += 1;
              timer = window.setTimeout(attempt, 250);
            }
          };
          if (role.get() === 'prompt') attempt();
          const off = role.subscribe(() => {
            if (role.get() !== 'prompt') return;
            tries = 0;
            if (timer) window.clearTimeout(timer);
            attempt();
          });
          return () => {
            if (timer) window.clearTimeout(timer);
            off();
          };
        }, NS + ': prompt focus');

        // Measured geometry for the fixed chrome. Everything here has to track a
        // mouse drag frame-by-frame, so it is a ResizeObserver + rAF, never a
        // transition: --dsd-rightbar-w (the shipped right sidebar), --dsd-panel-eff
        // (sidebar + right sidebar + the user's drag ratio) and --dsd-header-h.
        ctx.effect(() => {
          const root = document.documentElement;
          let frame = 0;
          let probe = null;
          let frameProbe = null;
          let watchedKey = -1;
          let watchedSide = [];

          const measure = () => {
            const shell = document.querySelector('[data-slot="root"] > *');
            // The shell writes the three tracks as inline pixels. That template is
            // the source of truth: this plugin restates it in the pair forms, so
            // the computed template would only read this plugin's own output.
            const inlineTemplate = shell ? String(shell.style.gridTemplateColumns || '') : '';
            const tracks = [];
            let depth = 0;
            let start = 0;
            for (let i = 0; i < inlineTemplate.length; i += 1) {
              const ch = inlineTemplate[i];
              if (ch === '(') depth += 1;
              else if (ch === ')') depth -= 1;
              else if (depth === 0 && ch === ' ') {
                if (i > start) tracks.push(inlineTemplate.slice(start, i));
                start = i + 1;
              }
            }
            if (start < inlineTemplate.length) tracks.push(inlineTemplate.slice(start));
            const lastPx = (track) => {
              const values = String(track || '').match(/-?[\d.]+px/g) || [];
              return values.length ? (parseFloat(values[values.length - 1]) || 0) : 0;
            };
            const computedColumns = shell
              ? String(window.getComputedStyle(shell).gridTemplateColumns || '').split(/\s+/).map((value) => parseFloat(value))
              : [];
            const sidebar = tracks.length >= 3 && lastPx(tracks[0]) > 0
              ? lastPx(tracks[0])
              : (Number.isFinite(computedColumns[0]) ? computedColumns[0] : 0);
            // the reserved caption band, straight off the frame's box: the
            // shell's --dsh-frame-top-clearance is not visible to the overlay layer
            const band = shell ? (parseFloat(window.getComputedStyle(shell).paddingTop) || 0) : 0;
            const body = document.querySelector('[data-conversation-content]');
            const hero = body !== null && body.getAttribute('data-content-phase') === 'hero';
            root.setAttribute('data-dsd-hero', hero ? '1' : '0');
            const scrollerEl = document.querySelector('[data-conversation-scroll]');
            if (scrollerEl) {
              const bandHeight = Math.round(scrollerEl.clientHeight);
              if (bandHeight > 0) root.style.setProperty('--dsd-band-h', bandHeight + 'px');
              // The body scrolls in form 2, so its scrollbar gutter narrows the
              // grid's content box; the fixed header has to give the same width
              // back or its left edge drifts off the divider.
              const gutter = Math.max(0, Math.round(scrollerEl.offsetWidth - scrollerEl.clientWidth));
              root.style.setProperty('--dsd-gutter', gutter + 'px');
            }
            root.style.setProperty('--dsd-band', band + 'px');
            const menuEl = document.querySelector('[data-windows-menu]');
            root.setAttribute('data-dsd-menu', menuEl ? '1' : '0');
            if (menuEl) {
              const menuRight = Math.round(menuEl.getBoundingClientRect().right);
              if (menuRight > 0) root.style.setProperty('--dsd-menu-end', (menuRight + 6) + 'px');
            }
            const titleBtn = document.querySelector('.dsd-titlebtn');
            if (titleBtn) {
              const titleWidth = Math.round(titleBtn.getBoundingClientRect().width);
              if (titleWidth > 0) root.style.setProperty('--dsd-titlebtn-w', titleWidth + 'px');
            }

            root.style.setProperty('--dsd-sidebar-w', Math.max(0, Math.round(sidebar)) + 'px');
            const seatEl = document.querySelector('[data-composer-seat]');
            const cardEl = document.querySelector('[data-composer-card]');
            if (seatEl && cardEl) {
              // Side gutter of the composer card; the prompt form reuses it as the
              // top/bottom margin so the card sits in an even frame.
              const gutter = Math.round((seatEl.getBoundingClientRect().width - cardEl.getBoundingClientRect().width) / 2);
              if (gutter > 0) root.style.setProperty('--dsd-composer-gap', gutter + 'px');
              // The candidate list hangs under the first text line: attachments
              // (image/file chips) push that line down, so measure it.
              const editorEl = document.querySelector('[data-composer-seat] [contenteditable]');
              if (editorEl) {
                const cardRect = cardEl.getBoundingClientRect();
                const editorTop = Math.round(editorEl.getBoundingClientRect().top - cardRect.top);
                const menuTop = Math.max(8, editorTop + 36);
                root.style.setProperty('--dsd-menu-top', menuTop + 'px');
                root.style.setProperty('--dsd-menu-shift', Math.max(0, menuTop - 52) + 'px');
              }
            }
            if (seatEl) {
              const seatLeft = Math.round(seatEl.getBoundingClientRect().left);
              if (seatLeft > 0) root.style.setProperty('--dsd-divider-x', seatLeft + 'px');
            }
            // Entering the pair collapses the shell's OWN sidebar: the flow form
            // hides the column anyway, and leaving the shell's state expanded kept
            // its reserved width and seam border behind the transcript.
            const toggleSidebar = () => {
              const layout = ctx.get('layout');
              if (layout && typeof layout.toggleSidebar === 'function') {
                try { layout.toggleSidebar(); return true; } catch { /* ignore */ }
              }
              const first = shell ? shell.firstElementChild : null;
              const button = first ? first.querySelector('button[class*="toggle"], button[class*="Toggle"]') : null;
              if (button) { button.click(); return true; }
              return false;
            };
            // Only the transition INTO the pair may touch the sidebar: an unrelated
            // state (a fullscreen pass, a stale role, a resize) must never collapse
            // it. Leaving the pair restores what we collapsed, once.
            const modeNow = root.getAttribute('data-ds-mode') || 'none';
            const inFlow = modeNow === 'flow' && role.get() === 'flow';
            if (inFlow && !api.flowWasIn) {
              api.flowWasIn = true;
              if (sidebar > 0) api.flowCollapsedSidebar = toggleSidebar() === true;
            } else if (!inFlow && api.flowWasIn) {
              api.flowWasIn = false;
              if (api.flowCollapsedSidebar) {
                api.flowCollapsedSidebar = false;
                if (sidebar === 0) toggleSidebar();
              }
            }
            // The shell drops its narrow-window sidebar override when the window
            // crosses the 1024px breakpoint, so going fullscreen from a narrow
            // window collapsed the sidebar. Put it back on the fullscreen edge.
            const fullscreenNow = document.documentElement.hasAttribute('data-fullscreen');
            if (fullscreenNow && !api.fullscreenPrev && modeNow !== 'flow' && modeNow !== 'prompt' && sidebar === 0) {
              toggleSidebar();
            }
            api.fullscreenPrev = fullscreenNow;

            // the rail state drives the caption-corner plate
            const isRail = sidebar < 120;
            root.setAttribute('data-dsd-rail', isRail ? '1' : '0');
            if (ui.get().rail !== isRail) ui.set({ rail: isRail });

            // The third inline track is the shipped right-sidebar width (0px while
            // that panel is closed). Reading it back keeps the flow form's restated
            // template faithful to whatever width the shell chose.
            const fullscreen = Boolean(shell && shell.hasAttribute('data-rightbar-fullscreen'));
            const collapsed = Boolean(shell && shell.hasAttribute('data-rightbar-collapsed'));
            const rightbar = (!fullscreen && !collapsed && tracks.length >= 3) ? lastPx(tracks[2]) : 0;
            // The pair form restates the shell's own template, only zeroing the
            // sidebar column. Copying the tracks verbatim keeps the divider, the
            // panel width and the centre floor in lockstep with the shell.
            if (tracks.length >= 3) {
              // In fullscreen presentation the panel floats over the frame and the
              // column must not reserve its width: copying the track verbatim left
              // a blank strip the width of the panel beside the transcript.
              const third = fullscreen ? '0px' : tracks[2];
              root.style.setProperty('--dsd-flow-tracks', '0px ' + tracks[1] + ' ' + third);
            } else {
              root.style.removeProperty('--dsd-flow-tracks');
            }
            if (rightbar > 0) {
              root.style.setProperty('--dsd-rightbar-w', Math.round(rightbar) + 'px');
              // The shell protects CENTER_MIN (400) while the right column is
              // open; restating the grid must keep that floor.
              root.style.setProperty('--dsd-center-min', '400px');
            } else {
              root.style.removeProperty('--dsd-rightbar-w');
              root.style.removeProperty('--dsd-center-min');
            }

            const avail = Math.max(320, window.innerWidth - sidebar - rightbar);
            api.avail = avail;
            api.rightbar = rightbar;
            const split = Math.min(0.62, Math.max(0.16, Number(prefs.get().split) || 0.26));
            // Same contract as the shell's right column: RIGHTBAR_MIN 300 .. 0.7 of the frame.
            const panel = Math.min(Math.round(avail * 0.7), Math.max(300, Math.round(avail * split)));
            root.style.setProperty('--dsd-panel-eff', panel + 'px');

            const header = document.querySelector('[data-slot="conversation.header"] > *');
            if (header) {
              const height = Math.round(header.getBoundingClientRect().height);
              if (height > 0) root.style.setProperty('--dsd-header-h', height + 'px');
            }
          };

          const schedule = () => {
            if (frame) return;
            frame = window.requestAnimationFrame(() => { frame = 0; measure(); });
          };

          const bind = () => {
            const targets = [
              document.querySelector('[data-rightbar-col]'),
              document.querySelector('[data-sidebar-right-panel]'),
              document.querySelector('[data-slot="sidebar"] > *'),
            ].filter(Boolean);
            const key = targets.length;
            if (key === watchedKey && targets.every((el, i) => el === watchedSide[i])) return;
            watchedKey = key;
            watchedSide = targets;
            if (probe) probe.disconnect();
            if (typeof ResizeObserver === 'function') {
              probe = new ResizeObserver(schedule);
              for (const el of targets) probe.observe(el);
            }
            // Dragging the right divider rewrites only the frame's inline
            // template; the column can keep its width, so a ResizeObserver alone
            // left --dsd-rightbar-w stale and the panel stopped growing early.
            if (frameProbe) frameProbe.disconnect();
            const frameEl = document.querySelector('[data-slot="root"] > *');
            if (frameEl && typeof MutationObserver === 'function') {
              frameProbe = new MutationObserver(schedule);
              frameProbe.observe(frameEl, { attributes: true, attributeFilter: ['style'] });
            }
          };

          bind();
          measure();
          // cold start: the shell's own widths settle a beat after the first
          // paint, so re-measure a few times instead of waiting for the poll
          for (const delay of [80, 240, 600, 1400]) window.setTimeout(() => { bind(); measure(); }, delay);

          const offPrefs = prefs.subscribe(schedule);
          const offRole = role.subscribe(schedule);
          window.addEventListener('resize', schedule);
          const id = window.setInterval(() => { bind(); measure(); }, 250);

          return () => {
            if (frame) window.cancelAnimationFrame(frame);
            window.clearInterval(id);
            offPrefs();
            offRole();
            window.removeEventListener('resize', schedule);
            if (probe) probe.disconnect();
            if (frameProbe) frameProbe.disconnect();
            root.style.removeProperty('--dsd-flow-tracks');
            root.style.removeProperty('--dsd-header-h');
            root.style.removeProperty('--dsd-rightbar-w');
            root.style.removeProperty('--dsd-panel-eff');
            root.style.removeProperty('--dsd-sidebar-w');
            root.style.removeProperty('--dsd-gutter');
            root.style.removeProperty('--dsd-composer-gap');
            root.style.removeProperty('--dsd-menu-top');
            root.style.removeProperty('--dsd-menu-shift');
            root.removeAttribute('data-dsd-menu');
          };
        }, NS + ': measured chrome');

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: NS,
          order: 950,
          inject: () => ({ api }),
        }, OverlayRoot));

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: NS,
          order: 60,
          label: () => t('title'),
          inject: () => ({ api }),
        }, SettingsSection));
      },
    };
  },
});
