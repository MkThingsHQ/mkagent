import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, Circle, CircleCheck } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { Spinner } from '../../ui/LoadingIndicator'
import type { TodoItem, TodoStatus } from '../TurnCard'
import { ROW_ICON_SLOT, SIZE_CONFIG, WORK_LOG_BODY } from './turn-classes'
import { useRowReveal } from './use-row-reveal'

/** Status icon for a todo item - accent check for completed */
function TodoStatusIcon({ status }: { status: TodoStatus }) {
  switch (status) {
    case 'pending':
      return <Circle aria-hidden className={cn(SIZE_CONFIG.iconSize, 'text-tertiary')} />
    case 'in_progress':
      return <Spinner className={cn(SIZE_CONFIG.spinnerSize, 'text-accent')} />
    case 'completed':
      return <CircleCheck aria-hidden className={cn(SIZE_CONFIG.iconSize, 'text-accent')} />
    case 'interrupted':
      return <Ban aria-hidden className={cn(SIZE_CONFIG.iconSize, 'text-tertiary')} />
  }
}

/** Single todo row - styled like an activity row */
function TodoRow({ todo, className, style }: { todo: TodoItem; className?: string; style?: React.CSSProperties }) {
  const displayText = todo.status === 'in_progress' && todo.activeForm ? todo.activeForm : todo.content
  const isDone = todo.status === 'completed'
  return (
    <div className={cn('flex min-h-7 min-w-0 items-center gap-2 text-label text-secondary', className)} style={style}>
      <span className={ROW_ICON_SLOT}>
        <TodoStatusIcon status={todo.status} />
      </span>
      <span className={cn('min-w-0 flex-1 truncate', isDone && 'text-tertiary line-through')}>{displayText}</span>
    </div>
  )
}

/**
 * TodoList - the current TodoWrite state, under the same inset hairline as the work log rows.
 */
export function TodoList({ todos, animateInserts }: { todos: TodoItem[]; animateInserts: boolean }) {
  const { t } = useTranslation()
  const rowReveal = useRowReveal(todos.length, animateInserts)
  if (todos.length === 0) return null

  return (
    <div className={cn(WORK_LOG_BODY, 'mt-1 pb-1')}>
      <div className="flex min-h-7 items-center text-label-sm font-medium text-tertiary">{t('turnCard.todoList')}</div>
      {todos.map((todo, index) => (
        <TodoRow key={`${todo.content}-${index}`} todo={todo} {...rowReveal(index)} />
      ))}
    </div>
  )
}
