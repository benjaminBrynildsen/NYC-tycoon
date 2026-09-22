// HUD wiring: top bar, portfolio, lot panel, massing dialog, the in-world
// building label, and the standings.

import * as THREE from 'three';
import { DISTRICTS, USES, STYLES, FORMS, massing, minFloors, maxFloors, buildableSf,
         floorsWithoutAir, CONFIG } from './world.js';
import { TYPES, massingVolumes, typologyFor } from './architecture.js';
import {
  money, sf, askPrice, landValue, buildingNOI, buildingValue, quote, netWorth,
  leaderboard, buyLot, sellLot, startProject, formatDate, occupancyFor, rentPerSf,
  premiums, blockCharacter, rushQuote, rushProject, nameBuilding, worthBreakdown,
  makeOffer, reservePrice,
} from './economy.js';

const $ = (id) => document.getElementById(id);
const pct = (n) => `${Math.round(n * 100)}%`;

/**
 * A newsprint elevation of the building a story is about, drawn from the same
 * volume stack the 3D mesh uses, so the paper shows the thing you actually built.
 */
function drawPlate(canvas, story, city) {
  if (!canvas) return;
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const INK = '#24211b', PAPER = '#ded6c2', SKY = '#cfc7b1';

  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);
  g.fillStyle = SKY;
  g.fillRect(0, 0, W, H * 0.88);
  // Halftone: enough grain to read as printed rather than drawn.
  g.fillStyle = 'rgba(36,33,27,0.10)';
  for (let y = 2; y < H * 0.88; y += 4) {
    for (let x = (y / 4) % 2 ? 2 : 4; x < W; x += 4) g.fillRect(x, y, 1, 1);
  }

  const ground = H * 0.88;
  g.fillStyle = INK;
  g.fillRect(0, ground, W, 1.5);

  const lot = story.lotId != null ? city.lots[story.lotId] : null;
  if (!lot || !story.snapshot) {
    // No building to draw: a generic skyline for market and corridor stories.
    const bars = [0.34, 0.55, 0.42, 0.72, 0.5, 0.63, 0.38];
    const bw = W / bars.length;
    g.fillStyle = INK;
    bars.forEach((t, i) => g.fillRect(i * bw + 3, ground - ground * t, bw - 6, ground * t));
    g.fillStyle = SKY;
    bars.forEach((t, i) => {
      for (let y = ground - ground * t + 7; y < ground - 6; y += 9) {
        for (let x = i * bw + 8; x < (i + 1) * bw - 10; x += 8) g.fillRect(x, y, 3, 4);
      }
    });
    return;
  }

  const b = story.snapshot;
  const vols = massingVolumes(lot, b);
  const totalH = b.floors * CONFIG.FLOOR_H;
  const widest = Math.max(...vols.map((v) => v.w));
  const scale = Math.min((W * 0.44) / widest, (ground - 10) / totalH);
  const cx = W * 0.5;

  // Neighbours for scale, so the tower reads as tall rather than just big.
  g.fillStyle = 'rgba(36,33,27,0.45)';
  const nh = Math.min(ground * 0.36, totalH * scale * 0.5);
  g.fillRect(cx - widest * scale / 2 - 46, ground - nh, 42, nh);
  g.fillRect(cx + widest * scale / 2 + 4, ground - nh * 0.82, 42, nh * 0.82);

  for (const v of vols) {
    const w = v.w * scale;
    const h = v.floors * CONFIG.FLOOR_H * scale;
    const y = ground - (v.y0 * CONFIG.FLOOR_H + v.floors * CONFIG.FLOOR_H) * scale;
    g.fillStyle = INK;
    g.fillRect(cx - w / 2, y, w, h);
    // Window courses, punched back out in paper colour.
    g.fillStyle = SKY;
    const rows = Math.max(1, Math.round(v.floors));
    const step = h / rows;
    if (step > 2.2) {
      for (let r = 0; r < rows; r++) {
        const wy = y + r * step + step * 0.28;
        for (let x = cx - w / 2 + 3; x < cx + w / 2 - 4; x += 6) {
          g.fillRect(x, wy, 2.6, Math.max(1, step * 0.4));
        }
      }
    }
    g.fillStyle = PAPER;
    g.fillRect(cx - w / 2 - 1, y - 2, w + 2, 2);      // cornice
  }

  // Two figures on the pavement, for scale.
  g.fillStyle = INK;
  for (const fx of [cx - widest * scale / 2 - 14, cx + widest * scale / 2 + 20]) {
    g.fillRect(fx, ground - 9, 2.4, 6);
    g.beginPath(); g.arc(fx + 1.2, ground - 10.6, 1.7, 0, 6.3); g.fill();
    g.fillRect(fx, ground - 3.5, 1, 3.5);
    g.fillRect(fx + 1.6, ground - 3.5, 1, 3.5);
  }
}

export class UI {
  constructor(state, controls) {
    this.state = state;
    this.controls = controls;
    this.selected = null;
    this.onSpeed = () => {};
    this.onTravel = () => {};
    this.onDirty = () => {};
    this.onMassingPreview = () => {};
    this.onHighlight = () => 0;
    this.highlightOwner = null;
    this.design = { style: 'masonry', form: 'stepped', variant: 1 };

    $('lot-close').onclick = () => this.closeLot();
    $('build-close').onclick = () => $('build-panel').classList.add('hidden');
    $('pf-close').onclick = () => $('portfolio').classList.add('hidden');
    $('np-more').onclick = () => this.openFullEdition();
    // Delegated: the standings list is rebuilt on a timer, so a handler bound
    // to each row would be thrown away between press and release.
    $('leaderboard').addEventListener('click', (e) => {
      const li = e.target.closest('li[data-actor]');
      if (!li) return;
      const id = li.dataset.actor;
      this.highlightOwner = this.highlightOwner === id ? null : id;
      const n = this.onHighlight(this.highlightOwner);
      this.toast(this.highlightOwner
        ? `${this.state.actors[id].name}: ${n} ${n === 1 ? 'property' : 'properties'} lit up on the map.`
        : 'Highlight cleared.');
      this.refreshBoard();
    });
    $('np-close').onclick = () => $('np-full').classList.add('hidden');
    $('np-full').onclick = (e) => { if (e.target.id === 'np-full') $('np-full').classList.add('hidden'); };
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
      <li data-actor="${a.id}" class="${a.isPlayer ? 'me' : ''}${this.highlightOwner === a.id ? ' lit' : ''}">
        <span class="dot" style="background:#${a.color.toString(16).padStart(6, '0')}"></span>
        <span class="nm">${a.name}<br><span class="sub">${sf(a.gsfBuilt)} built</span></span>
        <span class="wv">${money(a.worth)}</span>
      </li>`).join('');
    $('lb-hint').textContent = this.highlightOwner
      ? 'Click again to clear the highlight'
      : 'Click a firm to see what they own';
  }

  // -------------------------------------------------------------- the paper

  /** Front page. Only redrawn when a new story breaks. */
  refreshNews() {
    const s = this.state;
    const top = s.news[0];
    $('np-date').textContent = formatDate(s);
    if (!top) {
      // Draw the skyline anyway so day one isn't a blank rectangle.
      if (!this._emptyPlate) { this._emptyPlate = true; drawPlate($('np-plate'), {}, s.city); }
      return;
    }
    this._emptyPlate = false;
    if (this._newsDay === top.day + top.headline) return;
    this._newsDay = top.day + top.headline;
    $('np-head').textContent = top.headline;
    $('np-dek').textContent = top.dek;
    drawPlate($('np-plate'), top, s.city);
  }

  openFullEdition() {
    const s = this.state;
    $('np-full').classList.remove('hidden');
    $('np-fulldate').textContent = `${formatDate(s)} · ${s.mood} market · ${s.news.length} stories on file`;
    const host = $('np-stories');
    host.innerHTML = s.news.slice(0, 14).map((n, i) => `
      <article class="np-story">
        <canvas id="plate-${i}" width="352" height="200"></canvas>
        <div>
          <div class="when">${n.date}${n.address ? ' · ' + n.address : ''}</div>
          <div class="h">${n.headline}</div>
          <div class="d">${n.dek}</div>
        </div>
      </article>`).join('') || '<p class="d">Nothing has happened yet.</p>';
    s.news.slice(0, 14).forEach((n, i) => drawPlate($(`plate-${i}`), n, s.city));

    $('log').innerHTML = s.log.slice(0, 16).map((e) =>
      `<li><b>${e.text.startsWith('—') ? '' : e.name}</b> ${e.text}</li>`).join('')
      || '<li>Nothing yet.</li>';
  }

  // ----------------------------------------------------- the in-world label

  /**
   * A panel pinned to a building in the world. Built once per subject and then
   * updated in place: rebuilding the markup every frame destroyed the button
   * before a click could ever land on it.
   */
  updateWorldLabel(lot, camera) {
    const el = $('worldlabel');
    if (!lot || (!lot.project && !lot.building)) {
      el.classList.add('hidden');
      this._wlKey = null;
      return;
    }
    const s = this.state;
    const isProject = !!lot.project;
    const mine = lot.owner === 'player';
    const key = `${lot.id}_${isProject}_${mine}_${lot.name || ''}`;

    const h = (isProject ? lot.project.floors : lot.building.floors) * CONFIG.FLOOR_H;
    // The label runs before the renderer, so make sure we project against this
    // frame's camera rather than the last one's.
    camera.updateMatrixWorld();
    const v = new THREE.Vector3(lot.x, Math.min(h, 90) + 6, lot.z).project(camera);
    if (v.z > 1) { el.classList.add('hidden'); return; }
    // Snap to whole pixels: sub-pixel drift makes the button impossible to hit.
    el.style.left = `${Math.round((v.x * 0.5 + 0.5) * innerWidth)}px`;
    el.style.top = `${Math.round((-v.y * 0.5 + 0.5) * innerHeight)}px`;
    el.classList.remove('hidden');

    if (this._wlKey !== key) {
      this._wlKey = key;
      const title = lot.name || (isProject ? 'Under construction' : USES[lot.building.use].name);
      const rows = isProject
        ? [['Progress', 'p1'], ['Remaining', 'p2'], ['Income when done', 'p3'], ['Cost to date', 'p4']]
        : [['Size', 'p1'], ['Occupancy', 'p2'], ['Condition', 'p3'], ['Income', 'p4'], ['Value', 'p5']];
      if (isProject && mine) rows.push(['Overtime (3 mo)', 'p5']);
      el.innerHTML =
        `<div class="wl-head">${title}</div>`
        + `<div class="wl-addr">${lot.address} · at ${lot.crossStreet}</div>`
        + (isProject ? '<div class="wl-bar"><i id="wl-prog"></i></div>' : '')
        + rows.map(([k, id]) => `<div class="wl-row"><span>${k}</span><b id="wl-${id}"></b></div>`).join('')
        + (isProject && mine ? '<button class="wl-btn" id="wl-rush">Pay for overtime</button>' : '');

      const rush = $('wl-rush');
      if (rush) rush.onclick = (e) => {
        e.stopPropagation();
        const r = rushProject(s, lot, 'player', 3);
        if (!r.ok) return this.toast(r.why, true);
        this.toast(`Overtime authorised — ${r.months.toFixed(1)} months pulled forward for ${money(r.cost)}.`);
        this.refreshTop();
        if (this.selected === lot) this.select(lot);
      };
    }

    const set = (id, text, cls) => {
      const node = $(`wl-${id}`);
      if (!node) return;
      node.textContent = text;
      if (cls !== undefined) node.className = cls;
    };

    if (isProject) {
      const pr = lot.project;
      const done = Math.max(0, Math.min(1, (s.day - pr.startDay) / (pr.endDay - pr.startDay)));
      const monthsLeft = Math.max(0, (pr.endDay - s.day) / 30);
      const bar = $('wl-prog');
      if (bar) bar.style.width = pct(done);
      set('p1', `${Math.round(done * pr.floors)} / ${pr.floors} floors`);
      set('p2', `${monthsLeft.toFixed(1)} months`);
      set('p3', `${money(pr.projectedNOI)}/yr`, 'good');
      set('p4', money(pr.cost));
      const rush = $('wl-rush');
      if (rush) {
        const q = rushQuote(s, pr, 3);
        const broke = s.actors.player.cash < q.cost;
        // Only the row's value changes; the button's own label stays fixed so
        // its box never moves under the cursor.
        set('p5', q.months <= 0.05 ? '—' : `${money(q.cost)} → ${q.months.toFixed(1)} mo`,
            broke ? 'bad' : '');
        rush.disabled = q.months <= 0.05 || broke;
      }
    } else {
      const b = lot.building;
      set('p1', `${b.floors} floors · ${sf(b.gsf)}`);
      set('p2', pct(occupancyFor(s, lot)));
      set('p3', pct(b.condition ?? 1), (b.condition ?? 1) < 0.45 ? 'bad' : (b.condition ?? 1) > 0.8 ? 'good' : '');
      set('p4', `${money(buildingNOI(s, lot))}/yr`, mine ? 'good' : '');
      set('p5', money(buildingValue(s, lot)));
    }
  }

  // ----------------------------------------------------------------- lot panel

  select(lot) {
    if (!lot) return this.closeLot();
    const s = this.state;
    const d = DISTRICTS[lot.district];
    const owned = lot.owner === 'player';
    const rival = lot.owner && lot.owner !== 'npc' && lot.owner !== 'player' ? s.actors[lot.owner] : null;
    const p = premiums(s, lot);

    // The panel refreshes four times a second. Its interactive half holds a
    // text field and buttons, so that half is only rebuilt when the shape of
    // the panel actually changes — otherwise typing and clicks get swallowed.
    const sig = `${lot.id}|${lot.owner}|${!!lot.building}|${!!lot.project}|${this.controls.mode}`;
    const fresh = sig !== this._lotSig;
    this._lotSig = sig;
    this.selected = lot;
    $('lot-panel').classList.remove('hidden');

    // Panels need the mouse, and pointer lock owns it.
    if (fresh && document.pointerLockElement) document.exitPointerLock();

    $('lot-title').textContent = lot.name || lot.address;
    $('lot-meta').innerHTML =
      `${lot.name ? lot.address + ' · ' : ''}at ${lot.crossStreet} · ${d.name} · FAR ${lot.far}<br>`
      + `${sf(buildableSf(lot))} buildable · <b>${blockCharacter(s, lot.block)}</b>`;

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
    row('Height limit', `${maxFloors(lot)} floors`);

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

    if (fresh) this._buildLotControls(lot, { owned, rival });
    if (this._offerSync) this._offerSync();
  }

  /** The half of the lot panel that holds focusable controls. */
  _buildLotControls(lot, { owned, rival }) {
    const s = this.state;

    const nameBox = $('lot-name');
    if (owned && (lot.building || lot.project)) {
      nameBox.classList.remove('hidden');
      $('i-name').value = lot.name || '';
      $('i-name').placeholder = lot.address;
      $('do-name').onclick = () => {
        nameBuilding(s, lot, $('i-name').value);
        this.toast(lot.name ? `Named "${lot.name}".` : 'Name cleared.');
        this._wlKey = null;
        this.onDirty();
        this.select(lot);
      };
    } else nameBox.classList.add('hidden');

    const offerBox = $('lot-offer');
    this._offerSync = null;
    if (rival && !lot.project) {
      offerBox.classList.remove('hidden');
      const est = landValue(s, lot) + (lot.building ? buildingValue(s, lot) : 0);
      const slider = $('i-offer');
      slider.min = Math.round(est * 0.6);
      slider.max = Math.round(est * 2.2);
      slider.step = Math.max(10000, Math.round(est / 200));
      slider.value = Math.round(est * 1.3);
      this._offerSync = () => {
        $('o-offer').textContent = money(+slider.value);
        const broke = s.actors.player.cash < +slider.value;
        $('do-offer').disabled = broke;
        $('do-offer').textContent = broke ? 'Not enough cash' : `Offer ${money(+slider.value)}`;
        $('offer-note').textContent = lot.offerBlockedUntil > s.day
          ? `${rival.name} won't revisit this for ${Math.ceil(lot.offerBlockedUntil - s.day)} days.`
          : `${rival.name} isn't advertising it. Everything has a price.`;
      };
      slider.oninput = this._offerSync;
      $('do-offer').onclick = () => {
        const r = makeOffer(s, lot, 'player', +slider.value);
        if (!r.ok) return this.toast(r.why, true);
        if (r.accepted) {
          this.toast(`${r.seller} accepted. ${lot.address} is yours for ${money(r.price)}.`);
          this.refreshTop(); this.refreshBoard(); this.onDirty();
        } else this.toast(r.why, true);
        this._lotSig = null;
        this.select(lot);
      };
      this._offerSync();
    } else offerBox.classList.add('hidden');

    const acts = [];
    if (!owned && (!lot.owner || lot.owner === 'npc')) {
      acts.push(`<button id="a-buy">Buy — ${money(askPrice(s, lot))}</button>`);
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
      this._lotSig = null;
      this.select(lot); this.refreshTop(); this.refreshBoard();
    });
    on('a-build', () => this.openBuild(lot));
    on('a-sell', () => {
      const r = sellLot(s, lot, 'player');
      if (!r.ok) return this.toast(r.why, true);
      this.toast(`Sold ${lot.address} for ${money(r.price * 0.97)}.`);
      this._lotSig = null;
      this.select(lot); this.refreshTop(); this.onDirty();
    });
    on('a-rush', () => {
      const r = rushProject(s, lot, 'player', 6);
      if (!r.ok) return this.toast(r.why, true);
      this.toast(`Paid ${money(r.cost)} for overtime — ${r.months.toFixed(1)} months sooner.`);
      this.select(lot); this.refreshTop();
    });
    on('a-travel', () => this.onTravel(lot));
  }

  closeLot() {
    this.selected = null;
    this._lotSig = null;
    this._offerSync = null;
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
      + `<span class="dimtext">Zoning allows ${hi} floors here. Past `
      + `${floorsWithoutAir(lot)} you must buy air rights from the neighbours.</span>`;
    $('build-panel').classList.remove('hidden');
    this.refreshBuild();
  }

  refreshBuild() {
    const lot = this.buildLot;
    if (!lot) return;
    const floors = +$('i-floors').value;
    const use = $('i-use').value;
    const ltc = +$('i-ltc').value / 100;
    const needsAir = floors > floorsWithoutAir(lot);
    $('o-floors').textContent =
      `${floors} · ${Math.round(floors * CONFIG.FLOOR_H)}m${needsAir ? ' · air rights' : ''}`;
    $('o-ltc').textContent = pct(ltc);
    for (const b of $('i-form').children) b.classList.toggle('on', b.dataset.form === this.design.form);
    for (const b of $('i-colors').children) b.classList.toggle('on', +b.dataset.v === this.design.variant);

    const q = quote(this.state, lot, floors, use, ltc, this.design);
    const cash = this.state.actors.player.cash;
    const rows = [
      ['Floor area', sf(q.gsf)],
      ['Floorplate', `${Math.round(q.footprintSf).toLocaleString()} sf`],
      ['Hard + soft cost', money(q.hard + q.soft)],
      ['— per sf', `$${Math.round((q.hard + q.soft) / Math.max(1, q.gsf))}/sf`],
      ['Land', q.land > 0 ? money(q.land) : 'owned'],
      ...(q.airSf > 0 ? [[`Air rights (${sf(q.airSf)})`, money(q.air)]] : []),
      ['Total cost', money(q.total), 'sep'],
      ['Rent', `$${rentPerSf(this.state, lot, use, floors).toFixed(0)}/sf`],
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
