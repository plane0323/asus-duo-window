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
    const BUS_NAME = 'dsh-dualscreen';
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
      'dualDesktop': '当前环境不支持这个窗口模式。',
      'dualBlocked': '弹窗被浏览器拦截了，请允许弹窗后重试。',
      'dualScreenDenied': '没拿到第二块屏幕的位置，窗口先开在主屏下方，请拖到 2 号屏。',
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
      'dualDesktop': 'This environment does not support that window mode.',
      'dualBlocked': 'The browser blocked the popup. Allow popups and try again.',
      'dualScreenDenied': 'Could not read the second screen; the window opened below the current screen. Drag it to screen 2.',
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

/* ========== role views — flow keeps the process only ==================== */
html[data-ds-mode="flow"] [data-composer-seat] { display: none; }
html[data-ds-mode="flow"] [data-conversation-content] {
  --dsh-chat-content-width: max(420px, min(calc(100% - 96px), 1400px));
}

/* ========== role views — prompt keeps only the composer ================ */
/* slot anchors carry an inline display:contents, so the hide must be important */
html[data-ds-mode="prompt"] [data-slot="conversation.session"] { display: none !important; }
html[data-ds-mode="prompt"] [data-conversation-content] {
  --dsh-chat-content-width: max(420px, min(calc(100% - 160px), 1600px));
  --dsh-composer-card-max-width: max(420px, min(calc(100% - 160px), 1680px));
}
html[data-ds-mode="prompt"] [data-composer-seat] {
  margin-top: auto;
  margin-bottom: auto;
  background: none !important;
  --dsh-composer-text-max-height: min(54vh, 600px);
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
.dsd-overlay .dsd-pill,
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

.dsd-pill {
  position: absolute;
  bottom: 14px;
  right: 14px;
  display: flex; align-items: center; gap: 6px;
  padding: 4px 6px 4px 10px;
  border: var(--dsd-hair) solid var(--dsd-rule);
  border-radius: 999px;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #fff) 90%, transparent);
  backdrop-filter: blur(16px) saturate(1.2);
  box-shadow: var(--dsw-elevation-soft, 0 6px 20px rgba(0,0,0,.08));
  opacity: .58;
  transition: opacity .18s var(--dsd-ease), transform .18s var(--dsd-ease);
}
.dsd-pill[data-side="left"] { left: 300px; right: auto; }
.dsd-pill:hover, .dsd-pill:focus-within { opacity: 1; }
@starting-style { .dsd-pill { opacity: 0; transform: translateY(6px); } }
.dsd-pill-name { font-size: 11.5px; letter-spacing: .02em; white-space: nowrap; }

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
.dsd-settings-block {
  border: var(--dsd-hair) solid var(--dsd-rule-soft);
  border-radius: 14px; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 8px;
}
.dsd-settings-title { font-size: 13px; font-weight: 600; }

@media (prefers-reduced-motion: reduce) {
  html[data-ds-mode][data-dsd-animate="on"]::view-transition-old(root),
  html[data-ds-mode][data-dsd-animate="on"]::view-transition-new(root) { animation: none; }
  .dsd-pill, .dsd-scrim, .dsd-palette, .dsd-btn, .dsd-toast { transition: none; animation: none; }
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
      const store = createStore({ mode, split: Number.isFinite(stored.split) ? stored.split : 0.26 });
      store.persist = () => {
        try { window.localStorage.setItem(PREF_KEY, JSON.stringify(store.get())); } catch { /* private mode */ }
      };
      store.patch = (patch) => { store.set(patch); store.persist(); };
      return store;
    }

    function readRole() {
      try {
        const direct = new URLSearchParams(window.location.search).get('dshds');
        if (direct === 'prompt' || direct === 'flow') return direct;
      } catch { /* no location */ }
      try {
        const raw = window.sessionStorage.getItem(ROLE_KEY);
        if (raw === 'prompt' || raw === 'flow') return raw;
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
      // Aspect ratio only — a scaled panel (150%/200% DPI) reports far fewer CSS
      // pixels than its physical resolution, so absolute sizes must not gate this.
      if (ratio >= 2.2) return 'secondary';       // wide and short: output left / input right
      if (ratio >= 0.85 && ratio <= 1.18) return 'span'; // tall and squarish: stacked
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

    /**
     * Popup geometry before the screen-management permission resolves: the other
     * screen is assumed below the current one, the common vertical stacked
     * arrangement. getScreenDetails() corrects it when the user allows it.
     */
    function fallbackPromptBounds() {
      const s = window.screen || {};
      const left = Number.isFinite(s.availLeft) ? s.availLeft : 0;
      const top = Number.isFinite(s.availTop) ? s.availTop : 0;
      const width = Number.isFinite(s.availWidth) ? s.availWidth : 1280;
      const height = Number.isFinite(s.availHeight) ? s.availHeight : 800;
      return {
        left: Math.round(left),
        top: Math.round(top + height),
        width: Math.max(720, Math.round(width)),
        height: Math.max(480, Math.round(Math.min(900, height))),
      };
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

    function Pill(props) {
      const { t, mode, onOpen, onReset } = props;
      return h('div', { className: 'dsd-pill dsd-ui', 'data-side': 'right' },
        h('span', { className: 'dsd-pill-name' }, labelMode(mode, t)),
        h('button', { type: 'button', className: 'dsd-btn', onClick: onOpen }, t('control')),
        h('button', { type: 'button', className: 'dsd-btn dsd-btn-ghost', onClick: onReset }, t('exit')));
    }

    function SettingsSection(props) {
      const { api } = props;
      const prefs = useStore(api.prefs);
      const role = useStore(api.role);
      const ui = useStore(api.ui);
      const mode = ui.mode || resolveMode(prefs, role);
      const size = api.size();
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
                api.closePromptWindow();
              }
            },
          })));
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
          const clamped = Math.min(Math.max(panel, 340), 960);
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
          api.closePromptWindow();
        }
      }, [api]);
      const onRole = useCallback((next) => api.setRole(next), [api]);
      const onOpen = useCallback(() => api.ui.set({ palette: true }), [api]);
      const onReset = useCallback(() => api.resetDual(), [api]);

      const parts = [];
      if (mode === 'secondary' || mode === 'span') {
        parts.push(h(DragStrip, { key: 'drag' }));
        // The stacked form keeps the conversation header under the band, so its
        // caption no longer floats over the transcript and needs no plates.
        if (mode === 'secondary' && ui.rail) {
          parts.push(h(CornerPlate, { key: 'corner' }));
        }
      }
      if (mode === 'secondary') {
        parts.push(h(SplitHandle, { key: 'split', t, api }));
      } else if (mode === 'flow') {
        // Only the context side keeps the floating pill (layout palette + exit);
        // the input popup is clean, and the titlebar button is its off switch.
        parts.push(h(Pill, { key: 'pill', t, mode, onOpen, onReset }));
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
          promptWin: null,
          promptWatch: 0,
          busPost: null,
          patchPrefs: (patch) => prefs.patch(patch),
          setRole: (next) => role.setRole(next),

          /** Open the input-side popup on the other display; null when unavailable. */
          openPromptWindow: () => {
            if (isDesktopShell()) {
              showToast(t('dualDesktop'));
              return null;
            }
            if (api.promptWin && !api.promptWin.closed) {
              try { api.promptWin.focus(); } catch { /* closed */ }
              return api.promptWin;
            }
            const url = new URL(window.location.href);
            url.searchParams.set('dshds', 'prompt');
            const bounds = fallbackPromptBounds();
            const features = 'popup=yes,width=' + bounds.width + ',height=' + bounds.height
              + ',left=' + bounds.left + ',top=' + bounds.top + ',resizable=yes,scrollbars=yes';
            let win = null;
            try { win = window.open(url.href, 'dsh-dualscreen-prompt', features); } catch { win = null; }
            if (!win || win.closed) {
              showToast(t('dualBlocked'));
              return null;
            }
            api.promptWin = win;
            // The popup opens synchronously (user gesture); once the screen-access
            // permission settles, move it onto the display the current one is not on.
            try {
              if (typeof window.getScreenDetails === 'function') {
                window.getScreenDetails().then((details) => {
                  const target = (details.screens || []).find((screen) => screen !== details.currentScreen) || null;
                  if (target === null || !api.promptWin || api.promptWin.closed) return;
                  try {
                    api.promptWin.moveTo(target.availLeft, target.availTop);
                    api.promptWin.resizeTo(target.availWidth, target.availHeight);
                  } catch { /* the browser refused the move */ }
                }).catch(() => { showToast(t('dualScreenDenied')); });
              }
            } catch { /* Window Management API unavailable */ }
            if (api.promptWatch) window.clearInterval(api.promptWatch);
            api.promptWatch = window.setInterval(() => {
              const open = api.promptWin;
              if (!open || !open.closed) return;
              window.clearInterval(api.promptWatch);
              api.promptWatch = 0;
              api.promptWin = null;
              // Closing the input window ends the pair; the context window returns
              // to the automatic form instead of staying as a composer-less shell.
              if (role.get() === 'flow' && prefs.get().mode === 'dual') {
                prefs.patch({ mode: 'auto' });
                role.setRole(null);
              }
            }, 900);
            return win;
          },

          /** Close the input popup and drop the flow role from this window. */
          closePromptWindow: () => {
            const win = api.promptWin;
            api.promptWin = null;
            if (api.promptWatch) {
              window.clearInterval(api.promptWatch);
              api.promptWatch = 0;
            }
            if (win && !win.closed) {
              try { win.close(); } catch { /* already gone */ }
            }
            if (api.busPost) {
              try { api.busPost({ type: 'dual-off' }); } catch { /* channel closed */ }
            }
            try {
              const url = new URL(window.location.href);
              if (url.searchParams.get('dshds') === 'flow') {
                url.searchParams.delete('dshds');
                window.history.replaceState(null, '', url.href);
              }
            } catch { /* no location */ }
          },

          /** Stop dual collaboration from the context side. */
          resetDual: () => {
            api.closePromptWindow();
            prefs.patch({ mode: 'auto' });
            role.setRole(null);
          },
        };

        ctx.effect(() => () => {
          if (api.promptWatch) window.clearInterval(api.promptWatch);
          api.promptWatch = 0;
          api.promptWin = null;
        }, NS + ': dual popup watch');

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

          // two same-origin windows agree on who is which side
          let bus = null;
          const busId = 'w-' + Math.random().toString(36).slice(2);
          try { bus = new BroadcastChannel(BUS_NAME); } catch { bus = null; }
          api.busPost = (message) => {
            if (!bus) return;
            try { bus.postMessage(Object.assign({ from: busId }, message)); } catch { /* closed */ }
          };
          const onBus = (ev) => {
            const msg = ev && ev.data;
            if (!msg || msg.from === busId) return;
            if (msg.type === 'dual-off') {
              // The context side ended the pair: the input popup closes itself.
              if (role.get() === 'prompt') {
                try { window.close(); } catch { /* not script-opened */ }
              }
              return;
            }
            if (msg.type === 'hello') {
              const mine = role.get();
              if (mine) { try { bus.postMessage({ type: 'role', from: busId, role: mine }); } catch { /* closed */ } }
              return;
            }
            if (msg.type === 'role' && !role.get()) {
              api.setRole(msg.role === 'flow' ? 'prompt' : 'flow');
            }
          };
          if (bus) {
            bus.addEventListener('message', onBus);
            try { bus.postMessage({ type: 'hello', from: busId }); } catch { /* closed */ }
          }
          const offAnnounce = role.subscribe(() => {
            if (!bus) return;
            const mine = role.get();
            if (mine) { try { bus.postMessage({ type: 'role', from: busId, role: mine }); } catch { /* closed */ } }
          });

          return () => {
            if (frame) window.cancelAnimationFrame(frame);
            offPrefs();
            offRole();
            offAnnounce();
            window.removeEventListener('resize', onResize);
            if (observer) observer.disconnect();
            api.busPost = null;
            if (bus) { bus.removeEventListener('message', onBus); try { bus.close(); } catch { /* closed */ } }
            root.removeAttribute('data-ds-mode');
            root.removeAttribute('data-dsd-animate');
            root.style.removeProperty('--dsd-content-font');
            root.style.removeProperty('--dsd-code-font');
            root.style.removeProperty('--dsd-span-composer');
          };
        }, NS + ': mode driver');

        // Measured geometry for the fixed chrome. Everything here has to track a
        // mouse drag frame-by-frame, so it is a ResizeObserver + rAF, never a
        // transition: --dsd-rightbar-w (the shipped right sidebar), --dsd-panel-eff
        // (sidebar + right sidebar + the user's drag ratio) and --dsd-header-h.
        ctx.effect(() => {
          const root = document.documentElement;
          let frame = 0;
          let probe = null;
          let watchedKey = -1;
          let watchedSide = [];

          const measure = () => {
            const shell = document.querySelector('[data-slot="root"] > *');
            const columns = shell
              ? String(window.getComputedStyle(shell).gridTemplateColumns || '').split(/\s+/).map((value) => parseFloat(value))
              : [];
            const sidebar = Number.isFinite(columns[0]) ? columns[0] : 0;
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

            if (sidebar > 0) root.style.setProperty('--dsd-sidebar-w', Math.round(sidebar) + 'px');
            const seatEl = document.querySelector('[data-composer-seat]');
            if (seatEl) {
              const seatLeft = Math.round(seatEl.getBoundingClientRect().left);
              if (seatLeft > 0) root.style.setProperty('--dsd-divider-x', seatLeft + 'px');
            }
            // the rail state drives the caption-corner plate
            const isRail = sidebar < 120;
            root.setAttribute('data-dsd-rail', isRail ? '1' : '0');
            if (ui.get().rail !== isRail) ui.set({ rail: isRail });

            // The grid track is the authority: it collapses to 0 when the right
            // sidebar closes. The panel element can outlive the close with a stale
            // inline width, so it only refines the value while the track is open.
            const column = document.querySelector('[data-rightbar-col]');
            const panelEl = document.querySelector('[data-sidebar-right-panel]');
            const fullscreen = Boolean(shell && shell.hasAttribute('data-rightbar-fullscreen'));
            const collapsed = Boolean(shell && shell.hasAttribute('data-rightbar-collapsed'));
            const columnWidth = column ? column.getBoundingClientRect().width : 0;
            const panelWidth = panelEl ? panelEl.getBoundingClientRect().width : 0;
            const rightbar = (!fullscreen && !collapsed && columnWidth > 1)
              ? Math.max(columnWidth, panelWidth)
              : 0;
            if (rightbar > 0) root.style.setProperty('--dsd-rightbar-w', Math.round(rightbar) + 'px');
            else root.style.removeProperty('--dsd-rightbar-w');

            const avail = Math.max(320, window.innerWidth - sidebar - rightbar);
            api.avail = avail;
            api.rightbar = rightbar;
            const split = Math.min(0.62, Math.max(0.16, Number(prefs.get().split) || 0.26));
            const panel = Math.round(Math.min(Math.max(avail * split, 340), 960));
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
            root.style.removeProperty('--dsd-header-h');
            root.style.removeProperty('--dsd-rightbar-w');
            root.style.removeProperty('--dsd-panel-eff');
            root.style.removeProperty('--dsd-sidebar-w');
            root.style.removeProperty('--dsd-gutter');
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
