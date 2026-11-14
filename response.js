/* Reviewer navigation runs locally; no tracking or external requests. */
(() => {
  'use strict';
  const topics = [...document.querySelectorAll('.response-topic')];
  const buttons = [...document.querySelectorAll('[data-reviewer]')];
  const select = document.getElementById('reviewer-select');
  const body = document.querySelector('.response-body');
  const nav = document.querySelector('.reading-nav ol');
  const items = new Map([...nav.children].map(item => [item.dataset.topic, item]));
  const defaults = new Map(topics.map(topic => [topic.id, {
    question: topic.querySelector('.concern').textContent.replace('Question · paraphrased', '').trim(),
    kicker: topic.querySelector('.topic-number').textContent,
    navLabel: items.get(topic.id).querySelector('.nav-question').textContent
  }]));
  const reviewers = {
    NmGX: {
      order: ['contribution', 'capacity', 'costs', 'materials', 'real-photo-response'],
      labels: {contribution: 'Q1', capacity: 'Q2', costs: 'Q2', materials: 'Q3–Q4', 'real-photo-response': 'Q4'},
      subtitle: 'Q1–Q4 · Prior work, decoder capacity, material evaluation, and real photographs.',
      questions: {
        contribution: 'How does the Anchor Densifier differ from prior token expansion, particularly MSVS-VAE?',
        capacity: 'Does densification outperform deeper or wider standard decoders under a similar computational budget?',
        costs: 'What are the actual decoding latency and memory costs, with texture baking reported separately?',
        materials: 'How much do metallic and roughness improve, and how do predictions behave under different reference lighting?',
        'real-photo-response': 'Can the method handle real photographs with varied lighting, beyond generated-image examples?'
      }
    },
    UMid: {
      order: ['latent-budget', 'costs', 'contribution', 'capacity'],
      labels: {'latent-budget': 'Q1', costs: 'Runtime', contribution: 'Novelty / FiLM', capacity: 'Capacity'},
      subtitle: '16K quality and runtime, prior-work positioning, FiLM, and decoder capacity.',
      questions: {
        'latent-budget': 'Report full-set quality and end-to-end runtime for both 16K settings, especially densified 16K versus unexpanded 32K.',
        costs: 'How does the revised runtime relate to the original end-to-end times, and where is the time spent?',
        contribution: 'What is the contribution relative to existing native texturing methods, and how strong is the evidence for relative FiLM?',
        capacity: 'How much of the improvement comes from decoder capacity, rather than the densification design?'
      }
    },
    GgL7: {
      order: ['capacity', 'latent-budget', 'costs', 'materials', 'real-photo-response'],
      labels: {capacity: 'Q1', 'latent-budget': 'Q1', costs: 'Q2', materials: 'Q3', 'real-photo-response': 'Q3'},
      subtitle: 'Q1–Q3 · Matched-budget comparisons, stage costs and memory, and material evaluation.',
      questions: {
        capacity: 'Compare against deeper and wider decoders at a representative matched decoding budget.',
        'latent-budget': 'How does decoder densification compare with increasing the diffusion latent count?',
        costs: 'Separate decoding and baking costs, report peak memory, and compare expansion factors.',
        materials: 'Evaluate separate material channels across reference lighting and attribute the relighting improvement.',
        'real-photo-response': 'How do predicted materials behave on real inputs, including failure cases?'
      }
    }
  };
  let activeReviewer = 'all';
  function setReviewer(requested, updateUrl = false, moveFocus = false) {
    activeReviewer = Object.hasOwn(reviewers, requested) ? requested : 'all';
    const config = reviewers[activeReviewer];
    const order = config ? config.order : topics.map(topic => topic.id);
    const visible = new Set(order);
    for (const id of [...order, ...topics.map(topic => topic.id).filter(id => !visible.has(id))]) {
      const topic = topics.find(topic => topic.id === id);
      topic.hidden = !visible.has(id);
      items.get(id).hidden = topic.hidden;
      body.appendChild(topic);
      nav.appendChild(items.get(id));
      const label = config?.labels[id];
      topic.querySelector('.topic-number').textContent = label ? 'Reviewer ' + activeReviewer + ' · ' + label : defaults.get(id).kicker;
      items.get(id).querySelector('.nav-question').textContent = label || defaults.get(id).navLabel;
      topic.querySelectorAll('.reviewer-ref').forEach(ref => { ref.hidden = !!config; });
      const caption = document.createElement('span');
      caption.textContent = config ? 'Your question · paraphrased' : 'Question · paraphrased';
      topic.querySelector('.concern').replaceChildren(caption, document.createTextNode(config?.questions[id] || defaults.get(id).question));
    }
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.reviewer === activeReviewer)));
    select.value = activeReviewer;
    const title = document.getElementById('response-title');
    title.textContent = config ? 'Response to Reviewer ' + activeReviewer : 'Responses to all reviewers';
    document.title = 'DSTex · ' + (config ? 'Response to ' + activeReviewer : 'Author response');
    document.getElementById('response-subtitle').textContent = config?.subtitle || 'Six topics, with the supporting tables and figures alongside each answer.';
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
  document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', () => revealAnchor(link.hash)));
  window.addEventListener('hashchange', () => revealAnchor(location.hash));
  window.addEventListener('popstate', restoreLocation);
  restoreLocation();
  const navLinks = [...nav.querySelectorAll('a')];
  function updateReadingPosition() {
    const visible = [...body.querySelectorAll('.response-topic')].filter(topic => !topic.hidden);
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
})();
