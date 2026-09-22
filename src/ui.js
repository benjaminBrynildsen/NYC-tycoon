// HUD wiring: top bar, portfolio, lot panel, massing dialog, the in-world
// building label, and the standings.

import * as THREE from 'three';
import { DISTRICTS, USES, STYLES, FORMS, massing, minFloors, maxFloors, buildableSf, CONFIG } from './world.js';
import { TYPES } from './architecture.js';
import {
  money, sf, askPrice, landValue, buildingNOI, buildingValue, quote, netWorth,
  leaderboard, buyLot, sellLot, startProject, formatDate, occupancyFor, rentPerSf,
  premiums, blockCharacter, rushQuote, rushProject, nameBuilding, worthBreakdown,
  makeOffer, reservePrice,
} from './economy.js';

const $ = (id) => document.getElementById(id);
const pct = (n) => `${Math.round(n * 100)}%`;

export class UI {
  constructor(state, controls) {
    this.state = state;
    this.controls = controls;
    this.selected = null;
    this.onSpeed = () => {};
    this.onTravel = () => {};
    this.onDirty = () => {};
    this.onMassingPreview = () => {};
    this.design = { style: 'masonry', form: 'stepped', variant: 1 };

    $('lot-close').onclick = () => this.closeLot();
    $('build-close').onclick = () => $('build-panel').classList.add('hidden');
    $('pf-close').onclick = () => $('portfolio').classList.add('hidden');
    $('s-worth-wrap').onclick = () => this.togglePortfolio();

    for (const b of document.querySelectorAll('.sp')) b.onclick = () => this.setSpeed(+b.dataset.speed);
    $('i-floors').oninput = () => this.refreshBuild();
    $('i-use').onchange = () => this.refreshBuild();
    $('i-ltc').oninput = () => this.refreshBuild();
    $('do-build').onclick = () => this.commit();

    $('i-style').innerHTML = Object.entries(STYLES)
      .map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
    $('i-style').value = this.design.style;
    $('i-style').onchange = () => {
      this.design.style = $('i-style').value;
      this.design.variant = 1;
      this.renderSwatches();
      this.refreshBuild();
    };
    $('i-form').innerHTML = Object.entries(FORMS)
      .map(([k, v]) => `<button type="button" class="formbtn" data-form="${k}">${v.name}</button>`).join('');
    for (const b of $('i-form').children) {
      b.onclick = () => { this.design.form = b.dataset.form; this.refreshBuild(); };
    }
    this.renderSwatches();
  }

  /** Facade colours come straight from the chosen style's palette. */
  renderSwatches() {
    const pal = TYPES[STYLES[this.design.style].type].pal;
    $('i-colors').innerHTML = pal.map((hex, i) =>
      `<button type="button" class="swatch" data-v="${i}" style="background:${hex}"></button>`).join('');
    for (const b of $('i-colors').children) {
      b.onclick = () => { this.design.variant = +b.dataset.v; this.refreshBuild(); };
    }
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
    this._toastT = setTimeout(() => t.classList.remove('on'), 3400);
  }

  prompt(text) {
    const p = $('prompt');
    if (text) { p.textContent = text; p.classList.add('on'); } else p.classList.remove('on');
  }

  // -------------------------------------------------------------- top + portfolio

  refreshTop() {
    const s = this.state, me = s.actors.player;
    $('s-date').textContent = formatDate(s);
    $('s-cash').textContent = money(me.cash);
    $('s-cash').className = me.cash < 0 ? 'bad' : 'good';
    $('s-worth').textContent = money(netWorth(s, 'player'));
    $('s-gsf').textContent = sf(me.gsfBuilt);
    const c = s.cycle;
    $('s-cycle').textContent = c > 1.15 ? `Boom ${c.toFixed(2)}` : c < 0.9 ? `Slump ${c.toFixed(2)}` : `Steady ${c.toFixed(2)}`;
    $('s-cycle').className = c > 1.15 ? 'good' : c < 0.9 ? 'bad' : '';
    const rank = leaderboard(s).findIndex((a) => a.isPlayer) + 1;
    $('s-rank').textContent = `${rank}${['st', 'nd', 'rd', 'th'][Math.min(rank - 1, 3)]} of 4`;
    if (!$('portfolio').classList.contains('hidden')) this.refreshPortfolio();
  }

  togglePortfolio() {
    const p = $('portfolio');
    p.classList.toggle('hidden');
    if (!p.classList.contains('hidden')) this.refreshPortfolio();
  }

  refreshPortfolio() {
    const b = worthBreakdown(this.state);
    const line = (k, v, cls = '', sep = false) =>
      `<div class="kv${sep ? ' sep' : ''}"><span>${k}</span><b class="${cls}">${v}</b></div>`;
    $('pf-assets').innerHTML =
      line('Cash', money(b.cash), b.cash < 0 ? 'bad' : 'good') +
      line('Land', money(b.land)) +
      line('Buildings', money(b.buildings)) +
      line('Work in progress', money(b.wip)) +
      line('Debt', money(-b.debt), 'bad') +
      line('Net worth', money(b.total), 'big', true);
    $('pf-income').innerHTML =
      line('Rent (NOI)', `${money(b.noi)}/yr`, 'good') +
      line('Property tax', `${money(-b.tax)}/yr`) +
      line('Debt service', `${money(-b.debtService)}/yr`, 'bad') +
      line('Net income', `${money(b.netIncome)}/yr`, b.netIncome < 0 ? 'bad big' : 'good big', true) +
      line('Per month', `${money(b.netIncome / 12)}`, b.netIncome < 0 ? 'bad' : '');
    $('pf-holdings').textContent =
      `${b.lots} lots · ${b.built} buildings · ${sf(b.gsf)} · ${this.state.projects.filter((p) => p.owner === 'player').length} under construction`;
  }

  refreshBoard() {
    const s = this.state;
    $('leaderboard').innerHTML = leaderboard(s).map((a) => `
      <li class="${a.isPlayer ? 'me' : ''}">
        <span class="dot" style="background:#${a.color.toString(16).padStart(6, '0')}"></span>
        <span class="nm">${a.name}<br><span class="sub">${sf(a.gsfBuilt)} built</span></span>
        <span class="wv">${money(a.worth)}</span>
      </li>`).join('');
    $('log').innerHTML = s.log.slice(0, 12).map((e) =>
      `<li><b>${e.name === 'You' && e.text.startsWith('—') ? '' : e.name}</b> ${e.text}</li>`).join('')
      || '<li>Nothing yet.</li>';
  }

  // ----------------------------------------------------- the in-world label

  /** A floating panel pinned to a building, showing what it is and how it's going. */
  updateWorldLabel(lot, camera) {
    const el = $('worldlabel');
    if (!lot || (!lot.project && !lot.building)) { el.classList.add('hidden'); return; }
    const s = this.state;
    const h = lot.project ? lot.project.floors * CONFIG.FLOOR_H
                          : lot.building.floors * CONFIG.FLOOR_H;
    const v = new THREE.Vector3(lot.x, Math.min(h, 70) + 6, lot.z).project(camera);
    if (v.z > 1) { el.classList.add('hidden'); return; }
    el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
    el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
    el.classList.remove('hidden');

    const mine = lot.owner === 'player';
    const title = lot.name || (lot.project ? 'Under construction' : USES[lot.building.use].name);
    let rows = '';

    if (lot.project) {
      const p = lot.project;
      const done = Math.max(0, Math.min(1, (s.day - p.startDay) / (p.endDay - p.startDay)));
      const monthsLeft = Math.max(0, (p.endDay - s.day) / 30);
      const floorsUp = Math.round(done * p.floors);
      rows = `
        <div class="wl-bar"><i style="width:${pct(done)}"></i></div>
        <div class="wl-row"><span>Progress</span><b>${floorsUp} / ${p.floors} floors</b></div>
        <div class="wl-row"><span>Remaining</span><b>${monthsLeft.toFixed(1)} months</b></div>
        <div class="wl-row"><span>Income when done</span><b class="good">${money(p.projectedNOI)}/yr</b></div>
        <div class="wl-row"><span>Cost to date</span><b>${money(p.cost)}</b></div>`;
      if (mine && monthsLeft > 0.4) {
        const q = rushQuote(s, p, 3);
        rows += `<button class="wl-btn" id="wl-rush">Pay ${money(q.cost)} → ${q.months.toFixed(1)} months sooner</button>`;
      }
    } else {
      const b = lot.building;
      rows = `
        <div class="wl-row"><span>Size</span><b>${b.floors} floors · ${sf(b.gsf)}</b></div>
        <div class="wl-row"><span>Occupancy</span><b>${pct(occupancyFor(s, lot))}</b></div>
        <div class="wl-row"><span>Condition</span><b class="${b.condition < 0.45 ? 'bad' : b.condition > 0.8 ? 'good' : ''}">${pct(b.condition ?? 1)}</b></div>
        <div class="wl-row"><span>Income</span><b class="${mine ? 'good' : ''}">${money(buildingNOI(s, lot))}/yr</b></div>
        <div class="wl-row"><span>Value</span><b>${money(buildingValue(s, lot))}</b></div>`;
    }

    el.innerHTML = `<div class="wl-head">${title}</div>
      <div class="wl-addr">${lot.address} · at ${lot.crossStreet}</div>${rows}`;

    const rush = $('wl-rush');
    if (rush) rush.onclick = (e) => {
      e.stopPropagation();
      const r = rushProject(s, lot, 'player', 3);
      if (!r.ok) return this.toast(r.why, true);
      this.toast(`Overtime authorised — ${r.months.toFixed(1)} months pulled forward for ${money(r.cost)}.`);
      this.refreshTop();
    };
  }

  // ----------------------------------------------------------------- lot panel

  select(lot) {
    this.selected = lot;
    if (!lot) return this.closeLot();
    const s = this.state;
    const d = DISTRICTS[lot.district];
    const owned = lot.owner === 'player';
    const rival = lot.owner && lot.owner !== 'npc' && lot.owner !== 'player' ? s.actors[lot.owner] : null;
    const p = premiums(s, lot);

    $('lot-panel').classList.remove('hidden');
    $('lot-title').textContent = lot.name || lot.address;
    $('lot-meta').innerHTML =
      `${lot.name ? lot.address + ' · ' : ''}at ${lot.crossStreet} · ${d.name} · FAR ${lot.far}<br>`
      + `${sf(buildableSf(lot))} buildable · <b>${blockCharacter(s, lot.block)}</b>`;

    // The location tags are the part of the value that isn't size or zoning.
    const tags = [];
    if (lot.waterDist < 120) tags.push(['Waterfront', `+${Math.round((p.water - 1) * 100)}%`, 'tag-water']);
    if (lot.parkFront) tags.push(['Park front', `+${Math.round((p.park - 1) * 100)}%`, 'tag-park']);
    if (lot.avenue.famous || lot.street.famous) {
      const c = lot.avenue.famous ? lot.avenue : lot.street;
      tags.push([`${c.name} retail`, `+${Math.round((p.corridor - 1) * 100)}%`, 'tag-retail']);
    }
    if ((lot._blight ?? 0) > 0.35) tags.push(['Blighted block', `${Math.round((p.blight - 1) * 100)}%`, 'tag-blight']);
    $('lot-tags').innerHTML = tags.map(([n, v, c]) => `<span class="tag ${c}">${n} <b>${v}</b></span>`).join('');

    const rows = [];
    const row = (k, v, cls = '') => rows.push(`<div class="kv"><span>${k}</span><b class="${cls}">${v}</b></div>`);
    row('Owner', owned ? 'You' : rival ? rival.name : 'On the market', owned ? 'good' : rival ? 'bad' : '');
    row('Land value', money(landValue(s, lot)));

    if (lot.project) {
      const pr = lot.project;
      const done = Math.max(0, Math.min(1, (s.day - pr.startDay) / (pr.endDay - pr.startDay)));
      row('Under construction', `${pr.floors} floors · ${pct(done)}`);
      row('Months left', ((pr.endDay - s.day) / 30).toFixed(1));
      row('Income when done', `${money(pr.projectedNOI)}/yr`, 'good');
    } else if (lot.building) {
      const b = lot.building;
      row('Built', `${b.floors} floors · ${sf(b.gsf)}`);
      row('Use', USES[b.use].name);
      row('Condition', pct(b.condition ?? 1), (b.condition ?? 1) < 0.45 ? 'bad' : '');
      row('Occupancy', pct(occupancyFor(s, lot)));
      row('NOI / yr', money(buildingNOI(s, lot)), 'good');
      row('Asset value', money(buildingValue(s, lot)));
      const unused = buildableSf(lot) - b.gsf;
      if (unused > buildableSf(lot) * 0.25) row('Unbuilt capacity', sf(unused), 'good');
    } else {
      row('Status', 'Vacant');
    }
    if (!owned && !rival) row('Ask', money(askPrice(s, lot)));
    if (rival) row('Est. value', money(landValue(s, lot) + (lot.building ? buildingValue(s, lot) : 0)));
    $('lot-rows').innerHTML = rows.join('');

    // Rival-owned land isn't for sale, but everything has a price.
    const offerBox = $('lot-offer');
    if (rival && !lot.project) {
      offerBox.classList.remove('hidden');
      const est = landValue(s, lot) + (lot.building ? buildingValue(s, lot) : 0);
      const slider = $('i-offer');
      slider.min = Math.round(est * 0.6);
      slider.max = Math.round(est * 2.2);
      slider.step = Math.max(10000, Math.round(est / 200));
      if (!slider.value || +slider.value < +slider.min || +slider.value > +slider.max) {
        slider.value = Math.round(est * 1.3);
      }
      const sync = () => {
        $('o-offer').textContent = money(+slider.value);
        $('do-offer').disabled = s.actors.player.cash < +slider.value;
        $('do-offer').textContent = s.actors.player.cash < +slider.value
          ? 'Not enough cash' : `Offer ${money(+slider.value)}`;
      };
      slider.oninput = sync;
      sync();
      $('offer-note').textContent = lot.offerBlockedUntil > s.day
        ? `${rival.name} won't revisit this for ${Math.ceil(lot.offerBlockedUntil - s.day)} days.`
        : `${rival.name} isn't advertising it. Find their number.`;
      $('do-offer').onclick = () => {
        const r = makeOffer(s, lot, 'player', +slider.value);
        if (!r.ok) return this.toast(r.why, true);
        if (r.accepted) {
          this.toast(`${r.seller} accepted. ${lot.address} is yours for ${money(r.price)}.`);
          this.refreshTop(); this.refreshBoard(); this.onDirty();
        } else {
          this.toast(r.why, true);
        }
        this.select(lot);
      };
    } else offerBox.classList.add('hidden');

    // Naming, once it's yours and there's something to name.
    const nameBox = $('lot-name');
    if (owned && (lot.building || lot.project)) {
      nameBox.classList.remove('hidden');
      $('i-name').value = lot.name || '';
      $('i-name').placeholder = lot.address;
    } else nameBox.classList.add('hidden');
    $('do-name').onclick = () => {
      nameBuilding(s, lot, $('i-name').value);
      this.toast(lot.name ? `Named "${lot.name}".` : 'Name cleared.');
      this.select(lot);
    };

    const acts = [];
    if (!owned && (!lot.owner || lot.owner === 'npc')) {
      const afford = s.actors.player.cash >= askPrice(s, lot);
      acts.push(`<button id="a-buy" ${afford ? '' : 'disabled'}>Buy — ${money(askPrice(s, lot))}</button>`);
    }
    if (owned && !lot.project) {
      acts.push(`<button id="a-build" class="primary">${lot.building ? 'Redevelop' : 'Build'}</button>`);
      acts.push('<button id="a-sell">Sell</button>');
    }
    if (owned && lot.project) acts.push('<button id="a-rush" class="primary">Speed up</button>');
    if (this.controls.mode === 'board') acts.push('<button id="a-travel">Go there</button>');
    $('lot-actions').innerHTML = acts.join('');

    const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    on('a-buy', () => {
      const r = buyLot(s, lot, 'player');
      if (!r.ok) return this.toast(r.why, true);
      this.toast(`Bought ${lot.address} for ${money(r.price)}.`);
      this.select(lot); this.refreshTop(); this.refreshBoard();
    });
    on('a-build', () => this.openBuild(lot));
    on('a-sell', () => {
      const r = sellLot(s, lot, 'player');
      if (!r.ok) return this.toast(r.why, true);
      this.toast(`Sold ${lot.address} for ${money(r.price * 0.97)}.`);
      this.select(lot); this.refreshTop(); this.onDirty();
    });
    on('a-rush', () => {
      const q = rushQuote(s, lot.project, 6);
      const r = rushProject(s, lot, 'player', 6);
      if (!r.ok) return this.toast(r.why, true);
      this.toast(`Paid ${money(r.cost)} for overtime — ${r.months.toFixed(1)} months sooner.`);
      this.select(lot); this.refreshTop();
    });
    on('a-travel', () => this.onTravel(lot));
  }

  closeLot() {
    this.selected = null;
    $('lot-panel').classList.add('hidden');
    $('build-panel').classList.add('hidden');
  }

  // -------------------------------------------------------------- build dialog

  openBuild(lot) {
    this.buildLot = lot;
    const lo = minFloors(lot), hi = maxFloors(lot);
    const inp = $('i-floors');
    inp.min = lo; inp.max = hi;
    inp.value = Math.min(hi, Math.max(lo, Math.round(lo * 1.25)));
    $('build-lot').innerHTML =
      `${lot.address} · FAR ${lot.far} · entitlement ${sf(buildableSf(lot))}<br>`
      + `<span class="dimtext">${lo} floors uses it all; taller means slimmer.</span>`;
    $('build-panel').classList.remove('hidden');
    this.refreshBuild();
  }

  refreshBuild() {
    const lot = this.buildLot;
    if (!lot) return;
    const floors = +$('i-floors').value;
    const use = $('i-use').value;
    const ltc = +$('i-ltc').value / 100;
    $('o-floors').textContent = `${floors} · ${Math.round(floors * CONFIG.FLOOR_H)}m`;
    $('o-ltc').textContent = pct(ltc);
    for (const b of $('i-form').children) b.classList.toggle('on', b.dataset.form === this.design.form);
    for (const b of $('i-colors').children) b.classList.toggle('on', +b.dataset.v === this.design.variant);

    const q = quote(this.state, lot, floors, use, ltc, this.design);
    const cash = this.state.actors.player.cash;
    const rows = [
      ['Floor area', sf(q.gsf)],
      ['Footprint', `${pct(q.coverage)} of lot`],
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
    btn.textContent = cash < q.equity ? `Need ${money(q.equity - cash)} more` : `Break ground — ${money(q.equity)} down`;
    this.onMassingPreview(lot, floors, use, this.design);
  }

  commit() {
    const lot = this.buildLot;
    const floors = +$('i-floors').value;
    const use = $('i-use').value;
    const ltc = +$('i-ltc').value / 100;
    const r = startProject(this.state, lot, 'player', floors, use, ltc, { ...this.design });
    if (!r.ok) return this.toast(r.why, true);
    const nm = $('i-buildname').value.trim();
    if (nm) nameBuilding(this.state, lot, nm);
    $('i-buildname').value = '';
    this.toast(`Broke ground at ${lot.address}: ${floors} floors, ${r.quote.months} months.`);
    $('build-panel').classList.add('hidden');
    this.onDirty();
    this.select(lot);
    this.refreshTop();
  }
}
