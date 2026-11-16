import { el, button } from './dom';
import { currentEvent, runtimeOf, save } from '../state';
import { raceTime, formatRaceTime } from '../scan/timing';
import { generatePdf } from '../pdf/report';

/** 成绩公告页:排名表、风速录入(顺风>2m/s 标不计纪录)、导出 PDF */
export function renderResults(root: HTMLElement, rerender: () => void): void {
  root.append(el('h2', {}, '成绩公告'));
  const ev0 = currentEvent();
  if (!ev0) {
    root.append(el('p', {}, '请先在「赛事」页选择赛事。'));
    return;
  }
  const ev = ev0;
  const rt = runtimeOf(ev.id);
  const fpsMaybe = rt.videoInfo?.fps ?? ev.fps;
  if (!fpsMaybe) {
    root.append(el('p', {}, '缺少帧率信息,请先上传视频。'));
    return;
  }
  const fps: number = fpsMaybe;

  // 风速
  const windIn = el('input', { type: 'number', step: '0.1', placeholder: '如 +1.3 或 -0.5' });
  if (ev.wind !== null) windIn.value = String(ev.wind);
  const windNote = el('span', { class: 'dim' }, '');
  const updateWindNote = () => {
    if (ev.wind !== null && ev.wind > 2.0) {
      windNote.textContent = ` 风速 +${ev.wind.toFixed(1)} m/s 超过 +2.0 m/s,本场成绩不计纪录。`;
      windNote.className = 'warn';
    } else {
      windNote.textContent = ev.wind !== null ? ` 风速 ${ev.wind >= 0 ? '+' : ''}${ev.wind.toFixed(1)} m/s,合规。` : '';
      windNote.className = 'dim';
    }
  };
  windIn.addEventListener('change', () => {
    const v = parseFloat(windIn.value);
    ev.wind = Number.isFinite(v) ? v : null;
    save();
    updateWindNote();
    refreshTable();
  });
  updateWindNote();

  // 成绩表
  const tbl = el('table', { class: 'results' });
  function refreshTable(): void {
    tbl.replaceChildren();
    tbl.append(
      el('tr', {},
        el('th', {}, '名次'), el('th', {}, '道次'), el('th', {}, '姓名'),
        el('th', {}, '成绩'), el('th', {}, '备注')),
    );
    const rows = ev.athletes
      .map((a) => {
        const m = ev.marks.find((x) => x.lane === a.lane);
        const gun = ev.gunSec;
        const t = m && gun !== null ? raceTime(m.frame, fps, gun) : null;
        return { a, t };
      })
      .sort((x, y) => (x.t ?? Infinity) - (y.t ?? Infinity));
    let rank = 0;
    let lastT: number | null = null;
    for (const { a, t } of rows) {
      if (t !== null && t !== lastT) rank++;
      lastT = t;
      const windBad = ev.wind !== null && ev.wind > 2.0;
      tbl.append(
        el('tr', {},
          el('td', {}, t !== null ? String(rank) : '—'),
          el('td', {}, String(a.lane)),
          el('td', {}, a.name),
          el('td', {}, t !== null ? formatRaceTime(t) : '未判读'),
          el('td', {}, t !== null && windBad ? '风速超规,不计纪录' : ''),
        ),
      );
    }
  }
  refreshTable();

  const pdfBtn = button('生成成绩单 PDF', async () => {
    pdfBtn.disabled = true;
    try {
      await generatePdf(ev, fps, rt.scan);
    } catch (e) {
      alert(`PDF 生成失败:${e instanceof Error ? e.message : String(e)}`);
    } finally {
      pdfBtn.disabled = false;
    }
  });

  root.append(
    el('div', { class: 'card' },
      el('h3', {}, `${ev.name} — ${ev.distance} ${ev.groupName}`),
      el('div', { class: 'row' }, el('span', {}, '风速 (m/s,顺风为正):'), windIn, windNote),
      tbl,
      el('div', { class: 'row' }, pdfBtn,
        el('span', { class: 'dim' }, ev.gunSec === null ? ' 注意:未设定发令枪零点,无法计算比赛用时。' : '')),
    ),
  );
  void rerender;
}
