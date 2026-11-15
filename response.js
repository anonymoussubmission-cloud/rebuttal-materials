/* Reviewer navigation runs locally; no tracking or external requests. */
(() => {
  'use strict';
  const topics = [...document.querySelectorAll('.response-topic')];
  const buttons = [...document.querySelectorAll('[data-reviewer]')];
  const select = document.getElementById('reviewer-select');
  const body = document.querySelector('.response-body');
  const appendix = document.getElementById('appendix');
  const nav = document.querySelector('.reading-nav ol');
  const items = new Map([...nav.children].map(item => [item.dataset.topic, item]));
  const lightingEvidence = document.getElementById('lighting-evidence');
  const defaults = new Map(topics.map(topic => [topic.id, {
    question: topic.querySelector('.concern-text').textContent.trim(),
    concernLabel: topic.querySelector('.concern-label').textContent,
    title: topic.querySelector('.question-title').textContent,
    navTitle: items.get(topic.id).querySelector('a > span:last-child').textContent,
    kicker: topic.querySelector('.topic-number').textContent,
    navLabel: items.get(topic.id).querySelector('.nav-question').textContent
  }]));
  const reviewers = {
    NmGX: {
      order: ['contribution', 'capacity', 'costs', 'materials', 'real-photo-response'],
      labels: {contribution: 'W1 / Q1', capacity: 'W2 / Q2', costs: 'W2 / Q2', materials: 'Q3', 'real-photo-response': 'W3 / Q4'},
      titles: {materials: 'Material-channel accuracy', 'real-photo-response': 'Real photographs & varied lighting'},
      subtitle: 'W1–W3 / Q1–Q4 · Prior work, decoder capacity, material evaluation, and real photographs.',
      questions: {
        contribution: 'The projection, position encoding, and FiLM components are standard. What is the contribution, and how does the Anchor Densifier differ from MSVS-VAE?',
        capacity: 'Does densification outperform deeper or wider standard decoders under a similar computational budget?',
        costs: 'What are the actual decoding latency and memory costs, with texture baking reported separately?',
        materials: 'Report separate generation metrics for the metallic and roughness channels.',
        'real-photo-response': 'Provide results on real photographs or reference images under varied lighting conditions.'
      }
    },
    UMid: {
      order: ['latent-budget', 'costs', 'contribution', 'capacity', 'film'],
      labels: {'latent-budget': 'Q1 / W3', costs: 'W3', contribution: 'W1', film: 'W2', capacity: 'W1'},
      subtitle: '16K quality and runtime, prior-work positioning, FiLM, and decoder capacity.',
      questions: {
        'latent-budget': 'Report full-set quality and end-to-end runtime for both 16K settings, especially densified 16K versus unexpanded 32K.',
        costs: 'How does the revised runtime relate to the original end-to-end times, and where is the time spent?',
        contribution: 'What is the contribution relative to existing native texturing methods?',
        film: 'Does offset-conditioned FiLM provide a perceptual benefit beyond expansion with absolute positional embeddings?',
        capacity: 'How much of the improvement comes from decoder capacity, rather than the densification design?'
      }
    },
    GgL7: {
      order: ['capacity', 'latent-budget', 'costs', 'materials', 'real-photo-response'],
      labels: {capacity: 'W1 / Q1', 'latent-budget': 'W1 / Q1', costs: 'W2 / Q2', materials: 'Q3', 'real-photo-response': 'W3'},
      subtitle: 'W1–W3 / Q1–Q3 · Budget comparisons, stage costs and memory, material evaluation, and real photographs.',
      questions: {
        capacity: 'Compare against deeper and wider decoders at a representative matched decoding budget.',
        'latent-budget': 'How does decoder densification compare with increasing the diffusion latent count?',
        costs: 'Separate decoding and baking costs, report peak GPU memory, and compare expansion factors.',
        materials: 'Evaluate material stability under additional novel HDRIs, report metallic and roughness metrics, and identify which channels contribute to the relighting improvement.',
        'real-photo-response': 'How do predicted materials behave on real inputs, including failure cases?'
      }
    }
  };
  let activeReviewer = 'all';
  let pendingViewerAnchor = null;
  function setReviewer(requested, updateUrl = false, moveFocus = false) {
    activeReviewer = Object.hasOwn(reviewers, requested) ? requested : 'all';
    document.body.dataset.activeReviewer = activeReviewer;
    const config = reviewers[activeReviewer];
    const order = config ? config.order : topics.map(topic => topic.id);
    const visible = new Set(order);
    for (const id of [...order, ...topics.map(topic => topic.id).filter(id => !visible.has(id))]) {
      const topic = topics.find(topic => topic.id === id);
      topic.hidden = !visible.has(id);
      items.get(id).hidden = topic.hidden;
      body.insertBefore(topic, appendix);
      nav.appendChild(items.get(id));
      const label = config?.labels[id];
      topic.querySelector('.question-number').textContent = label || defaults.get(id).navLabel;
      topic.querySelector('.question-title').textContent = config?.titles?.[id] || defaults.get(id).title;
      items.get(id).querySelector('a > span:last-child').textContent = config?.titles?.[id] || defaults.get(id).navTitle;
      topic.querySelector('.topic-kicker').hidden = false;
      topic.querySelector('.topic-number').textContent = label ? activeReviewer + ' · ' + label : defaults.get(id).kicker;
      items.get(id).querySelector('.nav-question').textContent = label || defaults.get(id).navLabel;
      topic.querySelectorAll('.reviewer-ref').forEach(ref => { ref.hidden = !!config; });
      const kind = label?.includes('Q') && label?.includes('W') ? 'Question / weakness' : label?.includes('W') ? 'Weakness' : 'Question';
      topic.querySelector('.concern-label').textContent = label ? (kind === 'Question / weakness' ? 'Q / W:' : kind === 'Weakness' ? 'W:' : 'Q:') : defaults.get(id).concernLabel;
      topic.querySelector('.concern-text').textContent = config?.questions[id] || defaults.get(id).question;
    }
    // Keep Figure 5 and its live models with the question that asks for them.
    const lightingSlot = document.querySelector('[data-lighting-slot="' + (activeReviewer === 'NmGX' ? 'real' : 'materials') + '"]');
    lightingSlot.appendChild(lightingEvidence);
    // GgL7 asks about lighting first, followed by material accuracy and attribution.
    const materialTopic = document.getElementById('materials');
    const materialLightingSlot = materialTopic.querySelector('[data-lighting-slot="materials"]');
    const lightingPosition = activeReviewer === 'GgL7'
      ? document.getElementById('material-accuracy')
      : materialTopic.querySelector('.detail-link');
    materialTopic.insertBefore(materialLightingSlot, lightingPosition);
    document.querySelectorAll('[data-answer-for]').forEach(answer => {
      answer.hidden = !answer.dataset.answerFor.split(/\s+/).includes(activeReviewer);
    });
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.reviewer === activeReviewer)));
    select.value = activeReviewer;
    const title = document.getElementById('response-title');
    title.textContent = config ? 'Reviewer ' + activeReviewer : 'All reviewer responses';
    document.title = 'DSTex · ' + (config ? 'Response to ' + activeReviewer : 'Author response');
    document.getElementById('response-subtitle').textContent = config?.subtitle || 'Each reply includes its supporting figures and tables.';
    document.getElementById('filter-status').textContent = 'Showing ' + order.length + ' response topics for ' + (config ? 'reviewer ' + activeReviewer : 'all reviewers') + '.';
    const permalink = 'response.html' + (config ? '?reviewer=' + activeReviewer : '') + '#responses';
    document.getElementById('reviewer-permalink').href = permalink;
    if (updateUrl) {
      try { history.pushState(null, '', permalink); } catch (_) { /* Some anonymous mirrors have an opaque origin. */ }
    }
    if (moveFocus) {
      title.focus({preventScroll: true});
      document.getElementById('responses').scrollIntoView({behavior: 'auto', block: 'start'});
    }
  }
  buttons.forEach(button => button.addEventListener('click', () => setReviewer(button.dataset.reviewer, true, true)));
  select.addEventListener('change', () => setReviewer(select.value, true, true));
  function revealAnchor(hash) {
    let id;
    try { id = decodeURIComponent(hash.slice(1)); } catch (_) { return; }
    const target = document.getElementById(id);
    if (!target) return;
    if (target.tagName === 'DETAILS') target.open = true;
    if (target.closest('.response-topic')?.hidden) {
      setReviewer('all');
      try { const url = new URL(location.href); url.searchParams.delete('reviewer'); url.hash = hash; history.replaceState(null, '', url); } catch (_) {}
    }
    for (let parent = target.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
  }
  function restoreLocation() {
    setReviewer(new URLSearchParams(location.search).get('reviewer'));
    revealAnchor(location.hash);
  }
  document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', () => {
    revealAnchor(link.hash);
    if (['#interactive', '#sweep'].includes(link.hash) && viewerState !== 'ready') {
      pendingViewerAnchor = link.hash;
      startViewers();
    }
  }));
  // Keep an explicit jump aligned after the lazy viewer inserts its galleries.
  // Cancel it if the reader starts scrolling elsewhere while assets load.
  for (const event of ['wheel', 'touchstart', 'keydown']) {
    window.addEventListener(event, () => { pendingViewerAnchor = null; }, {passive: true});
  }
  window.addEventListener('hashchange', () => revealAnchor(location.hash));
  window.addEventListener('popstate', restoreLocation);
  restoreLocation();
  const navLinks = [...document.querySelectorAll('.reading-nav ol a, [data-appendix-link]')];
  function updateReadingPosition() {
    const visible = [...body.querySelectorAll('.response-topic, .appendix-section')].filter(topic => !topic.hidden && topic.getClientRects().length > 0);
    const current = visible.filter(topic => topic.getBoundingClientRect().top <= 150).at(-1) || visible[0];
    if (!current) return;
    for (const link of navLinks) {
      if (link.hash === '#' + current.id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }
  let readingUpdatePending = false;
  window.addEventListener('scroll', () => {
    if (readingUpdatePending) return;
    readingUpdatePending = true;
    requestAnimationFrame(() => { readingUpdatePending = false; updateReadingPosition(); });
  }, {passive: true});
  updateReadingPosition();
  appendix.addEventListener('toggle', updateReadingPosition);

  // Only wide numeric tables need this hint; prose comparisons stack on mobile.
  const tableRegions = [...document.querySelectorAll('.table-scroll')];
  const tableHints = new Map(tableRegions.map(region => {
    const hint = document.createElement('p');
    hint.className = 'table-scroll-hint';
    hint.textContent = 'Scroll horizontally to view all columns →';
    hint.hidden = true;
    region.after(hint);
    return [region, hint];
  }));
  function updateTableHints() {
    tableHints.forEach((hint, region) => {
      hint.hidden = region.clientWidth === 0 || region.scrollWidth <= region.clientWidth + 1;
    });
  }
  if ('ResizeObserver' in window) {
    const tableObserver = new ResizeObserver(updateTableHints);
    tableRegions.forEach(region => tableObserver.observe(region));
  }
  window.addEventListener('resize', updateTableHints, {passive: true});
  updateTableHints();

  // Load the shared viewer when an inline example approaches the reading area.
  // No separate page or click-to-load step is needed.
  let viewerState = 'idle';
  const loadedScripts = new Set();
  const appSource = document.body.dataset.viewerSrc || 'app.js';
  function loadViewerScript(src) {
    if (loadedScripts.has(src)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => fail(), 30000);
      function fail() {
        clearTimeout(timeout);
        script.remove();
        reject(new Error('Could not load ' + src));
      }
      script.src = src;
      script.onload = () => { clearTimeout(timeout); loadedScripts.add(src); resolve(); };
      script.onerror = fail;
      document.head.appendChild(script);
    });
  }
  async function startViewers() {
    if (viewerState === 'loading' || viewerState === 'ready') return;
    viewerState = 'loading';
    const notes = [...document.querySelectorAll('.viewer-load-note')];
    notes.forEach(note => { note.hidden = false; note.textContent = 'Preparing interactive 3D examples…'; });
    const scripts = ['vendor/three.min.js', 'vendor/GLTFLoader.js', 'vendor/RGBELoader.js', 'vendor/OrbitControls.js', 'vendor/meshopt_decoder.js', 'manifest.js', appSource];
    try {
      for (const src of scripts) await loadViewerScript(src);
      if (!document.querySelector('#real-grid .view')) throw new Error('Viewer initialization did not complete');
      viewerState = 'ready';
      if (pendingViewerAnchor) {
        const anchor = pendingViewerAnchor;
        pendingViewerAnchor = null;
        requestAnimationFrame(() => {
          if (location.hash === anchor) document.getElementById(anchor.slice(1))?.scrollIntoView({block: 'start'});
        });
      }
      notes.forEach(note => { note.hidden = true; });
      document.querySelectorAll('.inline-3d .viewer-tools').forEach(toolbar => {
        toolbar.removeAttribute('inert');
        toolbar.removeAttribute('aria-busy');
      });
    } catch (error) {
      viewerState = 'failed';
      console.error('3D preview could not load:', error);
      notes.forEach(note => {
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'retry-viewer';
        retry.textContent = 'Retry 3D preview';
        retry.addEventListener('click', () => {
          // An interrupted script can be retried in place. An initialization
          // exception needs a reload to clear its partially created globals.
          if (loadedScripts.has(appSource)) location.reload();
          else startViewers();
        });
        note.replaceChildren(document.createTextNode('The 3D preview could not finish loading. '), retry);
      });
    }
  }
  const viewerObserver = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      viewerObserver.disconnect();
      startViewers();
    }
  }, {rootMargin: '600px 0px'});
  document.querySelectorAll('.inline-3d').forEach(section => viewerObserver.observe(section));
  if (['#interactive', '#sweep'].includes(location.hash)) {
    pendingViewerAnchor = location.hash;
    startViewers();
  }
})();
