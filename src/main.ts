import './style.css';
import { load } from './state';
import { el } from './ui/dom';
import { renderEvents } from './ui/eventsPage';
import { renderCalibrate } from './ui/calibratePage';
import { renderScan } from './ui/scanPage';
import { renderRead } from './ui/readPage';
import { renderResults } from './ui/resultsPage';

const TABS = [
  { id: 'events', label: '赛事', render: renderEvents },
  { id: 'calibrate', label: '终点线标定', render: renderCalibrate },
  { id: 'scan', label: '扫描成像', render: renderScan },
  { id: 'read', label: '判读', render: renderRead },
  { id: 'results', label: '成绩公告', render: renderResults },
] as const;

type TabId = (typeof TABS)[number]['id'];

function currentTab(): TabId {
  const h = location.hash.replace('#/', '');
  return (TABS.some((t) => t.id === h) ? h : 'events') as TabId;
}

function render(): void {
  const tab = currentTab();
  const nav = document.getElementById('nav')!;
  nav.replaceChildren();
  for (const t of TABS) {
    const a = el('a', { href: `#/${t.id}`, class: t.id === tab ? 'active' : '' }, t.label);
    nav.append(a);
  }
  const app = document.getElementById('app')!;
  app.replaceChildren();
  TABS.find((t) => t.id === tab)!.render(app, render);
}

load();
window.addEventListener('hashchange', render);
render();
