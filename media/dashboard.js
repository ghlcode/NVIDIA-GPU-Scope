(() => {
  const vscode = acquireVsCodeApi();
  const content = document.getElementById('content');
  const errorBox = document.getElementById('error');
  const persistedState = vscode.getState() || {};
  let pinnedGpuUuid = typeof persistedState.pinnedGpuUuid === 'string'
    ? persistedState.pinnedGpuUuid
    : undefined;
  let state = { gpus: [], histories: {}, error: undefined };

  function fmtGiB(mib) {
    return Number.isFinite(mib) ? (mib / 1024).toFixed(1) : 'N/A';
  }

  function fmt(value, suffix) {
    return Number.isFinite(value) ? String(Math.round(value)) + (suffix || '') : 'N/A';
  }

  function clamp(n) {
    return Math.max(0, Math.min(100, Number(n) || 0));
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function card(label, value, percent) {
    const c = el('div', 'card');
    c.append(el('div', 'label', label), el('div', 'value', value));
    if (percent !== undefined) {
      const bar = el('div', 'bar');
      const fill = document.createElement('span');
      fill.style.width = clamp(percent) + '%';
      bar.append(fill);
      c.append(bar);
    }
    return c;
  }

  function temperaturePowerCard(gpu) {
    const c = el('div', 'card metric-pair');
    const temperature = el('div', 'metric-item');
    const power = el('div', 'metric-item');
    temperature.append(
      el('div', 'label', 'Temperature'),
      el('div', 'value', fmt(gpu.temperature, '°C'))
    );
    power.append(
      el('div', 'label', 'Power'),
      el('div', 'value', fmt(gpu.powerDraw, 'W') + '/' + fmt(gpu.powerLimit, 'W'))
    );
    c.append(temperature, power);
    return c;
  }

  function chart(history, index) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'chart');
    svg.setAttribute('viewBox', '0 0 300 90');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'GPU ' + index + ' utilization history');

    [22.5, 45, 67.5].forEach(y => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '0');
      line.setAttribute('x2', '300');
      line.setAttribute('y1', String(y));
      line.setAttribute('y2', String(y));
      line.setAttribute('class', 'chart-grid');
      svg.append(line);
    });

    if (!history || history.length < 2) return svg;

    const pts = history.map((s, i) => {
      const x = i * 300 / Math.max(1, history.length - 1);
      const y = 86 - clamp(s.utilization) * 0.82;
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');

    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    poly.setAttribute('points', pts);
    poly.setAttribute('class', 'chart-line');
    svg.append(poly);
    return svg;
  }

  function pinButton(gpu) {
    const pinned = pinnedGpuUuid === gpu.uuid;
    const button = el('button', 'pin-button' + (pinned ? ' pinned' : ''));
    const label = pinned ? 'Unpin GPU ' + gpu.index : 'Pin GPU ' + gpu.index + ' to top';
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(pinned));

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M5.5 1h5v1.2l-.9.9v3.1l1.7 1.7V9H8.7v5.8L8 16l-.7-1.2V9H4.7V7.9l1.7-1.7V3.1l-.9-.9V1Zm1.4 1.5.5.5v3.8L6.7 7.5h2.6l-.7-.7V3l.5-.5H6.9Z');
    svg.append(path);
    button.append(svg);

    button.addEventListener('click', () => {
      pinnedGpuUuid = pinned ? undefined : gpu.uuid;
      vscode.setState({ ...(vscode.getState() || {}), pinnedGpuUuid });
      render();
    });

    return button;
  }

  function renderGpu(gpu) {
    const pinned = pinnedGpuUuid === gpu.uuid;
    const panel = el('section', 'gpu-panel' + (pinned ? ' pinned' : ''));

    const header = el('div', 'gpu-header');
    const titleWrap = el('div', 'gpu-title-wrap');
    titleWrap.append(
      el('div', 'gpu-index', 'GPU ' + gpu.index),
      el('div', 'name', gpu.name)
    );

    const actions = el('div', 'gpu-header-actions');
    actions.append(el('div', 'gpu-live', fmt(gpu.utilization, '%')), pinButton(gpu));
    header.append(titleWrap, actions);
    panel.append(header);

    const memoryPct = gpu.memoryTotalMiB > 0
      ? gpu.memoryUsedMiB / gpu.memoryTotalMiB * 100
      : 0;

    const grid = el('div', 'grid');
    grid.append(
      card('Utilization', fmt(gpu.utilization, '%'), gpu.utilization),
      temperaturePowerCard(gpu),
      card('VRAM', fmtGiB(gpu.memoryUsedMiB) + ' / ' + fmtGiB(gpu.memoryTotalMiB) + ' GB', memoryPct)
    );
    panel.append(grid);

    const hSec = el('div', 'section');
    hSec.append(
      el('div', 'section-title', 'Utilization · recent history'),
      chart(state.histories[gpu.uuid] || [], gpu.index)
    );
    panel.append(hSec);


    return panel;
  }

  function render() {
    errorBox.hidden = !state.error;
    errorBox.textContent = state.error ? 'Refresh error: ' + state.error : '';

    if (!state.gpus.length) {
      content.replaceChildren(
        el('div', 'empty', 'No NVIDIA GPU detected. Ensure nvidia-smi is available in this workspace.')
      );
      return;
    }

    const frag = document.createDocumentFragment();
    if (state.gpus.length > 1) {
      const summary = el('div', 'multi-summary');
      summary.append(
        el('div', 'multi-title', state.gpus.length + ' GPUs detected'),
        el('div', 'multi-subtitle', 'All GPUs are shown live below')
      );
      frag.append(summary);
    }

    const orderedGpus = state.gpus
      .map((gpu, position) => ({ gpu, position }))
      .sort((left, right) => {
        const leftPinned = left.gpu.uuid === pinnedGpuUuid ? 1 : 0;
        const rightPinned = right.gpu.uuid === pinnedGpuUuid ? 1 : 0;
        return rightPinned - leftPinned || left.position - right.position;
      })
      .map(entry => entry.gpu);

    const list = el('div', 'gpu-list');
    for (const gpu of orderedGpus) list.append(renderGpu(gpu));
    frag.append(list);
    content.replaceChildren(frag);
  }

  window.addEventListener('message', event => {
    const msg = event.data;
    if (!msg || msg.type !== 'gpu-update') return;
    state = {
      gpus: Array.isArray(msg.gpus) ? msg.gpus : [],
      histories: msg.histories || {},
      error: msg.error
    };
    render();
  });
})();
