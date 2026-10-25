// muse-review 스킬용 ego-browser 도우미. ego-browser nodejs 스크립트 안에서 불러 쓴다.
//   const m = await import("file://<스킬 폴더>/scripts/muse.mjs");  // 플러그인이면 ${CLAUDE_PLUGIN_ROOT}/skills/muse-review
// 스크립트는 매번 새 Node 프로세스라, 함수마다 작업 공간 이름(또는 id)으로 다시 붙는다.
// taskSpace·listTaskSpaces는 ego-browser가 넣어 주는 전역 함수다.
import { readFileSync } from "node:fs";

// 이 컴퓨터만의 설정: ~/.claude/muse-review.json (플러그인 폴더는 업데이트 때 바뀌어서 밖에 둔다)
//   { "profileId": "Profile 2", "profileName": "표시 이름" } — Muse에 로그인된 Ego Lite 프로필.
// 프로필이 여럿이면 Muse 로그인은 하나에만 있을 수 있다(2026-10-23 확인: 다른 프로필은 로그인 화면).
const LOCAL = (() => {
  try { return JSON.parse(readFileSync(`${process.env.HOME}/.claude/muse-review.json`, "utf8")); } catch { return {}; }
})();
const PROFILE = LOCAL.profileId; // 없으면 ego-browser 기본 프로필
const INPUT = 'textarea[placeholder="메시지 보내기"]';
const SEND = 'button[aria-label="보내기"]';

// 페이지 안에서 돈다. 끝 표지 뒤의 Muse 답과 오른쪽 패널 상태를 읽는다.
// 일하는 동안엔 상태 줄 앞에 🎬 같은 그림 줄이 끼어서 그 줄을 건너뛴다(2026-10-22).
function readState(end) {
  const t = document.body.innerText, s = t.indexOf(end);
  if (s < 0) return { found: false };
  const p = t.indexOf("\nMuse\n", s); // 오른쪽 Muse 패널이 시작되는 곳
  const reply = t.slice(s + end.length, p < 0 ? undefined : p).trim();
  const head = p < 0 ? [] : t.slice(p + 6).split("\n");
  const status = /^\p{Extended_Pictographic}/u.test(head[0] || "") ? head[1] : head[0];
  // 본문이 [Muse 끝]을 인용할 수 있어서, 답이 이 표지로 끝나는지를 본다
  return { found: true, reply, status, done: reply.endsWith("[Muse 끝]") && status === "연결됨" };
}

// 이미 있는 작업 공간에만 붙는다. taskSpace(이름)은 없으면 기본 프로필로 새로 만들어 버린다.
async function attach(space) {
  const found = (await listTaskSpaces()).find((s) => s.id === space || s.name === space);
  if (!found) throw new Error(`작업 공간 없음: ${space} — open()부터`);
  if (found.ownership !== "agent") throw new Error(`사용자가 조작 중(${found.ownership}) — 멈추고 사용자에게 묻는다`);
  const task = await taskSpace(found.id);
  return { task, page: task.page("p1") };
}

// 채팅을 연다. 처음이면 설정 파일의 프로필로 작업 공간을 만들고, 있으면 다시 붙는다.
// profileId는 새로 만들 때만 받는다(이미 있는 공간에 넘기면 오류).
export async function open({ name, url, profileId = PROFILE }) {
  const exists = (await listTaskSpaces()).some((s) => s.name === name);
  const task = exists ? (await attach(name)).task : await taskSpace(name, profileId ? { profileId } : {});
  const page = task.page("p1");
  if ((await page.url()) !== url) await page.goto(url);
  await page.waitForLoadState();
  const ready = await page.waitForSelector(INPUT, { state: "visible", timeout: 15_000 }).then(() => true, () => false);
  // 대화 글은 입력창보다 늦게 그려진다. 바로 읽으면 마지막 답과 오른쪽 패널이 빠졌다(2026-10-23).
  // 글 길이가 1.5초 간격으로 두 번 같을 때까지(최대 20초) 기다린다.
  for (let i = 0, last = -1, same = 0; i < 14 && same < 2; i++) {
    const n = await page.evaluate(() => document.body.innerText.length);
    same = n === last ? same + 1 : 0;
    last = n;
    await page.waitForTimeout(1_500);
  }
  const login = await page.evaluate(() => /로그인 또는 계정 만들기/.test(document.body.innerText));
  const space = (await listTaskSpaces()).find((s) => s.id === task.spaceId);
  const profileOk = !LOCAL.profileName || space?.profileName === LOCAL.profileName;
  return { spaceId: task.spaceId, profile: space?.profileName, profileOk, url: await page.url(), ready, login };
}

// 채팅 화면 글 전체를 파일로 저장한다. 링크도 그대로 남는다.
export async function saveChat({ space, out }) {
  const { writeFile } = await import("node:fs/promises");
  const { page } = await attach(space);
  const text = await page.evaluate(() => document.body.innerText);
  await writeFile(out, text);
  return { out, length: text.length, lastClaudeMarkerAt: text.lastIndexOf("[Claude R") };
}

// 메시지 파일을 입력창에 넣고 보낸다. 클립보드는 쓰지 않는다.
// React 입력창이라 값 setter를 직접 부르고 input 이벤트를 보낸다.
// dryRun이면 넣고 확인만 한 뒤 비운다.
export async function send({ space, file, end, dryRun = false }) {
  const { readFile } = await import("node:fs/promises");
  const msg = await readFile(file, "utf8");
  if (!msg.trimEnd().endsWith(end)) throw new Error(`메시지가 끝 표지로 끝나지 않음: ${end}`);
  const { page } = await attach(space);
  await page.waitForSelector(INPUT, { state: "visible", timeout: 15_000 });
  const fill = (value) => page.evaluate(({ input, value, end }) => {
    const ta = document.querySelector(input);
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, value);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    const button = document.querySelector('button[aria-label="보내기"]');
    return { len: ta.value.length, ends: ta.value.split(end).length - 1, button: button ? !button.disabled : null };
  }, { input: INPUT, value, end });

  if (await page.evaluate((end) => document.body.innerText.includes(end), end)) {
    throw new Error(`이 끝 표지가 이미 채팅에 있음(중복 전송?): ${end}`);
  }
  const put = await fill(msg);
  const checked = { ...put, expected: msg.length };
  if (put.len !== msg.length || put.ends !== 1 || !put.button) {
    await fill("");
    throw new Error(`입력 확인 실패, 비움: ${JSON.stringify(checked)}`);
  }
  if (dryRun) {
    await fill("");
    return { ...checked, sent: false };
  }
  await page.click(SEND, { label: "Muse에 보내기" });
  await page.waitForFunction((end) => document.body.innerText.includes(end), end, { timeout: 20_000 });
  return { ...checked, sent: true, status: (await page.evaluate(readState, end)).status };
}

// 답이 끝날 때까지 기다렸다가 답 전문을 파일로 저장한다.
// 시간 안에 안 끝나면 화면을 찍어 두고 done:false로 돌아온다. 승인 버튼은 누르지 않는다.
export async function waitReply({ space, end, out, timeout = 300_000, shot }) {
  const { writeFile } = await import("node:fs/promises");
  const { page } = await attach(space);
  const until = Date.now() + timeout;
  let st = await page.evaluate(readState, end);
  while (st.found && !st.done && Date.now() < until) {
    await page.waitForTimeout(5_000);
    st = await page.evaluate(readState, end);
  }
  if (!st.found) return { found: false };
  if (st.reply) await writeFile(out, st.reply);
  const result = { done: st.done, status: st.status, length: st.reply.length, first: st.reply.split("\n")[0], out };
  if (!st.done && shot) result.screenshot = await page.screenshot({ path: shot });
  return result;
}

// 사용자가 브라우저에서 직접 해야 할 때(로그인, 확인 창). 넘긴 뒤 그 라운드를 끝낸다.
export async function handOff({ space }) {
  const { task } = await attach(space);
  await task.handOff();
  return { spaceId: task.spaceId, handedOff: true };
}

// 끝낼 때 한 번만. keep: [] 는 탭을 닫고, ["p1"]은 사용자가 보도록 남긴다. 대화는 Muse에 남는다.
export async function close({ space, keep = [] }) {
  const { task } = await attach(space);
  return await task.finish({ keep });
}
