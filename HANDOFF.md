> **2026-11-18 21:55← v1.6.15 全屏不再收起左栏：**
> - 上一版的自动收起只在 `role === 'flow'` 时判断，measure() 每帧都跑，任何触发 measure 的动作（全屏、还原、跨 1024 断点、stale role）都可能落进"收起"分支。
> - 改成**只认形态切换**：`modeNow === 'flow' && role === 'flow'` 且上帧不在 flow（`api.flowWasIn` false→true）才收一次；退出 flow 时再展开一次，其余一概不碰。
> - 另外补一条：`html[data-fullscreen]` 从无到有时（且不在 flow/prompt 形态），若侧栏是收起的就展开——宿主自己的规则是"窗口宽度低于 1024px 自动收起、跨断点丢弃手动展开覆盖"，从窄窗口进全屏正好会踩到，这条把它补回来。
> - 实测：收起侧栏（内联 0px）→ 加 `data-fullscreen` → 内联回到 280px ✓；移除此属性保持 280px。
> - 客户端改动，无需重启。

> **2026-11-18 21:50← v1.6.14 附件把 @// 候选菜单顶到打字行上：**
> - prompt 形态的候选菜单原来是 `top: 52px`（相对卡片顶固定）。一旦卡片顶部挂了图片/文件缩略图，编辑区被顶下去，52px 就正好压在输入的第一行上。
> - 改成测量：`measure()` 里取 `[data-composer-seat] [contenteditable]` 相对卡片的 top，写进 `--dsd-menu-top = max(8, editorTop + 36)`，菜单 `top: var(--dsd-menu-top, 52px)`；`--dsd-menu-shift` 记录相对 52 的增量，从 max-height 里扣掉。
> - 实测（无附件）：editorTop=8 → `--dsd-menu-top: 44px`，菜单 top 116（编辑器 80..116，正好贴在第一行下面）；挂附件时 editorTop 变大，菜单跟着下移。
> - 客户端改动，无需重启。

> **2026-11-18 21:40← v1.6.13 退出双屏时把左栏还回来：**
> - 1.6.10 进双屏时用 `toggleSidebar()` 收起宿主左栏，但退出时不恢复，用户得手动点。现在 `api.flowCollapsedSidebar` 记录"是我们收的"，退出 flow 且 `sidebar === 0` 时再 toggle 回来；用户自己收起的（进双屏前就是 0）不动。
> - 实测一轮：`280px`（默认）→ 点双屏 `0px` → 再点双屏 `280px` ✓。
> - 客户端改动，无需重启。

> **2026-11-18 21:30← v1.6.12 新对话输入框出界 + 副窗开机快同步：**
> - **出界**：空白会话的 composer stack = 大标题 `WOwLGG_root`(291px) + `heroWorkspaceRow`(28) + 卡片(min-height 537)，合计 856 > seat 567，卡片被挤到 y=411、底边 948（窗口 711）。插件原来那条 `:not(:has([contenteditable]))` 只覆盖到 seat 的直接孙层，够不到 stack 内部。新增 `[class*="composerStack"] > *:not(:has([contenteditable]))` 隐藏标题和工作区行，只留卡片。实测 card `[577,72,1680,537]`、`fits:true`、底部余量 102。
> - **快同步**：prompt 角色启动时用 `setTimeout(...,20)` 连续 tick 4 秒（`fastTimer`，cleanup 里清掉），随后转入正常的 300ms/8s + SSE 节奏。目的是刚 spawn 的副窗不用等一轮 300ms 才对齐主窗会话。
> - 客户端改动，无需重启。

> **2026-11-18 21:20← v1.6.11 顶栏菜单板的 L 形描边（用户指的"编辑和双屏中间那拐"）：**
> - 元素是 `[data-windows-menu]`（应用/编辑那块，rect 84..201 × 0..41）。插件自己的规则 `html[data-ds-mode][data-dsd-rail="1"] [data-windows-menu]` 在"侧栏像收起态"时给它画了 `border-right + border-bottom + border-bottom-right-radius:10px + 侧栏底色`——双屏里左栏是彻底没有的，这条就成了悬在顶栏下的 L 形亮边。
> - 新增 `html[data-ds-mode="flow"][data-dsd-rail="1"] [data-windows-menu] { background: transparent; padding: 0; border: 0; border-bottom-right-radius: 0; }`（和 span 形态已有的一条同款）。
> - 验证：扫描顶栏区域带边框/圆角的元素，修复前有 `[data-windows-menu]`（border-right/bottom 0.667px、radius 10px），修复后该元素不再出现；截图对比顶栏干净，双屏按钮左移。
> - 顺带：`measure()` 里 `(seat - card)/2` 得到的 `--dsd-composer-gap` 现在也会在 prompt 形态里被 `--dsd-vgap` 封顶到 72，见 v1.6.6。

> **2026-11-18 21:10← v1.6.10 进入双屏时真的收起宿主左栏（用户思路）：**
> - 之前只靠 CSS 把左栏列宽写 0 并隐藏，但宿主自己的布局状态里 `cols.sidebar` 还是 280——内联模板、`--dsh-windows-sidebar-width`、侧栏边框/圆角等"按侧栏还在"算出来的东西仍然存在，用户看到的就是那块残留。
> - 现在 `measure()` 里：`role==='flow' && sidebar>0 && !api.flowCollapsePending` → 调 `ctx.get('layout')?.toggleSidebar()`（取不到就退化成点左栏里的 toggle 按钮），把宿主真正切到收起态；离开双屏时重置标志，下次进入再收。
> - 实测：默认布局展开左栏（内联 `280px ...`）→ 点双屏 → 内联变成 `0px minmax(0px, 1fr) minmax(0px, 0px)`，对话列从 x=0 开始；再打开右侧栏 → `0px minmax(400px, 1fr) minmax(0px, 768px)`，分隔线 939 = 面板左边缘。
> - 客户端改动，无需重启（窗口重载后生效）。

> **2026-11-18 19:50← v1.6.9 全屏右栏的空白列（用户"没生效"的真凶之一）：**
> - 复现路径：默认布局把左侧栏展开（280）→ 点「双屏」→ flow。实测布局是对的（对话列 `[0,40,1283]`、圆角 0、分隔线 1283 = 面板左边缘）。
> - 但另一种状态会出空白：右侧栏是 **全屏呈现**（`data-rightbar-fullscreen`）时，面板是浮层，而宿主的内联模板仍写着 `minmax(0px, 424px)`。上一版「原样复制宿主三条 track」把这条也复制过来 → 右列保留 424/768 宽的空列，面板浮在上面 → 对话旁一条空白 + 分隔线对不上。
> - 修正：`fullscreen` 时第三条 track 强制写 `0px`。实测全屏态计算值 `0px 1707px 0px`（原来 `0px 939px 768px` 带 768 空白列）；退出全屏后回到 `0px 939px 768px`，分隔线 939 = 面板左边缘。
> - 另一个"没生效"的原因：客户端改动只在窗口重新加载后生效，用户测试时窗口可能还跑着上一版 bundle。可用 `document.querySelectorAll('style')` 里是否含 `--dsd-flow-tracks` / `:has([data-slot="sidebar"])` 判断。

> **2026-11-18 19:35← v1.6.8 左栏残留（用户定位）：**
> - 用户发现：**先收起左侧边栏再进双屏就正常**，说明残留来自「左栏展开时进入 flow」的状态。原来隐藏左栏用的是位置选择器 `[data-slot="root"] > * > :first-child`（依赖 DocumentTitle 不渲染、抽屉遮罩不存在），一旦结构变化就会漏；而且对话列（`.centerCol`）保留着 `border-top-left-radius:16px`——那是给侧栏接缝用的，侧栏没了就变成左上角一拐的亮边。
> - 改法：① 追加 `:has([data-slot="sidebar"])` 按内容隐藏；② flow 形态下 `:nth-child(2)` 的左上/左下圆角清零；③ `--dsd-sidebar-w` 每次都写成真实值（含 0/56），不再残留上次展开的 280。
> - 实测（左栏在宿主层面是展开的 280px、flow 模式下）：`--dsd-flow-tracks: 0px minmax(400px, 1fr) minmax(0px, 768px)`，对话列 rect `[0,40,939,1026]`、`border-top-left-radius: 0px`，左栏子元素 rect 全 0，截图左上角不再有拐角亮边。
> - 客户端改动，无需重启。

> **2026-11-18 19:30← v1.6.7 副屏 @// 候选列表高度：**
> - 旧规则 `max-height: clamp(96px, 100dvh - 2*gap - 102px, 320px)` 里还在用「侧边留白」`--dsd-composer-gap`（新屏上 297px），算出来是负数 → 被 clamp 到 **96px**，所以只能看到两行。
> - 改成 `clamp(140px, calc(100dvh - 2 * var(--dsd-vgap, 72px) - 96px), 70vh)`：菜单从编辑区第一行下面（top:52）一直排到工具栏上方。实测 prompt 窗口 vh=711：菜单 **471px**、46 项、底边 595 < 卡片底 609；489 高的窗口下是 249px。
> - 客户端改动，无需重启。

> **2026-11-18 19:20← v1.6.6 双屏三列直接沿用宿主模板 + 输入框留白封顶：**
> - **分割线**：上一版还在用「测量内联上限 → 写 --dsd-rightbar-w」这条路，拖动时仍可能落后一帧或和宿主的 clamp 不一致。现在 flow 的 `grid-template-columns` 改成 `var(--dsd-flow-tracks)`，measure() 每次把宿主内联模板的第 2、3 条 track **原样**拼成 `0px <t2> <t3>` 写进去（只把左栏置零）。面板宽度、分隔线位置、对话列 400 底线因此永远来自同一组数字。实测 `--dsd-flow-tracks: 0px minmax(400px, 1fr) minmax(0px, 768px)`，计算值 `0px 939px 768px`，分隔线中心 939 = 面板左边缘 939。
> - **副屏输入框**：`--dsd-composer-gap` 是「侧边留白」，在新显示器（2560 宽、卡片最大 1680）上算出来 297px，之前拿它当上下留白 → 卡片只剩 257px。新增 `--dsd-vgap: min(gap, 72px)`，卡片 min/max-height 和 seat 高度都改用它。实测 vh=711 时卡片 537px 高（原来 257），侧边留白仍是 297。
> - 客户端改动，无需重启。

> **2026-11-18 19:05← v1.6.5 挤压上限跟随 + 输入框高度封顶：**
> - **挤压**：拖动右侧栏分隔线只改帧的内联 `grid-template-columns`（`minmax(0px, pref)`），而插件的 `--dsd-rightbar-w` 原来只由 ResizeObserver（监听列宽）驱动——列宽没变就一直是旧值，于是面板提前停在旧上限，手柄继续往左走，中间露出帧底色（灰条）。现在 `bind()` 里给帧加了 `MutationObserver({attributes:true, attributeFilter:['style']})`，内联模板一变就 rAF 重算；并把 `--dsd-rightbar-w` 钳到 `min(内联上限, innerWidth-400)`，保证和对话列的 400 底线不打架。
> - **副屏输入框溢出**：prompt 形态的卡片原来只有 `min-height`，`[data-composer-card] > div:has([contenteditable])` 还是 `max-height:none`，草稿写多了卡片就长得比窗口高（hero 居中时上下边框直接出屏）。现在卡片加 `max-height: calc(100dvh - 2*gap)` + `overflow:hidden`，输入区 `overflow-y:auto`。
> - 实测：prompt 窗口 `vh=711`、`gap=227`，30 行长草稿时卡片高度被钉在 **257px**（=711-2*227），输入区滚动，`fits:true`（上下边框都在屏内）；flow 窗口右侧栏 768px、`--dsd-center-min:400px`、`--dsd-rightbar-w:768px`，对话列 939px，手柄位置与面板左边缘一致。
> - 客户端改动，不需要重启；Host 侧（1.6.4 的 status 推送）仍需要一次 DSH 重启才生效。

> **2026-11-18 19:10← v1.6.4 状态也改成推送 + 列宽对齐官方常量：**
> - **副窗关闭不再轮询**：Host 在子窗口 exit/error 以及 `POST /close` 时 `broadcast({type:'status', open:false})`；SSE 连接时先发 `{type:'snapshot', features:['status'], open}`。客户端收到 `status` 且 role=flow 就直接 `resetDual()`。
> - 兼容老 Host：只有 snapshot 的 `features` 里带 `status` 才停掉 1.4s 的 `/status` 兜底轮询（`api.sseStatus`）；SSE 报错时清标志并恢复兜底轮询。所以**这次必须重启 DSH** 才会真正停掉 `/status` 轮询。
> - **列宽对齐**（原来插件自己写的 340/960 与官方不一致）：flow 网格中间列改成 `minmax(var(--dsd-center-min,0px),1fr)`，右侧栏打开时 `--dsd-center-min:400px`（官方 `CENTER_MIN=400`；右侧栏关着时为 0，与官方 `cols.rightbar===0?0:CENTER_MIN` 一致）；插件自己的左右分栏宽度 clamp 从 `340..960` 改成 `max(300, ...)` 到 `0.7×可用宽`（官方 `RIGHTBAR_MIN=300`、`RIGHTBAR_MAX_RATIO=0.7`）。
> - 实测：右侧栏打开时 `--dsd-center-min:400px`、计算后网格 `0px 971px 736px`，对话列不再被压到 400 以下。
> - Host 侧 SSE 单测（`_probe/sse-test2.cjs`）：snapshot(带 features/open)、session(带 open)、status(close) 三种事件都通过。

> **2026-11-18 19:00← v1.6.3 同步彻底去轮询：**
> - 会话同步改成**推送优先**：`EventSource` `onopen` → 把轮询从 300ms 放慢到 **8000ms**（纯兜底）；`onerror`（流断了/老 Host 没这条路由）→ 立刻回到 300ms。发布侧仍是「本窗会话一变，30ms 去抖后立即 POST」，所以稳态下没有任何定时占空。
> - 实测：副窗切会话 → 本窗 DOM 32–42ms、publish 到 Host 75–125ms、主窗跟随 **113–176ms**；`performance` 里 `/dsh-ds-window/session` 的请求在最近 10 秒 **0 次**（旧版每 300ms 一次，10 秒约 33 次）。
> - 注意 Electron 后台窗口的 timer 会被节流，8 秒兜底在非前台窗口里可能更稀；这不影响推送路径。
> - 仍保留的轮询只有「副窗是否还开着」的 `/status` 1.4s 检查（窗口存活，不是内容同步）；要一起改成推送的话需要在 Host 里加一个 status 事件 + 重启 DSH。

> **2026-11-18 18:45← v1.6.2 双屏切会话加速：**
> - 旧链路：两侧各 700ms 轮询 → 点击到主窗落地 ~1.4–2s。
> - 现在：① Host 新增 **SSE** `GET /dsh-ds-window/events`（`listeners` Set，publish() 里 broadcast；15s 心跳；dispose 时 end）；② 客户端 `new EventSource('/dsh-ds-window/events')`，收到就 `tick()`；③ 轮询降到 300ms 作为兜底；④ 给 `data-conversation-session` 加 MutationObserver（childList+subtree+attributeFilter），本窗口一切换就 30ms 去抖后立即 tick，不再等轮询。
> - **实测**（新 Host + 新客户端，副窗点 Greeting）：本窗 DOM 切换 28ms、publish 到 Host 110ms、主窗重新盖章 225ms → publish→follow 115ms；总链路 ~0.2s。
> - 注意 **dsh-app:// 协议下 EventSource 也能正常收到推送**（实测 open=true、初始快照 1 条、publish 后再到 1 条），所以主窗同样走推送。
> - 顺带：`dual recovery` 改成最多重试 6 次 × 400ms 再判定窗口是否还在，避免 Host 重启瞬间的页面重载把 dual 状态误清、留下"主窗普通布局 + 副窗还开着"的半残状态。
> - SSE 是 Host 改动，**需要重启 DSH** 才生效；轮询 300ms + 立即发布是客户端改动，热重载即生效（重启前总延迟约 0.3–0.6s，重启后 ~0.2s）。

> **2026-11-18 18:32← v1.6.1 上下分栏阈值 1600 → 2000：** 主屏最大化窗口的物理高度正好 1599（CSS 1066 × 1.5），离 1600 只有 1px，DIP 舍入或边框差一点就会误判进上下分栏。`detectMode()` 改成 `physicalHeight > 2000`（跨两屏的 2332 仍然满足，单屏最大化 1599 稳妥落回默认）。这是一行常量改动，无其他逻辑变化。

> **2026-11-18 18:02← v1.6.0 峰谷规则重定义 + 弹窗改版：**
> - **规则**：峰 = 北京时间周一至周五 09:00–12:00、14:00–18:00（不含法定节假日）；其余（午休/夜间/周末/节假日）都是谷，谷价是峰价一半。实现用 UTC+8 固定偏移（中国无夏令时）：`beijingDate()/isPeakTime()`，分钟数 540–720、840–1080。**节假日表 CN_HOLIDAYS 内置 2026/2027 国务院通知的放假日期**（2026: 1/1–3、2/15–23、4/4–6、5/1–5、6/19–21、9/25–27、10/1–7；2027: 1/1–3、2/5–13、4/3–5、5/1–5、6/9、9/15、10/1–7）；每年 11 月国务院公布下一年安排后要补表。调休上班的周末按周末算谷（用户规则）。
> - 写了 20 条断言的单测（`_probe/peak-schedule-test.cjs`，从 client.js 抽出函数在 node 里跑）：边界 09:00/12:00/14:00/18:00、周末、2026 国庆、2027 端午/春节、nextValleyAt、倒计时格式化，全过。
> - **弹窗**：背景 `#2c2c2e`；正文「现在是**峰**时段，距离下一个谷时段还有 hh:mm:ss」，峰用 `.dsd-peak-big`（红色 #ff5c5c、15px、700），倒计时 `.dsd-confirm-countdown` 每秒 setInterval 刷新（关闭时 clear）；发送按钮改 `.dsd-btn-primary`（蓝底 #2f6fed、白字、14px、加内边距），文案「发送」。**默认焦点放在「取消」**，避免回车误发。
> - 取消不写标志（`acknowledgePeak` 只在 `finish(true)` 的 onConfirm 里调），所以取消后下次仍弹；标志 key `dsh.dualscreen.peak-ack`（sessionStorage，重启客户端重置）。
> - 测试用了临时 `clock-offset`（localStorage 偏移）把"现在"挪到 10:00 验证倒计时 01:59:5x 每秒递减，**测完已删除**，代码里没有 dev hook。

> **2026-11-18 17:46← v1.5.0 峰谷提示与峰时二次确认：**
> - 圆形发送按钮 = `[data-composer-card]` 里**最后一个可见 button**（不要按 hashed class 选）；`svg` 里有 `rect` 表示停止态，否则是发送态（箭头/转圈/重试）。`aria-label` 就是提示文案（"发送消息"/"停止生成"）。
> - 悬停提示是 shipped 的 body portal `<span role="tooltip" data-side="top">`，延迟 500ms 出现。插件用 MutationObserver 抓到新插入的 `[role="tooltip"]`，若文本 === 发送按钮的 aria-label 且按钮处于发送态，就改写为 `发送消息（<span class="dsd-peak|dsd-valley">峰|谷</span>）`。真实鼠标悬停才会触发，合成 pointerover 不行（要 SetCursorPos 真移动）。
> - 峰时确认：document 捕获阶段拦 `click`（按钮是其 target）和 `keydown Enter`（在 `[data-composer-seat]` 内、非 shift/ctrl/alt、非输入法组合）；`preventDefault + stopImmediatePropagation` 后弹自建 `.dsd-confirm-scrim/.dsd-confirm`（复用 palette head/body/foot 样式）；确认则写 sessionStorage 标志并按原动作重放（click 用 `button.click()`、Enter 用重派 KeyboardEvent），用 bypass 标志避免再次拦截。
> - 谷时 00:30–08:30（本机时间）；标志 key `dsh.dualscreen.peak-ack`，sessionStorage → 刷新保留、重启客户端重置。
> - 测试时用「failsafe 监听器」兜底：如果插件没拦住，后注册的捕获监听器会 preventDefault 阻止真的发消息（验证结果 `guardMissed=false`、对话框出现、草稿保持）。

> **2026-11-18 17:32← v1.4.1 上下模式两处修正：**
> - **触发条件改成物理高度 > 1600**（不再看宽高比）：`detectMode()` 里 `h * devicePixelRatio > 1600` → span；左右模式仍按 ratio ≥ 2.2；其余 default。这样 2560×2334 的跨屏窗口（CSS 1555）才会进上下分栏，普通主屏最大化（CSS 1066 → 1599 physical）不会误判。
> - **@ / slash 菜单整体留在上半 1600px**：shipped 菜单是 `bottom: calc(100% + 4px)` 贴着 composer card 顶部，而 card 顶部在输入带里（带顶 + 28px），菜单底边实测落在 1636 physical（伸进输入带 36px）。span 形态下改成 `bottom: calc(100% + 32px)`，实测菜单 1139–1594 physical，完全在上半屏、不压输入带。
> - 注意窗口里 `--dsd-span-composer` 是 734/dpr，seat 高度 489 CSS；card 顶部 = 带顶 + 28（padding）+ 1（border）。

> **2026-11-18 17:20← v1.4.0 设置里挑屏幕：**
> - 新增 Host 路由 `GET /dsh-ds-window/displays`：跑 `helper/displays.ps1`（`Screen.AllScreens`，SetProcessDPIAware 后是物理像素）返回 `{displays:[{device, primary, x, y, width, height}]}`，缓存 5 秒。
> - `POST /open` 接受 `{mainDisplay, promptDisplay}`（设备名，如 `\\\\.\\DISPLAY5`）：按设备名解析，找不到就回落到主屏 / 另一块屏；把解析出的物理 bounds 用环境变量 `DSH_DS_MAIN_BOUNDS` / `DSH_DS_PROMPT_BOUNDS` 传给 helper。
> - helper 里 `displayFor(bounds)` 把物理 bounds 和 `screen.getAllDisplays()` 的 DIP bounds × scaleFactor 对比（容差 32）找出那块屏；找不到才用“另一块屏”。实测 2560×734 physical 对 1707×490 DIP @1.5 的误差只有 2。
> - `focus-main.ps1` 加 `-Bounds "x,y,w,h"`；已在目标屏最大化时直接退出，不闪屏。
> - 客户端：prefs 增加 `mainDisplay` / `promptDisplay`；设置页的「屏幕」块用 `api.listDisplays()` 拉列表，两个 `<select>`（自动 / 每块屏），改完存 localStorage，下次 `/open` 带上。
> - 注意：**Host 改动要重启 DSH 才生效**；重启前设置页会显示“读不到屏幕列表”（`/displays` 还是 404）。
> - 调试导航时别乱点侧栏的 `[data-row-key]`——点到工作区行会把窗口切到空工作区；重新加载页面能恢复。

> **2026-11-18 17:00→ v1.3.2 双屏窗口编排与输入卡加厚：**
> - **按「双屏」自动摆窗**：helper 打开时先跑 `helper/focus-main.ps1`（EnumWindows 找进程名 `DeepSeek Harness` 的最大可见顶层窗，SW_RESTORE → SetWindowPos 到主屏物理尺寸 → SW_MAXIMIZE；已在主屏最大化则直接退出，不闪），然后自己 `win.maximize()` 落在 2 号屏。两个窗口都是最大化（带系统标题栏），不是无边框全屏。
> - 找主窗用进程名过滤就够了：helper 是 `electron.exe`，主窗属于 `DeepSeek Harness.exe`；**别再按窗口标题匹配**（标题是会话名）。
> - **修掉 helper 被 HMR 重载弄死的老 bug**：`did-fail-load` 会把重载时的 `ERR_ABORTED (-3)` 当成加载失败并 `app.quit()`，现在忽略 -3。之前"一改 client.js 副窗就消失"就是这个。
> - **副窗输入卡加厚**：`--dsd-composer-gap` 由 measure() 量出（seat 宽 − card 宽）/2，prompt 形态下 seat 高度 = `100% - 2*gap`，card 加 `min-height: calc(100dvh - 2*gap - 30px)`（30 是 seat 里那个 dock 的高度），card 的 scroll 区 `flex:1`。实测 1707×467 窗口：seat 275、card 245、上下留白 96 = 左右留白。注意 `[data-composer-seat] > *` 是 `display:contents` 的壳，flex 要打在 `:has(> [data-composer-card])` 的 root 上。
> - 卡片变高后 shipped 菜单的"卡上方空间"只剩 12px，prompt 形态改成落在卡内第一行下面：`top: 52px; left/right: 8px; max-height: clamp(96px, 100dvh - 2*gap - 102px, 320px)`，正好停在工具栏上方。
> - 测试时探针命令要带 `-Mode prompt|flow`（server 按 mode 过滤，一次只发一个窗口），命令 id 从 4999 起。

> **2026-11-18 15:20→ v1.3.1 双屏收尾：**
> - 去掉了 flow 形态右下角的浮动气泡（`Pill` 组件 + `.dsd-pill` CSS 全删），主窗开/关双屏只剩标题栏「双屏」按钮；`OverlayRoot` 里 flow 分支现在是空的。
> - **右输左出（secondary）下 @ / slash 菜单浮到对话区**：原来菜单挂在 `[data-composer-overlay]` 上、`bottom: 100% + 4px`，而 secondary 里 composer card 占满右列且从顶部开始，导致菜单只有 19px 高（实测 max-height=19）。改成 `position: fixed` + 用 `--dsd-divider-x / --dsd-sidebar-w / --dsd-panel-eff` 把它铺到对话区（左 300 → 右 divider−20，底 20，max-height 368），实测 274×368 覆盖对话区、46 项、点选正常。
> - **关键坑**：composer seat 上有 `will-change: transform`（shipped CSS），所以 `position: fixed` 的包含块是 **seat 而不是视口**——`left: 20px` 会变成 seat 左 + 20。必须用相对 seat 的负数 left：`left: calc(-1 * (var(--dsd-divider-x) - var(--dsd-sidebar-w) - 20px))`、`right: calc(var(--dsd-panel-eff) + 20px)`。查包含块可以用探针沿祖先链看 transform/filter/contain/will-change/container-type。
> - 探针服务器改成「每条命令只发给一个窗口」（claimed Set），否则多窗口会同时执行同一条命令；命令 id 从 4999 起，避免窗口 sessionStorage 里 last 值更大时忽略新命令。

> **2026-11-18 15:20 事故：package.json 被写进 UTF-8 BOM，插件整体不可用。** 起因是我用 Windows PowerShell 5.1 的 `Set-Content -Encoding UTF8` 改了版本号，它默认写 BOM（EF BB BF）。DSH 加载 bundle 时用 JSON.parse 解析 manifest，BOM 直接抛 `Unexpected token ''`，整包（含客户端）都不加载：界面退回原版、标题栏没有「双屏」。修法：用 `[System.IO.File]::WriteAllText(path, text, [Text.UTF8Encoding]::new($false))`（或 node 的 `fs.writeFileSync(p, t, 'utf8')`），不要用 PS 5.1 的 `Set-Content -Encoding UTF8`。改完 package.json 必须重启 DSH。以后改任何 JSON 都跑一遍 `JSON.parse` / `ConvertFrom-Json` 校验，并确认首字节不是 EF BB BF。

> **2026-11-18 v1.3.0 双屏协同重做（当前状态）：** 主窗 = 对话 + 右侧边栏，副屏 = 左侧栏 + 输入框，两边同一会话，切会话双向同步。关键点：
> - **会话同步协议**：Host `/dsh-ds-window/session` 存 `{id, source, seq}`；`/open` 先用主窗当前会话 seed（source=flow）再拉窗。flow 侧发布自己的会话，只在 `source==='prompt' && seq > ownSeq` 时跟随，跟随后再以 flow 重新盖章；prompt 侧在**真正 open 成功、DOM 里 `data-conversation-session` 变成目标 id 之后**才算 ready，ready 前绝不发布（这修掉了「副窗空白新会话把主窗顶掉」的老 bug）。`uiWorkspace.openSession` 返回时视图还没重渲染，必须轮询 DOM 等 id 落地。
> - **三栏 grid 的真相**：外壳把 `grid-template-columns: 280px minmax(0,1fr) minmax(0,0px)` 写成 frame 的**行内样式**。flow 要收起左栏只能整条重写模板（`!important`），所以第三栏宽度不能再读 computed（会读到自己的输出）——改成解析行内模板的 track，写进 `--dsd-rightbar-w`。右侧边栏打开时 flow 是 `0px 1fr 576px`，收起时 0。prompt 侧则用 `var(--dsd-sidebar-w)` + 第三栏 0，把右侧栏彻底隐藏。
> - **prompt 侧只留输入框**：隐藏 `[data-slot="conversation.header"]`、tabs、以及 `[data-conversation-scroll]` 里除 composer seat 外的子项。空白会话的「探索未至之境」标题和工作区行不是独立 hero 页，而是 composer seat 里 `composerStack` 的前两个兄弟，用 `[data-content-phase="hero"] ... > * > *:not(:has([contenteditable]))` 精确隐藏；seat 的 `margin: auto` 让输入框垂直居中（实测 458 高窗口里 165/165）。
> - **副窗焦点**：helper `show()` 里 `win.focus()`；页面侧 role=prompt 时给 `[data-composer-seat] [contenteditable]` 聚焦（最多重试 6 秒，且只在 `document.hasFocus()` 时）。
> - 去掉了一堆死代码：浏览器 popup `openPromptWindow`、BroadcastChannel 角色广播、`fallbackPromptBounds`；标题按钮只留「开/关双屏」两态。
> - **测试方法（下次直接复用）**：在 `C:\DSWS\_probe` 起一个 HttpServer（`server.cjs`，端口 8799）接收日志/命令，把一段 `DEV PROBE` 代码临时追加到 `client.js` 末尾（轮询 `/cmd` eval + `POST /log`），改文件后 DSH 会热重载装上前端探针；用 `send.ps1` 发命令、读结果。**系统级鼠标/键盘到不了 DSH 窗口（进程完整性级别更高），WM_CLOSE 和 taskkill 也会 Access denied**，只能页面内 `.click()`；截图用 DPI-aware 的 CopyFromScreen（先 `SetProcessDPIAware()`，否则只截到左上角 1707×1556）。
> - **Host 改动仍未重启生效**：本次跑的双屏用的是旧 Host（无 source/seq），所以「副窗切会话→主窗跟随」只用 `_probe/server.cjs` 的 stub Host 验证过客户端逻辑（flow seed → prompt publish → flow re-stamp，seq 1→2→3 正确）。重启 DSH 后需要再点一次双屏确认。

# 交接提示词：华硕duo系列窗口优化（dsh-dualscreen）

> **2026-11-17 桌面双屏 Edge 方案已整体回滚，先读这段：**
> - 曾试图由 Host 半边用 Edge app 模式在副屏开 prompt 窗；结果 Host 插件激活失败（`connection.rpc.handle()` 对插件必抛 `webServer without inject`，bundle row 又没声明 `inject`），更糟的是用 `plugin_manager set_bundle` 重载时把 profile 的 `dsh.profile.bundles` 改成只剩 `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`，桌面 app 欢迎页 `/api/settings/describe` 失败，直接启动崩溃。
> - 现已恢复：`index.js` 空实现、`cordis.patch.yml` 无 `inject`、客户端删掉所有 Edge/connection 代码；`C:\Users\15754\.dsh\profiles\desktop\package.json` 的 bundles 恢复为 base、web-app、dsh-smarthome、cot-translation、dsh-pet、dsh-dualscreen 六项。
> - 教训：① 不要用 `plugin_manager set_bundle` 来重载 Host 插件；② Host 代码改动只能重启 app；③ 桌面原生第二窗需要 shipped desktop API，插件层不要做。
> - 现在**标题栏「双屏」按钮已删除**（2026-11-17 用户放弃桌面双屏实验）；插件只保留自动/默认、右输左出、上下分栏，不再尝试打开第二个窗口。`?dshds=prompt` 的 prompt 角色代码还在，但没有入口。
>
> **2026-11-18 profile 又被 dsh-pet 0.4.9 更新改坏：** `dsh.profile.bundles` 丢了 `dsh-pet` 和 `dsh-dualscreen`，`node_modules\dsh-dualscreen` junction 又指回已移走的 `C:\DSWS\dsh-dualscreen`。已修复，并加了修复脚本 `C:\Users\15754\.dsh\repair-dsh-profile.ps1`（双击 `repair-dsh-profile.cmd`），备份在 `.dsh\backups`；基线快照 `profile-good-20261118-133837`。**dsh-pet 0.4.9 与 DSH 0.2.2-rc.3 不兼容，不要启用**；要宠物请装 0.3.x。以后任何插件管理器操作后先跑一次修复脚本，不要用 enable/disable 动 `dsh-dualscreen`。
>
> **2026-11-18 双窗口（原生副屏输入窗）已跑通并合并（v1.2.0）：** 用 pet 同款技术——Host 在 `index.js` 注册 `/dsh-ds-window` 路由，`ctx.connection.authenticatedUrl(ctx.webServer.getOrigin())` 拿带 token 的 Web GUI URL，spawn `~/.dsh/electron/electron.exe` + `helper/main.cjs`，在非主屏开一个正常 `BrowserWindow` 加载 `?dshds=prompt`。关键点：Electron 用 pet 下载的 43.3.0；spawn env 必须删除 `ELECTRON_RUN_AS_NODE`；helper 必须是 `.cjs`（包是 `type: module`）；`cordis.patch.yml` 行必须 `inject: [connection, webServer]`；客户端设置在 `client.js` 的 `SettingsSection`，fetch `/dsh-ds-window/open`。临时 POC bundle `dualscreen-window-poc` 已删除，profile 只剩 `dsh-dualscreen`。Electron 缺失时按钮报错，主窗布局不受影响；可用 `DSH_DS_ELECTRON_PATH` 覆盖路径。重启 DSH 后测试。
>
> **v1.2.0 形态补充：** 标题栏「双屏」按钮已恢复（`.dsd-titlebtn` / `.dsd-titleplate` / `--dsd-titlebtn-w`）。开 = 主窗 `role=flow` + Host `/open`；主窗 flow 隐藏 composer，并把 `[data-slot="root"] > *` 的首列（左侧栏 `sidebarCol`）格宽置 0、首子元素 display:none（`[data-width-handle]` 一并隐藏）；右侧栏保留 `--dsd-rightbar-w`。副窗 prompt 不再隐藏整个 `conversation.session`，改为隐藏 `[data-conversation-scroll]` 和 `[data-conversation-tabs]`，保留 `[data-slot="conversation.header"]`（标题）、左侧栏和 composer（含底部三处状态与模型选择）。客户端每 1.2s 查 `/status`，副窗被关→主窗 `resetDual()` 回自动；再点按钮 = `/close` + 恢复。
>
> **v1.2.0 双窗口（真实 DSH UI + 会话绑定）：** 手搓控制页无法做到侧栏/composer/按钮展开完全一致，已改回让副窗加载真实 DSH Web GUI 的 `?dshds=prompt` 视图（侧栏、composer、`+`/权限/模型及展开菜单原生一致；`[data-conversation-scroll]` 和 `[data-conversation-tabs]` 隐藏，`conversation.header`、侧栏、composer 保留）。主窗仍是唯一会话所有者：Host `index.js` 的 `/open` 用 `connection.authenticatedUrl(web.getOrigin())` + `dshds=prompt`，新增 `/session` GET/POST（内存 `lastSession`）；`client.js` 的 `NS + ': session sync'` 在 flow 侧发布主窗当前会话并轮询 Host、用 `ctx.get('uiWorkspace').openSession(id)` 跟随；prompt 侧先 GET Host 的会话开过去、之后发布自己侧栏切到的会话。`readRole()` 会把 URL 的 `dshds` 写进 sessionStorage，选会话重载后仍保持 prompt/flow。标题栏「双屏」按钮开主窗 flow + 副窗，关副窗或再点按钮回自动。改 Host 后必须重启 DSH，副窗关掉重开。

> 把下面整段复制到新会话即可。

---

## 任务

你接手一个**已经在用户机器上跑着**的 DeepSeek Harness（DSH）客户端插件，任务是继续完善它的「超宽屏 / 双屏」自适应布局。动手前先读：

- `C:\Users\15754\.dsh\plugins\asus-duo-window\client.js` —— 全部客户端逻辑（CSS 模板字符串 + 形态引擎 + React 组件），约 1200 行
- `C:\Users\15754\.dsh\plugins\asus-duo-window\package.json`、`index.js`、`locale\zh.json`、`README.md`
- `C:\Users\15754\.dsh\plugins\asus-duo-window\HANDOFF.md` —— 若存在，是本文件的副本

## 环境

- 机器：华硕 ROG 双屏（冰刃7）。主屏 `DISPLAY1`（系统报 1707×1067），副屏 `DISPLAY5`（2560×734，物理 2560×1100 @150%）。
- DSH 桌面版（Electron）窗口停在副屏：物理 2582×756 = **CSS 2560×732**，比例 3.4。
- 插件以 `link:C:/DSWS/dsh-dualscreen` 装在 `%USERPROFILE%\.dsh\profiles\desktop`，已加入 `dsh.profile.bundles`，当前是**启用**状态。
- 改完文件客户端 bundle 约 0.5 秒热重载，不用重启；但**冷启动路径有历史坑**（见下）。

## 四种形态

| # | 名称 | 说明 |
|---|---|---|
| ① | default | 完全不干预：`<html>` 上没有 `data-ds-mode` 时所有规则不生效 |
| ② | secondary | **左对话、右输入**，自动按宽高比触发 |
| ③ | span | 主屏用：保留会话头，输入框占下方 734 物理像素（CSS = 734 / dpr） |
| — | flow / prompt | 旧双屏协同（标题按钮已删除，无入口，不再维护） |

形态按**窗口宽高比**自动触发，不用绝对像素：`ratio ≥ 2.2 → secondary`（覆盖 21:9 带鱼屏）；`0.85–1.18 → span`；其余 `default`。**双屏协同（flow/prompt）已放弃**：标题按钮删除后没有入口，不参与自动判定，也不在设置列表里。
偏好存 `localStorage['dsh.dualscreen.prefs.v1'] = { mode, split }`，双屏角色存 sessionStorage。

## 已实现的机制（先理解，别推翻）

- secondary 下 `[data-conversation-scroll]` 是**两列 grid**：`minmax(0,1fr) var(--dsd-panel-eff)`。**外层 `[data-conversation-scroll]` 必须保持唯一滚动容器**：shipped 的 `ChatView` 用 `list.closest('[data-conversation-scroll]')` 解析滚动容器，回合导航（点击跳转 / 活动回合 / 跟随底部）全走它。把内层 `.scroll` 变成滚动容器 = 导航只对一个不滚动的元素操作，点击静默失效。
  - composer seat 作为第 2 列、留在文档流内，用 `position: sticky` 钉住：`top = band + headerH`，`height = band-h − band − headerH`。**不要改回 `position: fixed`**（脱离流会让 shell 的高度测量失真），也不要让内层 `.scroll` 自己滚。
  - grid 行最小高度是 `--dsd-band-h`（= 滚动体 clientHeight）；sticky 的容纳块是该行，短对话没有这个下限时面板没有向下滑的余量，会被标题栏压住。
  - 第 1 列（`[data-slot="conversation.session"] > *`）**不能 `overflow: hidden`**：它会成为导航 slot 的 sticky 容器，导航会随内容被拖出屏幕。
- **secondary** 下对话列整体上抬 `--dsd-band`（= 标题带 40px），会话头用 `position: fixed` 停在输入列上方，输入列从 `band + headerH` 开始。**span 不做上抬**：它保留 shipped 会话头（标题/页签），列从标题带下面正常开始；之前把 span 也上抬并 `display:none` 掉会话头，导致上下分栏没有标题栏。
- 外层滚动体的滚动条槽（`scrollbar-gutter: stable`，5px）会收窄 grid 内容盒；`measure()` 写 `--dsd-gutter`，标题栏 `right` 加上它才和分隔线对齐。
- `measure()` 把几何写进 `<html>` 的 CSS 变量：`--dsd-band`、`--dsd-header-h`、`--dsd-panel-eff`、`--dsd-sidebar-w`、`--dsd-divider-x`、`--dsd-menu-end`、`--dsd-band-h`、`--dsd-gutter`、`data-dsd-rail`。
- span（③）：composer 高度 = **734 物理像素 / dpr**（`--dsd-span-composer`），`box-sizing: border-box` 把分隔线算进去；seat 上 28px / 下 14px padding，输入卡不贴分隔线；seat 用不透明 `--dsw-alias-bg-base` 盖住从下方滚过的正文（shipped 的 seat 背景是透明渐变）；滚动体 `overflow-x: clip` 干掉 transcript 偶发横向溢出带出的横向滚动条（它会偷 4px 并把输入区顶高）。右侧栏是**浮层**（`[data-rightbar-col]` 宽度 0、`[data-sidebar-right-panel]` 绝对定位全高），span 下把 panel 高度截到 `100dvh - span-composer - band`，只占主屏那 1600 物理像素，不压住输入带。
- **形态值放在 store（`ui.mode`）**，driver 每轮算完写回。resize 必须能推动 React 重渲染——否则冷启动时 overlay 一个元素都不渲染（"重启后拖动消失"的真因）。
- 组件里读 UI 状态必须 `const ui = useStore(api.ui)`。`ui` 只在 `apply()` 里定义，模块级组件直接引用会 `ReferenceError`，被 slot 的错误边界吞成**空白面板**——设置页/侧栏按钮空白就是这个原因。
- `role` store 存的是裸字符串，必须 `store.set(() => next)`；直接 `store.set('flow')` 会被 `createStore` 当成对象 patch，展开成 `{0:'f',1:'l',...}`，`resolveMode` 永远匹配不到 flow/prompt——双屏协同设置后没反应的根因。
- `.dsd-split` 分隔条手柄：不可见、`left: var(--dsd-divider-x)`、宽 20px、**全部在输入面板一侧**（对话列右缘就是它的滚动条，手柄往左伸会压住滚动条）、`cursor: col-resize`。拖动时直接写 `--dsd-panel-eff` 并 `setPointerCapture`，松手才落 localStorage。
- `.dsd-dragstrip` 用 `-webkit-app-region: drag` 把标题带还给窗口拖动：左边界 `max(侧栏宽, 菜单按钮右边界)`，右边界停在分隔线左侧 24px。
- 标题栏「双屏」按钮及其 `.dsd-titlebtn`/`.dsd-titleplate`、测量变量、设置里的 `dualHintShort` 提示已于 2026-11-17 删除。不要再加回来；双屏实验已经放弃。
- 旧双屏协同的浏览器 popup / 桌面手动副窗代码仍留在 `api` 里（`openPromptWindow`/`resetDual`/Pill），但标题按钮删除后已无入口，不再维护；不要把窗口逻辑加回来。
- 桌面壳改不了：`lib/main.js` 只创建一个 `mainWindow`，`requestSingleInstanceLock` 第二次启动只 `focusOwner()`，页面 `window.open` 被 `setWindowOpenHandler` 全部 deny，preload 也没有 screen/window API。Host 的 `ready` 消息里虽然带 `authenticatedUrl`，但只到 main 进程（`hostUrl`/`hostCookie`），没有暴露给 renderer，所以客户端无法自己拼出带 token 的手动 URL——这是 B 只能手动开窗的原因。
- **旧 Edge 方案踩坑记录（已弃用，不要再走）：** Host `index.js` 曾用 `connection.rpc.handle()` 暴露 `openEdge/closeEdge/edgeStatus`，再用 Edge `--app --guest` 拉副窗。它有两个必炸点：① 这个 Loader 只认 `cordis.patch.yml` **行上**的 `inject`，模块里的 `export const inject` 不进入 fiber；行必须写 `inject: [connection, webServer]`，否则 `ctx.get('webServer')` 直接抛 `cannot get property "webServer" without inject`，整行 failed，客户端只看到 `HTTP 405`。② `connection.rpc.handle()` 的 `owner` 是 connection 服务自己的 ctx（只 inject 了 credentials），`owner.webServer.register` 必炸；就算改用 `connection.rpc.intercept('/api', ...)` 能注册，也别再碰。更严重的是当时用 `plugin_manager set_bundle` 重载，把 profile 的 `dsh.profile.bundles` 改成只剩 base+web-app，桌面 app 欢迎页 `/api/settings/describe` 失败、启动崩溃。**Host 代码改动只能重启 app，且不要用 plugin_manager 的 bundle 开关做重载。**
- 上下分栏的原图 lightbox：portal 到 body 的 `[role="dialog"][aria-modal="true"]`，stage 是其中带直接 `<img>` 的 `> div`。用 `html[data-ds-mode="span"] body > [role="dialog"][aria-modal="true"]:has(> div > img) > div:has(> img) { bottom: calc(var(--dsd-span-composer, 0px) + 40px) !important; }` 把预览中心压到上 1600 物理像素；不要给 backdrop 的 mask 兄弟加 bottom，否则下半屏不再变暗。
- 浮动 Pill 只在 flow 出现（布局 / 退出）；prompt 副窗和 span 都没有气泡，避免压住输入区状态行。
- 侧栏收起（`--dsd-sidebar-w < 120`）时：**secondary** 才渲染 `.dsd-cornerplate`（给 ⊞/⊕ 垫底色）；它 `pointer-events: none`，不能带 `-webkit-app-region`。菜单栏底板走 CSS：`html[data-ds-mode][data-dsd-rail="1"] [data-windows-menu]`。
- **span 不渲染这两块垫板**，并用更高优先级的规则把 `[data-windows-menu]` 的 rail 底板重置成透明/无边框/无 padding——span 恢复了会话头，标题带下面就是 header，不再悬浮在滚动正文上。
- **回合导航是 shipped 组件，不要重绘它。** 只做了两件事让它可见：① 给它的 slot 加 `container-type: normal`，绕开 shipped 的 `@container (max-width:900px){ .frame { display: none } }`；② **不要**在 `.frame` 的子元素那层加 `overflow: hidden`（会裁掉高度为 0 的导航 slot）。

## 回合导航（已解决）

真因：导航把最近的外层 `[data-conversation-scroll]` 当滚动容器，而旧实现让内层 `.scroll` 真滚动，于是 `scrollTop` 永远写不进去、`activeTurn` 也收不到滚动事件。

现方案（用户选的 C，**不摘 `data-conversation-scroll`、不动 shipped 代码**）：外层恢复滚动，输入列 sticky。点击跳转已用 `TurnNavigator` 的 `onNavigate` 直接验证：`scrollTop 1800 → 0`，面板 `top` 保持 128；滚动中面板/标题栏都不动。

- **B 方案（未采纳）**：用 MutationObserver 摘掉 `[data-conversation-scroll]`，让聊天视图自己接管滚动。用户明确要求「能不动原版就不动原版」，而且 ChatView 的 `attach()` 只在挂载时解析一次滚动容器，热切换会留下旧绑定。
- 残留：本次测试会话在切换/重载后 shipped 的 TurnNavigator 虚拟化没有渲染 mark（`marks` 容器高度 = 总高、`scrollRect.height = 0`），这是组件自身的挂载竞态，**与布局无关**（默认形态下同样复现）；因此悬停预览未能在本机再验一次，交付后请用户点一下确认。

## 硬约束

1. **不改 shipped 代码**，只能 overlay：`data-*` 属性、CSS 变量、结构选择器（`:has()`、`> *`、属性选择器）。
2. **不要为了凑交互去改布局**。
3. 外观必须和原版一致：不新增面板/看板，不重绘 shipped 组件；不再新增任何标题栏控件（旧「双屏」按钮已于 2026-11-17 删除）。
4. 输入框在右、对话在左。
5. 不要碰 hashed class 名（`V4vHZW_xxx` 这种）。

## 排错方法（踩过的坑）

- 改文件用 **node 脚本**，别用 PowerShell 的 `-replace`（CRLF 多行替换会静默失败）。
- CSS 活在 JS 模板字符串里：**注释和代码里都不能出现反引号**，否则整个插件语法错误、直接加载失败。
- `inset: auto` 写在 `top:` 之后会把 sticky 偏移清成 `auto`。
- 截图：**全屏 `CopyFromScreen`（VirtualScreen）在当前环境可用**，能抓到跨主/副屏的窗口（2560×2334），截完裁底部就能看 span 形态；`PrintWindow` 仍然拿不到 Chromium 合成层，若某次全屏也白，就退回 `document.title` 探针 + `GetWindowTextW`。
- 系统级合成鼠标（`SetCursorPos` / `mouse_event`）到不了应用；但**页面内 `el.click()` / `new PointerEvent('pointermove', {bubbles:true})` 可以**触发 React 处理器，点击跳转和悬停预览都能这样测。
- 插件以 link 方式安装，改 `client.js` 约 1 秒热重载；改完先在外面用 `new Function(src)` 做语法检查，再等 HMR。
- 需要整页重载时用一次性 `sessionStorage` guard 包住 `location.reload()`，否则 HMR + 重载会循环。
- 定位问题优先在页面内打探针：`getBoundingClientRect`、`getComputedStyle`、`elementFromPoint`；React 状态可以从 DOM 的 `__reactFiber$*` 一路向上读 hook（`useChatScroll` 返回值里有 `initialized` / `followingTail`，TurnNavigator 的 props 里有 `items` / `onNavigate`）——一次读数能省掉好几轮猜测。

## 你的第一步

通读 `client.js` 的 CSS 段（约 100–640 行）和 `apply()` 里的 `measure()` / 形态 driver。回合导航已按 C 方案修好（外层滚动 + 面板 sticky），先让用户确认点击跳转 / 悬停预览 / 发消息后自动到底这三点，再问"现在想调整哪一块"，**不要主动重构**。
