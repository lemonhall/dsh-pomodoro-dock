/**
 * Client half of dsh-pomodoro-dock —— 右侧栏的「番茄闹钟」tab。
 *
 * 倒计时**不靠前端存时间**：只用宿主给的 endsAt（结束时刻）减当前时间，
 * 所以本地每 250ms 重画一下就够了，不担心和宿主走偏。每 5 秒跟宿主对一次表。
 * ⚠️ 整个模块包在 IIFE 里（DSH 把客户端插件拼成一个脚本，顶层 const 会撞名）。
 */

;(() => {
const TAB_KIND = 'pomodoro'
const TAB_ID = 'dsh-pomodoro-dock:pomodoro'
const ROUTE_STATE = '/dsh-pomodoro/state'

window.__ModuleLoader__.load({
  id: 'dsh-pomodoro-dock',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const C = {
      bg: 'var(--dsw-alias-bg-base)',
      border: 'var(--dsw-alias-border-l1)',
      text: 'var(--dsw-alias-label-primary)',
      dim: 'var(--dsw-alias-label-secondary)',
      accent: 'var(--dsw-alias-brand-primary, #5a7cff)',
      focus: '#ff6b5a',
      rest: '#3ddc84',
      mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    }

    const PHASE_TEXT = { idle: '空闲', focus: '专注', break: '短休息', longBreak: '长休息' }

    function fmtClock(ms) {
      const total = Math.max(0, Math.round(ms / 1000))
      return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
    }

    function PomodoroPanel() {
      const [view, setView] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [, forceTick] = React.useState(0)
      const viewRef = React.useRef(null)

      const post = React.useCallback((action, extra) => {
        setBusy(true)
        return fetch(ROUTE_STATE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action, ...(extra || {}) }),
        })
          .then((response) => response.json())
          .then((payload) => {
            if (payload && payload.ok) {
              setView(payload.view)
              viewRef.current = payload.view
            }
          })
          .catch(() => {})
          .finally(() => setBusy(false))
      }, [])

      React.useEffect(() => {
        let cancelled = false
        const load = () =>
          fetch(ROUTE_STATE)
            .then((response) => response.json())
            .then((payload) => {
              if (!cancelled && payload && payload.ok) {
                setView(payload.view)
                viewRef.current = payload.view
              }
            })
            .catch(() => {})
        load()
        const sync = setInterval(load, 5000)
        const tick = setInterval(() => forceTick((n) => n + 1), 250)
        return () => {
          cancelled = true
          clearInterval(sync)
          clearInterval(tick)
        }
      }, [])

      const current = view || { phase: 'idle', running: false, remainingMs: 1500000, durationMs: 1500000, completedToday: 0, round: 0, focusMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, history: [] }
      // 本地推算剩余：运行中 = endsAt - now；否则用宿主给的 remainingMs
      const remain = current.running && current.endsAt ? Math.max(0, current.endsAt - Date.now()) : current.remainingMs
      const total = current.durationMs || 1
      const progress = Math.max(0, Math.min(1, 1 - remain / total))
      const tone = current.phase === 'focus' ? C.focus : current.phase === 'idle' ? C.dim : C.rest

      const size = 168
      const stroke = 10
      const radius = (size - stroke) / 2
      const circumference = 2 * Math.PI * radius

      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', height: '100%', background: C.bg, color: C.text } },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px', borderBottom: `1px solid ${C.border}`, fontSize: 12 } },
          h('span', { style: { fontWeight: 600 } }, '🍅 番茄钟'),
          h('span', { style: { fontFamily: C.mono, fontSize: 10.5, color: C.dim } }, `今日 ${current.completedToday} 个`),
          h('span', { style: { marginLeft: 'auto', fontFamily: C.mono, fontSize: 10.5, color: tone } }, PHASE_TEXT[current.phase] || current.phase),
        ),
        h(
          'div',
          { style: { flex: '1 1 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 16 } },
          h(
            'svg',
            { width: size, height: size, viewBox: `0 0 ${size} ${size}`, style: { transform: 'rotate(-90deg)' } },
            h('circle', { cx: size / 2, cy: size / 2, r: radius, fill: 'none', stroke: `color-mix(in srgb, ${tone} 16%, transparent)`, strokeWidth: stroke }),
            h('circle', {
              cx: size / 2,
              cy: size / 2,
              r: radius,
              fill: 'none',
              stroke: tone,
              strokeWidth: stroke,
              strokeLinecap: 'round',
              strokeDasharray: circumference,
              strokeDashoffset: circumference * (1 - progress),
              style: { transition: 'stroke-dashoffset 240ms linear' },
            }),
          ),
          // 时间文字单独放（SVG 里排中文麻烦，且要正着显示）
          h(
            'div',
            { style: { marginTop: -size / 2 - 34, fontFamily: C.mono, fontSize: 34, letterSpacing: 1, color: C.text } },
            fmtClock(remain),
          ),
          h(
            'div',
            { style: { marginTop: size / 2 - 4, fontSize: 11, color: C.dim } },
            `${current.focusMinutes}/${current.breakMinutes}/${current.longBreakMinutes} 分钟 · 专注/短休/长休`,
          ),
          // 本轮四个点
          h(
            'div',
            { style: { display: 'flex', gap: 6 } },
            Array.from({ length: 4 }, (_, index) =>
              h('span', {
                key: index,
                style: {
                  width: 8,
                  height: 8,
                  borderRadius: 8,
                  background: index < (current.round % 4 || (current.round && current.round % 4 === 0 ? 4 : 0)) ? tone : `color-mix(in srgb, ${tone} 20%, transparent)`,
                },
              }),
            ),
          ),
          h(
            'div',
            { style: { display: 'flex', gap: 8 } },
            current.running
              ? h('button', { type: 'button', onClick: () => post('pause'), style: button(tone) }, '暂停')
              : h('button', { type: 'button', onClick: () => post('resume'), style: button(tone) }, current.phase === 'idle' ? '开始专注' : '继续'),
            h('button', { type: 'button', onClick: () => post('skip'), style: button('transparent') }, '跳过'),
            h('button', { type: 'button', onClick: () => post('reset'), style: button('transparent') }, '重置'),
          ),
          busy ? h('div', { style: { fontSize: 10, color: C.dim } }, '…') : null,
        ),
        current.history && current.history.length
          ? h(
              'div',
              { style: { flex: 'none', borderTop: `1px solid ${C.border}`, padding: '6px 12px', fontSize: 10.5, color: C.dim, fontFamily: C.mono } },
              current.history
                .slice(0, 4)
                .map((row) => `${PHASE_TEXT[row.phase] || row.phase} ${row.minutes}分`)
                .join(' · '),
            )
          : null,
      )
    }

    function button(tint) {
      const isAccent = tint !== 'transparent'
      return {
        border: `1px solid ${isAccent ? tint : C.border}`,
        background: isAccent ? `color-mix(in srgb, ${tint} 22%, transparent)` : 'transparent',
        color: isAccent ? C.text : C.dim,
        borderRadius: 8,
        fontSize: 12.5,
        padding: '5px 14px',
        cursor: 'pointer',
      }
    }

    function PomodoroBody() {
      return h(PomodoroPanel)
    }

    function PomodoroTitle() {
      return h(
        'span',
        { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
        h('span', { 'aria-hidden': 'true' }, '🍅'),
        h('span', null, '番茄钟'),
      )
    }

    const inject = ['slots', 'sidebarRightTabs']

    function apply(ctx) {
      ctx.inject(['sidebarRightTabs'], (scoped) => {
        scoped.sidebarRightTabs.register({
          id: TAB_ID,
          kind: TAB_KIND,
          priority: 'extension',
          title: () => '番茄钟',
          guide: [
            {
              id: TAB_KIND,
              kind: TAB_KIND,
              order: 120,
              title: () => '番茄闹钟',
              description: () => '专注 / 休息循环 · 宿主计时',
              icon: () => h('span', { style: { fontSize: 16 } }, '🍅'),
            },
          ],
        })
      })
      ctx.inject(['slots'], (scoped) => {
        scoped.slots.inject('sidebar.right.pane.tab', () =>
          scoped.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, PomodoroBody),
        )
        scoped.slots.inject('sidebar.right.pane.tab.title', () =>
          scoped.slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID }, PomodoroTitle),
        )
      })
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
})()
