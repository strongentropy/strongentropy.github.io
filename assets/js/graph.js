/* Strong Entropy — Visitor Graph */
(function () {
  'use strict';

  // ── Node type config ──────────────────────────────────────────────────────
  const TYPES = {
    ip:      { color: '#7cfc9f', label: 'IP',      baseR: 6  },
    country: { color: '#f59e0b', label: 'Country', baseR: 10 },
    city:    { color: '#f97316', label: 'City',    baseR: 7  },
    asn:     { color: '#5b8af0', label: 'ASN',     baseR: 9  },
    org:     { color: '#8b5cf6', label: 'Org',     baseR: 9  },
    ua:      { color: '#ec4899', label: 'UA',      baseR: 8  },
    path:    { color: '#64748b', label: 'Path',    baseR: 7  },
    ref:     { color: '#06b6d4', label: 'Ref',     baseR: 7  },
  };

  // ── State ─────────────────────────────────────────────────────────────────
  let allNodes = [], allLinks = [];
  let activeTypes = new Set(Object.keys(TYPES));
  let focusedId = null;
  let simulation = null;
  let nodeSelection, linkSelection, labelSelection;
  let transform = d3.zoomIdentity;

  // ── UA parser ─────────────────────────────────────────────────────────────
  function parseUA(ua) {
    if (!ua) return 'Unknown';
    const tests = [
      [/Googlebot/i,      'Googlebot'],
      [/bingbot/i,        'Bingbot'],
      [/Slurp/i,          'Yahoo'],
      [/DuckDuckBot/i,    'DuckDuckBot'],
      [/Baiduspider/i,    'Baidu'],
      [/YandexBot/i,      'Yandex'],
      [/curl\//i,         'curl'],
      [/python-requests/i,'Python'],
      [/Go-http/i,        'Go HTTP'],
      [/Java\//i,         'Java'],
      [/okhttp/i,         'OkHttp'],
      [/Edg\//i,          'Edge'],
      [/OPR\//i,          'Opera'],
      [/Firefox\//i,      'Firefox'],
      [/Chrome\//i,       'Chrome'],
      [/Safari\//i,       'Safari'],
      [/Mobile/i,         'Mobile Browser'],
    ];
    for (const [re, name] of tests) if (re.test(ua)) return name;
    return ua.slice(0, 28);
  }

  // ── Build graph from log entries ──────────────────────────────────────────
  function buildGraph(entries) {
    const nodeMap = new Map();
    const edgeMap = new Map();

    function addNode(id, type, label, rawLabel) {
      if (!nodeMap.has(id)) nodeMap.set(id, { id, type, label, rawLabel: rawLabel || label, count: 0 });
      nodeMap.get(id).count++;
    }

    function addEdge(a, b) {
      if (!nodeMap.has(a) || !nodeMap.has(b)) return;
      const key = a < b ? `${a}|||${b}` : `${b}|||${a}`;
      if (!edgeMap.has(key)) edgeMap.set(key, { source: a, target: b, weight: 0 });
      edgeMap.get(key).weight++;
    }

    for (const e of entries) {
      if (!e.ip) continue;

      const ipId      = `ip:${e.ip}`;
      const countryId = e.country ? `country:${e.country}` : null;
      const cityId    = e.city    ? `city:${e.city}`        : null;
      const asnId     = e.asn    ? `asn:${e.asn}`           : null;
      const orgId     = e.org    ? `org:${e.org}`            : null;
      const uaLabel   = parseUA(e.ua);
      const uaId      = e.ua    ? `ua:${uaLabel}`            : null;
      const pathId    = (e.path && e.path !== '/') ? `path:${e.path}` : null;
      let refId       = null;
      if (e.ref) {
        try { refId = `ref:${new URL(e.ref).hostname}`; } catch {}
      }

      addNode(ipId, 'ip', e.ip, e.ip);
      if (countryId) addNode(countryId, 'country', e.country, e.country);
      if (cityId)    addNode(cityId,    'city',    e.city,    e.city);
      if (asnId)     addNode(asnId,     'asn',     `ASN ${e.asn}`, String(e.asn));
      if (orgId)     addNode(orgId,     'org',     e.org,     e.org);
      if (uaId)      addNode(uaId,      'ua',      uaLabel,   e.ua);
      if (pathId)    addNode(pathId,    'path',    e.path,    e.path);
      if (refId)     addNode(refId,     'ref',     refId.replace('ref:',''), refId.replace('ref:',''));

      if (countryId) addEdge(ipId, countryId);
      if (cityId)    { addEdge(ipId, cityId); if (countryId) addEdge(countryId, cityId); }
      if (asnId)     addEdge(ipId, asnId);
      if (orgId)     { addEdge(ipId, orgId); if (asnId) addEdge(asnId, orgId); }
      if (uaId)      addEdge(ipId, uaId);
      if (pathId)    addEdge(ipId, pathId);
      if (refId)     addEdge(ipId, refId);
    }

    return {
      nodes: [...nodeMap.values()],
      links: [...edgeMap.values()],
    };
  }

  // ── Radius scale ──────────────────────────────────────────────────────────
  function nodeRadius(d) {
    const base = TYPES[d.type]?.baseR ?? 6;
    return base + Math.sqrt(d.count) * 1.5;
  }

  // ── Filter nodes/links by active types ────────────────────────────────────
  function filteredGraph() {
    const nodes = allNodes.filter(n => activeTypes.has(n.type));
    const nodeIds = new Set(nodes.map(n => n.id));
    const links = allLinks.filter(l =>
      nodeIds.has(l.source.id ?? l.source) && nodeIds.has(l.target.id ?? l.target)
    );
    return { nodes, links };
  }

  // ── Focus opacity ─────────────────────────────────────────────────────────
  function applyFocus(nodeId) {
    focusedId = nodeId;
    if (!nodeId) {
      nodeSelection?.style('opacity', 1);
      linkSelection?.style('opacity', null).style('stroke', null);
      labelSelection?.style('opacity', null);
      return;
    }
    const connectedIds = new Set([nodeId]);
    allLinks.forEach(l => {
      const s = l.source.id ?? l.source;
      const t = l.target.id ?? l.target;
      if (s === nodeId) connectedIds.add(t);
      if (t === nodeId) connectedIds.add(s);
    });
    nodeSelection?.style('opacity', d => connectedIds.has(d.id) ? 1 : 0.08);
    linkSelection?.style('opacity', l => {
      const s = l.source.id ?? l.source;
      const t = l.target.id ?? l.target;
      return (s === nodeId || t === nodeId) ? 0.9 : 0.03;
    }).style('stroke', l => {
      const s = l.source.id ?? l.source;
      const t = l.target.id ?? l.target;
      if (s === nodeId || t === nodeId) {
        const other = s === nodeId ? t : s;
        const otherNode = allNodes.find(n => n.id === other);
        return otherNode ? TYPES[otherNode.type]?.color : '#2a2a3a';
      }
      return '#1a1a2a';
    });
    labelSelection?.style('opacity', d => connectedIds.has(d.id) ? 1 : 0);
  }

  // ── Search ────────────────────────────────────────────────────────────────
  function applySearch(term) {
    if (!term) {
      nodeSelection?.style('opacity', 1);
      labelSelection?.style('opacity', null);
      return;
    }
    const lower = term.toLowerCase();
    nodeSelection?.style('opacity', d =>
      d.label.toLowerCase().includes(lower) || d.rawLabel.toLowerCase().includes(lower) ? 1 : 0.06
    );
    labelSelection?.style('opacity', d =>
      d.label.toLowerCase().includes(lower) || d.rawLabel.toLowerCase().includes(lower) ? 1 : 0
    );
  }

  // ── Render/update simulation ───────────────────────────────────────────────
  function renderGraph(svg, width, height) {
    const { nodes, links } = filteredGraph();

    if (simulation) simulation.stop();

    // Clear
    svg.selectAll('*').remove();

    if (nodes.length === 0) {
      document.getElementById('empty').classList.add('visible');
      return;
    }
    document.getElementById('empty').classList.remove('visible');

    const g = svg.append('g');

    // Links
    linkSelection = g.append('g').attr('class', 'links')
      .selectAll('line')
      .data(links)
      .join('line')
        .attr('class', 'link')
        .style('stroke-width', d => Math.min(1 + Math.log1p(d.weight) * 0.5, 4));

    // Nodes
    const nodeG = g.append('g').attr('class', 'nodes')
      .selectAll('g')
      .data(nodes, d => d.id)
      .join('g')
        .attr('class', 'node')
        .call(d3.drag()
          .on('start', dragStarted)
          .on('drag',  dragged)
          .on('end',   dragEnded)
        );

    nodeG.append('circle')
      .attr('r', nodeRadius)
      .attr('fill', d => TYPES[d.type]?.color ?? '#888')
      .attr('fill-opacity', 0.85)
      .attr('stroke', d => TYPES[d.type]?.color ?? '#888')
      .attr('stroke-opacity', 0.4);

    nodeSelection = nodeG;

    // Labels — visible for high-count nodes, or shown on zoom
    labelSelection = g.append('g').attr('class', 'labels')
      .selectAll('text')
      .data(nodes.filter(d => d.count >= 3 || d.type === 'country'), d => d.id)
      .join('text')
        .attr('dy', d => nodeRadius(d) + 10)
        .text(d => d.label.length > 20 ? d.label.slice(0, 18) + '…' : d.label)
        .style('opacity', 0.65);

    // Tooltip
    const tooltip = document.getElementById('tooltip');
    nodeG
      .on('mouseover', (event, d) => {
        document.getElementById('tt-type').textContent  = TYPES[d.type]?.label ?? d.type;
        document.getElementById('tt-value').textContent = d.rawLabel;
        document.getElementById('tt-count').textContent = `${d.count} visit${d.count !== 1 ? 's' : ''}`;
        tooltip.classList.add('visible');
      })
      .on('mousemove', (event) => {
        const rect = document.getElementById('canvas-wrap').getBoundingClientRect();
        let x = event.clientX - rect.left + 14;
        let y = event.clientY - rect.top - 10;
        if (x + 270 > rect.width) x -= 280;
        tooltip.style.left = x + 'px';
        tooltip.style.top  = y + 'px';
      })
      .on('mouseout', () => tooltip.classList.remove('visible'))
      .on('click', (event, d) => {
        event.stopPropagation();
        if (focusedId === d.id) {
          applyFocus(null);
          closePanel();
        } else {
          applyFocus(d.id);
          openPanel(d);
        }
      });

    // Click canvas to deselect
    svg.on('click', () => { applyFocus(null); closePanel(); });

    // Zoom
    const zoom = d3.zoom()
      .scaleExtent([0.1, 8])
      .on('zoom', (event) => {
        transform = event.transform;
        g.attr('transform', transform);
        // Show more labels when zoomed in
        const k = event.transform.k;
        labelSelection.style('opacity', d => (d.count >= 3 || d.type === 'country' || k > 2) ? 0.75 : 0);
      });
    svg.call(zoom).call(zoom.transform, transform);

    // Simulation
    simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id)
        .distance(d => {
          const s = TYPES[d.source.type]?.baseR ?? 6;
          const t = TYPES[d.target.type]?.baseR ?? 6;
          return 60 + (s + t) * 3;
        })
        .strength(0.4)
      )
      .force('charge', d3.forceManyBody()
        .strength(d => -80 - nodeRadius(d) * 8)
      )
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force('collision', d3.forceCollide().radius(d => nodeRadius(d) + 5))
      .on('tick', () => {
        linkSelection
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y);
        nodeG.attr('transform', d => `translate(${d.x},${d.y})`);
        labelSelection.attr('transform', d => `translate(${d.x},${d.y})`);
      });
  }

  // ── Drag handlers ─────────────────────────────────────────────────────────
  function dragStarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x; d.fy = d.y;
  }
  function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
  function dragEnded(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null; d.fy = null;
  }

  // ── Detail panel ──────────────────────────────────────────────────────────
  function openPanel(d) {
    const connected = [];
    allLinks.forEach(l => {
      const s = l.source.id ?? l.source;
      const t = l.target.id ?? l.target;
      if (s === d.id || t === d.id) {
        const otherId = s === d.id ? t : s;
        const other = allNodes.find(n => n.id === otherId);
        if (other) connected.push({ node: other, weight: l.weight });
      }
    });
    connected.sort((a, b) => b.weight - a.weight);

    const grouped = {};
    connected.forEach(({ node, weight }) => {
      if (!grouped[node.type]) grouped[node.type] = [];
      grouped[node.type].push({ node, weight });
    });

    let html = `
      <h2>${TYPES[d.type]?.label ?? d.type}</h2>
      <div class="panel-value">${escHtml(d.rawLabel)}</div>
      <div style="font-size:0.65rem;color:var(--dim)">${d.count} visit${d.count !== 1 ? 's' : ''}</div>
    `;

    for (const [type, items] of Object.entries(grouped)) {
      html += `<div class="panel-section"><h3>${TYPES[type]?.label ?? type} (${items.length})</h3>`;
      items.forEach(({ node, weight }) => {
        const col = TYPES[node.type]?.color ?? '#888';
        html += `
          <div class="conn-item" data-id="${escHtml(node.id)}">
            <span class="conn-type" style="color:${col}">${TYPES[node.type]?.label ?? node.type}</span>
            <span class="conn-label">${escHtml(node.rawLabel)}</span>
            <span style="color:var(--dim);font-size:0.6rem;margin-left:auto">${weight}</span>
          </div>`;
      });
      html += '</div>';
    }

    document.getElementById('panel-content').innerHTML = html;

    // Click connected items to focus them
    document.querySelectorAll('.conn-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const target = allNodes.find(n => n.id === id);
        if (target) { applyFocus(id); openPanel(target); }
      });
    });

    document.getElementById('panel').classList.add('open');
  }

  function closePanel() {
    document.getElementById('panel').classList.remove('open');
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── Filter buttons ────────────────────────────────────────────────────────
  function buildFilters(nodes) {
    const counts = {};
    nodes.forEach(n => { counts[n.type] = (counts[n.type] || 0) + 1; });

    const container = document.getElementById('filters');
    container.innerHTML = '';

    Object.entries(TYPES).forEach(([type, cfg]) => {
      if (!counts[type]) return;
      const btn = document.createElement('button');
      btn.className = 'filter-btn active';
      btn.textContent = `${cfg.label} ${counts[type]}`;
      btn.style.color = cfg.color;
      btn.style.borderColor = cfg.color + '55';
      btn.dataset.type = type;
      btn.addEventListener('click', () => {
        if (activeTypes.has(type)) { activeTypes.delete(type); btn.classList.replace('active', 'inactive'); }
        else { activeTypes.add(type); btn.classList.replace('inactive', 'active'); }
        const svg = d3.select('#graph');
        const wrap = document.getElementById('canvas-wrap');
        renderGraph(svg, wrap.clientWidth, wrap.clientHeight);
      });
      container.appendChild(btn);
    });
  }

  // ── Status bar ────────────────────────────────────────────────────────────
  function setStatus(text) {
    document.getElementById('status').textContent = text;
  }

  // ── Main load ─────────────────────────────────────────────────────────────
  async function load(days) {
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('loading-msg').textContent = 'Fetching logs…';
    focusedId = null;
    closePanel();

    let entries = [];
    try {
      const res = await fetch(`/api/logs?days=${days}`, { credentials: 'same-origin' });
      if (res.status === 401) {
        document.getElementById('loading-msg').textContent = 'Authentication required — reload the page.';
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      entries = await res.json();
    } catch (err) {
      document.getElementById('loading-msg').textContent = `Error: ${err.message}`;
      return;
    }

    document.getElementById('loading-msg').textContent = 'Building graph…';

    const { nodes, links } = buildGraph(entries);
    allNodes = nodes;
    allLinks = links;

    buildFilters(nodes);
    setStatus(`${nodes.length} nodes · ${links.length} edges · ${entries.length} visits`);

    const svg  = d3.select('#graph');
    const wrap = document.getElementById('canvas-wrap');
    renderGraph(svg, wrap.clientWidth, wrap.clientHeight);

    document.getElementById('loading').classList.add('hidden');
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    const days = parseInt(document.getElementById('days-select').value);
    load(days);

    document.getElementById('days-select').addEventListener('change', e => {
      transform = d3.zoomIdentity;
      load(parseInt(e.target.value));
    });

    document.getElementById('search').addEventListener('input', e => {
      const term = e.target.value.trim();
      if (focusedId) { applyFocus(null); closePanel(); }
      applySearch(term);
    });

    document.getElementById('search').addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.target.value = ''; applySearch(''); }
    });

    document.getElementById('panel-close').addEventListener('click', () => {
      applyFocus(null);
      closePanel();
    });

    window.addEventListener('resize', () => {
      const svg  = d3.select('#graph');
      const wrap = document.getElementById('canvas-wrap');
      if (allNodes.length) renderGraph(svg, wrap.clientWidth, wrap.clientHeight);
    });
  });
})();
