// HUD wiring: the top bar, the lot panel, the massing dialog, the standings.

import { DISTRICTS, USES, massing, minFloors, maxFloors, buildableSf, CONFIG } from './world.js';
import {
  money, sf, askPrice, landValue, buildingNOI, buildingValue, quote, netWorth,
  leaderboard, buyLot, sellLot, startProject, formatDate, occupancyFor, rentPerSf,
} from './economy.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(state, controls) {
    this.state = state;
    this.controls = controls;
    this.selected = null;
    this.buildFloors = 10;
    this.onSpeed = () => {};
    this.onTravel = () => {};
    this.onDirty = () => {};

    $('lot-close').onclick = () => this.closeLot();
    $('build-close').onclick = () => $('build-panel').classList.add('hidden');

    for (const b of document.querySelectorAll('.sp')) {
      b.onclick = () => this.setSpeed(+b.dataset.speed);
    }

    $('i-floors').oninput = () => this.refreshBuild();
    $('i-use').onchange = () => this.refreshBuild();
    $('i-ltc').oninput = () => this.refreshBuild();
    $('do-build').onclick = () => this.commit();
  }

  setSpeed(n) {
    this.speed = n;
    for (const b of document.querySelectorAll('.sp')) b.classList.toggle('on', +b.dataset.speed === n);
    this.onSpeed(n);
  }

  toast(text, warn = false) {
    const t = $('toast');
    t.textContent = text;
    t.classList.toggle('warn', warn);
    t.classList.add('on');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('on'), 3200);
  }

  prompt(text) {
    const p = $('prompt');
    if (text) { p.textContent = text; p.classList.add('on'); }
    else p.classList.remove('on');
  }

  // ------------------------------------------------------------- top bar

  refreshTop() {
    const s = this.state;
    const me = s.actors.player;
    $('s-date').textContent = formatDate(s);
    $('s-cash').textContent = money(me.cash);
    $('s-cash').className = me.cash < 0 ? 'bad' : 'good';
    $('s-worth').textContent = money(netWorth(s, 'player'));
    $('s-debt').textContent = money(me.debt);
    $('s-gsf').textContent = sf(me.gsfBuilt);
    const c = s.cycle;
    $('s-cycle').textContent = c > 1.15 ? `Boom ${c.toFixed(2)}` : c < 0.9 ? `Slump ${c.toFixed(2)}` : `Steady ${c.toFixed(2)}`;
    $('s-cycle').className = c > 1.15 ? 'good' : c < 0.9 ? 'bad' : '';
  }

  refreshBoard() {
    const s = this.state;
    const rows = leaderboard(s);
    $('leaderboard').innerHTML = rows.map((a) => `
      <li class="${a.isPlayer ? 'me' : ''}">
        <span class="dot" style="background:#${a.color.toString(16).padStart(6, '0')}"></span>
        <span class="nm">${a.name}<br><span class="sub">${sf(a.gsfBuilt)} built</span></span>
        <span class="wv">${money(a.worth)}</span>
      </li>`).join('');

    $('log').innerHTML = s.log.slice(0, 14).map((e) =>
      `<li><b>${e.name}</b> ${e.text}</li>`).join('') || '<li>Nothing yet.</li>';
  }

  // ------------------------------------------------------------ lot panel

  select(lot) {
    this.selected = lot;
    if (!lot) return this.closeLot();
    const s = this.state;
    const d = DISTRICTS[lot.district];
    const owned = lot.owner === 'player';
    const rival = lot.owner && lot.owner !== 'npc' && lot.owner !== 'player'
      ? s.actors[lot.owner] : null;

    $('lot-panel').classList.remove('hidden');
    $('lot-title').textContent = `Lot #${lot.id} — ${d.name}`;
    $('lot-meta').textContent =
      `FAR ${lot.far} · ${Math.round(lot.areaSf).toLocaleString()} sf site · `
      + `${sf(buildableSf(lot))} buildable`;

    const rows = [];
    const row = (k, v, cls = '') => rows.push(`<div class="kv"><span>${k}</span><b class="${cls}">${v}</b></div>`);

    row('Owner', owned ? 'You' : rival ? rival.name : 'On the market',
      owned ? 'good' : rival ? 'bad' : '');
    row('Land value', money(landValue(s, lot)));

    if (lot.project) {
      const p = lot.project;
      const pct = Math.round(Math.max(0, Math.min(1, (s.day - p.startDay) / (p.endDay - p.startDay))) * 100);
      row('Under construction', `${p.floors} floors · ${pct}%`);
      row('Cost', money(p.cost));
    } else if (lot.building) {
      const b = lot.building;
      row('Built', `${b.floors} floors · ${sf(b.gsf)}`);
      row('Use', USES[b.use].name);
      row('Occupancy', `${Math.round(occupancyFor(s, lot) * 100)}%`);
      row('NOI / yr', money(buildingNOI(s, lot)), 'good');
      row('Asset value', money(buildingValue(s, lot)));
      const unused = buildableSf(lot) - b.gsf;
      if (unused > buildableSf(lot) * 0.25) {
        row('Unbuilt capacity', sf(unused), 'good');
      }
    } else {
      row('Status', 'Vacant');
    }
    if (!owned) row('Ask', money(askPrice(s, lot)));
    $('lot-rows').innerHTML = rows.join('');

    const acts = [];
    if (!owned && (!lot.owner || lot.owner === 'npc')) {
      const afford = s.actors.player.cash >= askPrice(s, lot);
      acts.push(`<button id="a-buy" ${afford ? '' : 'disabled'}>Buy — ${money(askPrice(s, lot))}</button>`);
    }
    if (owned && !lot.project) {
      acts.push(`<button id="a-build" class="primary">${lot.building ? 'Redevelop' : 'Build'}</button>`);
      acts.push(`<button id="a-sell">Sell</button>`);
    }
    if (this.controls.mode === 'board') acts.push(`<button id="a-travel">Go there</button>`);
    $('lot-actions').innerHTML = acts.join('');

    const buy = $('a-buy'), build = $('a-build'), sell = $('a-sell'), travel = $('a-travel');
    if (buy) buy.onclick = () => {
      const r = buyLot(this.state, lot, 'player');
      if (!r.ok) return this.toast(r.why, true);
      this.toast(`Bought lot #${lot.id} for ${money(r.price)}.`);
      this.select(lot); this.refreshTop(); this.refreshBoard();
    };
    if (build) build.onclick = () => this.openBuild(lot);
    if (sell) sell.onclick = () => {
      const r = sellLot(this.state, lot, 'player');
      if (!r.ok) return this.toast(r.why, true);
      this.toast(`Sold #${lot.id} for ${money(r.price * 0.97)}.`);
      this.select(lot); this.refreshTop(); this.onDirty();
    };
    if (travel) travel.onclick = () => this.onTravel(lot);
  }

  closeLot() {
    this.selected = null;
    $('lot-panel').classList.add('hidden');
    $('build-panel').classList.add('hidden');
  }

  // ---------------------------------------------------------- build dialog

  openBuild(lot) {
    this.buildLot = lot;
    const lo = minFloors(lot), hi = maxFloors(lot);
    const inp = $('i-floors');
    inp.min = lo; inp.max = hi;
    inp.value = Math.min(hi, Math.max(lo, Math.round(lo * 1.25)));
    $('build-lot').textContent =
      `Lot #${lot.id} · FAR ${lot.far} · entitlement ${sf(buildableSf(lot))} · min ${lo} floors to use it all`;
    $('build-panel').classList.remove('hidden');
    this.refreshBuild();
  }

  refreshBuild() {
    const lot = this.buildLot;
    if (!lot) return;
    const floors = +$('i-floors').value;
    const use = $('i-use').value;
    const ltc = +$('i-ltc').value / 100;
    this.buildFloors = floors;
    $('o-floors').textContent = `${floors} · ${Math.round(floors * CONFIG.FLOOR_H)}m`;
    $('o-ltc').textContent = `${Math.round(ltc * 100)}%`;

    const q = quote(this.state, lot, floors, use, ltc);
    const cash = this.state.actors.player.cash;
    const rows = [
      ['Floor area', sf(q.gsf)],
      ['Footprint', `${Math.round(q.coverage * 100)}% of lot`],
      ['Rent', `$${rentPerSf(this.state, lot, use, floors).toFixed(0)}/sf`],
      ['Hard + soft cost', money(q.hard + q.soft)],
      ['Land', q.land > 0 ? money(q.land) : 'owned'],
      ['Total cost', money(q.total), 'sep'],
      ['Loan', money(q.loan)],
      ['Your equity', money(q.equity)],
      ['Stabilised NOI', money(q.noi), 'sep'],
      ['Debt service', money(-q.debtService)],
      ['Cash flow / yr', money(q.cashflow)],
      ['Yield on cost', `${(q.yieldOnCost * 100).toFixed(1)}%`],
      ['Value on completion', money(q.value)],
      ['Profit', money(q.value - q.total), 'sep'],
      ['Schedule', `${q.months} months`],
    ];
    $('build-figures').innerHTML = rows.map(([k, v, cls]) =>
      `<tr class="${cls || ''}"><td>${k}</td><td>${v}</td></tr>`).join('');

    const btn = $('do-build');
    btn.disabled = cash < q.equity;
    btn.textContent = cash < q.equity
      ? `Need ${money(q.equity - cash)} more`
      : `Break ground — ${money(q.equity)} down`;

    this.onMassingPreview(lot, floors, use);
  }

  onMassingPreview() {}   // wired by main to drive the Vision ghost

  commit() {
    const lot = this.buildLot;
    const floors = +$('i-floors').value;
    const use = $('i-use').value;
    const ltc = +$('i-ltc').value / 100;
    const r = startProject(this.state, lot, 'player', floors, use, ltc);
    if (!r.ok) return this.toast(r.why, true);
    this.toast(`Broke ground: ${floors} floors, ${sf(r.quote.gsf)}, ${r.quote.months} months.`);
    $('build-panel').classList.add('hidden');
    this.onDirty();
    this.select(lot);
    this.refreshTop();
  }
}
