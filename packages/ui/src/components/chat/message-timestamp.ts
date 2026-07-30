/** Format a timestamp as YYYY-MM-DD HH:mm:ss in the user's local timezone. */
export function formatMessageTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number) => value.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
