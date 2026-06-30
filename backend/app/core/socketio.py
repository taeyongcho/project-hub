from socketio import AsyncServer
from fastapi import Request
from typing import Dict, Set

sio = AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    ping_timeout=60,
    ping_interval=25
)

# 보드별 활성 사용자
board_users: Dict[int, Set[str]] = {}
# 사용자 정보
user_info: Dict[str, Dict] = {}


@sio.event
async def connect(sid, environ):
    print(f'클라이언트 {sid} 연결됨')


@sio.on('join_board')
async def join_board(sid, data):
    board_id = data.get('boardId')
    user_id = data.get('userId')
    user_name = data.get('userName')

    if board_id not in board_users:
        board_users[board_id] = set()

    board_users[board_id].add(sid)
    user_info[sid] = {
        'userId': user_id,
        'userName': user_name,
        'boardId': board_id
    }

    # 현재 사용자들에게 알림
    await sio.emit('user_joined', {
        'userId': user_id,
        'userName': user_name,
        'activeUsers': [user_info[s] for s in board_users.get(board_id, []) if s in user_info]
    }, room=f'board_{board_id}')

    # 이 클라이언트를 room에 추가 (AsyncServer는 await 필요)
    await sio.enter_room(sid, f'board_{board_id}')


@sio.on('sync')
async def handle_sync(sid, data):
    """보드 전체 상태를 같은 보드의 다른 사용자에게 전송 (초기/폴백)"""
    board_id = data.get('boardId')
    if board_id:
        await sio.emit('sync', data, room=f'board_{board_id}', skip_sid=sid)


@sio.on('delta')
async def handle_delta(sid, data):
    """변경분(추가/수정 upserts, 삭제 deletes)만 전송"""
    board_id = data.get('boardId')
    if board_id:
        await sio.emit('delta', data, room=f'board_{board_id}', skip_sid=sid)


@sio.on('join_channel')
async def join_channel(sid, data):
    """채팅 채널 방 입장"""
    channel = data.get('channel')
    if channel:
        await sio.enter_room(sid, f'chat_{channel}')


@sio.on('leave_channel')
async def leave_channel(sid, data):
    """채팅 채널 방 퇴장"""
    channel = data.get('channel')
    if channel:
        await sio.leave_room(sid, f'chat_{channel}')


@sio.on('draw')
async def handle_draw(sid, data):
    """그리기 이벤트를 같은 보드의 모든 사용자에게 전송"""
    board_id = data.get('boardId')
    if board_id and f'board_{board_id}' in [r for r in sio.rooms(sid) if isinstance(r, str)]:
        await sio.emit('draw', data, room=f'board_{board_id}', skip_sid=sid)


@sio.on('cursor')
async def handle_cursor(sid, data):
    """커서 위치를 다른 사용자들에게 전송"""
    board_id = data.get('boardId')
    if board_id:
        cursor_data = {
            **data,
            'userId': user_info.get(sid, {}).get('userId'),
            'userName': user_info.get(sid, {}).get('userName')
        }
        await sio.emit('cursor', cursor_data, room=f'board_{board_id}', skip_sid=sid)


@sio.on('delete_object')
async def handle_delete(sid, data):
    """오브젝트 삭제를 다른 사용자들에게 전송"""
    board_id = data.get('boardId')
    if board_id and f'board_{board_id}' in [r for r in sio.rooms(sid) if isinstance(r, str)]:
        await sio.emit('delete_object', data, room=f'board_{board_id}', skip_sid=sid)


@sio.on('update_object')
async def handle_update(sid, data):
    """오브젝트 업데이트를 다른 사용자들에게 전송"""
    board_id = data.get('boardId')
    if board_id and f'board_{board_id}' in [r for r in sio.rooms(sid) if isinstance(r, str)]:
        await sio.emit('update_object', data, room=f'board_{board_id}', skip_sid=sid)


@sio.event
async def disconnect(sid):
    """사용자 연결 해제"""
    info = user_info.pop(sid, None)
    if info:
        board_id = info.get('boardId')
        if board_id in board_users:
            board_users[board_id].discard(sid)
            if not board_users[board_id]:
                del board_users[board_id]

            await sio.emit('user_left', {
                'userId': info.get('userId'),
                'userName': info.get('userName'),
                'activeUsers': [user_info[s] for s in board_users.get(board_id, []) if s in user_info]
            }, room=f'board_{board_id}')

    print(f'클라이언트 {sid} 연결 해제')
