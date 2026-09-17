export interface Task {
  readonly done: boolean
  readonly text: string
}

export interface TaskProgress {
  readonly done: number
  readonly total: number
}

const TASK_LINE = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s?(.*)$/u

const parseLine = (line: string): Task => {
  const match = TASK_LINE.exec(line)

  return match === null
    ? { done: false, text: line.trim() }
    : { done: match[1] !== ' ', text: match[2] ?? '' }
}

export const parseTasks = (body: string): readonly Task[] =>
  body
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map(parseLine)

export const serializeTasks = (tasks: readonly Task[]): string =>
  tasks
    .filter((task) => task.text.trim() !== '')
    .map((task) => `- [${task.done ? 'x' : ' '}] ${task.text.trim()}`)
    .join('\n')

export const taskProgress = (tasks: readonly Task[]): TaskProgress => ({
  done: tasks.filter((task) => task.done).length,
  total: tasks.length,
})
