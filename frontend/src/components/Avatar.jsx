// 사용자 캐릭터(이모지+색상) 아바타
export default function Avatar({ emoji, color, size = 28, fallback = '🙂' }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full flex-shrink-0 select-none"
      style={{
        width: size, height: size,
        background: color || '#3b82f6',
        fontSize: Math.round(size * 0.55),
        lineHeight: 1,
      }}
    >
      {emoji || fallback}
    </span>
  )
}
