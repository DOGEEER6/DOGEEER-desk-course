import { motion, AnimatePresence } from 'framer-motion'
import { useApp } from '../store'
import { colorOf } from '../lib/palette'
import { humanLeft, pad2, parseHM } from '../lib/time'
import { Icon, springSoft } from './ui'
import { findCurrentClass, useTodayClasses, type UpcomingClass } from '../hooks'

export function TodayHero({ now, onOpenCourse }: { now: Date; onOpenCourse: (id: string) => void }) {
  const courses = useApp((s) => s.courses)
  const { list, week } = useTodayClasses(now)
  const current = findCurrentClass(list, now)
  const upcoming = list.find((x) => x.start.getTime() > now.getTime()) ?? null

  const shown = current ?? upcoming
  const course = shown ? courses.find((c) => c.id === shown.courseId) : undefined
  const color = course ? colorOf(course.color) : colorOf(0)

  // 今天的课程总时长
  const totalMinutes = list.reduce((acc, x) => acc + (x.end.getTime() - x.start.getTime()) / 60000, 0)

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      {/* 主卡片：正在上课 / 下一节课 */}
      <motion.div
        layout
        transition={springSoft}
        className="relative overflow-hidden rounded-[24px] p-5"
        style={{
          background: shown
            ? `linear-gradient(145deg, ${color.from}, ${color.to} 60%, #ffffff)`
            : 'linear-gradient(145deg, #f3f6fc, #e9eefb)',
          border: `1px solid ${shown ? color.ring : 'rgba(15,23,42,0.07)'}`,
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-wider" style={{ color: shown ? color.text : '#6b7688' }}>
              {current ? (
                <>
                  <span className="live-dot inline-block h-2 w-2 rounded-full bg-[#FF3B30]" />
                  正在上课
                </>
              ) : (
                <>
                  <Icon name="sun" size={13} />
                  下一节课
                </>
              )}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={shown?.courseId ?? 'none'}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.26 }}
              >
                <div
                  className="mt-1.5 truncate text-[26px] font-bold leading-[1.15] tracking-[-0.03em]"
                  style={{ color: shown ? color.text : '#0b1220' }}
                >
                  {shown ? shown.name : '今天没有课'}
                </div>
                {shown ? (
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] font-medium" style={{ color: color.text, opacity: 0.8 }}>
                    <span className="tabular flex items-center gap-1.5">
                      <Icon name="clock" size={13} />
                      {pad2(shown.start.getHours())}:{pad2(shown.start.getMinutes())} – {pad2(shown.end.getHours())}:
                      {pad2(shown.end.getMinutes())}
                    </span>
                    {shown.room && (
                      <span className="flex items-center gap-1.5">
                        <Icon name="pin" size={13} />
                        {shown.room}
                      </span>
                    )}
                    {shown.teacher && (
                      <span className="flex items-center gap-1.5">
                        <Icon name="user" size={13} />
                        {shown.teacher}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 text-[12.5px] text-ink-3">好好休息，或者提前做点作业</div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* 倒计时 */}
          <div className="flex flex-none flex-col items-end">
            {shown ? (
              <Countdown now={now} target={current ? shown.end : shown.start} label={current ? '距离下课' : '距离上课'} tone={current ? 'live' : 'soon'} />
            ) : (
              <div className="text-right">
                <div className="tabular text-[30px] font-bold leading-none text-ink-3">
                  {pad2(now.getHours())}:{pad2(now.getMinutes())}
                </div>
                <div className="mt-1 text-[11px] text-ink-4">第 {week} 教学周</div>
              </div>
            )}
          </div>
        </div>

        {shown && (
          <div className="mt-4 flex items-center gap-2">
            <button className="btn h-8 bg-white/80 px-3 text-[12px] font-semibold" style={{ color: color.text }} onClick={() => onOpenCourse(shown.courseId)}>
              <Icon name="note" size={13} />
              课程详情
            </button>
            {current && (
              <div className="flex-1">
                <ProgressBar now={now} from={current.start} to={current.end} color={color.solid} />
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* 今日课程条 */}
      <div className="flex items-center gap-2">
        <div className="text-[11.5px] font-semibold text-ink-3">
          今天 {list.length} 节课
          <span className="ml-1.5 font-normal text-ink-4">
            · 共 {Math.round(totalMinutes / 60)} 小时 {totalMinutes % 60} 分
          </span>
        </div>
        <div className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto">
          {list.map((x) => {
            const c = courses.find((cc) => cc.id === x.courseId)
            const col = colorOf(c?.color ?? 0)
            const active = current?.sessionId === x.sessionId
            const past = x.end.getTime() < now.getTime()
            return (
              <button
                key={x.sessionId}
                onClick={() => onOpenCourse(x.courseId)}
                className="flex-none rounded-xl px-2.5 py-1.5 text-left transition-transform hover:scale-[1.03]"
                style={{
                  background: active ? col.solid : col.from,
                  color: active ? '#fff' : col.text,
                  opacity: past && !active ? 0.5 : 1,
                  border: `1px solid ${active ? 'transparent' : col.ring}`,
                }}
              >
                <div className="tabular text-[10.5px] font-bold opacity-80">
                  {pad2(x.start.getHours())}:{pad2(x.start.getMinutes())}
                </div>
                <div className="max-w-[92px] truncate text-[11.5px] font-semibold">{x.name}</div>
              </button>
            )
          })}
          {list.length === 0 && (
            <div className="rounded-xl bg-slate-900/[0.035] px-3 py-1.5 text-[11.5px] text-ink-4">今天无课</div>
          )}
        </div>
      </div>
    </div>
  )
}

function Countdown({
  now,
  target,
  label,
  tone,
}: {
  now: Date
  target: Date
  label: string
  tone: 'live' | 'soon'
}) {
  const ms = target.getTime() - now.getTime()
  const abs = Math.max(0, ms)
  const h = Math.floor(abs / 3600000)
  const m = Math.floor((abs % 3600000) / 60000)
  const s = Math.floor((abs % 60000) / 1000)
  return (
    <div className="text-right">
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-4">{label}</div>
      <div
        className="tabular text-[30px] font-bold leading-none tracking-[-0.02em]"
        style={{ color: tone === 'live' ? '#FF3B30' : '#0A84FF' }}
      >
        {h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`}
      </div>
      <div className="mt-1 text-[11px] text-ink-4">{humanLeft(ms)}</div>
    </div>
  )
}

function ProgressBar({ now, from, to, color }: { now: Date; from: Date; to: Date; color: string }) {
  const total = to.getTime() - from.getTime()
  const done = Math.min(1, Math.max(0, (now.getTime() - from.getTime()) / Math.max(1, total)))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.65)' }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={false}
        animate={{ width: `${done * 100}%` }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  )
}

/** 供“今日”页面复用 */
export function TodayList({ now, onOpenCourse }: { now: Date; onOpenCourse: (id: string) => void }) {
  const courses = useApp((s) => s.courses)
  const periods = useApp((s) => s.periods)
  const { list, week } = useTodayClasses(now)
  const current = findCurrentClass(list, now)

  const slots = periods.map((p) => {
    const item = list.find((x) => x.startPeriod === p.index) ?? list.find((x) => p.index >= x.startPeriod && p.index <= x.endPeriod)
    return { p, item, isStart: item?.startPeriod === p.index }
  })

  return (
    <div className="scroll-y min-h-0 flex-1 pr-1">
      <div className="mb-3 text-[12.5px] text-ink-3">
        第 {week} 教学周 · {list.length} 节课
        {current && <span className="ml-2 font-semibold text-[#FF3B30]">正在上课：{current.name}</span>}
      </div>
      <div className="space-y-1.5">
        {slots.map(({ p, item, isStart }) => {
          const c = item ? courses.find((cc) => cc.id === item.courseId) : undefined
          const col = colorOf(c?.color ?? 0)
          const active = current && item && current.sessionId === item.sessionId
          const past = item ? item.end.getTime() < now.getTime() : false
          const nowMin = now.getHours() * 60 + now.getMinutes()
          const isNow = nowMin >= parseHM(p.start) && nowMin <= parseHM(p.end)
          return (
            <div
              key={p.index}
              className="flex items-stretch gap-3"
              style={{ opacity: past && !active ? 0.5 : 1 }}
            >
              <div className="w-[62px] flex-none pt-2 text-right">
                <div className="tabular text-[12.5px] font-bold text-ink-2">{p.index}</div>
                <div className="tabular text-[10px] leading-4 text-ink-4">{p.start}</div>
                <div className="tabular text-[10px] leading-4 text-ink-4">{p.end}</div>
              </div>
              {item && isStart ? (
                <button
                  onClick={() => onOpenCourse(item.courseId)}
                  className="flex-1 rounded-2xl border p-3 text-left transition-transform hover:scale-[1.005]"
                  style={{
                    background: active ? col.solid : `linear-gradient(150deg, ${col.from}, ${col.to})`,
                    borderColor: active ? 'transparent' : col.ring,
                    color: active ? '#fff' : col.text,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-bold">{item.name}</span>
                    {active && (
                      <span className="rounded-full bg-white/25 px-2 py-[1px] text-[10.5px] font-bold">进行中</span>
                    )}
                    {isNow && !active && (
                      <span className="rounded-full bg-black/10 px-2 py-[1px] text-[10.5px] font-bold">本时段</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] opacity-80">
                    <span>{item.startPeriod === item.endPeriod ? `第 ${item.startPeriod} 节` : `第 ${item.startPeriod}-${item.endPeriod} 节`}</span>
                    {item.room && <span>{item.room}</span>}
                    {item.teacher && <span>{item.teacher}</span>}
                  </div>
                </button>
              ) : (
                <div className="flex-1 rounded-2xl border border-dashed border-transparent bg-slate-900/[0.02] py-2" />
              )}
            </div>
          )
        })}
      </div>

      {list.length === 0 && (
        <div className="mt-8 text-center text-[12.5px] text-ink-4">今天没有排课，好好休息</div>
      )}
    </div>
  )
}

export type { UpcomingClass }
