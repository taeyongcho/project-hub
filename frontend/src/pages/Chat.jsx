import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { io } from 'socket.io-client'
import { toast } from 'sonner'
import { Hash, Send, Users as UsersIcon, MessageSquare, Smile, Sticker, Paperclip, FileText, Download, X, Plus, UsersRound, CornerUpLeft, ExternalLink, Share2, HardDrive, Folder, ChevronRight, Upload, CheckSquare, CalendarDays, Flag, Pencil, Trash2 } from 'lucide-react'
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
  const [onlineIds, setOnlineIds] = useState([])
  const [forwardMsg, setForwardMsg] = useState(null)  // 전달할 메시지
  const [showNas, setShowNas] = useState(false)       // NAS 자료실 모달
  const [taskFromMsg, setTaskFromMsg] = useState(null) // 메시지→할일 모달
  const [editingMsg, setEditingMsg] = useState(null)   // {id, content} 수정 중
  const [imageEdit, setImageEdit] = useState(null)     // 붙여넣은 이미지 편집 (File)
  const [mainTab, setMainTab] = useState('chat')       // 'chat' | 'tasks' | 'calendar'

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
      // 데스크톱 알림 (다른 방이거나 창이 백그라운드일 때)
      if (msg.sender_id !== user.id && !msg.channel.startsWith('ai:') &&
          (document.hidden || msg.channel !== channelRef.current) &&
          typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          const n = new Notification(msg.sender_name || '새 메시지', {
            body: msg.attachment ? '📎 파일을 보냈습니다' : (msg.content || '').slice(0, 80),
            tag: `chat-${msg.channel}`,
          })
          n.onclick = () => { window.focus(); n.close() }
        } catch { /* 알림 미지원 환경 무시 */ }
      }
    })
    socket.on('chat_read', () => {
      qc.invalidateQueries({ queryKey: ['chat-readers'] })
    })
    // 온라인 상태
    socket.on('connect', () => socket.emit('presence_join', { userId: user.id }))
    socket.emit('presence_join', { userId: user.id })
    socket.on('presence', (d) => setOnlineIds(d.online || []))
    // 데스크톱 알림 권한 요청 (1회)
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    socket.on('chat_update', (upd) => {
      if (upd.channel === channelRef.current) {
        setMessages(prev => prev.map(m => m.id === upd.id ? { ...m, ...upd } : m))
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
        if (f) { e.preventDefault(); setImageEdit(f) }  // 편집 모달 먼저
      }
    }
  }

  const pick = (ch, label) => { setChannel(ch); setChannelLabel(label) }

  const isPopup = typeof window !== 'undefined' && (window.opener != null || window.location.pathname === '/chat-popup')

  // 독립 창일 때 창 제목 (별도 프로그램처럼)
  useEffect(() => {
    if (isPopup) {
      document.title = '어센틱웍스 채팅'
      return () => { document.title = '어센틱웍스' }
    }
  }, [isPopup])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 워크스페이스 탭 (채팅/할일/캘린더) */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0">
        {[['chat', '💬 채팅'], ['tasks', '✅ 할일'], ['calendar', '📅 캘린더']].map(([v, l]) => (
          <button key={v} onClick={() => setMainTab(v)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              mainTab === v
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}>
            {l}
          </button>
        ))}
      </div>

      {mainTab === 'tasks' && <ChatTasks myId={user.id} />}
      {mainTab === 'calendar' && <ChatCalendar myId={user.id} />}

      <div className={`flex flex-1 overflow-hidden ${mainTab === 'chat' ? '' : 'hidden'}`}>
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
                  <span className="flex-shrink-0 relative">
                    {c.kind === 'dm' || c.kind === 'ai'
                      ? <>
                          <Avatar emoji={c.avatar?.emoji} color={c.avatar?.color} size={isPopup ? 26 : 34} />
                          {c.kind === 'dm' && onlineIds.includes(c.avatar?.user_id) && (
                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
                          )}
                        </>
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
                  icon={
                    <span className="relative inline-flex">
                      <Avatar emoji={u.avatar_emoji} color={u.avatar_color} size={20} />
                      {onlineIds.includes(u.id) && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-white dark:border-slate-900" />
                      )}
                    </span>
                  }
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
                    {mine && !m.is_deleted && <MsgActions onReply={() => setReplyTo({ id: m.id, sender_name: m.sender_name, preview: (m.content || '📎 첨부').slice(0, 30) })} onReact={() => setReactFor(reactFor === m.id ? null : m.id)} onForward={() => setForwardMsg(m)} onTask={() => setTaskFromMsg(m)}
                      onEdit={m.content ? () => setEditingMsg({ id: m.id, content: m.content }) : undefined}
                      onDelete={async () => { if (confirm('이 메시지를 삭제할까요?')) { try { await api.delete(`/chat/messages/${m.id}`) } catch { toast.error('삭제 실패') } } }} />}

                    <div className="flex flex-col">
                      {/* 삭제된 메시지 */}
                      {m.is_deleted && (
                        <div className="px-3.5 py-2 rounded-2xl text-sm italic text-slate-400 bg-slate-100/60 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700">
                          삭제된 메시지입니다
                        </div>
                      )}
                      {/* 수정 중 */}
                      {!m.is_deleted && editingMsg?.id === m.id && (
                        <div className="flex flex-col gap-1.5 min-w-[220px]">
                          <textarea value={editingMsg.content} autoFocus rows={2}
                            onChange={e => setEditingMsg(p => ({ ...p, content: e.target.value }))}
                            onKeyDown={async e => {
                              if (e.key === 'Escape') setEditingMsg(null)
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                try { await api.patch(`/chat/messages/${m.id}`, { content: editingMsg.content }); setEditingMsg(null) }
                                catch (err) { toast.error(err.response?.data?.detail || '수정 실패') }
                              }
                            }}
                            className="bg-white dark:bg-slate-800 border-2 border-blue-400 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none resize-none" />
                          <div className="text-[10px] text-slate-400">Enter 저장 · Esc 취소</div>
                        </div>
                      )}
                      {/* 첨부 / 스티커 */}
                      {!m.is_deleted && editingMsg?.id !== m.id && m.attachment && (isSticker ? (
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
                      {!m.is_deleted && editingMsg?.id !== m.id && m.content && (isEmojiOnly(m.content) ? (
                        <div className="text-3xl leading-none px-1 py-1 select-none">{m.content}</div>
                      ) : (
                        <div className={`px-3.5 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                          mine ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-sm'
                        }`}>{linkify(m.content)}</div>
                      ))}
                    </div>

                    {!mine && <MsgActions onReply={() => setReplyTo({ id: m.id, sender_name: m.sender_name, preview: (m.content || '📎 첨부').slice(0, 30) })} onReact={() => setReactFor(reactFor === m.id ? null : m.id)} onForward={() => setForwardMsg(m)} onTask={() => setTaskFromMsg(m)} />}
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
                    {m.is_edited && !m.is_deleted && <span className="ml-1 text-slate-300 dark:text-slate-600">(수정됨)</span>}
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
            <button onClick={() => setShowNas(true)}
              className="p-2.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="부서 자료실 (NAS)">
              <HardDrive size={18} />
            </button>
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

      {forwardMsg && (
        <ForwardModal msg={forwardMsg} convos={convos} users={channels?.users || []} myId={user.id}
          onClose={() => setForwardMsg(null)}
          onSent={(label) => { setForwardMsg(null); qc.invalidateQueries({ queryKey: ['chat-convos'] }) }} />
      )}

      {showNas && (
        <NasModal onClose={() => setShowNas(false)}
          onAttach={async (meta) => { await sendMsg({ attachment: meta }); setShowNas(false) }} />
      )}

      {taskFromMsg && (
        <TaskFromMsgModal msg={taskFromMsg} users={channels?.users || []} me={user}
          onClose={() => setTaskFromMsg(null)} />
      )}

      {imageEdit && (
        <ImageEditModal file={imageEdit} onClose={() => setImageEdit(null)}
          onSend={async (file) => { setImageEdit(null); await uploadAndSend(file) }} />
      )}
    </div>
  )
}

const PEN_COLORS = ['#ef4444', '#3b82f6', '#facc15', '#111827']

function ImageEditModal({ file, onClose, onSend }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const historyRef = useRef([])
  const drawingRef = useRef(false)
  const cropStartRef = useRef(null)
  const [mode, setMode] = useState('pen')       // 'pen' | 'crop'
  const [penColor, setPenColor] = useState('#ef4444')
  const [penSize, setPenSize] = useState(4)
  const [cropRect, setCropRect] = useState(null) // {x,y,w,h} 캔버스 좌표
  const [sending, setSending] = useState(false)

  // 이미지 로드
  useEffect(() => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const maxW = Math.min(760, window.innerWidth - 120)
      const maxH = window.innerHeight - 260
      const scale = Math.min(1, maxW / img.width, maxH / img.height)
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      historyRef.current = []
      URL.revokeObjectURL(url)
    }
    img.src = url
  }, [file])

  const snapshot = () => {
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    historyRef.current.push(ctx.getImageData(0, 0, c.width, c.height))
    if (historyRef.current.length > 15) historyRef.current.shift()
  }

  const undo = () => {
    const prev = historyRef.current.pop()
    if (!prev) return
    const c = canvasRef.current
    // 자르기 되돌리기 대응: 캔버스 크기 복원
    c.width = prev.width
    c.height = prev.height
    c.getContext('2d').putImageData(prev, 0, 0)
    setCropRect(null)
  }

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onDown = (e) => {
    const pos = getPos(e)
    if (mode === 'pen') {
      snapshot()
      drawingRef.current = true
      const ctx = canvasRef.current.getContext('2d')
      ctx.strokeStyle = penColor
      ctx.lineWidth = penSize
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
    } else {
      cropStartRef.current = pos
      setCropRect({ x: pos.x, y: pos.y, w: 0, h: 0 })
    }
  }

  const onMove = (e) => {
    const pos = getPos(e)
    if (mode === 'pen' && drawingRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
    } else if (mode === 'crop' && cropStartRef.current) {
      const s = cropStartRef.current
      setCropRect({
        x: Math.min(s.x, pos.x), y: Math.min(s.y, pos.y),
        w: Math.abs(pos.x - s.x), h: Math.abs(pos.y - s.y),
      })
    }
  }

  const onUp = () => {
    drawingRef.current = false
    cropStartRef.current = null
  }

  const applyCrop = () => {
    if (!cropRect || cropRect.w < 10 || cropRect.h < 10) return
    snapshot()
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    const data = ctx.getImageData(cropRect.x, cropRect.y, cropRect.w, cropRect.h)
    c.width = cropRect.w
    c.height = cropRect.h
    ctx.putImageData(data, 0, 0)
    setCropRect(null)
    setMode('pen')
  }

  const send = () => {
    if (sending) return
    setSending(true)
    canvasRef.current.toBlob((blob) => {
      onSend(new File([blob], file.name || 'capture.png', { type: 'image/png' }))
    }, 'image/png')
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 max-w-[90vw]" onClick={e => e.stopPropagation()}>
        {/* 툴바 */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <button onClick={() => { setMode('pen'); setCropRect(null) }}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium ${mode === 'pen' ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            ✏️ 펜
          </button>
          <button onClick={() => setMode('crop')}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium ${mode === 'crop' ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            ✂️ 자르기
          </button>
          {mode === 'pen' && (
            <>
              {PEN_COLORS.map(c => (
                <button key={c} onClick={() => setPenColor(c)}
                  className={`w-6 h-6 rounded-full border-2 ${penColor === c ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'}`}
                  style={{ background: c }} />
              ))}
              <select value={penSize} onChange={e => setPenSize(parseInt(e.target.value))}
                className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-200">
                <option value={2}>가늘게</option>
                <option value={4}>보통</option>
                <option value={8}>굵게</option>
              </select>
            </>
          )}
          {mode === 'crop' && cropRect?.w >= 10 && (
            <button onClick={applyCrop}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium">
              선택 영역 자르기
            </button>
          )}
          <button onClick={undo}
            className="text-xs px-3 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium ml-auto">
            ↩ 되돌리기
          </button>
        </div>

        {/* 캔버스 */}
        <div ref={wrapRef} className="relative inline-block select-none rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700"
          style={{ cursor: mode === 'pen' ? 'crosshair' : 'cell' }}>
          <canvas ref={canvasRef}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} />
          {cropRect && (
            <div className="absolute border-2 border-blue-500 bg-blue-500/15 pointer-events-none"
              style={{ left: cropRect.x, top: cropRect.y, width: cropRect.w, height: cropRect.h }} />
          )}
        </div>

        <div className="flex justify-end gap-2 mt-3">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200">취소</button>
          <button onClick={send} disabled={sending}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-medium">
            {sending ? '전송 중...' : '보내기'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TaskFromMsgModal({ msg, users, me, onClose }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState((msg.content || msg.attachment?.name || '').slice(0, 100))
  const [dueDate, setDueDate] = useState('')
  const [assignee, setAssignee] = useState(String(me.id))
  const [saving, setSaving] = useState(false)

  const create = async () => {
    if (!title.trim()) return toast.error('제목을 입력하세요')
    setSaving(true)
    try {
      await api.post('/tasks', {
        title: title.trim(),
        description: `💬 채팅에서 등록 (${msg.sender_name}): ${(msg.content || '').slice(0, 500)}`,
        due_date: dueDate || null,
        assigned_to_id: parseInt(assignee),
        priority: 'normal',
      })
      qc.invalidateQueries({ queryKey: ['popup-tasks'] })
      toast.success('할일이 등록되었습니다')
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.detail || '등록 실패')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <CheckSquare size={16} className="text-emerald-500" /> 할일로 등록
          </span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">제목</label>
            <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">마감일</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">담당자</label>
              <select value={assignee} onChange={e => setAssignee(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value={me.id}>나 ({me.name})</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}{u.dept_name ? ` · ${u.dept_name}` : ''}</option>)}
              </select>
            </div>
          </div>
          <button onClick={create} disabled={saving}
            className="w-full py-2.5 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors">
            {saving ? '등록 중...' : '할일 등록'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ChatTasks({ myId }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['popup-tasks', myId],
    queryFn: () => api.get(`/tasks?assigned_to_id=${myId}`).then(r => r.data),
  })
  const statusMut = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/tasks/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['popup-tasks'] }),
    onError: () => toast.error('업데이트 실패'),
  })
  const addMut = useMutation({
    mutationFn: () => api.post('/tasks', { title: title.trim(), assigned_to_id: myId, priority: 'normal' }),
    onSuccess: () => { setTitle(''); qc.invalidateQueries({ queryKey: ['popup-tasks'] }) },
    onError: () => toast.error('등록 실패'),
  })

  const today = dayjs().startOf('day')
  const open = tasks.filter(t => t.status !== 'done')
    .sort((a, b) => (a.due_date || '9999') < (b.due_date || '9999') ? -1 : 1)
  const doneRecent = tasks.filter(t => t.status === 'done').slice(-8).reverse()

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4">
      <div className="max-w-lg mx-auto">
        <div className="flex gap-2 mb-4">
          <input value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && title.trim()) addMut.mutate() }}
            placeholder="+ 새 할일 입력 후 Enter"
            className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {isLoading ? (
          <div className="text-center text-xs text-slate-400 py-8">불러오는 중...</div>
        ) : open.length === 0 ? (
          <div className="text-center text-sm text-slate-400 py-10">🎉 미완료 할일이 없습니다</div>
        ) : (
          <div className="space-y-1.5">
            {open.map(t => {
              const overdue = t.due_date && dayjs(t.due_date).isBefore(today)
              const dueToday = t.due_date && dayjs(t.due_date).isSame(today, 'day')
              return (
                <label key={t.id} className="flex items-center gap-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
                  <input type="checkbox" checked={false}
                    onChange={() => statusMut.mutate({ id: t.id, status: 'done' })}
                    className="w-4 h-4 rounded accent-emerald-600 cursor-pointer flex-shrink-0" />
                  <span className="text-sm text-slate-800 dark:text-slate-100 flex-1 truncate">{t.title}</span>
                  {t.due_date && (
                    <span className={`text-[11px] flex-shrink-0 font-medium ${
                      overdue ? 'text-red-500' : dueToday ? 'text-amber-500' : 'text-slate-400'}`}>
                      {overdue ? `${today.diff(dayjs(t.due_date), 'day')}일 초과` : dueToday ? '오늘' : dayjs(t.due_date).format('MM/DD')}
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        )}

        {doneRecent.length > 0 && (
          <>
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mt-6 mb-2">최근 완료</div>
            <div className="space-y-1">
              {doneRecent.map(t => (
                <label key={t.id} className="flex items-center gap-2.5 px-3.5 py-1.5 opacity-50 cursor-pointer">
                  <input type="checkbox" checked
                    onChange={() => statusMut.mutate({ id: t.id, status: 'todo' })}
                    className="w-4 h-4 rounded accent-emerald-600 cursor-pointer flex-shrink-0" />
                  <span className="text-sm text-slate-500 line-through truncate">{t.title}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ChatCalendar({ myId }) {
  const [mineOnly, setMineOnly] = useState(false)
  const start = dayjs().startOf('day')
  const end = start.add(59, 'day')
  const { data } = useQuery({
    queryKey: ['popup-cal', myId],
    queryFn: () => api.get('/dashboard/calendar', {
      params: { start: start.format('YYYY-MM-DD'), end: end.format('YYYY-MM-DD') }
    }).then(r => r.data),
  })

  const byDate = {}
  const pushDay = (key, item) => { (byDate[key] = byDate[key] || []).push(item) }
  for (const t of data?.tasks || []) {
    if (mineOnly && t.assigned_to_id !== myId) continue
    if (t.status === 'done') continue
    if (t.start_date && t.due_date && t.start_date !== t.due_date) {
      pushDay(t.start_date, { kind: 'task', tag: '시작', ...t })
      pushDay(t.due_date, { kind: 'task', tag: '마감', ...t })
    } else if (t.due_date) {
      pushDay(t.due_date, { kind: 'task', ...t })
    } else if (t.start_date) {
      pushDay(t.start_date, { kind: 'task', tag: '시작', ...t })
    }
  }
  for (const m of data?.milestones || []) {
    (byDate[m.due_date] = byDate[m.due_date] || []).push({ kind: 'ms', ...m })
  }

  const days = Array.from({ length: 60 }, (_, i) => start.add(i, 'day'))
  const total = Object.values(byDate).reduce((a, v) => a + v.length, 0)
  const DOW = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4">
      <div className="max-w-lg mx-auto space-y-1.5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-400">앞으로 60일 — 마감 + 마일스톤</span>
          <div className="flex gap-1">
            {[[false, '전체'], [true, '내 일정']].map(([v, l]) => (
              <button key={l} onClick={() => setMineOnly(v)}
                className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors ${
                  mineOnly === v
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                }`}>{l}</button>
            ))}
          </div>
        </div>
        {total === 0 && (
          <div className="text-center text-sm text-slate-400 py-10">
            {mineOnly ? '60일 내 내 일정이 없습니다' : '60일 내 마감 일정이 없습니다'}<br />
            <span className="text-xs">할일에 마감일을 지정하면 여기 표시됩니다</span>
          </div>
        )}
        {days.map(d => {
          const key = d.format('YYYY-MM-DD')
          const items = byDate[key] || []
          const isToday = d.isSame(dayjs(), 'day')
          if (items.length === 0 && !isToday) return null
          return (
            <div key={key} className={`bg-white dark:bg-slate-900 border rounded-xl px-3.5 py-2.5 ${
              isToday ? 'border-blue-300 dark:border-blue-700' : 'border-slate-200 dark:border-slate-700'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-bold ${isToday ? 'text-blue-600 dark:text-blue-400' : d.day() === 0 ? 'text-red-500' : d.day() === 6 ? 'text-blue-500' : 'text-slate-600 dark:text-slate-300'}`}>
                  {d.format('MM/DD')} ({DOW[d.day()]})
                </span>
                {isToday && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-medium">오늘</span>}
              </div>
              {items.length === 0 ? (
                <div className="text-xs text-slate-300 dark:text-slate-600">일정 없음</div>
              ) : items.map((it, i) => (
                <div key={i} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 py-0.5">
                  {it.kind === 'ms'
                    ? <Flag size={12} style={{ color: it.project_color || '#8b5cf6' }} className="flex-shrink-0" />
                    : <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        it.priority === 'urgent' ? 'bg-red-500' : it.priority === 'high' ? 'bg-amber-500' : 'bg-blue-500'}`} />}
                  <span className="truncate">{it.title}</span>
                  {it.tag && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                      it.tag === '마감' ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    }`}>{it.tag}</span>
                  )}
                  {it.kind === 'ms' && it.project_name && <span className="text-[10px] text-slate-400 flex-shrink-0">{it.project_name}</span>}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function fmtNasSize(n) {
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB'
  if (n >= 1024) return (n / 1024).toFixed(0) + ' KB'
  return n + ' B'
}

function NasModal({ onClose, onAttach }) {
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const upRef = useRef(null)
  const qc2 = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['nas-list', path],
    queryFn: () => api.get('/nas/list', { params: { path } }).then(r => r.data),
  })

  const crumbs = path ? path.split('/') : []
  const goTo = (idx) => setPath(idx < 0 ? '' : crumbs.slice(0, idx + 1).join('/'))

  const attach = async (name) => {
    if (busy) return
    setBusy(true)
    try {
      const meta = await api.post('/nas/attach', { path: `${path ? path + '/' : ''}${name}` }).then(r => r.data)
      await onAttach(meta)
    } catch (e) {
      alert(e.response?.data?.detail || '첨부 실패')
      setBusy(false)
    }
  }

  const upload = async (file) => {
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      await api.post(`/nas/upload?path=${encodeURIComponent(path)}`, fd)
      qc2.invalidateQueries({ queryKey: ['nas-list', path] })
    } catch (e) {
      alert(e.response?.data?.detail || '업로드 실패')
    } finally { setBusy(false) }
  }

  const removeFile = async (name) => {
    if (busy || !confirm(`'${name}' 파일을 삭제할까요?`)) return
    setBusy(true)
    try {
      await api.post('/nas/delete', { path: `${path ? path + '/' : ''}${name}` })
      qc2.invalidateQueries({ queryKey: ['nas-list', path] })
    } catch (e) {
      alert(e.response?.data?.detail || '삭제 실패')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md max-h-[75vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <HardDrive size={16} /> 부서 자료실
          </span>
          <div className="flex items-center gap-1">
            {data?.can_write && (
              <>
                <button onClick={() => upRef.current?.click()} disabled={busy}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 font-medium disabled:opacity-50">
                  <Upload size={13} /> 업로드
                </button>
                <input ref={upRef} type="file" className="hidden" onChange={e => { upload(e.target.files[0]); e.target.value = '' }} />
              </>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1"><X size={18} /></button>
          </div>
        </div>

        {/* 경로 */}
        <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 overflow-x-auto whitespace-nowrap">
          <button onClick={() => goTo(-1)} className="hover:text-blue-600 font-medium">전체</button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight size={12} className="text-slate-300" />
              <button onClick={() => goTo(i)} className="hover:text-blue-600">{c}</button>
            </span>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {isLoading ? (
            <div className="text-center text-xs text-slate-400 py-10">불러오는 중...</div>
          ) : isError ? (
            <div className="text-center text-xs text-slate-400 py-10">NAS에 연결할 수 없습니다.<br />관리자에게 문의하세요.</div>
          ) : (data?.dirs?.length === 0 && data?.files?.length === 0) ? (
            <div className="text-center text-xs text-slate-400 py-10">빈 폴더입니다</div>
          ) : (
            <>
              {data.dirs.map(d => (
                <button key={d.name} onClick={() => setPath(path ? `${path}/${d.name}` : d.name)}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                  <Folder size={16} className={`flex-shrink-0 ${d.name === data.my_dept ? 'text-blue-500' : 'text-amber-400'}`} />
                  <span className="text-sm text-slate-800 dark:text-slate-100 truncate">{d.name}</span>
                  {d.name === data.my_dept && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-medium">내 본부</span>}
                </button>
              ))}
              {data.files.map(f => (
                <div key={f.name} className="group w-full flex items-center gap-2.5 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                  <button onClick={() => attach(f.name)} disabled={busy}
                    className="flex items-center gap-2.5 flex-1 min-w-0 text-left disabled:opacity-50"
                    title="클릭하면 채팅에 첨부됩니다">
                    <FileText size={16} className="text-slate-400 flex-shrink-0" />
                    <span className="text-sm text-slate-800 dark:text-slate-100 truncate">{f.name}</span>
                  </button>
                  {f.days_left !== undefined && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                      f.days_left <= 1 ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300'
                      : f.days_left <= 3 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}
                      title={`${f.days_left}일 후 자동 삭제`}>
                      D-{f.days_left}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400 flex-shrink-0">{fmtNasSize(f.size)}</span>
                  {data.can_write && (
                    <button onClick={() => removeFile(f.name)} disabled={busy}
                      title="파일 삭제"
                      className="text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded p-1 transition-colors flex-shrink-0">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
          파일 클릭 → 첨부 · 업로드는 내 본부 폴더만 · ⏳ 파일은 업로드 {data?.ttl_days || 7}일 후 자동 삭제
        </div>
      </div>
    </div>
  )
}

function ForwardModal({ msg, convos, users, myId, onClose, onSent }) {
  const [q, setQ] = useState('')
  const [sending, setSending] = useState(false)

  // 대상: 기존 대화방 + 전체 사용자(DM) — 채널 기준 중복 제거
  const targets = []
  const seen = new Set()
  for (const c of convos) {
    if (!seen.has(c.channel) && !c.channel.startsWith('ai:')) {
      seen.add(c.channel)
      targets.push({ channel: c.channel, label: c.label, sub: c.kind === 'dm' ? c.avatar?.dept : null })
    }
  }
  for (const u of users) {
    const ch = dmChannel(myId, u.id)
    if (!seen.has(ch)) {
      seen.add(ch)
      targets.push({ channel: ch, label: u.name, sub: u.dept_name })
    }
  }
  const ql = q.trim().toLowerCase()
  const filtered = targets.filter(t => !ql || t.label.toLowerCase().includes(ql) || (t.sub || '').toLowerCase().includes(ql))

  const forward = async (t) => {
    if (sending) return
    setSending(true)
    try {
      await api.post('/chat/messages', { channel: t.channel, content: msg.content || '', attachment: msg.attachment || null })
      onSent(t.label)
    } catch {
      alert('전달 실패')
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm max-h-[70vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100">메시지 전달</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
          <div className="text-xs text-slate-400 truncate mb-2 px-1">
            {msg.attachment ? '📎 ' : ''}{(msg.content || msg.attachment?.name || '').slice(0, 50)}
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="대화방·이름·부서 검색"
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="text-center text-xs text-slate-400 py-8">대상이 없습니다</div>
          ) : filtered.slice(0, 30).map(t => (
            <button key={t.channel} onClick={() => forward(t)} disabled={sending}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 disabled:opacity-50 transition-colors">
              <Share2 size={14} className="text-slate-400 flex-shrink-0" />
              <span className="text-sm text-slate-800 dark:text-slate-100 truncate">{t.label}</span>
              {t.sub && <span className="text-xs text-slate-400 truncate">{t.sub}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function GroupModal({ users, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState([])
  const [q, setQ] = useState('')
  const [saving, setSaving] = useState(false)
  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const selectedUsers = users.filter(u => selected.includes(u.id))
  const ql = q.trim().toLowerCase()
  // 검색 결과: 이름·부서 매칭, 미선택자만, 부서→이름 정렬
  const results = users
    .filter(u => !selected.includes(u.id))
    .filter(u => ql && (u.name.toLowerCase().includes(ql) || (u.dept_name || '').toLowerCase().includes(ql)))
    .sort((a, b) => (a.dept_name || '').localeCompare(b.dept_name || '') || a.name.localeCompare(b.name))
    .slice(0, 40)

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
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">그룹 만들기</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="그룹 이름"
          className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 mb-3" />

        {/* 선택된 멤버 칩 */}
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          멤버 {selected.length > 0 && <span className="text-blue-600 dark:text-blue-400">{selected.length}명 선택됨</span>}
        </div>
        {selectedUsers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selectedUsers.map(u => (
              <button key={u.id} onClick={() => toggle(u.id)}
                className="flex items-center gap-1 text-xs bg-blue-600 text-white pl-2 pr-1.5 py-1 rounded-full font-medium hover:bg-blue-700">
                {u.name}<X size={12} />
              </button>
            ))}
          </div>
        )}

        {/* 검색 */}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="이름 또는 부서로 검색..."
          className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 mb-2" />

        <div className="flex-1 overflow-y-auto min-h-[80px] border border-slate-200 dark:border-slate-700 rounded-xl p-1.5 mb-4">
          {!ql ? (
            <div className="text-center text-xs text-slate-400 py-8">이름이나 부서를 입력해 검색하세요<br />(예: 김철수, 재무팀)</div>
          ) : results.length === 0 ? (
            <div className="text-center text-xs text-slate-400 py-8">검색 결과 없음</div>
          ) : results.map(u => (
            <button key={u.id} onClick={() => toggle(u.id)}
              className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer text-left">
              <Avatar emoji={u.avatar_emoji} color={u.avatar_color} size={24} />
              <span className="text-sm text-slate-700 dark:text-slate-200 flex-1">{u.name}</span>
              {u.dept_name && <span className="text-[11px] text-slate-400">{u.dept_name}</span>}
              <span className="text-blue-500 text-xs font-bold">+</span>
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">취소</button>
          <button onClick={create} disabled={!name.trim() || selected.length === 0 || saving}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium">만들기</button>
        </div>
      </div>
    </div>
  )
}

function MsgActions({ onReply, onReact, onForward, onTask, onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity self-center">
      <button onClick={onReact} title="반응" className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"><Smile size={14} /></button>
      <button onClick={onReply} title="답글" className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"><CornerUpLeft size={14} /></button>
      <button onClick={onForward} title="전달" className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"><Share2 size={14} /></button>
      <button onClick={onTask} title="할일로 등록" className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"><CheckSquare size={14} /></button>
      {onEdit && <button onClick={onEdit} title="수정" className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"><Pencil size={14} /></button>}
      {onDelete && <button onClick={onDelete} title="삭제" className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"><Trash2 size={14} /></button>}
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
