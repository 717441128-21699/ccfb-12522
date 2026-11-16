import { el, button, field } from './dom';
import { state, save, newId, currentEvent, runtimeOf } from '../state';
import { probeVideo } from '../video/decoder';
import type { EventMeta } from '../types';

/** 赛事管理页:创建/选择赛事,录入选手,上传视频 */
export function renderEvents(root: HTMLElement, rerender: () => void): void {
  root.append(el('h2', {}, '赛事管理'));

  // 新建赛事
  const nameIn = el('input', { placeholder: '赛事名称,如:校运会男子100米预赛第2组' });
  const distIn = el('input', { placeholder: '项目,如:100米' });
  const grpIn = el('input', { placeholder: '组别,如:男子甲组' });
  root.append(
    el(
      'div',
      { class: 'card row' },
      field('名称', nameIn),
      field('项目', distIn),
      field('组别', grpIn),
      button('新建赛事', () => {
        if (!nameIn.value.trim()) return alert('请填写赛事名称');
        const ev: EventMeta = {
          id: newId(),
          name: nameIn.value.trim(),
          distance: distIn.value.trim() || '100米',
          groupName: grpIn.value.trim(),
          athletes: [],
          wind: null,
          line: null,
          gunSec: null,
          marks: [],
          fps: null,
          frameCount: null,
          videoFileName: null,
        };
        state.events.push(ev);
        state.currentId = ev.id;
        save();
        rerender();
      }),
    ),
  );

  const cur = currentEvent();

  // 赛事列表
  const list = el('div', { class: 'card' }, el('h3', {}, '赛事列表'));
  if (state.events.length === 0) list.append(el('p', { class: 'dim' }, '暂无赛事'));
  for (const ev of state.events) {
    const row = el(
      'div',
      { class: 'row event-row' + (ev.id === state.currentId ? ' active' : '') },
      el('strong', {}, `${ev.name}`),
      el('span', { class: 'dim' }, ` ${ev.distance} ${ev.groupName}`),
      el('span', { class: 'dim' }, ev.videoFileName ? ` 视频:${ev.videoFileName}` : ' 未上传视频'),
      button('打开', () => {
        state.currentId = ev.id;
        save();
        rerender();
      }),
      button('删除', () => {
        if (!confirm(`删除赛事「${ev.name}」?`)) return;
        state.events = state.events.filter((e) => e.id !== ev.id);
        state.runtime.delete(ev.id);
        if (state.currentId === ev.id) state.currentId = null;
        save();
        rerender();
      }),
    );
    list.append(row);
  }
  root.append(list);

  if (!cur) return;
  const rt = runtimeOf(cur.id);

  // 视频上传
  const fileIn = el('input', { type: 'file', accept: 'video/mp4,video/quicktime' });
  const info = el('p', { class: 'dim' }, rt.videoInfo
    ? `已加载:${rt.videoInfo.width}×${rt.videoInfo.height},${rt.videoInfo.fps.toFixed(3)} fps,共 ${rt.videoInfo.frameCount} 帧(${rt.videoInfo.durationSec.toFixed(2)} 秒)`
    : cur.videoFileName
      ? `上次使用:${cur.videoFileName}(刷新后需重新选择文件)`
      : '未选择视频');
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files?.[0];
    if (!f) return;
    info.textContent = '正在解析视频…';
    try {
      const vi = await probeVideo(f);
      rt.videoFile = f;
      rt.videoInfo = vi;
      rt.scan = null; // 视频变了,旧扫描图作废
      cur.fps = vi.fps;
      cur.frameCount = vi.frameCount;
      cur.videoFileName = f.name;
      save();
      info.textContent = `已加载:${vi.width}×${vi.height},${vi.fps.toFixed(3)} fps,共 ${vi.frameCount} 帧(${vi.durationSec.toFixed(2)} 秒)`;
    } catch (e) {
      info.textContent = `解析失败:${e instanceof Error ? e.message : String(e)}`;
    }
  });
  root.append(el('div', { class: 'card' }, el('h3', {}, `比赛视频 — ${cur.name}`), fileIn, info));

  // 选手名单
  const roster = el('div', { class: 'card' }, el('h3', {}, '选手名单(按道次)'));
  const tbl = el('table', {});
  tbl.append(el('tr', {}, el('th', {}, '道次'), el('th', {}, '姓名'), el('th', {}, '')));
  for (const a of cur.athletes) {
    tbl.append(
      el(
        'tr',
        {},
        el('td', {}, String(a.lane)),
        el('td', {}, a.name),
        el('td', {}, button('移除', () => {
          cur.athletes = cur.athletes.filter((x) => x !== a);
          cur.marks = cur.marks.filter((m) => m.lane !== a.lane);
          save();
          rerender();
        })),
      ),
    );
  }
  roster.append(tbl);
  const laneIn = el('input', { type: 'number', min: '1', max: '12', placeholder: '道次', style: 'width:5em' });
  const nameIn2 = el('input', { placeholder: '姓名' });
  roster.append(
    el(
      'div',
      { class: 'row' },
      laneIn,
      nameIn2,
      button('添加选手', () => {
        const lane = parseInt(laneIn.value, 10);
        if (!lane || !nameIn2.value.trim()) return alert('请填道次和姓名');
        if (cur.athletes.some((a) => a.lane === lane)) return alert('该道次已有选手');
        cur.athletes.push({ lane, name: nameIn2.value.trim() });
        cur.athletes.sort((a, b) => a.lane - b.lane);
        save();
        rerender();
      }),
    ),
  );
  root.append(roster);
}
