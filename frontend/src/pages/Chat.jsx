import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { io } from 'socket.io-client'
import { Hash, Send, Users as UsersIcon, MessageSquare, Smile, Sticker, Paperclip, FileText, Download, X, Plus, UsersRound, CornerUpLeft, ExternalLink } from 'lucide-react'
import dayjs from 'dayjs'
import api from '../api/client'
import useAuth from '../store/auth'
import Avatar from '../components/Avatar'

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
  const parts = text.split(/(https?:\/\/[^\s]+|@[\w가-힣]+)/g)
  return parts.map((p, i) => {
    if (/^https?:\/\//.test(p)) {
      return <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="underline break-all">{p}</a>
    }
    if (/^@[\w가-힣]+$/.test(p)) {
      return <span key={i} className="font-semibold bg-black/10 dark:bg-white/15 rounded px-1">{p}</span>
    }
    return p
  })
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

  const [showGroupModal, setShowGroupModal] = useState(false)
  const [replyTo, setReplyTo] = useState(null) // {id, sender_name, preview}
  const [stickerTab, setStickerTab] = useState('emoji') // 'emoji' | 'image'
  const [reactFor, setReactFor] = useState(null) // 반응 팔레트 대상 메시지 id
  const [aiTyping, setAiTyping] = useState(false)
  const [dmSearch, setDmSearch] = useState('')
  const [sideTab, setSideTab] = useState('talks')  // 'talks' 대화 | 'people' 사람

  const { data: channels } = useQuery({
    queryKey: ['chat-channels'],
    queryFn: () => api.get('/chat/channels').then(r => r.data)
  })

  const { data: unread } = useQuery({
    queryKey: ['chat-unread'],
    queryFn: () => api.get('/chat/unread').then(r => r.data),
    refetchInterval: 30000
  })

  const { data: imageStickers = [] } = useQuery({
    queryKey: ['chat-stickers'],
    queryFn: () => api.get('/chat/stickers').then(r => r.data)
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['chat-groups'],
    queryFn: () => api.get('/chat/groups').then(r => r.data)
  })

  const { data: convos = [] } = useQuery({
    queryKey: ['chat-convos'],
    queryFn: () => api.get('/chat/conversations').then(r => r.data),
    refetchInterval: 15000,
  })

  const { data: readers = [] } = useQuery({
    queryKey: ['chat-readers', channel],
    queryFn: () => api.get('/chat/read-status', { params: { channel } }).then(r => r.data),
  })

  // 소켓 1회 연결
  useEffect(() => {
    if (!user?.id) return
    const socket = io(window.location.origin, { path: '/socket.io', transports: ['websocket', 'polling'] })
    socketRef.current = socket
    socket.on('chat_message', (msg) => {
      if (msg.channel === channelRef.current) {
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
      }
      qc.invalidateQueries({ queryKey: ['chat-unread'] })
      qc.invalidateQueries({ queryKey: ['chat-convos'] })
    })
    socket.on('chat_read', () => {
      qc.invalidateQueries({ queryKey: ['chat-readers'] })
    })
    socket.on('chat_update', (upd) => {
      if (upd.channel === channelRef.current) {
        setMessages(prev => prev.map(m => m.id === upd.id ? { ...m, reactions: upd.reactions } : m))
      }
    })
    // AI 스트리밍
    socket.on('ai_typing', (d) => {
      if (d.channel === channelRef.current) setAiTyping(d.typing)
    })
    socket.on('ai_stream', (d) => {
      if (d.channel === channelRef.current) {
        setMessages(prev => prev.map(m => m.id === d.id ? { ...m, content: (m.content || '') + d.delta } : m))
      }
    })
    socket.on('ai_stream_done', (d) => {
      if (d.channel === channelRef.current) {
        setMessages(prev => prev.map(m => m.id === d.id ? { ...m, content: d.content, streaming: false } : m))
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
    // 읽음 처리
    api.post('/chat/read', { channel }).then(() => qc.invalidateQueries({ queryKey: ['chat-unread'] }))
    setReplyTo(null)
    setAiTyping(false)
    return () => { socket.emit('leave_channel', { channel }) }
  }, [channel])

  // 새 메시지 시 스크롤 하단으로
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, aiTyping])

  const sendMsg = async ({ content = '', attachment = null }) => {
    if (!content.trim() && !attachment) return
    const payload = { channel, content, attachment, reply_to: replyTo || null }
    const msg = await api.post('/chat/messages', payload).then(r => r.data)
    setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
    setReplyTo(null)
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

  const sendImageSticker = async (st) => {
    setPicker(null)
    await sendMsg({ attachment: { url: st.url, name: st.name, type: 'image/png', size: 0, sticker: true } })
  }

  const uploadSticker = async (file) => {
    if (!file) return
    const fd = new FormData(); fd.append('file', file)
    await api.post('/chat/stickers', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    qc.invalidateQueries({ queryKey: ['chat-stickers'] })
  }

  const toggleReaction = async (msgId, emoji) => {
    setReactFor(null)
    const res = await api.post(`/chat/messages/${msgId}/react`, { emoji }).then(r => r.data)
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions: res.reactions } : m))
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

  const isPopup = typeof window !== 'undefined' && (window.opener != null || window.location.pathname === '/chat-popup')

  return (
    <div className="flex h-full overflow-hidden">
      {/* 채널 목록 */}
      <div className={`${isPopup ? 'w-40' : 'w-60'} border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col flex-shrink-0`}>
        <div className="px-4 pt-4 pb-2 border-b border-slate-100 dark:border-slate-800">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2.5"><MessageSquare size={20} /> 채팅</h1>
          <div className="flex gap-1">
            {[['talks', '💬 대화'], ['people', '👥 사람']].map(([v, l]) => (
              <button key={v} onClick={() => setSideTab(v)}
                className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors ${
                  sideTab === v
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* 대화 탭: 메시지가 있는 방만, 최신순 */}
        {sideTab === 'talks' && (
          <div className="flex-1 overflow-y-auto py-1">
            {convos.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-400">
                대화가 없습니다.<br />👥 사람 탭에서 대화를 시작해보세요.
              </div>
            ) : convos.map(c => {
              const isActive = channel === c.channel
              const t = c.last_at ? (dayjs(c.last_at).isSame(dayjs(), 'day') ? dayjs(c.last_at).format('HH:mm') : dayjs(c.last_at).format('MM/DD')) : ''
              return (
                <button key={c.channel} onClick={() => pick(c.channel, c.label)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                    isActive ? 'bg-blue-50 dark:bg-blue-950' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}>
                  <span className="flex-shrink-0">
                    {c.kind === 'dm' || c.kind === 'ai'
                      ? <Avatar emoji={c.avatar?.emoji} color={c.avatar?.color} size={isPopup ? 26 : 34} />
                      : c.kind === 'project'
                        ? <span className="w-[34px] h-[34px] rounded-full flex items-center justify-center" style={{ background: (c.avatar?.color || '#64748b') + '22' }}><span className="w-2.5 h-2.5 rounded-full" style={{ background: c.avatar?.color || '#64748b' }} /></span>
                        : <span className="w-[34px] h-[34px] rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">{c.kind === 'group' ? <UsersRound size={16} className="text-slate-500" /> : <Hash size={16} className="text-slate-500" />}</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-1">
                      <span className={`text-sm truncate ${isActive ? 'text-blue-700 dark:text-blue-300 font-semibold' : 'text-slate-800 dark:text-slate-100 font-medium'}`}>{c.label}</span>
                      <span className="text-[10px] text-slate-400 flex-shrink-0">{t}</span>
                    </span>
                    <span className="flex items-center justify-between gap-1">
                      <span className="text-xs text-slate-400 truncate">{c.preview || ' '}</span>
                      {c.unread > 0 && !isActive && (
                        <span className="flex-shrink-0 text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold min-w-[18px] text-center">{c.unread}</span>
                      )}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* 사람 탭: 디렉터리 (새 대화 시작) */}
        <div className={`flex-1 overflow-y-auto py-2 ${sideTab === 'people' ? '' : 'hidden'}`}>
          {/* 팀 채널 */}
          <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">채널</div>
          <ChannelItem active={channel === 'team'} onClick={() => pick('team', '전체 팀')} icon={<Hash size={16} />} label="전체 팀" badge={unread?.channels?.['team']} />
          {channels?.projects?.map(p => (
            <ChannelItem key={p.id} active={channel === `project:${p.id}`}
              onClick={() => pick(`project:${p.id}`, p.name)}
              icon={<span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />} label={p.name}
              badge={unread?.channels?.[`project:${p.id}`]} />
          ))}

          {/* 그룹 */}
          <div className="px-4 pt-4 pb-1 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">그룹</span>
            <button onClick={() => setShowGroupModal(true)} className="text-slate-400 hover:text-blue-600" title="그룹 만들기"><Plus size={14} /></button>
          </div>
          {groups.map(g => (
            <ChannelItem key={g.id} active={channel === `group:${g.id}`}
              onClick={() => pick(`group:${g.id}`, g.name)}
              icon={<UsersRound size={16} />} label={`${g.name} (${g.member_ids.length})`}
              badge={unread?.channels?.[`group:${g.id}`]} />
          ))}

          {/* AI 사원 */}
          {channels?.ai_user && (
            <>
              <div className="px-4 pt-4 pb-1 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">AI 비서</div>
              <ChannelItem active={channel === channels.ai_user.channel}
                onClick={() => pick(channels.ai_user.channel, 'AI 사원')}
                icon={<Avatar emoji={channels.ai_user.avatar_emoji} color={channels.ai_user.avatar_color} size={20} />}
                label="AI 사원" badge={unread?.channels?.[channels.ai_user.channel]} />
            </>
          )}

          {/* DM */}
          <div className="px-4 pt-4 pb-1 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">다이렉트 메시지</div>
          <div className="px-3 pb-1.5">
            <input value={dmSearch} onChange={e => setDmSearch(e.target.value)}
              placeholder="이름·부서 검색"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
          {(() => {
            const q = dmSearch.trim().toLowerCase()
            const filtered = (channels?.users || []).filter(u =>
              !q || u.name.toLowerCase().includes(q) || (u.dept_name || '').toLowerCase().includes(q))
            if (filtered.length === 0) {
              return <div className="px-4 py-3 text-xs text-slate-400">검색 결과 없음</div>
            }
            return filtered.map(u => {
              const ch = dmChannel(user.id, u.id)
              return (
                <ChannelItem key={u.id} active={channel === ch} onClick={() => pick(ch, u.name)}
                  icon={<Avatar emoji={u.avatar_emoji} color={u.avatar_color} size={20} />}
                  label={u.name} sub={u.dept_name} badge={unread?.channels?.[ch]} />
              )
            })
          })()}
        </div>
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
          <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            {channel.startsWith('dm:') ? <UsersIcon size={18} /> : <Hash size={18} />}
            {channelLabel}
          </h2>
          {!isPopup && (
            <button
              onClick={() => window.open('/chat-popup', 'projecthub_chat', 'width=440,height=680,menubar=no,toolbar=no,location=no,status=no')}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="작은 창으로 분리">
              <ExternalLink size={14} /> 새 창
            </button>
          )}
        </div>

        <div className={`flex-1 overflow-y-auto ${isPopup ? 'px-3' : 'px-6'} py-4 space-y-3`}>
          {messages.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-16">아직 메시지가 없습니다. 첫 메시지를 보내보세요!</div>
          ) : messages.map((m, i) => {
            const mine = m.sender_id === user.id
            const showName = i === 0 || messages[i - 1].sender_id !== m.sender_id
            const isSticker = m.attachment?.sticker
            return (
              <div key={m.id} className={`group flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                {!mine && (showName
                  ? <Avatar emoji={m.sender_avatar} color={m.sender_color} size={28} />
                  : <span className="w-7 flex-shrink-0" />)}
                <div className={`${isPopup ? 'max-w-[85%]' : 'max-w-[70%]'} ${mine ? 'items-end' : 'items-start'} flex flex-col relative`}>
                  {showName && !mine && <span className="text-xs text-slate-500 mb-0.5 ml-1">{m.sender_name}</span>}

                  {/* 답글 인용 */}
                  {m.reply_to && (
                    <div className={`text-xs px-2.5 py-1 mb-0.5 rounded-lg border-l-2 ${mine ? 'bg-blue-500/10 border-blue-300 text-slate-500' : 'bg-slate-100 dark:bg-slate-800 border-slate-300 text-slate-500'}`}>
                      <span className="font-medium">{m.reply_to.sender_name}</span>: {m.reply_to.preview}
                    </div>
                  )}

                  <div className="flex items-end gap-1.5">
                    {/* 호버 액션 (내 메시지면 왼쪽) */}
                    {mine && <MsgActions onReply={() => setReplyTo({ id: m.id, sender_name: m.sender_name, preview: (m.content || '📎 첨부').slice(0, 30) })} onReact={() => setReactFor(reactFor === m.id ? null : m.id)} />}

                    <div className="flex flex-col">
                      {/* 첨부 / 스티커 */}
                      {m.attachment && (isSticker ? (
                        <img src={m.attachment.url} alt="sticker" className="max-w-[120px] max-h-[120px] mb-1 select-none" />
                      ) : m.attachment.type?.startsWith('image/') ? (
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
                        <div className="text-3xl leading-none px-1 py-1 select-none">{m.content}</div>
                      ) : (
                        <div className={`px-3.5 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                          mine ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-sm'
                        }`}>{linkify(m.content)}</div>
                      ))}
                    </div>

                    {!mine && <MsgActions onReply={() => setReplyTo({ id: m.id, sender_name: m.sender_name, preview: (m.content || '📎 첨부').slice(0, 30) })} onReact={() => setReactFor(reactFor === m.id ? null : m.id)} />}
                  </div>

                  {/* 반응 팔레트 */}
                  {reactFor === m.id && (
                    <div className="flex gap-1 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-2 py-1 shadow-lg z-10">
                      {['👍','❤️','😂','🎉','😮','😢','🙏'].map(e => (
                        <button key={e} onClick={() => toggleReaction(m.id, e)} className="text-lg hover:scale-125 transition-transform">{e}</button>
                      ))}
                    </div>
                  )}

                  {/* 반응 칩 */}
                  {m.reactions && Object.keys(m.reactions).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(m.reactions).map(([emoji, uids]) => (
                        <button key={emoji} onClick={() => toggleReaction(m.id, emoji)}
                          className={`text-xs px-1.5 py-0.5 rounded-full border flex items-center gap-1 ${
                            uids.includes(user.id) ? 'bg-blue-50 dark:bg-blue-950 border-blue-300 text-blue-700 dark:text-blue-300' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                          }`}>
                          <span>{emoji}</span><span>{uids.length}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <span className="text-[10px] text-slate-400 mt-0.5 mx-1">
                    {mine && !channel.startsWith('ai:') && (() => {
                      const cnt = readers.filter(r => r.user_id !== user.id && r.last_read_at && !dayjs(r.last_read_at).isBefore(dayjs(m.created_at))).length
                      if (!cnt) return null
                      return <span className="text-blue-500 font-medium mr-1">{channel.startsWith('dm:') ? '읽음' : `읽음 ${cnt}`}</span>
                    })()}
                    {dayjs(m.created_at).format('HH:mm')}
                  </span>
                </div>
              </div>
            )
          })}
          {aiTyping && (
            <div className="flex items-center gap-2 text-sm text-slate-400 px-1">
              <Avatar emoji="🤖" color="#6366f1" size={24} />
              <span className="flex items-center gap-1">
                AI 사원이 입력 중
                <span className="inline-flex gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 입력 */}
        <div className={`${isPopup ? 'px-3' : 'px-6'} py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 relative`}>
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
          {/* 스티커 피커 (기본/이미지 탭) */}
          {picker === 'sticker' && (
            <div className="absolute bottom-full left-6 mb-2 w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3 z-50">
              <div className="flex gap-1 mb-2">
                <button onClick={() => setStickerTab('emoji')} className={`text-xs px-2.5 py-1 rounded-lg font-medium ${stickerTab === 'emoji' ? 'bg-blue-100 dark:bg-blue-900 text-blue-600' : 'text-slate-500'}`}>기본</button>
                <button onClick={() => setStickerTab('image')} className={`text-xs px-2.5 py-1 rounded-lg font-medium ${stickerTab === 'image' ? 'bg-blue-100 dark:bg-blue-900 text-blue-600' : 'text-slate-500'}`}>이미지</button>
                <label className="ml-auto text-xs px-2.5 py-1 rounded-lg text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer font-medium">
                  + 업로드
                  <input type="file" accept="image/*" className="hidden" onChange={e => { uploadSticker(e.target.files[0]); e.target.value = '' }} />
                </label>
              </div>
              {stickerTab === 'emoji' ? (
                <div className="grid grid-cols-6 gap-1 max-h-52 overflow-y-auto">
                  {STICKERS.map((s, i) => (
                    <button key={i} onClick={() => sendSticker(s)}
                      className="text-3xl p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors">{s}</button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2 max-h-52 overflow-y-auto">
                  {imageStickers.length === 0
                    ? <div className="col-span-4 text-center text-xs text-slate-400 py-6">업로드한 이미지 스티커가 없습니다.<br/>+ 업로드로 PNG를 추가하세요.</div>
                    : imageStickers.map(st => (
                      <button key={st.id} onClick={() => sendImageSticker(st)}
                        className="aspect-square p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl">
                        <img src={st.url} alt={st.name} className="w-full h-full object-contain" />
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* AI 채널 전용 빠른 액션 */}
          {channel.startsWith('ai:') && (
            <div className="flex gap-2 mb-2 flex-wrap">
              <button onClick={() => sendMsg({ content: "오늘 나눈 대화와 내 업무 현황을 바탕으로 오늘 업무일지 초안을 작성해줘. '완료한 업무', '이슈/리스크', '다음 계획' 세 섹션으로 마크다운으로 정리해줘." })}
                className="text-xs px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                📝 업무일지 초안 작성
              </button>
              <button onClick={() => sendMsg({ content: "내 미완료 업무를 마감 임박순으로 정리해줘." })}
                className="text-xs px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                📋 내 업무 정리
              </button>
            </div>
          )}

          {/* 답글 배너 */}
          {replyTo && (
            <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl border-l-2 border-blue-400">
              <CornerUpLeft size={14} className="text-blue-500 flex-shrink-0" />
              <div className="min-w-0 flex-1 text-xs text-slate-500">
                <span className="font-medium text-slate-700 dark:text-slate-200">{replyTo.sender_name}</span>님에게 답글: {replyTo.preview}
              </div>
              <button onClick={() => setReplyTo(null)} className="text-slate-400 hover:text-slate-700"><X size={14} /></button>
            </div>
          )}

          {/* @멘션 자동완성 */}
          {(() => {
            if (channel.startsWith('ai:')) return null
            const mm = text.match(/@([\w가-힣]*)$/)
            if (!mm) return null
            const q = mm[1].toLowerCase()
            const cands = (channels?.users || [])
              .filter(u => !q || u.name.toLowerCase().includes(q) || (u.dept_name || '').toLowerCase().includes(q))
              .slice(0, 6)
            if (cands.length === 0) return null
            return (
              <div className="absolute bottom-full left-6 right-6 mb-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50">
                {cands.map(u => (
                  <button key={u.id}
                    onClick={() => setText(t => t.replace(/@[\w가-힣]*$/, `@${u.name} `))}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    <Avatar emoji={u.avatar_emoji} color={u.avatar_color} size={22} />
                    <span className="text-sm text-slate-800 dark:text-slate-100">{u.name}</span>
                    {u.dept_name && <span className="text-xs text-slate-400">{u.dept_name}</span>}
                  </button>
                ))}
              </div>
            )
          })()}

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
              placeholder={uploading ? '업로드 중...' : isPopup ? '메시지 입력...' : `${channelLabel}에 메시지 보내기... (이미지 붙여넣기 가능)`}
              className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={send} disabled={!text.trim()}
              className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl transition-colors">
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>

      {showGroupModal && (
        <GroupModal users={channels?.users || []}
          onClose={() => setShowGroupModal(false)}
          onCreated={(g) => {
            qc.invalidateQueries({ queryKey: ['chat-groups'] })
            setShowGroupModal(false)
            pick(`group:${g.id}`, g.name)
          }} />
      )}
    </div>
  )
}

function GroupModal({ users, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState([])
  const [saving, setSaving] = useState(false)
  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const create = async () => {
    if (!name.trim() || selected.length === 0) return
    setSaving(true)
    try {
      const g = await api.post('/chat/groups', { name, member_ids: selected }).then(r => r.data)
      onCreated(g)
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">그룹 만들기</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="그룹 이름"
          className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 mb-3" />
        <div className="text-xs font-medium text-slate-500 mb-1">멤버 초대 ({selected.length}명)</div>
        <div className="max-h-56 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl p-2 mb-4">
          {users.map(u => (
            <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer">
              <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} />
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: `hsl(${(u.id * 137) % 360},60%,50%)` }}>{u.name[0]}</span>
              <span className="text-sm text-slate-700 dark:text-slate-200">{u.name}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">취소</button>
          <button onClick={create} disabled={!name.trim() || selected.length === 0 || saving}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium">만들기</button>
        </div>
      </div>
    </div>
  )
}

function MsgActions({ onReply, onReact }) {
  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity self-center">
      <button onClick={onReact} title="반응" className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"><Smile size={14} /></button>
      <button onClick={onReply} title="답글" className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"><CornerUpLeft size={14} /></button>
    </div>
  )
}

function ChannelItem({ active, onClick, icon, label, sub, badge }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
        active ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}>
      <span className="flex-shrink-0 flex items-center justify-center w-5">{icon}</span>
      <span className="truncate flex-1 text-left">
        {label}
        {sub && <span className="block text-[10px] text-slate-400 truncate leading-tight">{sub}</span>}
      </span>
      {badge > 0 && !active && (
        <span className="flex-shrink-0 text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold min-w-[18px] text-center">{badge}</span>
      )}
    </button>
  )
}
