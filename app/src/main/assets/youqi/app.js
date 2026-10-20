/* 云朵 · 应用主逻辑
   明暗双模、无限周时间表、文字/图片识别日程。
   数据由原生桥接（YouqiAndroid）持久化到 Fossify 的 Room 数据库。 */
(() => {
  'use strict';

  const NATIVE = window.YouqiAndroid;
  const DAY = 86400000;
  const HOUR = 3600000;
  const MIN = 60000;
  // The native side serves the stored background image from this path.
  const BACKGROUND_PATH = 'background';

  /* ---------------------------------------------------------------- 调色板 */
  // 14 色；每色给出亮/暗两套底色与前景，保证任何主题下对比度 >= 4.5:1
  const COLORS = [
    { name: '鸢尾紫', bg: '#DDD3FF', fg: '#3A1F79', bd: '#9670F1', dot: '#7D45DF', darkBg: '#332A55', darkFg: '#D6C7FF' },
    { name: '晴空蓝', bg: '#CFE8FF', fg: '#0C4272', bd: '#58AFF2', dot: '#218CE2', darkBg: '#1E3448', darkFg: '#BCDEFF' },
    { name: '薄荷绿', bg: '#CFEFDE', fg: '#14543A', bd: '#5DCB97', dot: '#23A66B', darkBg: '#1B3A2C', darkFg: '#B4E7CE' },
    { name: '杏子橙', bg: '#FFE3BC', fg: '#6B3F0B', bd: '#EFAD41', dot: '#E78D12', darkBg: '#402F19', darkFg: '#FBD9A6' },
    { name: '玫瑰粉', bg: '#FFD4E2', fg: '#7A2A4C', bd: '#F17AA8', dot: '#DD4E89', darkBg: '#43232F', darkFg: '#FFC5D8' },
    { name: '雾海青', bg: '#C8EDE9', fg: '#0F4C4A', bd: '#4FC2B8', dot: '#149D94', darkBg: '#173B39', darkFg: '#AEE2DD' },
    { name: '藤花紫', bg: '#D5DAFF', fg: '#30388B', bd: '#8795EA', dot: '#5C6BD4', darkBg: '#2A2E52', darkFg: '#C8CFFF' },
    { name: '山茶粉', bg: '#FFD2D2', fg: '#7A2E38', bd: '#F07D86', dot: '#D95062', darkBg: '#422227', darkFg: '#FFC4C4' },
    { name: '橄榄绿', bg: '#E7F0C0', fg: '#4A5713', bd: '#B6CD59', dot: '#91AA29', darkBg: '#333A19', darkFg: '#DCE9A4' },
    { name: '湖水蓝', bg: '#CBE6F0', fg: '#1E4E6B', bd: '#69B7D3', dot: '#3391B8', darkBg: '#1D3846', darkFg: '#BADCF0' },
    { name: '蜜桃橙', bg: '#FFDCC6', fg: '#6F3B24', bd: '#F1996A', dot: '#DF713F', darkBg: '#41291C', darkFg: '#FCD1B6' },
    { name: '丁香粉', bg: '#F1D6FB', fg: '#5B3170', bd: '#C88AE1', dot: '#AA5AC6', darkBg: '#3A2544', darkFg: '#EBCBF9' },
    { name: '灰竹绿', bg: '#D5EAD0', fg: '#2C4F21', bd: '#86BA75', dot: '#5A9846', darkBg: '#25361F', darkFg: '#C6E0BE' },
    { name: '麦穗金', bg: '#FFEDC2', fg: '#664B0C', bd: '#E7BC4E', dot: '#CCA01D', darkBg: '#3D331A', darkFg: '#FBE1A8' }
  ];

  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
  const WEEKDAY_FULL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  const EXAMPLES = [
    '每周三提交概率论作业，截止到当天晚上。',
    '同学们好！明天 19:20–21:00 在六教 6A413 开班会。',
    '本周六 20:00 前提交大物实验报告；周日交英语阅读笔记；下周一 18:00 前完成选课确认。'
  ];

  /* ------------------------------------------------------------------ 图标 */
  const ICONS = {
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M8 3v4m8-4v4M3.5 10h17"/>',
    check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.4 2.8 2.8L16 9.6"/>',
    settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15.14 4.66a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.1a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.03Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="m6.4 6.4 11.2 11.2M17.6 6.4 6.4 17.6"/>',
    left: '<path d="m14.5 6-6 6 6 6"/>',
    right: '<path d="m9.5 6 6 6-6 6"/>',
    chevron: '<path d="m9.5 6 6 6-6 6"/>',
    chevronDown: '<path d="m6 9.5 6 6 6-6"/>',
    spark: '<path d="M12 3.5 13.9 9 19.5 11 13.9 13 12 18.5 10.1 13 4.5 11 10.1 9Z"/><path d="M18.6 2.4 19.3 4.4 21.3 5.1 19.3 5.8 18.6 7.8 17.9 5.8 15.9 5.1 17.9 4.4Z"/>',
    mic: '<rect x="8" y="3" width="8" height="12" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4.5 17 4.4-4.2a2 2 0 0 1 2.7 0l3 2.8m0 0 1.7-1.6a2 2 0 0 1 2.7 0l1.5 1.4m-5.9.2 2.4 2.3"/>',
    pin: '<path d="M19 10.2c0 5-7 10.8-7 10.8S5 15.2 5 10.2a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10.2" r="2.6"/>',
    edit: '<path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m14.5 6 3.5 3.5"/>',
    trash: '<path d="M4 6.5h16M9.5 6.5V4h5v2.5M6.5 6.5 7.5 20h9l1-13.5M10.5 10v6.5m3-6.5v6.5"/>',
    repeat: '<path d="m17 2.5 3.5 3.5L17 9.5"/><path d="M3.5 11.5V10a3.5 3.5 0 0 1 3.5-3.5h13"/><path d="M7 21.5 3.5 18 7 14.5"/><path d="M20.5 12.5V14a3.5 3.5 0 0 1-3.5 3.5H4"/>',
    download: '<path d="M12 3.5v11m-4.5-4.5L12 14.5l4.5-4.5M4.5 17v3.5h15V17"/>',
    upload: '<path d="M12 14.5v-11M7.5 8 12 3.5 16.5 8M4.5 17v3.5h15V17"/>',
    shield: '<path d="m12 3 8 3v6.2c0 5-8 8.8-8 8.8s-8-3.8-8-8.8V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
    refresh: '<path d="M20 6.5v5h-5"/><path d="M19.6 11.5A7.8 7.8 0 1 0 17 17.4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2m0 15v2M4.4 4.4l1.4 1.4m12.4 12.4 1.4 1.4M2.5 12h2m15 0h2M4.4 19.6l1.4-1.4M18.2 5.8l1.4-1.4"/>',
    moon: '<path d="M20 14.2A8.5 8.5 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2Z"/>',
    contrast: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17Z" fill="currentColor" stroke="none"/>',
    list: '<path d="M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01"/>',
    folder: '<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h3.3l2 2.5h8.7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-14a2 2 0 0 1-2-2z"/>',
    note: '<path d="M5 4.5h14v11l-4 4H5z"/><path d="M15 19.5V15h4M8.5 9h7m-7 3.5h5"/>',
    alert: '<path d="M12 3.5 21 20H3z"/><path d="M12 10v4m0 2.5h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5m0-8.5h.01"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
    sliders: '<path d="M5 21v-6m0-4V3m7 18v-9m0-4V3m7 18v-4m0-4V3"/><circle cx="5" cy="13.5" r="2"/><circle cx="12" cy="9.5" r="2"/><circle cx="19" cy="15.5" r="2"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
    today: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M8 3v4m8-4v4M3.5 10h17"/><circle cx="12" cy="15" r="2" fill="currentColor" stroke="none"/>',
    jump: '<path d="M20 5.5v13M4 12h11m-4.5-4.5L15 12l-4.5 4.5"/>',
    noteAdd: '<path d="M4 4.5h10.5L20 10v9.5H4z"/><path d="M12 13v6m-3-3h6"/>'
  };
  // width/height are set here so an icon can never stretch an unconstrained container
  // (e.g. inside a flex row with no explicit svg rule); CSS overrides them where needed.
  const icon = (name, cls = '') =>
    `<svg class="${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.calendar}</svg>`;

  /* Replace Android's native select popup with a themed, animated menu. The
     original select remains in the DOM (visually hidden) so FormData and the
     existing change handlers keep working unchanged. */
  function enhanceSelects(root = document) {
    root.querySelectorAll('select:not(.custom-select-native)').forEach(select => {
      if (select.closest('.custom-select')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'custom-select';
      const parent = select.parentNode;
      parent.insertBefore(wrapper, select);
      wrapper.appendChild(select);
      select.classList.add('custom-select-native');

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'custom-select-trigger';
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');
      wrapper.insertBefore(trigger, select);
      const menu = document.createElement('div');
      menu.className = 'custom-select-menu';
      menu.setAttribute('role', 'listbox');
      wrapper.insertBefore(menu, select);

      const close = () => {
        wrapper.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
      };
      const refresh = () => {
        const selected = [...select.options].find(option => option.value === select.value) || select.options[0];
        trigger.textContent = selected?.textContent || '';
        trigger.disabled = select.disabled;
        wrapper.classList.toggle('disabled', select.disabled);
        menu.replaceChildren(...[...select.options].map(option => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'custom-select-option';
          item.textContent = option.textContent;
          item.dataset.value = option.value;
          item.disabled = option.disabled;
          item.setAttribute('role', 'option');
          item.setAttribute('aria-selected', String(option.value === select.value));
          item.addEventListener('click', event => {
            event.stopPropagation();
            if (item.disabled) return;
            select.value = item.dataset.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            close();
            refresh();
          });
          return item;
        }));
      };
      select._customRefresh = refresh;
      trigger.addEventListener('click', event => {
        event.stopPropagation();
        document.querySelectorAll('.custom-select.open').forEach(other => {
          if (other !== wrapper) other.classList.remove('open');
        });
        refresh();
        if (select.disabled) return;
        const open = !wrapper.classList.contains('open');
        wrapper.classList.toggle('open', open);
        trigger.setAttribute('aria-expanded', String(open));
      });
      trigger.addEventListener('keydown', event => {
        if (event.key === 'Escape') close();
        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault(); trigger.click();
        }
      });
      select.addEventListener('change', refresh);
      new MutationObserver(refresh).observe(select, { childList: true });
      refresh();
    });
  }
  document.addEventListener('click', event => {
    if (!event.target.closest('.custom-select')) document.querySelectorAll('.custom-select.open').forEach(wrapper => wrapper.classList.remove('open'));
  });
  window.YunduoSelects = { enhance: enhanceSelects };

  /* ------------------------------------------------------------ 基础工具 */
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = value => String(value).padStart(2, '0');
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const dateKey = value => { const d = value instanceof Date ? value : new Date(value); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const localISO = value => { const d = value instanceof Date ? value : new Date(value); return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const hhmm = value => { const d = value instanceof Date ? value : new Date(value); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const atDay = key => new Date(`${key}T00:00:00`);
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const monday = d => { const r = atDay(dateKey(d)); r.setDate(r.getDate() - (r.getDay() + 6) % 7); return r; };
  const sameDay = (a, b) => dateKey(a) === dateKey(b);
  const uid = () => `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const validISO = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime()) && localISO(new Date(value)) === value;
  const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

  /* The WebView date inputs used to open Android's stock pickers. Keep the
     values form-compatible, but render a small in-app calendar so every
     picker follows the same 云朵 surface, typography and motion. */
  let activePicker = null;
  const pickerDate = value => {
    const raw = String(value || '');
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
  };
  const pickerValue = (date, hour, minute, kind) => {
    const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return kind === 'datetime' ? `${day}T${pad(hour)}:${pad(minute)}` : day;
  };
  const pickerLabel = (value, kind) => {
    const date = pickerDate(value);
    const label = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAY_FULL[date.getDay()]}`;
    if (kind !== 'datetime') return label;
    const match = String(value || '').match(/T(\d{2}):(\d{2})/);
    return `${label} ${match ? `${match[1]}:${match[2]}` : '12:00'}`;
  };
  function pickerField(id, value, kind = 'date', required = false) {
    const raw = String(value || '');
    return `<button type="button" class="text-input picker-field" id="${id}" value="${escape(raw)}" data-action="open-picker" data-picker-kind="${kind}" data-picker-value="${escape(raw)}" aria-haspopup="dialog" aria-required="${required}"><span data-picker-label>${escape(pickerLabel(raw, kind))}</span>${icon('calendar')}</button>
      <input type="hidden" id="${id}-value" name="${id}" value="${escape(raw)}"${required ? ' required' : ''}>`;
  }
  function closePicker() {
    activePicker = null;
    document.querySelector('.picker-backdrop')?.remove();
  }
  function renderPicker() {
    if (!activePicker) return;
    const p = activePicker;
    const first = new Date(p.year, p.month, 1);
    const offset = first.getDay();
    const days = new Date(p.year, p.month + 1, 0).getDate();
    const selected = pickerDate(p.value);
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push('<span class="picker-day empty"></span>');
    for (let day = 1; day <= days; day++) {
      const selectedDay = selected.getFullYear() === p.year && selected.getMonth() === p.month && selected.getDate() === day;
      cells.push(`<button type="button" class="picker-day ${selectedDay ? 'selected' : ''}" data-action="picker-day" data-day="${day}">${day}</button>`);
    }
    const hour = pad(p.hour);
    const minute = pad(p.minute);
    const time = p.kind === 'datetime' ? `<div class="picker-time"><span>时间</span><label><input inputmode="numeric" maxlength="2" data-picker-part="hour" value="${hour}">时</label><b>:</b><label><input inputmode="numeric" maxlength="2" data-picker-part="minute" value="${minute}">分</label></div>` : '';
    const html = `<div class="picker-backdrop" role="presentation"><section class="picker-dialog" role="dialog" aria-modal="true" aria-label="选择${p.kind === 'datetime' ? '日期和时间' : '日期'}">
      <header class="picker-header"><div><span class="picker-kicker">云朵 · ${p.kind === 'datetime' ? '时间安排' : '日期选择'}</span><strong>${escape(pickerLabel(p.value, p.kind))}</strong></div><button type="button" class="close-button" data-action="close-picker" aria-label="关闭">${icon('close')}</button></header>
      <div class="picker-month"><button type="button" class="picker-nav" data-action="picker-prev" aria-label="上个月">${icon('left')}</button><strong>${p.year}年 ${p.month + 1}月</strong><button type="button" class="picker-nav" data-action="picker-next" aria-label="下个月">${icon('right')}</button></div>
      <div class="picker-weekdays">${WEEKDAYS.map(day => `<span>${day}</span>`).join('')}</div><div class="picker-grid">${cells.join('')}</div>${time}
      <footer class="picker-footer"><button type="button" class="secondary-button" data-action="close-picker">取消</button><button type="button" class="primary-button" data-action="confirm-picker">确定</button></footer>
    </section></div>`;
    document.querySelector('.picker-backdrop')?.remove();
    document.body.insertAdjacentHTML('beforeend', html);
    document.querySelectorAll('.picker-time input').forEach(input => input.addEventListener('input', () => {
      const value = clamp(Number(input.value) || 0, input.dataset.pickerPart === 'hour' ? 0 : 0, input.dataset.pickerPart === 'hour' ? 23 : 59);
      p[input.dataset.pickerPart] = value;
      input.value = pad(value);
    }));
  }
  function openPicker(target) {
    const kind = target.dataset.pickerKind || 'date';
    const value = target.value || target.dataset.pickerValue || '';
    const date = pickerDate(value);
    const match = String(value).match(/T(\d{2}):(\d{2})/);
    activePicker = { targetId: target.id, kind, value, year: date.getFullYear(), month: date.getMonth(), day: date.getDate(), hour: match ? Number(match[1]) : 12, minute: match ? Number(match[2]) : 0 };
    renderPicker();
  }
  function commitPicker() {
    if (!activePicker) return;
    const p = activePicker;
    const date = new Date(p.year, p.month, p.day || 1);
    const value = pickerValue(date, p.hour, p.minute, p.kind);
    const target = document.getElementById(p.targetId);
    const hidden = document.getElementById(`${p.targetId}-value`);
    if (target) { target.value = value; target.dataset.pickerValue = value; const label = target.querySelector('[data-picker-label]'); if (label) label.textContent = pickerLabel(value, p.kind); }
    if (hidden) hidden.value = value;
    closePicker();
  }

  const dateLabel = value => { const d = new Date(value); return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAY_FULL[d.getDay()]}`; };
  const relDay = value => {
    const key = dateKey(value);
    if (key === dateKey(NOW)) return '今天';
    if (key === dateKey(addDays(NOW, 1))) return '明天';
    if (key === dateKey(addDays(NOW, -1))) return '昨天';
    const diff = Math.round((atDay(key) - atDay(dateKey(NOW))) / DAY);
    if (diff > 1 && diff < 7) return WEEKDAY_FULL[new Date(value).getDay()];
    return dateLabel(value);
  };

  /* ------------------------------------------------------------ 全局状态 */
  let NOW = new Date();
  let state = {
    tab: 'home',
    filter: 'pending',
    week: dateKey(monday(NOW)),
    selected: dateKey(NOW),
    events: []
  };
  let settings = {
    theme: 'auto',
    bgOpacity: 1,
    bgBlur: 0,
    bgScrim: 0,
    bgName: '',
    hasBackground: false
  };
  let backgroundUrl = '';
  let startupError = '';
  let pendingParsed = null;
  let homeTick = '';

  /* ---------------------------------------------------------------- 桥接层 */
  // The WebView bridge only accepts a call whose receiver is the injected object,
  // so the method must be invoked *through* NATIVE rather than destructured into a
  // local first — doing that detaches `this` and the bridge rejects it.
  function call(method, ...args) {
    const fn = NATIVE?.[method];
    if (typeof fn !== 'function') throw new Error(`本机缺少 ${method} 接口`);
    return fn.apply(NATIVE, args);
  }

  function saveSettings(next = settings) {
    settings = { ...settings, ...next };
    try { call('saveSettings', JSON.stringify(settings)); } catch (_) { }
    applyAppearance();
  }

  function loadInitial() {
    try {
      const raw = call('loadSettings');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !parsed.error) settings = { ...settings, ...parsed };
    } catch (_) { }
    if (settings.hasBackground) {
      backgroundUrl = `${BACKGROUND_PATH}?v=${Number(settings.bgVersion) || 0}`;
    }
  }

  /* --------------------------------------------------------------- 外观 */
  const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolvedTheme = () => settings.theme === 'auto' ? (prefersDark() ? 'dark' : 'light') : settings.theme;

  function applyAppearance() {
    const theme = resolvedTheme();
    document.documentElement.dataset.theme = theme;

    const root = document.documentElement.style;
    root.setProperty('--bg-image-opacity', settings.hasBackground ? String(settings.bgOpacity) : '0');
    root.setProperty('--bg-blur', `${settings.bgBlur}px`);
    root.setProperty('--scrim-opacity', settings.hasBackground ? String(settings.bgScrim) : '0');
    root.setProperty('--scrim-color', theme === 'dark' ? '0, 0, 0' : '255, 255, 255');

    // 背景图越强 / 遮罩越弱，承载面越厚，确保文字对比度始终达标
    const scrim = settings.bgScrim;
    const weakScrim = settings.hasBackground && scrim < 0.35;
    document.body.dataset.hasImage = settings.hasBackground ? 'true' : 'false';
    document.body.dataset.scrimWeak = weakScrim ? 'true' : 'false';

    const image = document.getElementById('backdropImage');
    if (image) image.style.backgroundImage = backgroundUrl ? `url("${backgroundUrl}")` : 'none';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#121116' : '#F7F5FB');

    try { call('setAppearance', theme === 'dark'); } catch (_) { }
    window.dispatchEvent(new Event('yunduo-appearance'));
  }

  /* ------------------------------------------------------------- 事件模型 */
  const colorOf = index => COLORS[clamp(Number(index) || 0, 0, COLORS.length - 1)];
  const isDark = () => resolvedTheme() === 'dark';
  function eventStyle(event) {
    const c = colorOf(event.color);
    return isDark()
      ? `--ev-bg:${c.darkBg};--ev-fg:${c.darkFg};--ev-bd:${c.bd};--ev-dot:${c.dot}`
      : `--ev-bg:${c.bg};--ev-fg:${c.fg};--ev-bd:${c.bd};--ev-dot:${c.dot}`;
  }

  const REPEAT_PRESETS = {
    none: '不重复',
    daily: '每天',
    weekly: '每周',
    monthly: '每月',
    yearly: '每年'
  };

  function repeatSummary(event) {
    const repeat = event.repeat;
    if (!repeat || typeof repeat !== 'object') return '';
    const interval = Math.max(1, Number(repeat.interval) || 1);
    const every = interval > 1 ? `每 ${interval} ` : '每';
    let text;
    switch (repeat.freq) {
      case 'daily': text = `${every}天`; break;
      case 'weekly': {
        const days = Array.isArray(repeat.weekdays) && repeat.weekdays.length
          ? [...new Set(repeat.weekdays)].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
          : [new Date(event.start || event.due).getDay()];
        text = interval > 1
          ? `每 ${interval} 周 ${days.map(d => WEEKDAYS[d]).join('、')}`
          : `每${days.map(d => WEEKDAYS[d]).join('、')}`;
        break;
      }
      case 'monthly':
        text = repeat.monthlyMode === 'last' ? `${every}月最后一天`
          : repeat.monthlyMode === 'weekday' ? `${every}月第 ${repeat.nth || 1} 个${WEEKDAY_FULL[repeat.weekday ?? new Date(event.due).getDay()]}`
            : `${every}月 ${new Date(event.due).getDate()} 日`;
        break;
      case 'yearly': text = `${every}年`; break;
      default: text = '重复';
    }
    return event.until ? `${text} · 至 ${event.until}` : text;
  }

  function normalizeEvents(items) {
    if (!Array.isArray(items) || items.length > 5000) throw new Error('数据格式不正确或条目过多。');
    const ids = new Set();
    return items.map(item => {
      if (!item || typeof item.title !== 'string' || !item.title.trim() || !validISO(item.due)) {
        throw new Error('有事项缺少名称或有效截止时间。');
      }
      if (item.start && (!validISO(item.start) || new Date(item.start) >= new Date(item.due))) {
        throw new Error('有事项的起止时间不正确。');
      }
      let id = typeof item.id === 'string' && /^[\w-]+$/.test(item.id) ? item.id : uid();
      if (ids.has(id)) id = uid();
      ids.add(id);
      return {
        id,
        title: item.title.slice(0, 240),
        due: item.due,
        start: item.start || null,
        allDay: !!item.allDay,
        color: Number.isInteger(item.color) && COLORS[item.color] ? item.color : 0,
        location: String(item.location || '').slice(0, 500),
        note: String(item.note || '').slice(0, 2000),
        source: String(item.source || '').slice(0, 40000),
        repeat: item.repeat && typeof item.repeat === 'object' ? {
          freq: ['daily', 'weekly', 'monthly', 'yearly'].includes(item.repeat.freq) ? item.repeat.freq : 'weekly',
          interval: clamp(Number(item.repeat.interval) || 1, 1, 99),
          weekdays: Array.isArray(item.repeat.weekdays) ? item.repeat.weekdays.filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : [],
          monthlyMode: ['date', 'weekday', 'last'].includes(item.repeat.monthlyMode) ? item.repeat.monthlyMode : 'date',
          nth: clamp(Number(item.repeat.nth) || 1, 1, 5),
          weekday: Number.isInteger(item.repeat.weekday) ? clamp(item.repeat.weekday, 0, 6) : 0
        } : null,
        until: validDay(item.until) ? item.until : null,
        nativeRepeat: !!item.nativeRepeat,
        repeatLabel: item.repeatLabel || '',
        completedDates: Array.isArray(item.completedDates) ? item.completedDates.filter(validDay) : [],
        skippedDates: Array.isArray(item.skippedDates) ? item.skippedDates.filter(validDay) : [],
        showOnHome: typeof item.showOnHome === 'boolean' ? item.showOnHome : null,
        showInTasks: typeof item.showInTasks === 'boolean' ? item.showInTasks : null,
        urgent: item.urgent === true,
        nativeId: item.nativeId || null
      };
    });
  }

  try {
    const data = JSON.parse(call('loadEvents'));
    if (!Array.isArray(data)) throw new Error(data.error || '无法读取本机数据');
    state.events = normalizeEvents(data);
  } catch (error) { state.events = []; startupError = error.message; }

  function save() {
    try {
      const result = JSON.parse(call('saveEvents', JSON.stringify(state.events)));
      if (!result.ok) throw new Error(result.error || '保存失败');
      return true;
    } catch (error) {
      try { reload(); } catch (_) { }
      toast(`保存未完成：${error.message}`);
      return false;
    }
  }

  function reload() {
    const value = JSON.parse(call('loadEvents'));
    if (!Array.isArray(value)) throw new Error(value.error || '无法读取手机日程');
    state.events = normalizeEvents(value);
  }

  function occurrences(from, to) {
    const data = JSON.parse(call('listOccurrences', localISO(from), localISO(to)));
    if (!Array.isArray(data)) throw new Error(data.error || '无法读取日程');
    return data;
  }

  /* --------------------------------------------------------------- 渲染器 */
  const app = document.getElementById('appRoot');
  const screenRoot = document.getElementById('screenRoot');
  const tabBar = document.getElementById('tabBar');
  const overlay = document.getElementById('overlay');
  const sheet = document.getElementById('sheetContent');
  const toastEl = document.getElementById('toast');

  const TABS = [
    ['home', 'clock', '接下来'],
    ['calendar', 'calendar', '日程'],
    ['tasks', 'checkCircle', '待办'],
    ['settings', 'settings', '设置']
  ];

  function renderTabBar() {
    tabBar.className = 'tabbar';
    tabBar.innerHTML = TABS.map(([tab, ic, label]) =>
      `<button class="tab-item ${state.tab === tab ? 'active' : ''}" data-tab="${tab}" aria-current="${state.tab === tab ? 'page' : 'false'}" aria-label="${label}">
        <span class="tab-icon">${icon(ic)}</span><span>${label}</span>
      </button>`).join('');
  }

  function busy(flag) {
    let bar = app.querySelector('.top-progress');
    if (flag && !bar) {
      bar = document.createElement('div');
      bar.className = 'top-progress';
      app.appendChild(bar);
    } else if (!flag && bar) bar.remove();
  }

  const stateBlock = (type, iconName, title, body, actions = '') =>
    `<div class="state ${type}"><span class="state-icon">${icon(iconName)}</span><h3>${title}</h3><p>${body}</p>${actions ? `<div class="state-actions">${actions}</div>` : ''}</div>`;

  /* ------------------------------------------------------- 首页：接下来 */
  function countdownParts(target) {
    let ms = new Date(target) - NOW;
    if (ms < 0) ms = 0;
    let seconds = Math.floor(ms / 1000);
    const days = Math.floor(seconds / 86400); seconds -= days * 86400;
    const hours = Math.floor(seconds / 3600); seconds -= hours * 3600;
    const minutes = Math.floor(seconds / 60); seconds -= minutes * 60;
    return { days, hours, minutes, seconds };
  }

  function countdownText(target) {
    const { days, hours, minutes, seconds } = countdownParts(target);
    if (days > 0) return { value: `${days}天 ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`, compact: `${days}天${hours ? ` ${hours}小时` : ''}` };
    return { value: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`, compact: hours ? `${hours}小时${minutes}分` : `${minutes}分${seconds}秒` };
  }

  const minuteOf = value => { const d = new Date(value); return d.getHours() * 60 + d.getMinutes(); };
  const isDeadline = event => !event.start && !event.allDay;
  // Keep the stored instant and occurrence key intact. Midnight is the previous day's 24:00.
  function displayDay(event) {
    if (isDeadline(event) && minuteOf(event.due) === 0) return dateKey(addDays(new Date(event.due), -1));
    return dateKey(event.start || event.due);
  }
  function dueClock(event) {
    return isDeadline(event) && [0, 1439].includes(minuteOf(event.due)) ? '24:00' : hhmm(event.due);
  }
  function inCalendar(event) {
    if (event.allDay) return true;
    if (event.start) return sameDay(event.start, event.due) && minuteOf(event.start) >= 420 && minuteOf(event.due) <= 1320;
    return minuteOf(event.due) >= 420 && minuteOf(event.due) <= 1320;
  }
  // Some ICS exports flatten a course into many independent VEVENTs with no RRULE.
  // Match its weekday AND time slot so occasional labs with the same title stay visible.
  const courseKey = title => title.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  function regularCourseIds() {
    const groups = new Map(), ids = new Set();
    for (const event of state.events) {
      if (!event.start || event.allDay || !inCalendar(event)) continue;
      if (event.repeat?.freq === 'weekly' && (Number(event.repeat.interval) || 1) === 1) {
        ids.add(event.id); continue;
      }
      if (event.repeat) continue;
      const key = [courseKey(event.title), new Date(event.start).getDay(), hhmm(event.start), hhmm(event.due)].join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(event);
    }
    for (const group of groups.values()) {
      const days = [...new Set(group.map(e => dateKey(e.start)))].sort();
      if (days.length < 3) continue;
      const gaps = days.slice(1).map((day, i) => Math.round((atDay(day) - atDay(days[i])) / DAY));
      // Allow a holiday gap, but keep fortnightly and irregular teaching sessions.
      if (gaps.filter(gap => gap === 7).length / gaps.length >= 0.75) group.forEach(e => ids.add(e.id));
    }
    return ids;
  }
  function shownOnHome(event, regular = regularCourseIds()) {
    return typeof event.showOnHome === 'boolean' ? event.showOnHome : !regular.has(event.id);
  }
  function shownInTasks(event) {
    return typeof event.showInTasks === 'boolean' ? event.showInTasks : isDeadline(event) || (!event.allDay && !inCalendar(event));
  }
  function eventMoment(event) { return new Date(event.start || event.due); }

  function rangeText(event, { withRelative = true } = {}) {
    const dayName = value => withRelative ? relDay(value) : dateLabel(value);
    if (event.allDay) return `${dayName(event.due)} 全天`;
    if (event.start) {
      const sameDate = dateKey(event.start) === dateKey(event.due);
      return `${dayName(event.start)} ${hhmm(event.start)}–${sameDate ? '' : `${dayName(event.due)} `}${hhmm(event.due)}`;
    }
    return `${dayName(atDay(displayDay(event)))} ${dueClock(event)} 截止`;
  }

  // 进行中：已用时长占比；未开始：24 小时逼近度
  function progressOf(event) {
    const start = event.start ? new Date(event.start) : null;
    const due = new Date(event.due);
    if (start && start <= NOW) {
      const total = due - start;
      if (total <= 0) return 1;
      return clamp((NOW - start) / total, 0, 1);
    }
    const target = start || due;
    const hoursLeft = (target - NOW) / HOUR;
    return clamp(1 - hoursLeft / 24, 0.02, 1);
  }

  function featuredBlock(event, heading) {
    const active = event.start && new Date(event.start) <= NOW;
    const target = !event.start || active ? event.due : event.start;
    const label = active ? '距离结束' : event.start ? '距离开始' : '距离截止';
    const clock = countdownText(target);
    const urgent = new Date(target) - NOW < 2 * HOUR;
    const progress = progressOf(event);
    return `<button class="featured" style="${eventStyle(event)}" data-action="detail" data-id="${escape(event.id)}" data-date="${event.occurrenceDate}"
        aria-label="${escape(event.title)}，${rangeText(event)}，${label} ${clock.compact}">
      <div class="featured-head">
        <div class="featured-title">${event.urgent ? `<span class="urgent-mark">${icon('alert')}紧急</span>` : ''}${escape(event.title)}</div>
        ${heading ? `<span class="chip accent">${heading}</span>` : ''}
      </div>
      <div class="featured-meta">
        <div class="meta-line">${icon('clock')}<span>${rangeText(event)}</span></div>
        ${event.location ? `<div class="meta-line">${icon('pin')}<span>${escape(event.location)}</span></div>` : ''}
      </div>
      <div class="progress" role="progressbar" aria-label="进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress * 100)}">
        <div class="progress-fill" style="width:${(progress * 100).toFixed(1)}%"></div>
      </div>
      <div class="countdown-row">
        <span class="countdown-label">${label}</span>
        <span class="countdown-value ${urgent ? 'urgent' : ''}" data-countdown="${target}">${clock.value}</span>
      </div>
    </button>`;
  }

  function rowBlock(event) {
    const active = event.start && new Date(event.start) <= NOW && new Date(event.due) > NOW;
    const overdue = !event.done && new Date(event.due) < NOW;
    // 右侧只保留值得注意的状态；时间已经在上方详情行里，不重复显示
    const status = event.done ? '已完成' : active ? '进行中' : overdue ? '已过期' : '';
    const statusClass = event.done ? 'ok' : active ? 'live' : overdue ? 'overdue' : '';
    const timeText = event.allDay ? '全天'
      : event.start ? `${hhmm(event.start)}–${hhmm(event.due)}`
        : `${dueClock(event)} 截止`;
    const meta = [event.location, event.repeat ? repeatSummary(event) : ''].filter(Boolean).join(' · ');
    return `<button class="row ${event.done ? 'done' : ''}" style="${eventStyle(event)}" data-action="detail" data-id="${escape(event.id)}" data-date="${event.occurrenceDate}"
        aria-label="${escape(event.title)}，${rangeText(event)}${status ? `，${status}` : ''}">
      <span class="row-marker" aria-hidden="true"></span>
      <span class="row-main">
        <span class="row-title">${event.urgent ? `<span class="urgent-mark">${icon('alert')}紧急</span>` : ''}${escape(event.title)}</span>
        <span class="row-meta">${icon('clock')}<span>${timeText}</span>${meta ? `<span class="dot-sep">·</span><span>${escape(meta)}</span>` : ''}</span>
      </span>
      ${status ? `<span class="row-side"><span class="row-status ${statusClass}">${status}</span></span>` : ''}
    </button>`;
  }

  function renderHome() {
    let events;
    const regular = regularCourseIds();
    try {
      events = occurrences(atDay(dateKey(NOW)), addDays(NOW, 30))
        .filter(e => !e.done && new Date(e.due) >= NOW)
        .filter(e => shownOnHome(e, regular))
        // Urgent items always lead the home queue; date ordering remains the tie-breaker.
        .sort((a, b) => (Number(b.urgent) - Number(a.urgent)) || (a.allDay - b.allDay) || (eventMoment(a) - eventMoment(b)));
    } catch (error) {
      return `<div class="content">${stateBlock('error', 'alert', '无法读取日程', escape(error.message),
        `<button class="primary-button" data-action="reload">重新加载</button>`)}</div>`;
    }

    const header = `<header class="appbar">
      <div class="appbar-title"><p class="appbar-eyebrow">${NOW.getFullYear()}年 ${NOW.getMonth() + 1}月${NOW.getDate()}日 ${WEEKDAY_FULL[NOW.getDay()]}</p><h1>接下来</h1></div>
      <div class="appbar-actions">
        <button class="icon-button" data-action="open-add" aria-label="添加日程">${icon('plus')}</button>
      </div>
    </header>`;

    if (!events.length) {
      return `${header}<div class="content">${stateBlock('empty', 'clock', '接下来，由你安排',
        '未来 30 天没有临时安排或截止事项。每周固定课程可在日程表查看。',
        `<button class="primary-button" data-action="open-add">${icon('plus')} 添加日程</button>
         <button class="secondary-button" data-action="import-ics">${icon('upload')} 导入课表</button>`)}</div>`;
    }

    const first = events[0];
    const ongoing = first.start && new Date(first.start) <= NOW;
    const heading = ongoing ? '进行中' : first.allDay ? '最近' : first.start ? '即将开始' : '即将截止';

    const rest = events.slice(1, 80);
    const groups = [];
    for (const event of rest) {
      const key = displayDay(event);
      let group = groups[groups.length - 1];
      if (!group || group.key !== key) groups.push(group = { key, items: [] });
      group.items.push(event);
    }

    const body = groups.map(group => {
      const date = atDay(group.key);
      const soon = group.key === dateKey(NOW) || group.key === dateKey(addDays(NOW, 1));
      return `<div class="list-day ${soon ? 'soon' : ''}">
          <span>${relDay(date)}</span>
          <span class="list-day-date">${date.getMonth() + 1}月${date.getDate()}日</span>
        </div>
        <div class="rows">${group.items.map(rowBlock).join('')}</div>`;
    }).join('');

    return `${header}<div class="content">
      <div class="section-label"><span>${heading}</span><span class="section-hint">${rangeText(first, { withRelative: false })}</span></div>
      ${featuredBlock(first, ongoing ? '进行中' : '')}
      ${body}
      <p class="helper-note subtle" style="text-align:center;margin-top:var(--s6)">共 ${events.length} 项未完成安排 · 未来 30 天</p>
    </div>`;
  }

  /* -------------------------------------------------------- 日程页：周表 */
  function renderDayCells(weekStart, events) {
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      const key = dateKey(date);
      const dayEvents = events.filter(e => dateKey(e.start || e.due) === key);
      const today = key === dateKey(NOW);
      const selected = key === state.selected;
      const marker = dayEvents[0];
      return `<button class="day-cell ${today ? 'is-today' : ''} ${selected ? 'is-selected' : ''} ${dayEvents.length ? 'has-load' : ''}"
          data-action="select-day" data-date="${key}" aria-label="${dateLabel(date)}${dayEvents.length ? `，${dayEvents.length} 项` : ''}" aria-pressed="${selected}"
          ${marker ? `style="--ev-dot:${colorOf(marker.color).dot}"` : ''}>
        <span class="day-name">${today ? '今天' : WEEKDAYS[date.getDay()]}</span>
        <span class="day-number">${date.getDate()}</span>
        <span class="day-load" aria-hidden="true"></span>
      </button>`;
    }).join('');
  }

  function renderWeekPane(weekKey, offset) {
    const weekStart = atDay(weekKey);
    let events = [];
    let failed = '';
    try { events = occurrences(weekStart, new Date(addDays(weekStart, 7).getTime() - 1)).filter(inCalendar); }
    catch (error) { failed = error.message; }

    const timed = events.filter(e => e.start && !e.allDay);
    const allDay = events.filter(e => e.allDay);
    const deadlines = events.filter(e => !e.start && !e.allDay);

    // All weeks share the same compact 07:00–22:00 axis.
    const minutesOf = minuteOf;
    const startMinute = 420, endMinute = 1320, span = 900;
    const top = minutes => ((minutes - startMinute) / span) * 100;
    const hourList = [];
    for (let m = startMinute; m <= endMinute; m += 60) hourList.push(m);

    // 同时段事项分列，避免互相遮挡
    const lanes = new Map();
    for (let day = 0; day < 7; day++) {
      const items = timed.filter(e => (new Date(e.due).getDay() + 6) % 7 === day)
        .sort((a, b) => new Date(a.start) - new Date(b.start));
      let group = [], groupEnd = 0;
      const place = () => {
        const ends = [];
        const placed = [];
        for (const item of group) {
          let lane = ends.findIndex(end => end <= new Date(item.start).getTime());
          if (lane < 0) lane = ends.length;
          ends[lane] = new Date(item.due).getTime();
          placed.push([item, lane]);
        }
        for (const [item, lane] of placed) lanes.set(`${item.id}@${item.occurrenceDate}`, { lane, count: ends.length });
      };
      for (const item of items) {
        if (group.length && new Date(item.start).getTime() >= groupEnd) { place(); group = []; groupEnd = 0; }
        group.push(item);
        groupEnd = Math.max(groupEnd, new Date(item.due).getTime());
      }
      if (group.length) place();
    }

    const blocks = timed.map(e => {
      const dayIndex = (new Date(e.due).getDay() + 6) % 7;
      const y = clamp(top(minutesOf(e.start)), 0, 99.6);
      const height = clamp((new Date(e.due) - new Date(e.start)) / MIN / span * 100, 1.6, 100 - y);
      const lane = lanes.get(`${e.id}@${e.occurrenceDate}`) || { lane: 0, count: 1 };
      const width = 100 / 7 / lane.count;
      const left = (dayIndex + lane.lane / lane.count) * (100 / 7);
      const roomy = height > 5.2;
      return `<button class="event ${e.done ? 'done' : ''}" style="${eventStyle(e)};top:${y}%;left:${left}%;width:${width}%;height:${height}%"
          data-action="detail" data-id="${escape(e.id)}" data-date="${e.occurrenceDate}"
          aria-label="${escape(e.title)}，${dateLabel(e.due)} ${hhmm(e.start)} 至 ${hhmm(e.due)}">
        <span class="event-title">${escape(e.title)}</span>
        ${roomy ? `<span class="event-sub">${hhmm(e.start)}${e.location ? ` · ${escape(e.location)}` : ''}</span>` : ''}
      </button>`;
    }).join('');

    const redlines = deadlines.map(e => {
      const dayIndex = (new Date(e.due).getDay() + 6) % 7;
      const y = clamp(top(minutesOf(e.due)), 0, 99);
      const below = y < 6;
      return `<div class="deadline ${e.done ? 'done' : ''} ${below ? 'below' : ''}" style="${eventStyle(e)};top:${y}%;left:${dayIndex * 100 / 7}%;width:${100 / 7}%">
        <span class="deadline-dot" aria-hidden="true"></span>
        <button class="deadline-label" data-action="detail" data-id="${escape(e.id)}" data-date="${e.occurrenceDate}"
          aria-label="${escape(e.title)}，${dateLabel(e.due)} ${hhmm(e.due)} 截止">${escape(e.title)}</button>
        <span class="deadline-time">${hhmm(e.due)}</span>
      </div>`;
    }).join('');

    const allDayStrip = `<div class="allday-strip">
        <div class="allday-cells">${Array.from({ length: 7 }, (_, i) =>
          `<div>${allDay.filter(e => (new Date(e.due).getDay() + 6) % 7 === i).map(e =>
            `<button class="allday-chip" style="${eventStyle(e)}" data-action="detail" data-id="${escape(e.id)}" data-date="${e.occurrenceDate}">${escape(e.title)}</button>`).join('')}</div>`).join('')}</div>
      </div>`;

    const timeline = failed
      ? stateBlock('error', 'alert', '无法读取这一周', escape(failed), `<button class="secondary-button" data-action="reload">重新加载</button>`)
      : `<div class="time-scroll" tabindex="0" aria-label="日程表，横向自由滚动，上下查看07:00至22:00">
          <div class="time-grid">
            <div class="time-lanes">
              ${Array.from({ length: 7 }, (_, i) => `<div class="day-column ${dateKey(addDays(weekStart, i)) === state.selected ? 'selected-column' : ''}" style="left:${i * 100 / 7}%;width:${100 / 7}%"></div>`).join('')}
              ${hourList.map(m => `<div class="hour-rule ${m % 120 ? 'half' : ''}" style="top:${top(m)}%"></div>`).join('')}
              ${blocks}${redlines}
            </div>
          </div>
        </div>`;

    return `<section class="calendar-region week-pane" data-week="${weekKey}" data-offset="${offset}" aria-label="${dateLabel(weekStart)}起的一周">
      <div class="days-row">${renderDayCells(weekStart, events)}</div>
      ${timeline}
      ${allDayStrip}
    </section>`;
  }

  // User-confirmed academic anchor: 2026-10-12 is the Monday of week 5.
  function academicWeek(date) {
    const week = Math.floor((atDay(dateKey(date)) - atDay('2026-09-14')) / (7 * DAY)) + 1;
    return week >= 1 && week <= 18 ? week : null;
  }
  function academicLabel(start, end) {
    const first = academicWeek(start), last = academicWeek(end);
    if (first && last && first !== last) return `第 ${first}–${last} 周`;
    return first || last ? `第 ${first || last} 周` : '07:00–22:00';
  }

  function renderCalendar() {
    const weekStart = atDay(state.week);
    const weekEnd = addDays(weekStart, 6);
    const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
    const isThisWeek = dateKey(monday(NOW)) === state.week;
    const monthTitle = sameMonth ? `${weekStart.getMonth() + 1}月` : `${weekStart.getMonth() + 1}月–${weekEnd.getMonth() + 1}月`;

    return `<header class="appbar">
      <div class="appbar-title">
        <p class="appbar-eyebrow">${weekStart.getFullYear()}年</p>
        <h1>${monthTitle}</h1>
      </div>
      <div class="appbar-actions">
        <button class="pill-button ${isThisWeek ? '' : 'accent'}" data-action="today">${icon('today')} 今天</button>
        <button class="icon-button" data-action="jump-date" aria-label="跳转日期">${icon('jump')}</button>
        <button class="icon-button solid" data-action="open-add" aria-label="添加日程">${icon('plus')}</button>
      </div>
    </header>
    <div class="week-strip">
      <div class="week-strip-head">
        <span class="week-strip-label">${weekStart.getMonth() + 1}月${weekStart.getDate()}日 – ${weekEnd.getMonth() + 1}月${weekEnd.getDate()}日</span>
        <div class="week-navigation">
          <button class="week-nav-button" data-action="prev-week" aria-label="上一周">${icon('left')}</button>
          <span class="week-strip-label academic-week">${academicLabel(weekStart, weekEnd)}</span>
          <button class="week-nav-button" data-action="next-week" aria-label="下一周">${icon('right')}</button>
        </div>
      </div>
    </div>
    <div class="calendar-frame">
      <aside class="calendar-axis" aria-label="07:00至22:00">
        <div class="axis-head"></div>
        <div class="axis-scroll"><div class="axis-grid">
          ${Array.from({ length: 16 }, (_, i) => `<span class="hour-label" style="top:${i / 15 * 100}%">${pad(i + 7)}:00</span>`).join('')}
        </div></div>
        <div class="axis-foot">全天</div>
      </aside>
      <div class="week-pager" aria-label="连续日程表，可停在任意日期之间">
        ${[-3, -2, -1, 0, 1, 2, 3].map(offset => renderWeekPane(dateKey(addDays(weekStart, offset * 7)), offset)).join('')}
      </div>
    </div>`;
  }

  function weekNumber(date) {
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const firstThursday = new Date(target.getFullYear(), 0, 4);
    const diff = target - firstThursday;
    return Math.floor(diff / (7 * DAY)) + 1 + (firstThursday.getDay() > 4 ? 1 : 0);
  }

  /* ------------------------------------------------------------- 待办页 */
  function renderTasks() {
    let weekEvents = [];
    let failed = '';
    try {
      const start = atDay(state.week);
      const end = addDays(start, 7);
      weekEvents = occurrences(start, end).filter(shownInTasks)
        .filter(e => displayDay(e) >= dateKey(start) && displayDay(e) < dateKey(end));
    } catch (error) { failed = error.message; }

    const pending = weekEvents.filter(e => !e.done);
    const done = weekEvents.filter(e => e.done);
    const list = state.filter === 'pending' ? pending : state.filter === 'done' ? done : weekEvents;

    const groups = [];
    // Keep urgent tasks at the top of the week, then preserve the chronological order.
    for (const event of [...list].sort((a, b) => (Number(b.urgent) - Number(a.urgent)) || (new Date(a.due) - new Date(b.due)))) {
      const key = displayDay(event);
      let group = groups[groups.length - 1];
      if (!group || group.key !== key) groups.push(group = { key, items: [] });
      group.items.push(event);
    }

    const body = failed
      ? stateBlock('error', 'alert', '无法读取待办', escape(failed), `<button class="secondary-button" data-action="reload">重新加载</button>`)
      : !list.length
        ? stateBlock('empty', state.filter === 'done' ? 'checkCircle' : 'noteAdd',
          state.filter === 'done' ? '还没有完成记录' : '这一周，暂时没有待办',
          state.filter === 'done' ? '勾选完成的事项会出现在这里。' : '复制一条通知，或手动添加一件事。',
          `<button class="primary-button" data-action="open-add">${icon('plus')} 添加待办</button>`)
        : groups.map(group => {
          const date = atDay(group.key);
          return `<div class="list-day ${sameDay(date, NOW) || dateKey(date) === dateKey(addDays(NOW, 1)) ? 'soon' : ''}">
              <span>${relDay(date)}</span><span class="list-day-date">${date.getMonth() + 1}月${date.getDate()}日</span>
            </div>
            ${group.items.map(e => `<div class="task-row ${e.done ? 'done' : ''}" style="${eventStyle(e)}">
              <button class="check-button ${e.done ? 'checked' : ''}" data-action="complete" data-id="${escape(e.id)}" data-date="${e.occurrenceDate}"
                role="checkbox" aria-checked="${e.done}" aria-label="${e.done ? '恢复未完成' : '标记完成'}：${escape(e.title)}">${icon('check')}</button>
              <button class="task-details" data-action="detail" data-id="${escape(e.id)}" data-date="${e.occurrenceDate}">
                <span class="task-main">
                  <span class="task-name">${e.urgent ? `<span class="urgent-mark">${icon('alert')}紧急</span>` : ''}${escape(e.title)}</span>
                  <span class="task-meta"><span class="dot"></span>${e.allDay ? '全天' : e.start ? `${hhmm(e.start)}–${sameDay(e.start, e.due) ? '' : `${dateLabel(e.due)} `}${hhmm(e.due)}` : `${dueClock(e)} 截止`}${e.repeat ? ` · ${escape(repeatSummary(e))}` : ''}${e.location ? ` · ${escape(e.location)}` : ''}</span>
                </span>${icon('chevron')}
              </button>
            </div>`).join('')}`;
        }).join('');

    return `<header class="appbar">
      <div class="appbar-title"><p class="appbar-eyebrow">${atDay(state.week).getMonth() + 1}月${atDay(state.week).getDate()}日那一周</p><h1>待办</h1></div>
      <div class="appbar-actions"><button class="icon-button solid" data-action="open-add" aria-label="添加待办">${icon('plus')}</button></div>
    </header>
    <div class="content">
      <div class="segmented" role="tablist" aria-label="待办筛选">
        ${[['pending', '待完成', pending.length], ['done', '已完成', done.length], ['all', '全部', weekEvents.length]].map(([key, label, count]) =>
          `<button class="${state.filter === key ? 'active' : ''}" data-action="filter" data-filter="${key}" role="tab" aria-selected="${state.filter === key}">${label}<span class="count">${count}</span></button>`).join('')}
      </div>
      ${body}
    </div>`;
  }

  /* ------------------------------------------------------------- 设置页 */
  function renderSettings() {
    const theme = settings.theme;
    const themeOption = (value, label, cls) =>
      `<button class="theme-option ${theme === value ? 'active' : ''}" data-action="set-theme" data-theme="${value}" aria-pressed="${theme === value}">
        <span class="theme-swatch ${cls}"></span><span class="theme-name">${label}</span>
      </button>`;

    const row = (ic, title, action) =>
      `<button class="setting-row" data-action="${action}"><span class="setting-icon">${icon(ic)}</span>
        <span class="setting-copy"><strong>${title}</strong></span>${icon('chevron', 'chevron')}</button>`;

    const preview = settings.hasBackground
      ? `<div class="bg-preview">
          <div class="bg-preview-image" style="background-image:url('${backgroundUrl}');opacity:${settings.bgOpacity};filter:blur(${settings.bgBlur}px)"></div>
          <div class="bg-preview-scrim" style="opacity:${settings.bgScrim}"></div>

        </div>`
      : '';

    return `<header class="appbar">
      <div class="appbar-title"><h1>设置</h1></div>
    </header>
    <div class="content">
      <div class="settings-group">
        <h2>外观</h2>
        <div class="plain-list" style="margin-bottom:var(--s3)">
          <div class="theme-picker">
            ${themeOption('light', '浅色', 'light')}${themeOption('dark', '深色', 'dark')}${themeOption('auto', '跟随系统', 'auto')}
          </div>
          <button class="setting-row" data-action="pick-background">
            <span class="setting-icon">${icon('image')}</span>
            <span class="setting-copy"><strong>背景图片</strong></span>
            ${icon('chevron', 'chevron')}
          </button>
          ${settings.hasBackground ? `
            <div class="setting-slider">
              <div class="setting-slider-head"><strong>背景不透明度</strong><span class="setting-value">${Math.round(settings.bgOpacity * 100)}%</span></div>
              <input type="range" min="10" max="100" step="5" value="${Math.round(settings.bgOpacity * 100)}" data-slider="bgOpacity" aria-label="背景不透明度">
            </div>
            <div class="setting-slider">
              <div class="setting-slider-head"><strong>遮罩强度</strong><span class="setting-value">${Math.round(settings.bgScrim * 100)}%</span></div>
              <input type="range" min="0" max="90" step="5" value="${Math.round(settings.bgScrim * 100)}" data-slider="bgScrim" aria-label="遮罩强度">

            </div>
            <div class="setting-slider">
              <div class="setting-slider-head"><strong>模糊程度</strong><span class="setting-value">${settings.bgBlur}px</span></div>
              <input type="range" min="0" max="24" step="2" value="${settings.bgBlur}" data-slider="bgBlur" aria-label="模糊程度">
            </div>
            <button class="setting-row" data-action="clear-background" style="border-bottom:0">
              <span class="setting-icon" style="background:var(--danger-soft);color:var(--danger)">${icon('trash')}</span>
              <span class="setting-copy"><strong>移除背景图片</strong></span>
            </button>` : ''}
        </div>
        ${preview}
      </div>

      <div class="settings-group">
        <h2>日程</h2>
        <div class="plain-list">
          ${row('plus', '添加日程', 'open-add')}
          ${row('repeat', '重复规则', 'repeat-help')}
        </div>
      </div>

      <div id="assistantSettings"></div>
      <div class="settings-group">
        <h2>智能录入</h2>
        <div class="plain-list">
          ${row('spark', 'AI 识别接口', 'api-info')}
          ${row('mic', '语音识别 API', 'speech-config')}
        </div>
      </div>

      <div class="settings-group">
        <h2>数据</h2>
        <div class="plain-list">
          ${row('upload', '导入课表', 'import-ics')}
          ${row('download', '导出备份', 'export-backup')}
          ${row('folder', '恢复备份', 'import-backup')}
        </div>
      </div>

      <div class="settings-group">
        <h2>关于</h2>
        <div class="plain-list">
          ${row('shield', '本机保存', 'storage-info')}
          ${row('refresh', '检查更新', 'check-update')}
          ${row('info', '关于云朵', 'about')}
        </div>
      </div>
    </div>`;
  }

  /* ------------------------------------------------------------- 主渲染 */
  let weekPager = null;
  let pagerTimer = null;
  let suppressClickUntil = 0;
  let calendarScrollTop = 0;
  let calendarFraction = 0;

  function render(preserveScroll = false) {
    const activeScroll = app.querySelector('.week-pane[data-offset="0"] .time-scroll');
    if (activeScroll) calendarScrollTop = activeScroll.scrollTop;
    else if (!preserveScroll) calendarScrollTop = 0;

    const homeScroll = preserveScroll ? (app.querySelector('.content')?.scrollTop || 0) : 0;

    clearTimeout(pagerTimer);
    weekPager?.observer?.disconnect();
    weekPager = null;

    renderTabBar();
    screenRoot.innerHTML = state.tab === 'home' ? renderHome()
      : state.tab === 'calendar' ? renderCalendar()
        : state.tab === 'tasks' ? renderTasks()
          : renderSettings();
    enhanceSelects(screenRoot);

    const content = screenRoot.querySelector('.content');
    if (content && state.tab !== 'calendar') content.scrollTop = homeScroll;
    if (state.tab === 'calendar') mountWeekPager();
    window.YunduoCat?.refresh();
  }

  function changeWeek(weeks) {
    calendarFraction = 0;
    state.week = dateKey(addDays(atDay(state.week), weeks * 7));
    state.selected = dateKey(addDays(atDay(state.selected), weeks * 7));
    render(true);
  }

  function mountWeekPager() {
    const element = app.querySelector('.week-pager');
    if (!element) return;
    const context = { element, touching: false, x: 0, y: 0, horizontal: false, width: element.clientWidth, syncing: false };
    weekPager = context;
    const syncVertical = () => {
      element.querySelectorAll('.time-scroll').forEach(scroll => {
        if (Math.abs(scroll.scrollTop - calendarScrollTop) > 0.1) scroll.scrollTop = calendarScrollTop;
      });
      app.querySelector('.axis-grid').style.transform = `translateY(${-calendarScrollTop}px)`;
    };
    element.scrollLeft = (3 + calendarFraction) * context.width;
    syncVertical();

    const rememberPosition = () => {
      const width = element.clientWidth;
      if (!width) return 0;
      const position = element.scrollLeft / width;
      const index = Math.floor(position + 0.00001);
      const pane = element.children[index];
      if (pane) state.week = pane.dataset.week;
      calendarFraction = position - index;
      const start = addDays(atDay(state.week), Math.floor(calendarFraction * 7));
      const end = addDays(start, 6);
      const labels = app.querySelectorAll('.week-strip-label');
      labels[0].textContent = `${start.getMonth() + 1}月${start.getDate()}日 – ${end.getMonth() + 1}月${end.getDate()}日`;
      labels[1].textContent = academicLabel(start, end);
      app.querySelector('.appbar-eyebrow').textContent = `${start.getFullYear()}年`;
      app.querySelector('.appbar h1').textContent = start.getMonth() === end.getMonth() ? `${start.getMonth() + 1}月` : `${start.getMonth() + 1}月–${end.getMonth() + 1}月`;
      return index;
    };
    const settle = () => {
      if (weekPager !== context || context.touching || !element.isConnected) return;
      const shift = rememberPosition() - 3;
      if (!shift) return;
      const oldLeft = element.scrollLeft;
      // Recycle only offscreen weeks. Keep the visible dates and fractional position unchanged.
      for (let i = 0; i < Math.abs(shift); i++) {
        if (shift > 0) {
          const next = dateKey(addDays(atDay(element.lastElementChild.dataset.week), 7));
          element.insertAdjacentHTML('beforeend', renderWeekPane(next, 0));
          element.firstElementChild.remove();
        } else {
          const previous = dateKey(addDays(atDay(element.firstElementChild.dataset.week), -7));
          element.insertAdjacentHTML('afterbegin', renderWeekPane(previous, 0));
          element.lastElementChild.remove();
        }
      }
      [...element.children].forEach((pane, i) => { pane.dataset.offset = i - 3; });
      element.scrollLeft = oldLeft - shift * element.clientWidth;
      syncVertical();
    };
    const schedule = () => { clearTimeout(pagerTimer); pagerTimer = setTimeout(settle, 180); };
    element.addEventListener('scroll', () => { rememberPosition(); schedule(); }, { passive: true });
    element.addEventListener('scrollend', schedule, { passive: true });
    element.addEventListener('touchstart', event => {
      context.touching = true; context.horizontal = false;
      clearTimeout(pagerTimer);
      context.x = event.touches[0].clientX;
      context.y = event.touches[0].clientY;
    }, { passive: true });
    element.addEventListener('touchmove', event => {
      if (!event.touches.length) return;
      const dx = Math.abs(event.touches[0].clientX - context.x);
      const dy = Math.abs(event.touches[0].clientY - context.y);
      if (dx > 12 && dx > dy * 1.3) context.horizontal = true;
    }, { passive: true });
    const end = () => {
      context.touching = false;
      if (context.horizontal) suppressClickUntil = performance.now() + 350;
      schedule();
    };
    element.addEventListener('touchend', end, { passive: true });
    element.addEventListener('touchcancel', end, { passive: true });
    // Either visible week can receive a vertical gesture; all use one shared time scale.
    element.addEventListener('scroll', event => {
      const target = event.target;
      if (!target?.classList?.contains('time-scroll') || Math.abs(target.scrollTop - calendarScrollTop) <= 0.1) return;
      calendarScrollTop = target.scrollTop;
      syncVertical();
    }, true);
    const observer = new ResizeObserver(() => {
      if (weekPager !== context || !element.clientWidth || context.width === element.clientWidth) return;
      const position = element.scrollLeft / context.width;
      context.width = element.clientWidth;
      element.scrollLeft = position * context.width;
    });
    context.observer = observer;
    observer.observe(element);
    rememberPosition();
  }

  app.addEventListener('click', event => {
    if (event.target.closest('.week-pager') && performance.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  /* -------------------------------------------------------------- 提示层 */
  let toastTimer;
  function toast(message) {
    clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.hidden = false;
    requestAnimationFrame(() => toastEl.classList.add('visible'));
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('visible');
      setTimeout(() => { toastEl.hidden = true; }, 200);
    }, 3200);
  }

  let previousFocus;
  let sheetMode = '';
  function showSheet(html, mode) {
    if (sheetMode === 'voice-input' && mode !== 'voice-input') cleanupSpeech();
    if (overlay.hidden) previousFocus = document.activeElement;
    window.YunduoCat?.suspend();
    sheetMode = mode;
    sheet.innerHTML = html;
    overlay.hidden = false;
    app.inert = true;
    document.body.classList.add('sheet-open');
    enhanceSelects(sheet);
    requestAnimationFrame(() => {
      const first = sheet.querySelector('textarea, input:not([type="checkbox"]):not([type="range"]), button:not(.close-button)');
      first?.focus({ preventScroll: true });
    });
  }
  function closeSheet() {
    closePicker();
    if (sheetMode === 'voice-input') cleanupSpeech();
    if (document.getElementById('noticeInput')) noticeText = document.getElementById('noticeInput').value;
    overlay.hidden = true;
    app.inert = false;
    document.body.classList.remove('sheet-open');
    sheetMode = '';
    sheet.innerHTML = '';
    window.YunduoCat?.refresh();
    previousFocus?.focus?.({ preventScroll: true });
  }

  const sheetHeader = (title, sub, action = '') =>
    `<div class="sheet-header"><div class="sheet-heading"><h2 id="sheetTitle">${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
      <div class="sheet-actions"><button class="close-button" type="button" data-action="close-sheet" aria-label="关闭">${icon('close')}</button>${action}</div></div>`;

  /* -------------------------------------------------- 添加：手动 / AI */
  let noticeText = '';
  let messageDate = dateKey(NOW);
  let editingId = null;
  let editScopeTarget = 'all';
  let editBaseDate = null;
  let drafts = [];
  let draftManual = false;
  let activeInput = 'text';
  let pendingImage = null;

  function openAdd() {
    editingId = null;
    if (pendingParsed) {
      drafts = pendingParsed;
      pendingParsed = null;
      renderDrafts();
      return;
    }
    showSheet(`${sheetHeader('添加日程', '选择录入方式')}
      <div class="sheet-body">
        <div class="choice-list">
          <button class="choice" data-action="choose-manual">
            <span class="choice-icon">${icon('edit')}</span>
            <span class="choice-copy"><strong>手动添加</strong><small>自己填写名称、时间与重复规则</small></span>
            ${icon('chevron')}
          </button>
          <button class="choice" data-action="choose-voice">
            <span class="choice-icon">${icon('mic')}</span>
            <span class="choice-copy"><strong>语音添加</strong><small>录一段通知，识别后确认日程</small></span>${icon('chevron')}
          </button>
          <button class="choice" data-action="choose-ai">
            <span class="choice-icon">${icon('spark')}</span>
            <span class="choice-copy"><strong>AI 智能提取</strong><small>粘贴通知文字，或上传课表 / 通知截图</small></span>
            ${icon('chevron')}
          </button>
        </div>
      </div>`, 'add-choice');
  }

  function newDraft(overrides = {}) {
    return {
      title: '',
      allDay: false,
      due: `${state.selected}T23:59`,
      start: '',
      hasStart: false,
      location: '',
      note: '',
      repeat: null,
      color: state.events.length % COLORS.length,
      source: '手动添加',
      warnings: [],
      showOnHome: true,
      showInTasks: false,
      urgent: false,
      ...overrides
    };
  }

  function draftToEvent(draft, index) {
    const allDay = !!draft.allDay;
    const due = allDay ? `${draft.due.slice(0, 10)}T23:59` : draft.due;
    const start = !allDay && draft.hasStart && draft.start ? draft.start : null;
    return {
      id: uid(),
      title: String(draft.title || '').trim() || '待命名事项',
      due,
      start,
      allDay,
      color: clamp(Number(draft.color) || 0, 0, COLORS.length - 1),
      location: String(draft.location || '').trim(),
      note: String(draft.note || '').trim(),
      source: String(draft.source || '').slice(0, 20000),
      showOnHome: draft.showOnHome !== false,
      showInTasks: draft.showInTasks === true,
      urgent: draft.urgent === true,
      repeat: draft.repeat || null,
      until: draft.repeat?.until || null,
      completedDates: [],
      skippedDates: []
    };
  }

  /* -------- 手动 -------- */
  function openManual(draft) {
    editingId = null;
    editScopeTarget = 'all';
    editBaseDate = null;
    draftManual = true;
    drafts = [draft || newDraft()];
    renderDrafts({ manual: true });
  }

  /* -------- AI -------- */
  // 重新渲染输入面板时保留已选图片；只有主动清空或重新进入 AI 模式才会丢弃它。
  function openAi(tab = 'text', { resetImage = false } = {}) {
    if (sheetMode === 'voice-input' && tab !== 'voice') cleanupSpeech();
    const priorText = document.getElementById('noticeInput');
    if (priorText) noticeText = priorText.value;
    messageDate = document.getElementById('messageDate')?.value || messageDate;
    activeInput = tab;
    if (tab === 'voice') { renderSpeech(); return; }
    if (resetImage) pendingImage = null;
    const config = apiConfig();
    const ready = config.hasKey && config.model;
    showSheet(`${sheetHeader('AI 智能提取', '识别结果会先预览，确认后才写入日程')}
      <div class="sheet-body">
        ${inputTabs(tab)}
        <label class="field-label" for="messageDate">原文 / 截图对应日期 <span class="required-mark">*</span></label>
        ${pickerField('messageDate', messageDate, 'date', true)}
        <p class="helper-note">相对日期（“明天”“下周三”）以这一天为基准计算。</p>
        ${tab === 'text' ? `
          <label class="field-label" for="noticeInput">
            <span>通知文字</span>
            <button class="text-button" type="button" data-action="paste-clipboard">从剪贴板粘贴</button>
          </label>
          <textarea class="text-input" id="noticeInput" placeholder="例如：每周三交概率论作业，周五 22:00 前提交实验报告……">${escape(noticeText)}</textarea>
          <div class="example-chips" style="display:flex;flex-wrap:wrap;gap:var(--s2);margin-top:var(--s3);align-items:center">
            <span class="helper-note subtle" style="margin:0">试一试</span>
            ${['每周作业', '有起止时间的班会', '一次添加多条'].map((label, i) => `<button class="chip" data-action="example" data-example="${i}">${label}</button>`).join('')}
          </div>
          <p class="helper-note">点击识别后，文字会发送到你配置的 API 服务。</p>`
        : `
          <span class="field-label">截图 / 照片</span>
          ${pendingImage
            ? `<div class="choice" style="cursor:default">
                <span class="choice-icon" style="padding:0;overflow:hidden;background:none">
                  <img src="${pendingImage.thumb}" alt="" style="width:42px;height:42px;object-fit:cover">
                </span>
                <span class="choice-copy"><strong>${escape(pendingImage.name || '已选择图片')}</strong><small>${pendingImage.width}×${pendingImage.height}</small></span>
                <button class="draft-remove" data-action="clear-image" aria-label="移除图片">${icon('close')}</button>
              </div>`
            : `<button class="choice" data-action="pick-image">
                <span class="choice-icon">${icon('image')}</span>
                <span class="choice-copy"><strong>选择图片</strong><small>课表截图、群通知截图、纸质通知照片</small></span>
                ${icon('chevron')}
              </button>`}
          <p class="helper-note">支持 JPG / PNG / WEBP，图片会发送到你配置的 API 服务。建议先裁剪到只含通知内容。</p>`}
        ${ready ? '' : `<div class="form-error" style="margin-top:var(--s4)">${icon('alert')}<span>还没有配置 AI 接口。请先在设置中填写 API 地址、Key 并选择模型。</span></div>`}
      </div>
      <div class="sheet-footer">
        <button class="secondary-button" data-action="close-sheet">取消</button>
        <button class="primary-button" data-action="analyze" ${ready && (tab === 'text' || pendingImage) ? '' : 'disabled'}>${icon('spark')} 开始识别</button>
      </div>`, 'ai-input');
  }

  /* ------------------------------------------------------------- 语音录入 */
  const voice = { phase: 'idle', audio: null, text: '', error: '', started: 0, generation: 0, timer: null };
  function speechConfig() {
    try { return JSON.parse(call('getSpeechConfig')); }
    catch { return { endpoint: '', model: 'whisper-1', language: 'zh', hasKey: false }; }
  }
  function captureSpeechText() {
    if (sheetMode !== 'voice-input') return;
    const input = document.getElementById('noticeInput');
    if (input) voice.text = input.value;
    messageDate = document.getElementById('messageDate')?.value || messageDate;
  }
  function cleanupSpeech() {
    captureSpeechText();
    if (voice.phase === 'recording' || voice.phase === 'starting' || voice.phase === 'stopping') {
      try { call('cancelRecording'); } catch (_) { }
    }
    if (voice.phase === 'transcribing') { try { call('cancelTranscription'); } catch (_) { } }
    voice.generation++;
    voice.phase = 'idle';
    clearInterval(voice.timer); voice.timer = null;
  }
  function audioTime(ms) {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
  }
  function inputTabs(tab) {
    return `<div class="input-tabs" role="tablist" aria-label="输入方式">${[['text','note','文字'],['image','image','图片'],['voice','mic','语音']].map(([key, glyph, text]) =>
      `<button class="${tab === key ? 'active' : ''}" type="button" data-action="ai-tab" data-input="${key}" role="tab" aria-selected="${tab === key}">${icon(glyph)} ${text}</button>`).join('')}</div>`;
  }
  function renderSpeech(preserveText = true) {
    if (preserveText) captureSpeechText();
    const config = speechConfig();
    const configured = !!config.endpoint && !!config.model;
    const recording = voice.phase === 'recording';
    const working = !['idle', 'recording'].includes(voice.phase);
    const llmReady = apiConfig().hasKey && apiConfig().model;
    const caption = recording ? '录音中，点击停止' : voice.phase === 'starting' ? '正在准备麦克风…'
      : voice.phase === 'stopping' ? '正在保存录音…' : voice.phase === 'importing' ? '正在读取音频…' : voice.phase === 'transcribing' ? '正在转为文字…' : voice.phase === 'extracting' ? '正在提取日程…' : voice.audio ? '再录一段' : '点击开始录音';
    showSheet(`${sheetHeader('语音添加日程', '说出通知、安排或截止时间')}
      <div class="sheet-body">
        ${inputTabs('voice')}
        <section class="speech-panel" aria-label="录音控制">
          <button type="button" class="speech-record ${recording ? 'recording' : ''}" data-action="${recording ? 'speech-stop' : 'speech-start'}" aria-label="${recording ? '停止录音' : '开始录音'}" ${working ? 'disabled' : ''}>
            ${working ? '<span class="spinner"></span>' : icon(recording ? 'stop' : 'mic')}
          </button>
          <strong class="speech-caption">${caption}</strong>
          <span class="speech-timer" data-speech-timer aria-label="录音时长">${recording ? audioTime(Date.now() - voice.started) : voice.audio ? audioTime(voice.audio.durationMs) : '00:00'}</span>
          <p class="helper-note">最长录音5分钟，离开应用会停止录音。</p>
          <button type="button" class="text-button speech-import" data-action="speech-import" ${voice.phase !== 'idle' ? 'disabled' : ''}>${icon('upload')} 导入音频文件</button>
        </section>
        ${voice.audio ? `<div class="speech-clip"><span>${icon('mic')}<strong>${escape(voice.audio.name)}</strong><small>${audioTime(voice.audio.durationMs)} · ${(voice.audio.bytes / 1024 / 1024).toFixed(1)} MB</small></span><button type="button" class="icon-button" data-action="speech-clear" aria-label="移除音频" ${voice.phase !== 'idle' ? 'disabled' : ''}>${icon('close')}</button></div>` : ''}
        ${voice.phase === 'transcribing' ? `<button type="button" class="secondary-button speech-transcribe" data-action="speech-cancel">取消转写</button>` : voice.audio ? `<button type="button" class="primary-button speech-transcribe" data-action="speech-transcribe" ${voice.phase !== 'idle' || !configured ? 'disabled' : ''}>${icon('spark')} 转为文字</button>` : ''}
        <div class="speech-service-note"><span>${configured ? `${escape(config.model)} · 自定义语音服务` : '先配置语音识别 API，录好后即可转写。'}</span><button type="button" class="text-button" data-action="speech-config" ${voice.phase !== 'idle' ? 'disabled' : ''}>${configured ? '配置' : '去配置'}</button></div>
        ${voice.error ? `<p class="form-error" role="alert">${icon('alert')}<span>${escape(voice.error)}</span></p>` : ''}
        <label class="field-label" for="noticeInput">识别文字 <span class="optional-mark">可修改后再提取日程</span></label>
        <textarea class="text-input" id="noticeInput" maxlength="20000" placeholder="语音识别完成后，文字会显示在这里。" ${voice.phase !== 'idle' ? 'disabled' : ''}>${escape(voice.text)}</textarea>
        <label class="field-label" for="messageDate">说话内容对应日期</label>
        ${pickerField('messageDate', messageDate, 'date', true)}
        <p class="helper-note">“明天”“下周三”以这一天为准。点击“转为文字”才会把音频发给你的语音服务；提取日程使用现有 AI 接口。</p>
        ${!llmReady ? '<p class="helper-note">还需在设置中配置日程解析 AI，才能从文字提取日程。</p>' : ''}
      </div>
      <div class="sheet-footer"><button type="button" class="secondary-button" data-action="close-sheet">关闭</button><button type="button" class="primary-button" data-action="analyze" ${voice.phase !== 'idle' || !voice.text.trim() || !llmReady ? 'disabled' : ''}>${icon('spark')} 提取日程</button></div>`, 'voice-input');
    clearInterval(voice.timer);
    if (recording) voice.timer = setInterval(() => {
      const clock = document.querySelector('[data-speech-timer]');
      if (clock) clock.textContent = audioTime(Date.now() - voice.started);
    }, 250);
  }
  function startSpeechRecording() {
    captureSpeechText(); voice.error = ''; voice.phase = 'starting';
    const generation = ++voice.generation;
    renderSpeech();
    nativeRequest(id => call('startRecording', id), result => {
      if (generation !== voice.generation) return;
      voice.phase = result.ok ? 'recording' : 'idle';
      if (result.ok) { voice.audio = null; voice.text = ''; noticeText = ''; voice.started = Date.now(); }
      else voice.error = result.error;
      if (sheetMode === 'voice-input') renderSpeech(!result.ok);
    });
  }
  function stopSpeechRecording() {
    voice.phase = 'stopping'; clearInterval(voice.timer); renderSpeech();
    const generation = voice.generation;
    nativeRequest(id => call('stopRecording', id), result => {
      if (generation !== voice.generation) return;
      voice.phase = 'idle';
      if (result.ok) { voice.audio = result.data; voice.error = ''; } else voice.error = result.error;
      if (sheetMode === 'voice-input') renderSpeech();
    });
  }
  function importSpeechAudio() {
    captureSpeechText();
    const generation = ++voice.generation;
    voice.phase = 'importing'; renderSpeech();
    nativeRequest(id => call('pickAudio', id), result => {
      if (generation !== voice.generation) return;
      voice.phase = 'idle';
      if (result.data?.cancelled) { if (sheetMode === 'voice-input') renderSpeech(); return; }
      if (result.ok) { voice.audio = result.data; voice.text = ''; noticeText = ''; voice.error = ''; }
      else voice.error = result.error;
      if (sheetMode === 'voice-input') renderSpeech(!result.ok);
    });
  }
  function transcribeSpeech() {
    if (!voice.audio) return;
    captureSpeechText();
    voice.phase = 'transcribing'; voice.error = '';
    const generation = ++voice.generation;
    const token = voice.audio.token;
    renderSpeech();
    nativeRequest(id => call('transcribeAudio', id, token), result => {
      if (generation !== voice.generation) return;
      voice.phase = 'idle';
      if (result.ok) { voice.text = result.data.text || ''; noticeText = voice.text; }
      else voice.error = result.error;
      if (sheetMode === 'voice-input') renderSpeech(false);
    });
  }
  let speechReturnToInput = false;
  function showSpeechConfig() {
    speechReturnToInput = sheetMode === 'voice-input';
    if (speechReturnToInput) cleanupSpeech();
    const config = speechConfig();
    showSheet(`<form id="speechApiForm" novalidate>
      ${sheetHeader('语音识别 API', '', '<button type="submit" class="primary-button sheet-save">保存</button>')}
      <div class="sheet-body">
        <label class="field-label" for="speech-endpoint">完整转写接口地址</label>
        <input id="speech-endpoint" name="endpoint" type="url" class="text-input" value="${escape(config.endpoint)}" placeholder="https://你的服务/v1/audio/transcriptions" autocomplete="off" autocapitalize="none" spellcheck="false">
        <label class="field-label" for="speech-key">API Key </label>
        <input id="speech-key" name="key" type="password" class="text-input" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${config.hasKey ? '留空保留语音服务的 Key' : '填写语音服务的 Key'}">
        <label class="field-label" for="speech-model"><span>语音识别模型</span><button type="button" class="text-button" data-action="speech-models">获取模型</button></label>
        <input id="speech-model" name="model" class="text-input" list="speech-model-list" value="${escape(config.model || 'whisper-1')}" placeholder="如 whisper-1 或服务商提供的语音模型" autocomplete="off" spellcheck="false">
        <datalist id="speech-model-list"></datalist>
        <p id="speechModelsNote" class="config-status" role="status"></p>
        <label class="field-label" for="speech-language">识别语言</label>
        <select id="speech-language" name="language" class="select-input">${[['zh','中文'],['','自动识别'],['en','英语']].map(([value,label]) => `<option value="${value}" ${config.language === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
        ${config.hasKey ? '<label class="switch-row"><span class="switch-copy"><strong>删除语音服务的 Key</strong></span><input class="switch-control" type="checkbox" name="removeKey"></label>' : ''}
        <p id="speechConfigError" class="form-error" role="alert" hidden></p>
      </div></form>`, 'speech-config');
  }
  function speechFormData() {
    const form = document.getElementById('speechApiForm');
    if (!form) return null;
    const data = new FormData(form);
    return { endpoint: String(data.get('endpoint') || '').trim(), key: String(data.get('key') || '').trim(), model: String(data.get('model') || '').trim(), language: String(data.get('language') || ''), removeKey: data.has('removeKey') };
  }
  function saveSpeechConfig() {
    const data = speechFormData(); if (!data) return;
    try {
      const result = JSON.parse(call('saveSpeechConfig', JSON.stringify(data)));
      if (!result.ok) throw Error(result.error || '语音配置未能保存');
      const returnToInput = speechReturnToInput;
      closeSheet();
      if (returnToInput) { activeInput = 'voice'; renderSpeech(); } else render(true);
      toast('语音接口已保存');
    } catch (error) {
      const output = document.getElementById('speechConfigError');
      output.textContent = error.message; output.hidden = false; output.scrollIntoView({ block: 'nearest' });
    }
  }
  function fetchSpeechModels(button) {
    const data = speechFormData(); if (!data) return;
    const form = document.getElementById('speechApiForm');
    const fingerprint = JSON.stringify(data);
    button.disabled = true;
    const note = document.getElementById('speechModelsNote'); note.textContent = '正在获取模型…';
    nativeRequest(id => call('listSpeechModels', id, JSON.stringify(data)), result => {
      if (document.getElementById('speechApiForm') !== form) return;
      button.disabled = false;
      if (fingerprint !== JSON.stringify(speechFormData())) { note.textContent = '配置已更改，请重新获取模型。'; return; }
      if (!result.ok) { note.textContent = result.error + '；也可以直接填写模型名。'; return; }
      const models = result.data.models || [];
      document.getElementById('speech-model-list').innerHTML = models.map(name => `<option value="${escape(name)}"></option>`).join('');
      note.textContent = `获取到 ${models.length} 个模型，请选择服务支持的语音模型。`;
    });
  }

  /* -------- 预览 -------- */
  function renderDrafts({ manual = false } = {}) {
    const scrollTop = sheetMode === 'preview' ? sheet.querySelector('.sheet-body')?.scrollTop || 0 : 0;
    const heading = editingId ? '编辑日程' : manual ? '手动添加' : '确认识别结果';
    const sub = editingId ? '修改名称、时间或显示位置后保存。' : manual ? '截止时间必填，开始时间按需开启。'
      : `识别到 ${drafts.length} 项安排 · 保存前可以逐项修改或删除`;

    const cards = drafts.map((draft, i) => {
      const repeatOn = !!draft.repeat;
      const freq = draft.repeat?.freq || 'weekly';
      return `<section class="draft-card" data-draft="${i}">
        <div class="draft-head">
          <span class="draft-index">${i + 1}</span>
          <strong>${editingId ? '日程信息' : manual ? '新的安排' : '识别结果'}</strong>
          ${!editingId && (drafts.length > 1 || !manual) ? `<button type="button" class="draft-remove" data-action="remove-draft" data-index="${i}" aria-label="删除第 ${i + 1} 项">${icon('trash')}</button>` : ''}
        </div>

        <label class="field-label" for="title-${i}">名称 <span class="required-mark">*</span></label>
        <input class="text-input ${draft.title ? '' : 'warning-input'}" id="title-${i}" name="title-${i}" value="${escape(draft.title)}" placeholder="例如：概率论作业" maxlength="100">

        <fieldset class="visibility-fields">
          <legend class="field-label">显示位置</legend>
          <label><input type="checkbox" name="showOnHome-${i}" ${draft.showOnHome !== false ? 'checked' : ''}>接下来</label>
          <label><input type="checkbox" name="showInTasks-${i}" ${draft.showInTasks === true ? 'checked' : ''}>待办</label>
        </fieldset>
        <fieldset class="priority-fields">
          <legend class="field-label">优先级</legend>
          <label class="urgent-option"><input type="checkbox" name="urgent-${i}" ${draft.urgent === true ? 'checked' : ''}>紧急置顶</label>
        </fieldset>
        <label class="switch-row" style="padding-left:0;padding-right:0;min-height:0;margin-top:var(--s4)">
          <span class="switch-copy"><strong>全天事项</strong><small>没有具体时段，只在日期上标记</small></span>
          <input class="switch-control" type="checkbox" name="allDay-${i}" data-toggle="allday" data-index="${i}" ${draft.allDay ? 'checked' : ''}>
        </label>

        <div class="time-fields" style="margin-top:var(--s3)">
          <div>
            <label class="field-label" for="due-${i}">${draft.allDay ? '日期' : '截止时间'} <span class="required-mark">*</span></label>
            ${pickerField(`due-${i}`, draft.allDay ? (draft.due || '').slice(0, 10) : draft.due, draft.allDay ? 'date' : 'datetime', true)}
          </div>
          <div ${draft.allDay ? 'hidden' : ''} data-start-wrap="${i}">
            <label class="field-label" for="start-${i}">开始时间 <span class="optional-mark">选填</span></label>
            ${pickerField(`start-${i}`, draft.start, 'datetime')}
          </div>
        </div>
        ${draft.warnings.length ? `<div class="field-warning">${icon('alert')}<span>${draft.warnings.map(escape).join(' ')}</span></div>` : ''}

        <label class="field-label" for="location-${i}">地点 <span class="optional-mark">选填</span></label>
        <input class="text-input" id="location-${i}" name="location-${i}" value="${escape(draft.location)}" placeholder="例如：六教 6A413" maxlength="200">

        <label class="field-label" for="note-${i}">备注 <span class="optional-mark">选填</span></label>
        <input class="text-input" id="note-${i}" name="note-${i}" value="${escape(draft.note)}" placeholder="补充说明、提交方式等" maxlength="500">

        <label class="switch-row" style="padding-left:0;padding-right:0;min-height:0;margin-top:var(--s4)">
          <span class="switch-copy"><strong>重复</strong><small>${repeatOn ? escape(repeatSummary({ repeat: draft.repeat, due: draft.due, until: draft.repeat?.until })) : '不重复'}</small></span>
          <input class="switch-control" type="checkbox" name="repeat-${i}" data-toggle="repeat" data-index="${i}" ${repeatOn ? 'checked' : ''}>
        </label>
        <div data-repeat-fields="${i}" ${repeatOn ? '' : 'hidden'}>
          <label class="field-label">重复方式</label>
          <select class="select-input" name="freq-${i}" data-field="freq" data-index="${i}">
            ${Object.entries(REPEAT_PRESETS).filter(([k]) => k !== 'none').map(([k, label]) =>
              `<option value="${k}" ${freq === k ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
          ${repeatExtraFields(draft, i)}
        </div>

        <label class="field-label">颜色</label>
        <div class="color-options" role="radiogroup" aria-label="第 ${i + 1} 项颜色">
          ${COLORS.map((c, ci) => `<label class="color-radio">
            <input type="radio" name="color-${i}" value="${ci}" ${draft.color === ci ? 'checked' : ''} aria-label="${c.name}">
            <span class="color-swatch" style="--swatch-bg:${isDark() ? c.darkBg : c.bg};--swatch-fg:${isDark() ? c.darkFg : c.fg}">${icon('check')}</span>
          </label>`).join('')}
        </div>

        ${draft.source && !manual ? `<div class="draft-source">原文：${escape(draft.source.slice(0, 300))}</div>` : ''}
      </section>`;
    }).join('');

    showSheet(`<form id="draftForm" novalidate>
        ${sheetHeader(heading, sub, `<button class="primary-button sheet-save" type="submit" aria-label="${editingId ? '保存修改' : '保存日程'}">保存${drafts.length > 1 ? ` ${drafts.length} 项` : ''}</button>`)}
        <div class="sheet-body">
          ${cards}
          <p class="form-error" id="formError" role="alert" hidden></p>
        </div>
        ${!manual && !editingId ? `<div class="sheet-footer"><button class="secondary-button" type="button" data-action="back-to-ai">返回修改</button></div>` : ''}
      </form>`, 'preview');
    sheet.querySelector('.sheet-body').scrollTop = scrollTop;
  }

  function repeatExtraFields(draft, i) {
    const repeat = draft.repeat || { freq: 'weekly', interval: 1, weekdays: [], monthlyMode: 'date', nth: 1, weekday: 0 };
    const freq = repeat.freq;
    const untilValue = repeat.until || '';
    let extra = '';

    if (freq === 'weekly') {
      const selected = Array.isArray(repeat.weekdays) && repeat.weekdays.length
        ? repeat.weekdays
        : [new Date(draft.due || NOW).getDay()];
      extra = `<label class="field-label">重复的星期</label>
        <div class="weekday-picker">${[1, 2, 3, 4, 5, 6, 0].map(d =>
        `<label><input type="checkbox" name="wd-${i}" value="${d}" ${selected.includes(d) ? 'checked' : ''} data-field="weekday" data-index="${i}"><span>${WEEKDAYS[d]}</span></label>`).join('')}</div>`;
    }
    if (freq === 'monthly') {
      extra = `<label class="field-label">每月方式</label>
        <select class="select-input" name="monthlyMode-${i}" data-field="monthlyMode" data-index="${i}">
          <option value="date" ${repeat.monthlyMode === 'date' ? 'selected' : ''}>每月同一日期</option>
          <option value="weekday" ${repeat.monthlyMode === 'weekday' ? 'selected' : ''}>每月第几个星期几</option>
          <option value="last" ${repeat.monthlyMode === 'last' ? 'selected' : ''}>每月最后一天</option>
        </select>
        ${repeat.monthlyMode === 'weekday' ? `<label class="field-label">第几个</label>
          <div class="recur-grid">
            <select class="select-input" name="nth-${i}" data-field="nth" data-index="${i}">
              ${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${repeat.nth === n ? 'selected' : ''}>第 ${n} 个</option>`).join('')}
            </select>
            <select class="select-input" name="weekday-${i}" data-field="weekday" data-index="${i}">
              ${[1, 2, 3, 4, 5, 6, 0].map(d => `<option value="${d}" ${repeat.weekday === d ? 'selected' : ''}>${WEEKDAY_FULL[d]}</option>`).join('')}
            </select>
          </div>` : ''}`;
    }

    return `${extra}
      <div class="recur-grid" style="margin-top:var(--s3)">
        <div>
          <label class="field-label" for="interval-${i}">间隔</label>
          <select class="select-input" id="interval-${i}" name="interval-${i}" data-field="interval" data-index="${i}">
            ${Array.from({ length: 12 }, (_, n) => n + 1).map(n =>
        `<option value="${n}" ${(repeat.interval || 1) === n ? 'selected' : ''}>每 ${n} ${freq === 'daily' ? '天' : freq === 'weekly' ? '周' : freq === 'monthly' ? '月' : '年'}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="field-label" for="until-${i}">结束日期 <span class="optional-mark">选填</span></label>
          ${pickerField(`until-${i}`, untilValue, 'date')}
        </div>
      </div>`;
  }

  function collectDrafts(form) {
    const data = new FormData(form);
    const result = [];
    let error = '';
    const next = drafts.map((draft, i) => ({ ...draft }));

    for (let i = 0; i < next.length; i++) {
      const draft = next[i];
      draft.title = String(data.get(`title-${i}`) || '').trim();
      draft.allDay = data.has(`allDay-${i}`);
      draft.showOnHome = data.has(`showOnHome-${i}`);
      draft.showInTasks = data.has(`showInTasks-${i}`);
      draft.urgent = data.has(`urgent-${i}`);
      draft.location = String(data.get(`location-${i}`) || '').trim();
      draft.note = String(data.get(`note-${i}`) || '').trim();
      draft.start = draft.allDay ? '' : String(data.get(`start-${i}`) || '');
      draft.hasStart = !draft.allDay && !!draft.start;

      const dueRaw = String(data.get(`due-${i}`) || '');
      draft.due = draft.allDay ? (dueRaw ? `${dueRaw}T23:59` : '') : dueRaw;

      const repeatOn = data.has(`repeat-${i}`);
      if (repeatOn) {
        const freq = String(data.get(`freq-${i}`) || 'weekly');
        const weekdays = data.getAll(`wd-${i}`).map(v => Number(v));
        draft.repeat = {
          freq,
          interval: clamp(Number(data.get(`interval-${i}`)) || 1, 1, 99),
          weekdays: freq === 'weekly' ? (weekdays.length ? weekdays : [new Date(draft.due).getDay()]) : [],
          monthlyMode: String(data.get(`monthlyMode-${i}`) || 'date'),
          nth: clamp(Number(data.get(`nth-${i}`)) || 1, 1, 5),
          weekday: clamp(Number(data.get(`weekday-${i}`)) ?? new Date(draft.due).getDay(), 0, 6)
        };
        const until = String(data.get(`until-${i}`) || '');
        draft.repeat.until = validDay(until) ? until : null;
        if (draft.repeat.until && new Date(draft.repeat.until) < new Date(draft.due.slice(0, 10))) {
          error = `第 ${i + 1} 项：结束日期不能早于第一次发生的日期。`;
          break;
        }
      } else draft.repeat = null;

      draft.color = clamp(Number(data.get(`color-${i}`)) || 0, 0, COLORS.length - 1);

      if (!draft.title) { error = `第 ${i + 1} 项：请填写名称。`; break; }
      if (!validISO(draft.due)) { error = `第 ${i + 1} 项：请填写有效的${draft.allDay ? '日期' : '截止日期和时间'}。`; break; }
      if (!draft.allDay && draft.hasStart && new Date(draft.start) >= new Date(draft.due)) {
        error = `第 ${i + 1} 项：开始时间必须早于截止时间。`; break;
      }
      result.push(draftToEvent(draft, i));
    }

    // Keep the collected values on `drafts` so a re-render (toggling a switch, removing an
    // item, switching repeat type) preserves everything the user already typed.
    drafts = next;

    if (error) {
      const el = document.getElementById('formError');
      if (el) {
        el.innerHTML = `${icon('alert')}<span>${escape(error)}</span>`;
        el.hidden = false;
        el.scrollIntoView({ block: 'nearest' });
      }
      return null;
    }
    return result;
  }

  function commitDrafts(events) {
    const editing = editingId ? state.events.find(e => e.id === editingId) : null;
    const reset = () => { editingId = null; editScopeTarget = 'all'; editBaseDate = null; };
    const applyCourseColors = () => {
    // A course uses one color across dates, including separately imported sessions.
    for (const incoming of events) {
      if (!incoming.start || incoming.allDay) continue;
      state.events = state.events.map(e => e.start && !e.allDay && courseKey(e.title) === courseKey(incoming.title)
        ? { ...e, color: incoming.color } : e);
    }
    };

    if (editing) {
      const incoming = events[0];
      const base = editBaseDate || editing.occurrenceDate || state.selected;

      // 仅修改这一次：原系列跳过该日，另建一条独立事项承载改动
      if (editing.repeat && editScopeTarget === 'this') {
        editing.skippedDates = [...new Set([...editing.skippedDates, base])];
        state.events = [...state.events, { ...incoming, id: uid(), repeat: null, until: null }];
        applyCourseColors();
        if (!save()) return;
        reset();
        closeSheet();
        render();
        toast('已修改这一次，其余各次不变');
        return;
      }

      // 本次及以后：原系列在 base 前一天结束，新系列从 base 开始
      if (editing.repeat && editScopeTarget === 'future') {
        editing.until = dateKey(addDays(atDay(base), -1));
        editing.skippedDates = editing.skippedDates.filter(d => d < base);
        state.events = [...state.events, { ...incoming, id: uid() }];
        applyCourseColors();
        if (!save()) return;
        reset();
        closeSheet();
        render();
        toast('已修改本次及以后的安排');
        return;
      }

      // 整个系列
      state.events = state.events.map(e => e.id === editing.id ? {
        ...editing,
        ...incoming,
        id: editing.id,
        completedDates: editing.completedDates,
        skippedDates: editing.skippedDates,
        // 数值规则由界面的结构化规则重新生成，不再沿用导入时的原始规则
        nativeRepeat: false
      } : e);
    } else {
      state.events = [...state.events, ...events];
    }

    applyCourseColors();
    state.week = dateKey(monday(new Date(events[0].due)));
    state.selected = dateKey(events[0].due);
    if (!save()) return;
    reset();
    closeSheet();
    render();
    toast(events.length > 1 ? `已添加 ${events.length} 项日程` : '已保存');
  }

  /* ------------------------------------------------------------ 详情面板 */
  function getOccurrence(id, date) {
    return occurrences(atDay(date), new Date(atDay(date).getTime() + DAY - 1)).find(e => e.id === id);
  }

  function openDetail(id, date) {
    let event;
    try { event = getOccurrence(id, date); } catch (error) { toast(error.message); return; }
    if (!event) { toast('这项日程已删除'); return; }
    activeOccurrence = { id, date };
    const c = colorOf(event.color);
    const kind = event.allDay ? '全天' : event.start ? '有时段' : '截止待办';

    showSheet(`${sheetHeader('日程详情', '')}
      <div class="sheet-body">
        <div class="detail-hero">
          <span class="chip" style="background:${isDark() ? c.darkBg : c.bg};color:${isDark() ? c.darkFg : c.fg}">${escape(c.name)}</span>
          <span class="chip">${kind}</span>
          ${event.urgent ? `<span class="chip danger">${icon('alert')}紧急置顶</span>` : ''}
          ${event.repeat ? `<span class="chip accent">${icon('repeat')}${escape(repeatSummary(event) || '重复')}</span>` : ''}
          ${event.done ? `<span class="chip ok">${icon('check')}已完成</span>` : ''}
        </div>
        <h2 class="detail-title">${escape(event.title)}</h2>
        <div class="detail-grid">
          <div class="detail-item">${icon('calendar')}<div><span>日期</span><strong>${dateLabel(atDay(displayDay(event)))}</strong></div></div>
          ${event.start ? `<div class="detail-item">${icon('clock')}<div><span>开始时间</span><strong>${hhmm(event.start)}</strong></div></div>` : ''}
          <div class="detail-item">${icon('clock')}<div><span>${event.start ? '结束时间' : '截止时间'}</span><strong>${event.allDay ? '全天' : dueClock(event)}</strong></div></div>
          ${event.location ? `<div class="detail-item">${icon('pin')}<div><span>地点</span><strong>${escape(event.location)}</strong></div></div>` : ''}
          ${event.note ? `<div class="detail-item">${icon('note')}<div><span>备注</span><strong>${escape(event.note)}</strong></div></div>` : ''}
          ${event.urgent ? `<div class="detail-item">${icon('alert')}<div><span>优先级</span><strong>紧急，已置顶</strong></div></div>` : ''}
          ${event.repeat ? `<div class="detail-item">${icon('repeat')}<div><span>重复规则</span><strong>${escape(repeatSummary(event) || '重复')}</strong></div></div>` : ''}
        </div>
        ${event.source ? `<div class="detail-source"><span class="field-label">原始信息</span><p>${escape(event.source)}</p></div>` : ''}
      </div>
      <div class="sheet-footer">
        <button class="secondary-button icon-only" data-action="edit-event" data-id="${escape(id)}" data-date="${date}" aria-label="编辑">${icon('edit')}</button>
        <button class="secondary-button icon-only" data-action="request-delete" data-id="${escape(id)}" data-date="${date}" aria-label="删除">${icon('trash')}</button>
        <button class="primary-button" data-action="complete" data-id="${escape(id)}" data-date="${date}">${icon('check')} ${event.done ? '恢复未完成' : '标记完成'}</button>
      </div>`, 'detail');
  }


  // Explicit, narrow adapter: the assistant can propose changes, then use existing editors.
  window.YunduoHost = {
    call,
    request(method, ...args) {
      return new Promise((resolve, reject) => nativeRequest(id => call(method, id, ...args), result => {
        if (result.ok) resolve(result.data || {}); else reject(new Error(result.error || '请求失败'));
      }));
    },
    toast,
    isDark,
    hasSheet: () => !overlay.hidden,
    navigate(tab) {
      if (!TABS.some(([name]) => name === tab)) throw new Error('不能打开这个页面');
      state.tab = tab; render();
    },
    describe(action) {
      const event = state.events.find(e => e.id === action.id);
      if (!event) throw new Error('这项安排已不存在，请重新查询');
      return {title:event.title, due:event.due, repeat:!!event.repeat, urgent:event.urgent === true};
    },
    prepare(action) {
      if (action.type === 'add') {
        editingId = null; editScopeTarget = 'all'; editBaseDate = null; draftManual = false;
        drafts = draftsFromModel(action.events, '云朵管家');
        drafts.forEach((draft,index) => { draft.showInTasks = action.events[index]?.showInTasks === true; });
        if (!drafts.length) throw new Error('没有可添加的安排');
        renderDrafts(); return '已打开新增预览，请检查后保存';
      }
      const event = state.events.find(e => e.id === action.id);
      if (!event) throw new Error('这项安排已不存在，请重新查询');
      const date = validDay(action.date) ? action.date : event.due.slice(0,10);
      if (!getOccurrence(event.id,date)) throw new Error('这次安排已变化，请重新查询');
      if (action.type === 'edit') { openEdit(event.id,date); return '已打开编辑页，请修改后保存'; }
      if (action.type === 'delete') { requestDelete(event.id,date); return '请选择并确认删除范围'; }
      if (action.type === 'complete') {
        if (event.completedDates.includes(date)) return '这一项已经完成';
        event.completedDates = [...new Set([...event.completedDates,date])];
        if (!save()) throw new Error('保存未完成，请重新查询后再试');
        render(true); return '已标记本次完成';
      }
      throw new Error('暂不支持这个操作');
    },
    context(text) {
      const now = new Date(), today = atDay(dateKey(now));
      let from = today, to = addDays(today,14);
      if (/明天/.test(text)) { from=addDays(today,1); to=addDays(today,2); }
      else if (/今天|今日/.test(text)) to=addDays(today,1);
      else if (/下周/.test(text)) { from=addDays(monday(now),7); to=addDays(from,7); }
      else if (/本周|这周/.test(text)) { from=monday(now); to=addDays(from,7); }
      const explicit=text.match(/20\d{2}-\d{2}-\d{2}/);
      if (explicit && validDay(explicit[0])) { from=atDay(explicit[0]); to=addDays(from,1); }
      const rows=occurrences(from,new Date(to.getTime()-1));
      const context=rows.slice(0,60).map(e=>({id:e.id,title:e.title.slice(0,100),due:e.due,start:e.start,
        occurrenceDate:e.occurrenceDate || e.due.slice(0,10),done:e.done,urgent:e.urgent === true,location:e.location?.slice(0,100),note:e.note?.slice(0,120)}));
      return {context,contextRange:`${dateKey(from)} 至 ${dateKey(new Date(to.getTime()-1))}，最多60项，截断：${rows.length>60}`};
    }
  };

  let activeOccurrence = null;

  function toggleComplete(id, date) {
    const event = state.events.find(e => e.id === id);
    if (!event) return;
    const done = event.completedDates.includes(date);
    event.completedDates = done ? event.completedDates.filter(d => d !== date) : [...new Set([...event.completedDates, date])];
    if (!save()) return;
    render(true);
    if (sheetMode === 'detail') openDetail(id, date);
    toast(done ? '已恢复为未完成' : event.repeat ? '本次已完成，下次照常' : '已完成');
  }

  function requestDelete(id, date) {
    const event = state.events.find(e => e.id === id);
    if (!event) return;
    activeOccurrence = { id, date };
    if (!event.repeat) {
      showSheet(`${sheetHeader('删除这一项？', '')}
        <div class="sheet-body"><p class="helper-note">删除后可以从之前导出的备份恢复。</p>
        <h2 class="detail-title" style="margin-top:var(--s3)">${escape(event.title)}</h2></div>
        <div class="sheet-footer vertical-footer">
          <button class="danger-button" data-action="delete-series">删除</button>
          <button class="text-button" data-action="close-sheet">取消</button>
        </div>`, 'delete');
      return;
    }
    showSheet(`${sheetHeader('删除重复日程', '')}
      <div class="sheet-body"><p class="helper-note">这是一项重复安排，请选择删除范围。</p>
      <h2 class="detail-title" style="margin-top:var(--s3)">${escape(event.title)}</h2></div>
      <div class="sheet-footer vertical-footer">
        <button class="danger-button" data-action="delete-one">仅删除这一次</button>
        <button class="secondary-button" data-action="delete-series">删除整个系列</button>
        <button class="text-button" data-action="close-sheet">取消</button>
      </div>`, 'delete');
  }

  function performDelete(all) {
    if (!activeOccurrence) return;
    const { id, date } = activeOccurrence;
    const event = state.events.find(e => e.id === id);
    if (!event) return;
    if (event.repeat && !all) event.skippedDates = [...new Set([...event.skippedDates, date])];
    else state.events = state.events.filter(e => e.id !== id);
    if (!save()) return;
    closeSheet();
    render(true);
    toast(all || !event.repeat ? '已删除' : '已删除这一次');
  }

  /* -------------------------------------------------------- 编辑范围选择 */
  function openEdit(id, date) {
    const item = state.events.find(e => e.id === id);
    if (!item) return;
    if (!item.repeat) return openEditor(item, null, date);
    editBaseDate = date;
    showSheet(`${sheetHeader('修改重复日程', '')}
      <div class="sheet-body"><p class="helper-note">这项安排会重复发生，请选择修改范围。</p>
      <h2 class="detail-title" style="margin-top:var(--s3)">${escape(item.title)}</h2></div>
      <div class="sheet-footer vertical-footer">
        <button class="primary-button" data-action="edit-scope" data-scope="this" data-id="${escape(id)}">仅修改这一次</button>
        <button class="secondary-button" data-action="edit-scope" data-scope="future" data-id="${escape(id)}">本次及以后</button>
        <button class="secondary-button" data-action="edit-scope" data-scope="all" data-id="${escape(id)}">整个系列</button>
        <button class="text-button" data-action="close-sheet">取消</button>
      </div>`, 'edit-scope');
  }

  function openEditor(item, scope, date) {
    editingId = item.id;
    editScopeTarget = scope || 'all';
    editBaseDate = scope && scope !== 'all' ? date : null;
    draftManual = false;
    // 修改「这一次」或「本次及以后」时，表单从被点开的那一天的日期起算
    const moment = editBaseDate;
    drafts = [{
      title: item.title,
      allDay: item.allDay,
      due: moment ? `${moment}T${hhmm(item.due)}` : item.due,
      start: item.start ? (moment ? `${moment}T${hhmm(item.start)}` : item.start) : '',
      hasStart: !!item.start,
      location: item.location || '',
      note: item.note || '',
      repeat: item.repeat ? { ...item.repeat, until: item.until } : null,
      color: item.color,
      source: item.source || '',
      warnings: [],
      showOnHome: shownOnHome(item),
      showInTasks: shownInTasks(item),
      urgent: item.urgent === true,
      occurrenceDate: moment || item.occurrenceDate
    }];
    renderDrafts();
  }

  /* ------------------------------------------------------------ 重复说明 */
  function showRepeatHelp() {
    showSheet(`${sheetHeader('重复规则', '')}
      <div class="sheet-body">
        <p class="helper-note">添加或编辑日程时，打开「重复」开关即可设置：</p>
        <div class="detail-grid" style="margin-top:var(--s3)">
          <div class="detail-item">${icon('repeat')}<div><span>每天</span><strong>可设置每 1–12 天，并可指定结束日期</strong></div></div>
          <div class="detail-item">${icon('repeat')}<div><span>每周</span><strong>任选一周中的多天，例如每周一、三、五</strong></div></div>
          <div class="detail-item">${icon('repeat')}<div><span>每月</span><strong>同一日期、每月第几个星期几，或每月最后一天</strong></div></div>
          <div class="detail-item">${icon('repeat')}<div><span>每年</span><strong>同一月日，适合纪念日与年检</strong></div></div>
        </div>
        <p class="helper-note">修改重复日程时可以选择仅修改这一次、本次及以后，或整个系列。删除时同样可以选择范围。</p>
      </div>
      <div class="sheet-footer"><button class="primary-button" data-action="close-sheet">知道了</button></div>`, 'info');
  }

  /* -------------------------------------------------------------- AI 接口 */
  function apiConfig() {
    try { return JSON.parse(call('getConfig')); }
    catch { return { region: 'cn', baseUrl: 'https://api.minimax.cn/v1', model: '', hasKey: false, tested: false }; }
  }

  function showApiConfig() {
    const config = apiConfig();
    showSheet(`${sheetHeader('AI 识别接口', '')}
      <form id="apiForm" novalidate>
        <div class="sheet-body">
          <label class="field-label" for="api-region">API 服务</label>
          <select id="api-region" name="region" class="select-input">
            <option value="cn" ${config.region === 'cn' ? 'selected' : ''}>MiniMax · 国内</option>
            <option value="io" ${config.region === 'io' ? 'selected' : ''}>MiniMax · 国际</option>
            <option value="custom" ${config.region === 'custom' ? 'selected' : ''}>自定义 · OpenAI 兼容</option>
          </select>

          <label class="field-label" for="api-base-url">API 地址</label>
          <input id="api-base-url" name="baseUrl" class="text-input" type="url" value="${escape(config.baseUrl || 'https://api.minimax.cn/v1')}"
            placeholder="https://你的服务地址/v1" autocomplete="off" autocapitalize="none" spellcheck="false">

          <label class="field-label" for="api-key">
            <span>API Key</span>${config.hasKey ? '' : '<span class="required-mark">*</span>'}
          </label>
          <input id="api-key" name="key" class="text-input" type="password"
            placeholder="${config.hasKey ? '留空保留已有 Key' : '在手机上粘贴 API Key'}" autocomplete="off" autocapitalize="none" spellcheck="false">

          <div class="field-label" style="margin-bottom:var(--s2)">
            <span>选择模型 <span class="required-mark">*</span></span>
            <button type="button" class="text-button" data-action="fetch-models">获取模型</button>
          </div>
          <select id="api-model" name="model" class="select-input" ${config.model ? '' : 'disabled'}>
            <option value="">${config.model ? '请选择模型' : '先填 Key，再点「获取模型」'}</option>
            ${config.model ? `<option value="${escape(config.model)}" selected>${escape(config.model)}（已保存）</option>` : ''}
          </select>
          <p id="apiModelsNote" class="config-status" role="status"></p>

          ${config.hasKey ? `<label class="switch-row" style="padding-left:0;padding-right:0;margin-top:var(--s4);border-bottom:0">
            <span class="switch-copy"><strong>删除已保存的 Key</strong></span>
            <input class="switch-control" type="checkbox" name="removeKey">
          </label>` : ''}
          <p class="form-error" id="apiError" role="alert" hidden></p>
          <div id="apiTestResult" class="form-error" role="status" hidden></div>
        </div>
        <div class="sheet-footer">
          <button type="button" class="secondary-button" data-action="test-api">测试连接</button>
          <button type="submit" class="primary-button">保存</button>
        </div>
      </form>`, 'api-config');
  }

  function apiFormData() {
    const form = document.getElementById('apiForm');
    if (!form) return null;
    const data = new FormData(form);
    return {
      region: String(data.get('region')),
      baseUrl: String(data.get('baseUrl') || '').trim(),
      model: String(data.get('model') || ''),
      key: String(data.get('key') || '').trim(),
      removeKey: data.has('removeKey')
    };
  }

  function invalidateModelList() {
    const model = document.getElementById('api-model');
    if (!model) return;
    model.innerHTML = '<option value="">配置已更改，请重新获取模型</option>';
    model.disabled = true;
    const note = document.getElementById('apiModelsNote');
    if (note) note.textContent = '点「获取模型」读取当前服务的模型列表。';
    const result = document.getElementById('apiTestResult');
    if (result) result.hidden = true;
  }

  function fetchModels(button) {
    const form = document.getElementById('apiForm');
    const data = apiFormData();
    if (!data) return;
    const error = document.getElementById('apiError');
    error.hidden = true;
    if (data.removeKey || (!data.key && !apiConfig().hasKey)) {
      error.innerHTML = `${icon('alert')}<span>请先填写 API Key，并取消「删除已保存的 Key」。</span>`;
      error.hidden = false;
      return;
    }
    const fingerprint = JSON.stringify(data);
    const previous = data.model;
    button.disabled = true;
    button.textContent = '正在获取…';
    nativeRequest(id => call('listModels', id, JSON.stringify(data)), result => {
      if (document.getElementById('apiForm') !== form) return;
      button.disabled = false;
      button.textContent = '获取模型';
      if (!result.ok) {
        error.innerHTML = `${icon('alert')}<span>${escape(result.error)}</span>`;
        error.hidden = false;
        return;
      }
      if (fingerprint !== JSON.stringify(apiFormData())) {
        document.getElementById('apiModelsNote').textContent = '配置已更改，请重新获取模型。';
        return;
      }
      const models = result.data.models || [];
      const select = document.getElementById('api-model');
      select.innerHTML = '<option value="">请选择模型</option>' + models.map(m => `<option value="${escape(m)}">${escape(m)}</option>`).join('');
      select.disabled = false;
      select.value = models.includes(previous) ? previous : models.length === 1 ? models[0] : '';
      document.getElementById('apiModelsNote').textContent = `获取到 ${models.length} 个模型，请选择支持对话（识别图片还需要视觉）的模型。`;
    });
  }

  function saveApiConfig(close) {
    const data = apiFormData();
    if (!data) return false;
    const config = apiConfig();
    let error = !data.model && !data.removeKey ? '请先获取并选择模型。'
      : !data.key && !config.hasKey && !data.removeKey ? '请填写 API Key。' : '';
    if (!error) {
      try {
        const result = JSON.parse(call('saveConfig', JSON.stringify(data)));
        if (!result.ok) error = result.error || '配置保存失败';
      } catch (e) { error = e.message; }
    }
    const el = document.getElementById('apiError');
    if (error) {
      if (el) { el.innerHTML = `${icon('alert')}<span>${escape(error)}</span>`; el.hidden = false; }
      else toast(error);
      return false;
    }
    if (close) { closeSheet(); render(); toast('AI 配置已保存'); }
    return true;
  }

  /* -------------------------------------------------------- 识别结果处理 */
  function draftsFromModel(items, source) {
    if (!Array.isArray(items)) throw new Error('识别结果缺少日程列表');
    return items.slice(0, 30).map((item, index) => {
      const warnings = [];
      let due = typeof item.due === 'string' ? item.due.trim() : '';
      const start = typeof item.start === 'string' && validISO(item.start.trim()) ? item.start.trim() : '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(due)) {
        due = `${due}T23:59`;
        warnings.push('原文没有给出钟点，已补为当天 23:59，请确认。');
      }
      if (!validISO(due)) {
        due = '';
        warnings.push('截止时间无法确定，请补齐后再保存。');
      }
      if (item.assumedTime && due) warnings.push('原文没有给出钟点，时间按默认补全。');
      if (typeof item.warning === 'string' && item.warning.trim()) warnings.push(item.warning.trim().slice(0, 250));
      const title = typeof item.title === 'string' ? item.title.trim().slice(0, 100) : '';
      if (!title) warnings.push('名称未明确，请补充。');

      // 模型给出的重复描述归一化成结构化规则
      let repeat = null;
      if (item.repeat === true || (item.repeatFreq && item.repeatFreq !== 'none') || (item.repeat && item.repeat !== 'none')) {
        const freq = ['daily', 'weekly', 'monthly', 'yearly'].includes(item.repeatFreq) ? item.repeatFreq
          : ['daily', 'weekly', 'monthly', 'yearly'].includes(item.repeat) ? item.repeat : 'weekly';
        const base = validISO(due) ? new Date(due) : NOW;
        repeat = {
          freq,
          interval: clamp(Number(item.repeatInterval) || 1, 1, 99),
          weekdays: Array.isArray(item.repeatWeekdays) && item.repeatWeekdays.length
            ? item.repeatWeekdays.map(Number).filter(d => d >= 0 && d <= 6)
            : freq === 'weekly' ? [base.getDay()] : [],
          monthlyMode: 'date',
          nth: 1,
          weekday: base.getDay(),
          until: validDay(item.until) ? item.until : null
        };
      }

      return {
        title,
        allDay: item.allDay === true,
        due,
        start,
        hasStart: !!start,
        location: typeof item.location === 'string' ? item.location.trim().slice(0, 200) : '',
        note: typeof item.note === 'string' ? item.note.trim().slice(0, 500) : '',
        repeat,
        color: (state.events.length + index) % COLORS.length,
        source: String(source || '').slice(0, 20000),
        showOnHome: true,
        showInTasks: false,
        urgent: item.urgent === true || item.priority === 'urgent',
        warnings
      };
    });
  }

  /* ---------------------------------------------------------- 原生请求层 */
  const nativeRequests = new Map();
  function nativeRequest(start, handler) {
    const id = uid();
    nativeRequests.set(id, handler);
    busy(true);
    const wrapped = result => {
      // Download progress shares the request id but must not finish the request.
      if (result?.ok && result.data?.progress) { handler(result); return; }
      busy(false);
      handler(result);
    };
    nativeRequests.set(id, wrapped);
    try { start(id); } catch (error) {
      nativeRequests.delete(id);
      busy(false);
      handler({ id, ok: false, error: error.message || '操作未完成，请重试' });
    }
  }

  /* ------------------------------------------------------------ 背景设置 */
  function pickBackground() {
    nativeRequest(id => call('pickBackground', id), result => {
      if (!result.ok) { toast(result.error); return; }
      if (result.data.cancelled) return;
      // The native side stores the image and serves it at /youqi/background;
      // the version query busts the WebView cache after a replacement.
      backgroundUrl = `${BACKGROUND_PATH}?v=${Number(result.data.version) || Date.now()}`;
      saveSettings({ hasBackground: true, bgName: result.data.name || '自定义图片' });
      render();
      toast('背景已更新');
    });
  }

  function loadSample() {
    showSheet(`${sheetHeader('添加示例日程', '')}
      <div class="sheet-body"><p class="helper-note">添加一周示例课程和截止任务，用来体验配色与排布。它们会标注为示例，随时可以删除。</p></div>
      <div class="sheet-footer">
        <button class="secondary-button" data-action="close-sheet">取消</button>
        <button class="primary-button" data-action="confirm-sample">添加</button>
      </div>`, 'info');
  }

  /* --------------------------------------------------------------- 事件 */
  function handleAction(action, target) {
    switch (action) {
      case 'open-add': openAdd(); break;
      case 'reload': try { reload(); } catch (e) { toast(e.message); } render(); break;
      case 'close-sheet': closeSheet(); break;
      case 'open-picker': openPicker(target); break;
      case 'close-picker': closePicker(); break;
      case 'picker-prev': if (activePicker) { activePicker.month--; if (activePicker.month < 0) { activePicker.month = 11; activePicker.year--; } activePicker.day = Math.min(activePicker.day, new Date(activePicker.year, activePicker.month + 1, 0).getDate()); activePicker.value = pickerValue(new Date(activePicker.year, activePicker.month, activePicker.day), activePicker.hour, activePicker.minute, activePicker.kind); renderPicker(); } break;
      case 'picker-next': if (activePicker) { activePicker.month++; if (activePicker.month > 11) { activePicker.month = 0; activePicker.year++; } activePicker.day = Math.min(activePicker.day, new Date(activePicker.year, activePicker.month + 1, 0).getDate()); activePicker.value = pickerValue(new Date(activePicker.year, activePicker.month, activePicker.day), activePicker.hour, activePicker.minute, activePicker.kind); renderPicker(); } break;
      case 'picker-day': if (activePicker) { activePicker.day = Number(target.dataset.day); activePicker.value = pickerValue(new Date(activePicker.year, activePicker.month, activePicker.day), activePicker.hour, activePicker.minute, activePicker.kind); renderPicker(); } break;
      case 'confirm-picker': commitPicker(); break;
      case 'today': calendarFraction = 0; state.week = dateKey(monday(NOW)); state.selected = dateKey(NOW); render(); break;
      case 'prev-week': changeWeek(-1); break;
      case 'next-week': changeWeek(1); break;
      case 'select-day': {
        state.selected = target.dataset.date;
        render(true);
        break;
      }
      case 'jump-date': showJumpDate(); break;
      case 'jump-to': {
        const value = document.getElementById('jumpInput')?.value;
        if (!validDay(value)) { toast('请选择有效日期'); break; }
        calendarFraction = 0;
        state.week = dateKey(monday(atDay(value)));
        state.selected = value;
        closeSheet();
        render();
        break;
      }
      case 'detail': openDetail(target.dataset.id, target.dataset.date); break;
      case 'complete': toggleComplete(target.dataset.id, target.dataset.date); break;
      case 'filter': state.filter = target.dataset.filter; render(); break;

      case 'choose-voice': editingId = null; openAi('voice'); break;
      case 'speech-start': startSpeechRecording(); break;
      case 'speech-stop': stopSpeechRecording(); break;
      case 'speech-import': importSpeechAudio(); break;
      case 'speech-transcribe': transcribeSpeech(); break;
      case 'speech-config': showSpeechConfig(); break;
      case 'speech-models': fetchSpeechModels(target); break;
      case 'speech-cancel': cleanupSpeech(); renderSpeech(); break;
      case 'speech-clear': cleanupSpeech(); call('discardAudio'); voice.audio = null; voice.error = ''; renderSpeech(); break;
      case 'choose-manual': openManual(); break;
      case 'choose-ai': openAi('text', { resetImage: true }); break;
      case 'ai-tab': openAi(target.dataset.input); break;
      case 'example': {
        noticeText = EXAMPLES[Number(target.dataset.example)] || '';
        const input = document.getElementById('noticeInput');
        if (input) { input.value = noticeText; input.focus(); }
        break;
      }
      case 'paste-clipboard': {
        try {
          const text = call('readClipboard');
          const input = document.getElementById('noticeInput');
          if (text && input) { input.value = text; noticeText = text; toast('已粘贴'); }
          else toast('剪贴板里没有文字');
        } catch (error) { toast(error.message); }
        break;
      }
      case 'pick-image': {
        nativeRequest(id => call('pickImage', id), result => {
          if (!result.ok) { toast(result.error); return; }
          if (result.data.cancelled) return;
          pendingImage = result.data;
          openAi('image');
        });
        break;
      }
      case 'clear-image': pendingImage = null; openAi('image'); break;
      case 'analyze': runAnalyze(target); break;
      case 'back-to-ai': openAi(activeInput); break;
      case 'remove-draft': {
        const index = Number(target.dataset.index);
        const form = document.getElementById('draftForm');
        // collectDrafts() writes the current form values back onto `drafts`
        if (form) collectDrafts(form);
        drafts = drafts.filter((_, i) => i !== index);
        if (!drafts.length) { openAdd(); break; }
        renderDrafts({ manual: draftManual });
        break;
      }
      case 'edit-event': openEdit(target.dataset.id, target.dataset.date); break;
      case 'edit-scope': {
        const item = state.events.find(e => e.id === target.dataset.id);
        if (!item) break;
        openEditor(item, target.dataset.scope, editBaseDate);
        break;
      }
      case 'request-delete': requestDelete(target.dataset.id, target.dataset.date); break;
      case 'delete-one': performDelete(false); break;
      case 'delete-series': performDelete(true); break;

      case 'set-theme': saveSettings({ theme: target.dataset.theme }); render(); break;
      case 'pick-background': pickBackground(); break;
      case 'clear-background':
        backgroundUrl = '';
        saveSettings({ hasBackground: false, bgName: '' });
        render();
        toast('已移除背景图片');
        break;
      case 'repeat-help': showRepeatHelp(); break;
      case 'api-info': showApiConfig(); break;
      case 'storage-info': showStorageInfo(); break;
      case 'check-update': checkUpdate(); break;
      case 'download-update': downloadUpdate(target); break;
      case 'about': showAbout(); break;
      case 'toggle-license': {
        const panel = document.getElementById('licenseDisclosure');
        const toggle = document.getElementById('licenseToggle');
        if (panel && toggle) {
          const open = panel.dataset.open !== 'true';
          panel.dataset.open = String(open);
          toggle.setAttribute('aria-expanded', String(open));
        }
        break;
      }
      case 'load-sample': loadSample(); break;
      case 'confirm-sample': confirmSample(); break;
      case 'import-ics': importIcs(); break;
      case 'export-backup': exportBackup(); break;
      case 'import-backup': importBackup(); break;
      case 'restore-native': restoreNative(target); break;
      case 'fetch-models': fetchModels(target); break;
      case 'test-api': testApi(target); break;
      default: break;
    }
  }

  document.addEventListener('click', event => {
    if (event.target.classList?.contains('picker-backdrop')) { closePicker(); return; }
    const target = event.target.closest('[data-action], [data-tab]');
    if (!target) { if (event.target === overlay) closeSheet(); return; }
    if (target.dataset.tab && !target.dataset.action) { state.tab = target.dataset.tab; render(); return; }
    if (target.dataset.action) handleAction(target.dataset.action, target);
  });

  document.addEventListener('submit', event => {
    if (event.target.id === 'draftForm') {
      event.preventDefault();
      const events = collectDrafts(event.target);
      if (events) commitDrafts(events);
      return;
    }
    if (event.target.id === 'speechApiForm') { event.preventDefault(); saveSpeechConfig(); return; }
    if (event.target.id === 'apiForm') { event.preventDefault(); saveApiConfig(true); }
  });

  document.addEventListener('input', event => {
    if (sheetMode === 'voice-input' && event.target.id === 'noticeInput') {
      voice.text = event.target.value;
      const button = sheet.querySelector('[data-action="analyze"]');
      if (button) button.disabled = !voice.text.trim() || !apiConfig().hasKey || !apiConfig().model || voice.phase !== 'idle';
    }
    const slider = event.target.dataset.slider;
    if (slider) {
      const value = Number(event.target.value);
      const next = slider === 'bgBlur' ? { bgBlur: value }
        : slider === 'bgOpacity' ? { bgOpacity: value / 100 }
          : { bgScrim: value / 100 };
      saveSettings(next);
      const head = event.target.closest('.setting-slider')?.querySelector('.setting-value');
      if (head) head.textContent = slider === 'bgBlur' ? `${value}px` : `${value}%`;
      return;
    }
    if (event.target.id === 'api-base-url') {
      const region = document.getElementById('api-region');
      if (region) region.value = 'custom';
      invalidateModelList();
    }
    if (event.target.id === 'api-key') invalidateModelList();
  });

  document.addEventListener('change', event => {
    const target = event.target;
    if ((target.id === 'speech-key' || target.id === 'speech-endpoint') && document.getElementById('speech-endpoint')?.value && (document.getElementById('speech-key')?.value || speechConfig().hasKey)) {
      const button = sheet.querySelector('[data-action="speech-models"]'); if (button && !button.disabled) fetchSpeechModels(button);
      return;
    }
    if (target.id === 'api-region') {
      const url = document.getElementById('api-base-url');
      if (url && target.value !== 'custom') {
        url.value = target.value === 'io' ? 'https://api.minimax.io/v1' : 'https://api.minimax.cn/v1';
      }
      invalidateModelList();
      return;
    }
    if (target.id === 'api-key') {
      if (target.value.trim()) {
        const button = document.querySelector('[data-action="fetch-models"]');
        if (button && !button.disabled) fetchModels(button);
      }
      return;
    }
    // Toggling 全天 / 重复 or changing a repeat field re-renders so the dependent controls
    // appear. collectDrafts() writes the current values back onto `drafts` first, so nothing
    // the user already typed is lost. Its return value is ignored on purpose: the form is
    // still incomplete at this point, and a missing name must not block the repeat controls.
    const toggle = target.dataset.toggle;
    if (toggle === 'allday' || toggle === 'repeat' || target.dataset.field) {
      const form = document.getElementById('draftForm');
      if (!form) return;
      collectDrafts(form);
      renderDrafts({ manual: draftManual });
    }
  });

  // 滑块实时预览背景
  document.addEventListener('input', event => {
    if (!event.target.dataset.slider) return;
    const preview = document.querySelector('.bg-preview');
    if (!preview) return;
    const image = preview.querySelector('.bg-preview-image');
    const scrim = preview.querySelector('.bg-preview-scrim');
    if (image) {
      image.style.opacity = settings.bgOpacity;
      image.style.filter = `blur(${settings.bgBlur}px)`;
    }
    if (scrim) scrim.style.opacity = settings.bgScrim;
  });

  document.addEventListener('keydown', event => {
    if (overlay.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); closeSheet(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...sheet.querySelectorAll('button, input, textarea, select')]
      .filter(el => !el.disabled && !el.closest('[hidden]'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  /* ------------------------------------------------------------ 跳转日期 */
  function showJumpDate() {
    showSheet(`${sheetHeader('跳转到日期', '')}
      <div class="sheet-body">
        <label class="field-label" for="jumpInput">选择日期</label>
        ${pickerField('jumpInput', state.selected, 'date', true)}
        <p class="helper-note">跳转后，时间表会显示该日期所在的那一周。</p>
      </div>
      <div class="sheet-footer">
        <button class="secondary-button" data-action="close-sheet">取消</button>
        <button class="primary-button" data-action="jump-to">跳转</button>
      </div>`, 'jump');
  }

  /* ---------------------------------------------------------------- 识别 */
  function runAnalyze(button) {
    const config = apiConfig();
    if (!config.hasKey || !config.model) { showApiConfig(); toast('先配置 AI 接口'); return; }

    const dateInput = document.getElementById('messageDate');
    messageDate = dateInput?.value || messageDate;
    if (!validDay(messageDate)) { toast('请选择原文对应的日期'); return; }

    const isImage = activeInput === 'image';
    if (isImage && !pendingImage) { toast('请先选择一张图片'); return; }
    if (!isImage) {
      const input = document.getElementById('noticeInput');
      noticeText = input?.value.trim() || '';
      if (!noticeText) { toast('先粘贴一段通知文字'); return; }
      if (noticeText.length > 20000) { toast('文字超过 2 万字，请分段识别'); return; }
    }

    const requestedText = noticeText;
    const requestedImage = pendingImage?.token;
    const wasVoice = activeInput === 'voice';
    const voiceGeneration = voice.generation;
    if (wasVoice) { voice.phase = 'extracting'; renderSpeech(); button = sheet.querySelector('[data-action="analyze"]'); }
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> 正在识别…`;

    const finish = () => {
      if (wasVoice && voice.generation === voiceGeneration) { voice.phase = 'idle'; if (sheetMode === 'voice-input') renderSpeech(); }
      const current = sheet.querySelector('[data-action="analyze"]');
      if (current) { current.disabled = false; current.innerHTML = `${icon('spark')} ${activeInput === 'voice' ? '提取日程' : '开始识别'}`; }
    };

    const handler = result => {
      finish();
      if (!result.ok) { toast(result.error); return; }
      try {
        const parsed = draftsFromModel(result.data.events, isImage ? `图片识别 · ${messageDate}` : requestedText);
        if (!parsed.length) { toast('没有识别出明确的日程，可以换一张更清晰的图片或手动添加'); return; }
        if (!isImage && document.getElementById('noticeInput')?.value.trim() !== requestedText) {
          pendingParsed = parsed;
          toast('识别已完成，点 ＋ 查看结果');
          return;
        }
        drafts = parsed;
        renderDrafts();
      } catch (error) { toast(error.message); }
    };

    nativeRequest(id => {
      if (isImage) call('analyzeImage', id, requestedImage, messageDate);
      else call('analyze', id, requestedText, messageDate);
    }, handler);
  }

  /* ------------------------------------------------------------ 备份导入 */
  function exportBackup() {
    nativeRequest(id => call('exportBackup', id), result => {
      if (!result.ok) { toast(result.error); return; }
      if (!result.data.cancelled) toast('备份已保存（不含 API Key）');
    });
  }

  function importBackup() {
    nativeRequest(id => call('importBackup', id), result => {
      if (!result.ok) { toast(result.error); return; }
      if (result.data.cancelled) return;
      const token = result.data.restoreToken;
      showSheet(`${sheetHeader('恢复这份备份？', '')}
        <div class="sheet-body"><p class="helper-note">包含 ${result.data.count} 项日程，将替换手机中的日程与完成记录。API 配置和外观设置会保留。</p></div>
        <div class="sheet-footer vertical-footer">
          <button class="primary-button" data-action="restore-native" data-token="${escape(token)}">确认恢复</button>
          <button class="text-button" data-action="close-sheet">取消</button>
        </div>`, 'restore');
    });
  }

  function restoreNative(target) {
    target.disabled = true;
    nativeRequest(id => call('confirmRestore', id, target.dataset.token), result => {
      if (!result.ok) { target.disabled = false; toast(result.error); return; }
      try { reload(); } catch (_) { }
      closeSheet();
      render();
      toast('日程已恢复');
    });
  }

  function importIcs() {
    nativeRequest(id => call('importIcs', id), result => {
      if (!result.ok) { toast(result.error); return; }
      if (result.data.cancelled) return;
      try { reload(); } catch (_) { }
      render();
      const data = result.data;
      const text = data.status === 'IMPORT_FAIL' ? '文件未能完整解析，请确认是 ThuInfo 导出的 .ics 文件。'
        : data.status === 'IMPORT_NOTHING_NEW' ? '文件里的日程已经存在，没有重复添加。'
          : data.status === 'IMPORT_PARTIAL' ? '部分条目未能导入，请检查日程表。'
            : '课程、地点与重复规则已写入日程。';
      showSheet(`${sheetHeader('课表导入结果', '')}
        <div class="sheet-body">
          <h2 class="detail-title">${data.added ? `新增 ${data.added} 项` : '已处理课表文件'}</h2>
          <p class="helper-note">${text}</p>
        </div>
        <div class="sheet-footer"><button class="primary-button" data-action="close-sheet">查看日程</button></div>`, 'info');
    });
  }

  function confirmSample() {
    const offset = Math.round((monday(NOW) - new Date(2026, 9, 12)) / DAY);
    const samples = [
      ['电影与政治', '16:05', '13:30', 4, '三教 2101'],
      ['能源利用中的物理化学', '12:15', '09:50', 3, '法律图书馆 B104'],
      ['概率论与数理统计', '16:05', '13:30', 0, '六教 6C101'],
      ['复变函数引论', '09:35', '08:00', 6, '三教 2101'],
      ['体能训练', '15:05', '13:30', 8, '综合体育馆'],
      ['电工技术与电子技术', '16:55', '15:20', 11, '舜德楼 101'],
      ['大数据与人工智能', '12:15', '09:50', 1, '建华楼 A111'],
      ['偏微分方程', '11:25', '09:50', 2, '六教 6C202']
    ];
    const base = monday(NOW);
    const events = samples.map(([title, endTime, startTime, color, location], index) => {
      const day = addDays(base, [0, 1, 1, 2, 2, 2, 3, 4][index]);
      return {
        id: uid(), title, allDay: false,
        start: localISO(new Date(`${dateKey(day)}T${startTime}`)),
        due: localISO(new Date(`${dateKey(day)}T${endTime}`)),
        color, location,
        note: '', source: '示例日程 · 可删除',
        repeat: { freq: 'weekly', interval: 1, weekdays: [day.getDay()], monthlyMode: 'date', nth: 1, weekday: day.getDay() },
        until: null,
        completedDates: [], skippedDates: []
      };
    });
    const deadline = {
      id: uid(), title: '实验报告', allDay: false,
      start: null, due: localISO(addDays(base, 4)), color: 9, location: '',
      note: '示例截止事项', source: '示例日程 · 可删除',
      repeat: null, until: null, completedDates: [], skippedDates: []
    };
    state.events = [...state.events, ...events, deadline];
    if (!save()) return;
    closeSheet();
    render();
    toast('已添加示例日程');
  }

  function showStorageInfo() {
    showSheet(`${sheetHeader('本机保存', '')}
      <div class="sheet-body">
      </div>
      <div class="sheet-footer"><button class="primary-button" data-action="export-backup">导出一份备份</button></div>`, 'info');
  }

  function checkUpdate() {
    showSheet(`${sheetHeader('检查更新', '')}
      <div class="sheet-body"><div id="updateResult" class="update-result"><p class="helper-note">正在连接 GitHub 检查最新版本…</p></div></div>
      <div class="sheet-footer"><button class="primary-button" data-action="close-sheet">关闭</button></div>`, 'update');
    nativeRequest(id => call('checkForUpdate', id), result => {
      const output = document.getElementById('updateResult');
      if (!output) return;
      if (!result.ok) { output.innerHTML = `<p class="form-error">${escape(result.error)}</p>`; return; }
      const data = result.data || {};
      if (!data.available) {
        output.innerHTML = `<p class="helper-note">当前已经是最新版本 ${escape(data.current || '')}。</p>`;
        return;
      }
      output.innerHTML = `<p><strong>发现新版本 ${escape(data.latest || '')}</strong></p><p class="helper-note">当前版本：${escape(data.current || '')}</p><button type="button" class="primary-button" data-action="download-update">下载并安装</button>`;
      output.querySelector('[data-action="download-update"]').dataset.url = data.url || '';
    });
  }

  function downloadUpdate(button) {
    const output = document.getElementById('updateResult');
    button.disabled = true;
    button.textContent = '正在下载更新…';
    nativeRequest(id => call('downloadUpdate', id, button.dataset.url || ''), result => {
      if (result.ok && result.data?.progress) {
        const downloaded = Number(result.data.downloaded) || 0;
        const total = Number(result.data.total) || 0;
        const percent = total > 0 ? Math.min(100, Math.round(downloaded * 100 / total)) : 0;
        const formatSize = value => `${(value / 1048576).toFixed(1)} MB`;
        button.textContent = total > 0
          ? `正在下载 ${percent}%（${formatSize(downloaded)} / ${formatSize(total)}）`
          : `正在下载（${formatSize(downloaded)}）`;
        return;
      }
      if (!result.ok) {
        button.disabled = false;
        button.textContent = '重试下载并安装';
        if (output) output.insertAdjacentHTML('beforeend', `<p class="form-error">${escape(result.error)}</p>`);
        return;
      }
      if (result.data?.permissionRequired) {
        button.disabled = false;
        button.textContent = '返回后再次安装';
        if (output) output.insertAdjacentHTML('beforeend', '<p class="helper-note">请允许云朵安装未知来源应用，返回后再次点击安装。</p>');
      } else {
        button.textContent = '安装程序已打开';
        if (output) output.insertAdjacentHTML('beforeend', '<p class="helper-note">系统安装页面已打开，请确认安装。</p>');
      }
    });
  }

  function showAbout() {
    let license = '';
    try { license = call('license'); } catch (_) { }
    showSheet(`${sheetHeader('关于云朵', '')}
      <div class="sheet-body">
        <div class="license-disclosure" id="licenseDisclosure" data-open="false">
          <button type="button" class="text-button license-toggle" id="licenseToggle" data-action="toggle-license" aria-expanded="false" aria-controls="licenseBody"><span class="license-chevron" aria-hidden="true"></span><span>查看 GPL-3.0 许可证</span></button>
          <div class="license-clip" id="licenseBody"><pre class="license-body">${escape(license.slice(0, 20000))}</pre></div>
        </div>
      </div>
      <div class="sheet-footer"><button class="primary-button" data-action="close-sheet">完成</button></div>`, 'info');
  }

  function testApi(button) {
    if (!saveApiConfig(false)) return;
    button.disabled = true;
    button.textContent = '正在测试…';
    nativeRequest(id => call('testConnection', id), result => {
      button.disabled = false;
      button.textContent = '测试连接';
      const output = document.getElementById('apiTestResult');
      if (!output) { toast(result.ok ? '连接成功' : result.error); return; }
      output.hidden = false;
      output.className = result.ok ? 'form-error' : 'form-error';
      output.style.background = result.ok ? 'var(--ok-soft)' : 'var(--danger-soft)';
      output.style.color = result.ok ? 'var(--ok)' : 'var(--danger)';
      output.innerHTML = `${icon(result.ok ? 'checkCircle' : 'alert')}<span>${escape(result.ok ? (result.data.message || '连接成功，模型可以调用') : result.error)}</span>`;
    });
  }

  /* -------------------------------------------------原生回调与对外接口 */
  window.YouqiNativeResult = result => {
    if (window.YunduoCat?.onAudioResult(result)) return;
    if (result.id === 'speech-stopped' || result.id === 'speech-interrupted') {
      voice.generation++;
      voice.phase = 'idle'; clearInterval(voice.timer);
      if (result.ok) { voice.audio = result.data; voice.error = ''; } else voice.error = result.error;
      if (sheetMode === 'voice-input') renderSpeech();
      return;
    }
    if (result.id === 'shared') {
      noticeText = result.data?.text || '';
      openAi('text', { resetImage: true });
      return;
    }
    if (result.id === 'incoming') {
      try { reload(); } catch (_) { }
      render();
      toast(result.ok ? '课表文件已处理' : result.error);
      return;
    }
    const handler = nativeRequests.get(result.id);
    if (handler) { nativeRequests.delete(result.id); handler(result); }
  };

  window.YouqiApp = {
    refreshData() { try { reload(); } catch (_) { } render(true); },
    handleBack() {
      if (!overlay.hidden) { closeSheet(); return true; }
      if (window.YunduoCat?.handleBack()) return true;
      if (state.tab !== 'home') { state.tab = 'home'; render(); return true; }
      return false;
    },
    refreshClock() {
      NOW = new Date();
      updateClock();
    }
  };

  /* ---------------------------------------------------------- 时钟与启动 */
  function updateClock() {
    if (!overlay.hidden) return;
    const stamp = localISO(NOW);
    if (stamp !== homeTick && state.tab === 'home') { homeTick = stamp; render(true); return; }
    let rerender = false;
    app.querySelectorAll('[data-countdown]').forEach(element => {
      const target = element.dataset.countdown;
      const clock = countdownText(target);
      if (element.textContent !== clock.value) element.textContent = clock.value;
      if (new Date(target) <= NOW) rerender = true;
    });
    if (rerender) render(true);
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings.theme === 'auto') { applyAppearance(); render(true); }
  });

  loadInitial();
  applyAppearance();
  homeTick = localISO(NOW);
  render();
  setInterval(() => {
    if (document.hidden) return;
    NOW = new Date();
    if (state.tab === 'home') updateClock();
  }, 1000);

  if (startupError) toast(`读取日程失败：${startupError}`);
})();
