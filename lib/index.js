/**
 * Host half of dsh-pomodoro-dock —— 番茄钟的宿主半。
 *
 * **计时只存 `endsAt`**（结束时刻的毫秒时间戳），不跑定时器：
 * 剩余时间 = endsAt - now，随时可算。好处是切 tab、关侧栏、重启应用都不影响准确度，
 * 也不会因为宿主闲着就走偏。暂停时把剩余毫秒存进 `remainingMs`，恢复时再换算成新的 endsAt。
 */

import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createStateStore } from './state.js'

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const DEFAULTS = {
  focusMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
  roundsBeforeLongBreak: 4,
  autoStartNext: false,
}

const ROUTE_STATE = '/dsh-pomodoro/state'

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const stateStore = createStateStore(join(DSH_HOME, 'dsh-pomodoro-dock', 'state.json'), {
  phase: 'idle', // idle | focus | break | longBreak
  running: false,
  endsAt: null, // 运行中：结束时刻
  remainingMs: null, // 暂停中：剩余毫秒
  round: 0, // 本轮循环里已完成几个专注
  completedToday: 0,
  dayKey: null, // completedToday 属于哪一天
  focusMinutes: null, // 用户改过的时长（null = 用配置）
  breakMinutes: null,
  longBreakMinutes: null,
  history: [], // [{ phase, minutes, at }] 最近若干次完成的记录
})

function sendJson(res, status, payload) {
  try {
    const body = JSON.stringify(payload)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(body),
    })
    res.end(body)
  } catch {
    /* 连接已经断了 */
  }
}

export function dateKey(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now())
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 各阶段时长（毫秒）；用户改过就用用户的。 */
export function durations(state, opts) {
  const minutes = (value, fallback) => {
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? n : fallback
  }
  return {
    focus: minutes(state.focusMinutes, opts.focusMinutes) * 60000,
    break: minutes(state.breakMinutes, opts.breakMinutes) * 60000,
    longBreak: minutes(state.longBreakMinutes, opts.longBreakMinutes) * 60000,
  }
}

export function phaseDuration(state, opts) {
  const d = durations(state, opts)
  if (state.phase === 'focus') return d.focus
  if (state.phase === 'longBreak') return d.longBreak
  if (state.phase === 'break') return d.break
  return d.focus
}

/** 剩余毫秒（运行中按 endsAt 算，暂停看 remainingMs，空闲给整段）。 */
export function remainingMs(state, opts, now = Date.now()) {
  if (state.running && Number(state.endsAt)) return Math.max(0, Number(state.endsAt) - now)
  if (Number(state.remainingMs) > 0) return Number(state.remainingMs)
  return phaseDuration(state, opts)
}

/** 把一个阶段推进到下一个（专注 → 休息；休息 → 专注）。 */
export function nextPhase(state, opts) {
  if (state.phase === 'focus') {
    const round = (Number(state.round) || 0) + 1
    const needLong = Number(opts.roundsBeforeLongBreak) > 0 && round % Number(opts.roundsBeforeLongBreak) === 0
    return { phase: needLong ? 'longBreak' : 'break', round }
  }
  return { phase: 'focus', round: Number(state.round) || 0 }
}

/** 到点了就自动翻面（每次读状态时顺手推进，不需要定时器）。 */
function catchUp(state, opts, now = Date.now()) {
  if (!state.running || !Number(state.endsAt)) return state
  if (Number(state.endsAt) > now) return state
  const today = dateKey(now)
  const finished = state.phase
  const minutes = Math.round(phaseDuration(state, opts) / 60000)
  const next = nextPhase(state, opts)
  const completed =
    finished === 'focus'
      ? (state.dayKey === today ? Number(state.completedToday) || 0 : 0) + 1
      : Number(state.dayKey === today ? state.completedToday : 0) || 0
  const history = [{ phase: finished, minutes, at: now }, ...(state.history || [])].slice(0, 20)
  const duration = phaseDuration({ ...state, phase: next.phase }, opts)
  return {
    ...state,
    phase: next.phase,
    round: next.round,
    completedToday: completed,
    dayKey: today,
    history,
    endsAt: opts.autoStartNext ? now + duration : null,
    running: Boolean(opts.autoStartNext),
    remainingMs: opts.autoStartNext ? null : duration,
  }
}

function view(state, opts) {
  const now = Date.now()
  const current = catchUp(state, opts, now)
  return {
    phase: current.phase,
    running: current.running,
    endsAt: current.endsAt,
    remainingMs: remainingMs(current, opts, now),
    durationMs: phaseDuration(current, opts),
    round: current.round,
    completedToday: current.dayKey === dateKey(now) ? current.completedToday : 0,
    history: (current.history || []).slice(0, 8),
    focusMinutes: Number(current.focusMinutes) > 0 ? Number(current.focusMinutes) : opts.focusMinutes,
    breakMinutes: Number(current.breakMinutes) > 0 ? Number(current.breakMinutes) : opts.breakMinutes,
    longBreakMinutes: Number(current.longBreakMinutes) > 0 ? Number(current.longBreakMinutes) : opts.longBreakMinutes,
  }
}

const PHASE_TEXT = { idle: '空闲', focus: '专注', break: '短休息', longBreak: '长休息' }

/** Host plugin body. */
function apply(ctx, config) {
  const cfg = config && typeof config === 'object' ? config : {}
  const opts = { ...DEFAULTS, ...cfg }

  const apply_action = (action, args) => {
    const now = Date.now()
    const state = catchUp(stateStore.get(), opts, now)
    const d = durations(state, opts)
    switch (action) {
      case 'start': {
        const phase = ['focus', 'break', 'longBreak'].includes(String(args.phase || '')) ? String(args.phase) : state.phase === 'idle' ? 'focus' : state.phase
        const duration = phase === 'focus' ? d.focus : phase === 'longBreak' ? d.longBreak : d.break
        return stateStore.patch({ phase, running: true, endsAt: now + duration, remainingMs: null })
      }
      case 'pause':
        return state.running
          ? stateStore.patch({ running: false, endsAt: null, remainingMs: remainingMs(state, opts, now) })
          : state
      case 'resume':
        return state.running
          ? state
          : stateStore.patch({
              running: true,
              phase: state.phase === 'idle' ? 'focus' : state.phase,
              endsAt: now + (Number(state.remainingMs) > 0 ? Number(state.remainingMs) : d.focus),
              remainingMs: null,
            })
      case 'reset':
        return stateStore.patch({ phase: 'idle', running: false, endsAt: null, remainingMs: null })
      case 'skip': {
        const next = nextPhase(state, opts)
        const duration = next.phase === 'focus' ? d.focus : next.phase === 'longBreak' ? d.longBreak : d.break
        return stateStore.patch({ phase: next.phase, round: next.round, running: false, endsAt: null, remainingMs: duration })
      }
      case 'config': {
        const patch = {}
        for (const key of ['focusMinutes', 'breakMinutes', 'longBreakMinutes']) {
          const n = Number(args[key])
          if (Number.isFinite(n) && n > 0) patch[key] = Math.min(180, Math.round(n))
        }
        return stateStore.patch(patch)
      }
      default:
        return state
    }
  }

  ctx.inject(['tools'], (toolScoped) => {
    toolScoped.tools.register({
      name: 'pomodoro_panel',
      description:
        '读写 DSH 右侧栏「番茄闹钟」面板。计时在宿主侧（存 endsAt，切 tab 也不中断）。' +
        'action=status 看当前阶段与剩余时间；action=start 开始（可给 phase=focus|break|longBreak）；' +
        'action=pause/resume/reset/skip；action=config 改时长（focusMinutes/breakMinutes/longBreakMinutes）。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['status', 'start', 'pause', 'resume', 'reset', 'skip', 'config'], description: '要做的动作。' },
          phase: { type: 'string', enum: ['focus', 'break', 'longBreak'], description: 'start：从哪个阶段开始。' },
          focusMinutes: { type: 'number', description: 'config：专注时长（分钟）。' },
          breakMinutes: { type: 'number', description: 'config：短休息时长。' },
          longBreakMinutes: { type: 'number', description: 'config：长休息时长。' },
        },
        required: ['action'],
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
        render(_args, value) {
          return [{ type: 'text', text: String((value && value.value) || (value && value.text) || '') }]
        },
      },
      presentCall(args) {
        return { card: 'terminal', title: `pomodoro_panel ${String((args && args.action) || 'status')}`.trim() }
      },
      async execute(args) {
        const action = String((args && args.action) || 'status').toLowerCase()
        if (action !== 'status') apply_action(action, args || {})
        const v = view(stateStore.get(), opts)
        const rest = Math.max(0, Math.round(v.remainingMs / 1000))
        const mm = Math.floor(rest / 60)
        const ss = String(rest % 60).padStart(2, '0')
        return {
          text:
            `${PHASE_TEXT[v.phase] || v.phase}${v.running ? '（运行中）' : '（已暂停/未开始）'}  剩余 ${mm}:${ss}\n` +
            `今日完成 ${v.completedToday} 个专注 · 本轮第 ${v.round} 个 · 时长 ${v.focusMinutes}/${v.breakMinutes}/${v.longBreakMinutes} 分钟（专注/短休/长休）` +
            (v.history.length ? `\n最近：${v.history.slice(0, 3).map((row) => `${row.phase} ${row.minutes}分`).join(' · ')}` : ''),
        }
      },
    })
  })

  ctx.inject(['webServer'], (scoped) => {
    const disposers = []
    disposers.push(
      scoped.webServer.register({
        kind: 'exact',
        path: ROUTE_STATE,
        handler: (req, res) => {
          const method = String((req && req.method) || 'GET').toUpperCase()
          const headers = (req && req.headers) || {}
          if (String(headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') {
            res.statusCode = 403
            res.end()
            return
          }
          if (method === 'GET' || method === 'HEAD') {
            // 读的时候顺手推进一次（到点自动翻面），并把结果落盘
            const before = stateStore.get()
            const after = catchUp(before, opts)
            if (after !== before) stateStore.patch(after)
            sendJson(res, 200, { ok: true, now: Date.now(), view: view(stateStore.get(), opts), state: stateStore.get() })
            return
          }
          if (method === 'POST') {
            let raw = ''
            req.on('data', (chunk) => {
              raw += chunk
              if (raw.length > 256 * 1024) req.destroy()
            })
            req.on('end', () => {
              let body = {}
              try {
                body = raw.trim() ? JSON.parse(raw) : {}
              } catch {
                sendJson(res, 400, { ok: false, error: '请求体不是 JSON' })
                return
              }
              if (body.action) apply_action(String(body.action).toLowerCase(), body)
              sendJson(res, 200, { ok: true, now: Date.now(), view: view(stateStore.get(), opts) })
            })
            return
          }
          res.statusCode = 405
          res.end()
        },
      }),
    )

    ctx.on('dispose', () => {
      for (const off of disposers) {
        try {
          off()
        } catch {
          /* already gone */
        }
      }
    })
  })
}

export { apply, ROUTE_STATE, DEFAULTS }
