/**
 * 番茄钟状态机的单元测试（纯函数）：
 *   node test/pomodoro.test.mjs
 */
import { remainingMs, nextPhase, durations, phaseDuration } from '../lib/index.js'

const OPTS = { focusMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, roundsBeforeLongBreak: 4, autoStartNext: false }

let failed = 0
function check(name, actual, expected) {
  const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v))
  const ok = show(actual) === show(expected)
  if (!ok) failed += 1
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    期望 ${show(expected)}\n    实际 ${show(actual)}`}`)
}

// --- 时长 ---
check('默认时长（毫秒）', durations({}, OPTS), { focus: 1500000, break: 300000, longBreak: 900000 })
check('用户改过的优先', durations({ focusMinutes: 50 }, OPTS).focus, 3000000)
check('非法时长回落到配置', durations({ focusMinutes: -3 }, OPTS).focus, 1500000)
check('idle 阶段的时长算专注', phaseDuration({ phase: 'idle' }, OPTS), 1500000)

// --- 剩余时间：核心是"只靠 endsAt，不需要 tick" ---
const NOW = 1_700_000_000_000
check('运行中按 endsAt 算', remainingMs({ running: true, endsAt: NOW + 90_000, phase: 'focus' }, OPTS, NOW), 90000)
check('已经过点了给 0（不给负数）', remainingMs({ running: true, endsAt: NOW - 5000, phase: 'focus' }, OPTS, NOW), 0)
check('暂停看 remainingMs', remainingMs({ running: false, remainingMs: 12345, phase: 'focus' }, OPTS, NOW), 12345)
check('空闲给整段', remainingMs({ running: false, phase: 'break' }, OPTS, NOW), 300000)

// --- 阶段推进 ---
check('专注后进短休', nextPhase({ phase: 'focus', round: 0 }, OPTS), { phase: 'break', round: 1 })
check('第 4 个专注后进长休', nextPhase({ phase: 'focus', round: 3 }, OPTS), { phase: 'longBreak', round: 4 })
check('第 8 个专注后又进长休', nextPhase({ phase: 'focus', round: 7 }, OPTS), { phase: 'longBreak', round: 8 })
check('休息后回专注且轮次不变', nextPhase({ phase: 'break', round: 2 }, OPTS), { phase: 'focus', round: 2 })
check('长休后也回专注', nextPhase({ phase: 'longBreak', round: 4 }, OPTS), { phase: 'focus', round: 4 })

// --- 边界：roundsBeforeLongBreak = 0 时不做长休 ---
check('关掉长休就一直是短休', nextPhase({ phase: 'focus', round: 3 }, { ...OPTS, roundsBeforeLongBreak: 0 }), { phase: 'break', round: 4 })

console.log(failed ? `\n${failed} 项失败` : '\n全部通过')
process.exit(failed ? 1 : 0)
