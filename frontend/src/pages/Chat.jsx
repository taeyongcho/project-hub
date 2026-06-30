import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { io } from 'socket.io-client'
import { Hash, Send, Users as UsersIcon, MessageSquare, Smile, Sticker, Paperclip, FileText, Download, X } from 'lucide-react'
import dayjs from 'dayjs'
import api from '../api/client'
import useAuth from '../store/auth'

function dmChannel(a, b) {
  const [lo, hi] = [a, b].sort((x, y) => x - y)
  return `dm:${lo}-${hi}`
}

// 이모지 카테고리
const EMOJI_GROUPS = {
  '표정': ['😀','😁','😂','🤣','😊','😍','😘','😎','🤔','😅','😆','🙂','😉','😋','😜','🤩','🥳','😏','😢','😭','😤','😡','🥺','😴','🤗','🤐','😬','🙄','😱','🤯'],
  '제스처': ['👍','👎','👏','🙌','👋','🤙','✌️','🤞','👌','🤝','🙏','💪','👀','🫡','🤲','✋','🖐️','🤟'],
  '하트/기호': ['❤️','🧡','💛','💚','💙','💜','🖤','💯','🔥','✨','⭐','🎉','🎊','💡','✅','❌','❗','❓','⚡','💢','💤','💬'],
  '사물/음식': ['☕','🍕','🍔','🍻','🍺','🎂','🍰','🍩','🍙','🍜','🎁','💻','📱','📌','📎','🗂️','📈','📊','🚀','⏰'],
}

// 큰 스티커 (이모지만 있는 메시지는 크게 = 스티커)
const STICKERS = [
  '🎉','👍','❤️','😂','🔥','💯','🙏','👏','🚀','✅','💪','🥳','😎','🤝','☕','⭐',
  '💡','😴','🎊','👀','🫡','🆗','💢','😭','🤣','😍','🥰','😅','😱','🤯','🤔','😏',
  '🙌','🤙','✌️','👌','🤞','🫶','💖','💔','💀','👻','🤖','🎯','📌','📣','⏰','🍻',
  '🍕','🍔','🎂','🍰','🎁','💰','📈','📉','🐶','🐱','🦄','🌈','☀️','🌙','⚡','❄️',
  '🥹','🫠','😇','🤩','🥳','🤗','🙇','💁','🤷','🙆','🙅','💃','🕺','👑','🏆','🎮',
]

// 메시지가 이모지로만 이루어졌는지(=스티커) 판별
function isEmojiOnly(s) {
  if (!s) return false
  const stripped = s.replace(/\s/g, '')
  if (!stripped) return false
  // 이모지/변형선택자/ZWJ만 남는지
  return /^(\p{Extended_Pictographic}|️|‍)+$/u.test(stripped) && [...stripped].length <= 6
}

const fmtSize = (b) => b > 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`

// URL을 클릭 가능한 링크로 변환
function linkify(text) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  return parts.map((p, i) =>
    /^https?:\/\//.test(p)
      ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="underline break-all">{p}</a>
      : p
  )
}

export default function Chat() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [channel, setChannel] = useState('team')
  const [channelLabel, setChannelLabel] = useState('전체 팀')
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [picker, setPicker] = useState(null) // null | 'emoji' | 'sticker'
  const socketRef = useRef(null)
  const bottomRef = useRef(null)
  const channelRef = useRef(channel)

  const { data: channels } = useQuery({
    queryKey: ['chat-channels'],
    queryFn: () => api.get('/chat/channels').then(r => r.data)
  })

  // 소켓 1회 연결
  useEffect(() => {
    if (!user?.id) return
    const socket = io(window.location.origin, { path: '/socket.io', transports: ['websocket', 'polling'] })
    socketRef.current = socket
    socket.on('chat_message', (msg) => {
      if (msg.channel === channelRef.current) {
        setMessages(prev => [...prev, msg])
      }
    })
    return () => socket.disconnect()
  }, [user?.id])

  // 채널 전환 시: 이전 방 나가고 새 방 입장 + 메시지 로드
  useEffect(() => {
    channelRef.current = channel
    const socket = socketRef.current
    if (!socket) return
    socket.emit('join_channel', { channel })
    api.get(`/chat/messages?channel=${encodeURIComponent(channel)}`).then(r => setMessages(r.data))
    return () => { socket.emit('leave_channel', { channel }) }
  }, [channel])

  // 새 메시지 시 스크롤 하단으로
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendMsg = async ({ content = '', attachment = null }) => {
    if (!content.trim() && !attachment) return
    const msg = await api.post('/chat/messages', { channel, content, attachment }).then(r => r.data)
    setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
  }

  const send = async () => {
    const content = text.trim()
    if (!content) return
    setText('')
    setPicker(null)
    await sendMsg({ content })
  }

  const sendSticker = async (emoji) => {
    setPicker(null)
    await sendMsg({ content: emoji })
  }

  const [uploading, setUploading] = useState(false)
  const uploadAndSend = async (file) => {
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const meta = await api.post('/chat/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
      await sendMsg({ attachment: meta })
    } catch (e) {
      const msg = e?.response?.data?.detail || '업로드 실패'
      alert(msg)
    } finally {
      setUploading(false)
    }
  }

  const onPaste = (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const it of items) {
      if (it.type.startsWith('image/')) {
        const f = it.getAsFile()
        if (f) { e.preventDefault(); uploadAndSend(f) }
      }
    }
  }

  const pick = (ch, label) => { setChannel(ch); setChannelLabel(label) }

  return (
    <div className="flex h-full">
      {/* 채널 목록 */}
      <div className="w-60 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col flex-shrink-0">
        <div className="px-4 py-4 border-b border-slate-100 dark:border-slate-800">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2"><MessageSquare size={20} /> 채팅</h1>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {/* 팀 채널 */}
          <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">채널</div>
          <ChannelItem active={channel === 'team'} onClick={() => pick('team', '전체 팀')} icon={<Hash size={16} />} label="전체 팀" />
          {channels?.projects?.map(p => (
            <ChannelItem key={p.id} active={channel === `project:${p.id}`}
              onClick={() => pick(`project:${p.id}`, p.name)}
              icon={<span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />} label={p.name} />
          ))}

          {/* DM */}
          <div className="px-4 pt-4 pb-1 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">다이렉트 메시지</div>
          {channels?.users?.map(u => {
            const ch = dmChannel(user.id, u.id)
            return (
              <ChannelItem key={u.id} active={channel === ch} onClick={() => pick(ch, u.name)}
                icon={<span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: `hsl(${(u.id * 137) % 360},60%,50%)` }}>{u.name[0]}</span>}
                label={u.name} />
            )
          })}
        </div>
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            {channel.startsWith('dm:') ? <UsersIcon size={18} /> : <Hash size={18} />}
            {channelLabel}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {messages.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-16">아직 메시지가 없습니다. 첫 메시지를 보내보세요!</div>
          ) : messages.map((m, i) => {
            const mine = m.sender_id === user.id
            const showName = i === 0 || messages[i - 1].sender_id !== m.sender_id
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                  {showName && !mine && <span className="text-xs text-slate-500 mb-0.5 ml-1">{m.sender_name}</span>}

                  {/* 첨부 */}
                  {m.attachment && (m.attachment.type?.startsWith('image/') ? (
                    <a href={m.attachment.url} target="_blank" rel="noopener noreferrer" className="block mb-1">
                      <img src={m.attachment.url} alt={m.attachment.name} className="max-w-[240px] max-h-60 rounded-xl border border-slate-200 dark:border-slate-700" />
                    </a>
                  ) : (
                    <a href={m.attachment.url} target="_blank" rel="noopener noreferrer" download
                      className={`flex items-center gap-2 mb-1 px-3 py-2 rounded-xl border ${mine ? 'bg-blue-500/20 border-blue-300' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                      <FileText size={20} className="text-slate-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className={`text-sm font-medium truncate ${mine ? 'text-white' : 'text-slate-800 dark:text-slate-100'}`}>{m.attachment.name}</div>
                        <div className={`text-[10px] ${mine ? 'text-blue-100' : 'text-slate-400'}`}>{fmtSize(m.attachment.size || 0)}</div>
                      </div>
                      <Download size={15} className={mine ? 'text-blue-100' : 'text-slate-400'} />
                    </a>
                  ))}

                  {/* 텍스트 */}
                  {m.content && (isEmojiOnly(m.content) ? (
                    <div className="text-5xl leading-none px-1 py-1 select-none">{m.content}</div>
                  ) : (
                    <div className={`px-3.5 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                      mine ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-sm'
                    }`}>{linkify(m.content)}</div>
                  ))}
                  <span className="text-[10px] text-slate-400 mt-0.5 mx-1">{dayjs(m.created_at).format('HH:mm')}</span>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* 입력 */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 relative">
          {/* 이모지 피커 */}
          {picker === 'emoji' && (
            <div className="absolute bottom-full left-6 mb-2 w-80 max-h-72 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3 z-50">
              {Object.entries(EMOJI_GROUPS).map(([group, emojis]) => (
                <div key={group} className="mb-2">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">{group}</div>
                  <div className="grid grid-cols-8 gap-0.5">
                    {emojis.map((e, i) => (
                      <button key={i} onClick={() => { setText(t => t + e) }}
                        className="text-xl p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">{e}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* 스티커 피커 */}
          {picker === 'sticker' && (
            <div className="absolute bottom-full left-6 mb-2 w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3 z-50">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">스티커 (클릭하면 바로 전송)</div>
              <div className="grid grid-cols-6 gap-1">
                {STICKERS.map((s, i) => (
                  <button key={i} onClick={() => sendSticker(s)}
                    className="text-3xl p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors">{s}</button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button onClick={() => setPicker(p => p === 'emoji' ? null : 'emoji')}
              className={`p-2.5 rounded-xl transition-colors ${picker === 'emoji' ? 'bg-blue-100 dark:bg-blue-900 text-blue-600' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`} title="이모지">
              <Smile size={18} />
            </button>
            <button onClick={() => setPicker(p => p === 'sticker' ? null : 'sticker')}
              className={`p-2.5 rounded-xl transition-colors ${picker === 'sticker' ? 'bg-blue-100 dark:bg-blue-900 text-blue-600' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`} title="스티커">
              <Sticker size={18} />
            </button>
            <label className="p-2.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors" title="파일 첨부">
              <Paperclip size={18} />
              <input type="file" className="hidden" onChange={e => { uploadAndSend(e.target.files[0]); e.target.value = '' }} />
            </label>
            <input value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              onFocus={() => setPicker(null)}
              onPaste={onPaste}
              placeholder={uploading ? '업로드 중...' : `${channelLabel}에 메시지 보내기... (이미지 붙여넣기 가능)`}
              className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={send} disabled={!text.trim()}
              className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl transition-colors">
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ChannelItem({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
        active ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}>
      <span className="flex-shrink-0 flex items-center justify-center w-5">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}
