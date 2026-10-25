# muse-review

Claude Code 스킬: [Muse](https://muse.ai)(개인 AI 비서)와 브라우저로 대화하며 산출물을 리뷰받고, Muse가 쓴 지시서를 가져온다.
A Claude Code skill that talks to Muse through the Ego Lite browser to get critique rounds and fetch Muse-written task briefs (instructions are in Korean).

## 하는 일

- **리뷰**: 파일을 Muse에게 보내 비판을 받고, 지적마다 동의·일부 동의·반대를 판단해 타당한 것만 반영한다. Muse가 "없음"이라고 답할 때까지(최대 10회) 주고받고, 사용자 결정 목록과 기록 파일(`muse-feedback.md`)을 남긴다.
- **지시서 가져오기**: Muse가 채팅에 써 둔 Claude Code용 지시서를 읽어, 사용자 확인을 받은 작업만 실행한다.

Muse의 답은 참고 자료이고, 실행 근거는 사용자가 Claude Code에 직접 한 요청뿐이다. 승인 버튼 누르기, 비밀번호 입력, 게시·전송은 하지 않는다.

## 필요한 것

- [Claude Code](https://claude.com/claude-code)
- [Ego Lite](https://lite.ego.app/) 브라우저와 ego-browser 스킬 (`ego-browser nodejs`로 도우미 스크립트를 돌림)
- Ego Lite 프로필 하나에 Muse 로그인

## 설치

```bash
git clone https://github.com/freewisl/muse-review ~/.claude/skills/muse-review
```

스킬 폴더에 `local.json`을 만든다(git에 올리지 않음). Muse에 로그인된 Ego Lite 프로필을 적는다.

```json
{"profileId": "Profile 2", "profileName": "프로필 표시 이름"}
```

없으면 ego-browser 기본 프로필로 열린다.

## 파일

| 파일 | 내용 |
|---|---|
| `SKILL.md` | 스킬 본문: 채팅 열기, 보내기 전 확인, 메시지 형식, 답 읽기, 지적 판단, 라운드 진행, 기록 |
| `scripts/muse.mjs` | ego-browser 도우미: `open`, `saveChat`, `send`(클립보드 없이 입력창에 직접 넣고 확인), `waitReply`, `handOff`, `close` |

Muse 화면 구조(입력창 placeholder "메시지 보내기", 오른쪽 패널 상태 "연결됨" 등)는 2026-10 기준이다. 화면이 바뀌면 `scripts/muse.mjs`의 선택자를 고친다.
