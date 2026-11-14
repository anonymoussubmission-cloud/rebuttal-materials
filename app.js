// Synchronized material viewers.
//
// The host serves this page in a sandbox without allow-same-origin, so fetch() of the page's own
// files fails CORS. Binary payloads therefore arrive as classic scripts calling PAGE_DATA, and the
// whole page is one WebGL context drawing every viewer into its cell (browsers cap contexts at ~16).
"use strict";

const REAL_PER_PAGE = document.body.classList.contains("response-page") ? 4 : 8;
const CAMERA_DISTANCE = 3.9; // fits the unit sphere that every model is normalised into, at 30 degrees
const CAMERA_HOME = new THREE.Vector3(0, 0.9, CAMERA_DISTANCE).setLength(CAMERA_DISTANCE);

const pending = new Map();
function PAGE_DATA(key, base64) {
  const request = pending.get(key);
  if (!request) return;
  pending.delete(key);
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    request.resolve(bytes.buffer);
  } catch (error) {
    payloads.delete(key);
    request.reject(error);
  }
}

// Keep each hosted file below the mirror's size limit without resampling any texture
// or changing any model bytes. Classic scripts also work in the host's opaque sandbox.
const chunkLoads = new Map();
function PAGE_DATA_PART(key, index, base64) {
  const parts = chunkLoads.get(key);
  if (parts) parts[index] = base64;
}
function PAGE_DATA_CHUNKS(key, paths) {
  const parts = new Array(paths.length);
  chunkLoads.set(key, parts);
  const scripts = [];
  Promise.all(paths.map((path, index) => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    scripts.push(script);
    script.src = path;
    script.onload = () => {
      script.remove();
      if (typeof parts[index] !== "string") reject(new Error("Missing model chunk: " + path));
      else resolve();
    };
    script.onerror = () => reject(new Error("Failed to load model chunk: " + path));
    document.head.appendChild(script);
  }))).then(() => {
    chunkLoads.delete(key);
    PAGE_DATA(key, parts.join(""));
  }).catch((error) => {
    scripts.forEach((script) => script.remove());
    chunkLoads.delete(key);
    const request = pending.get(key);
    pending.delete(key);
    payloads.delete(key);
    if (request) request.reject(error);
  });
}
const payloads = new Map();
function payload(key) {
  if (!payloads.has(key)) {
    payloads.set(key, new Promise((resolve, reject) => {
      pending.set(key, { resolve, reject });
      const script = document.createElement("script");
      script.src = key + ".js";
      script.onerror = () => { pending.delete(key); payloads.delete(key); script.remove(); reject(new Error("failed to load " + key)); };
      script.onload = () => script.remove();
      document.head.appendChild(script);
    }));
  }
  return payloads.get(key);
}

const canvas = document.getElementById("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setClearColor(0x000000, 0);
renderer.setScissorTest(true);
const pmrem = new THREE.PMREMGenerator(renderer);

const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
camera.position.copy(CAMERA_HOME);
const state = { channel: "pbr", environment: null, environmentName: null, zoom: 1, spin: false };
// Each inline example section has its own controls; all views remain synchronized.
const controlElements = (name) => [...document.querySelectorAll('#' + name + ', [data-viewer-control="' + name + '"]')];

const loader = new THREE.GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

// A view is one cell: its own scene holding at most one model, drawn with the shared camera.
const views = new Set();
function makeView(element, modelKey, label) {
  const view = { element, modelKey, scene: new THREE.Scene(), model: null, materials: [], loading: false, disposed: false,
    clipParent: element.closest(".comparison-scroll") };
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", label + ". Drag to rotate, or use the arrow keys.");
  element.tabIndex = 0;
  element.addEventListener("keydown", (event) => {
    if (event.target !== element || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    setSpin(false);
    const spherical = new THREE.Spherical().setFromVector3(camera.position);
    if (event.key === "ArrowLeft") spherical.theta -= 0.12;
    if (event.key === "ArrowRight") spherical.theta += 0.12;
    if (event.key === "ArrowUp") spherical.phi -= 0.12;
    if (event.key === "ArrowDown") spherical.phi += 0.12;
    spherical.makeSafe();
    camera.position.setFromSpherical(spherical);
  });
  view.scene.environment = state.environment;
  const status = document.createElement("div");
  status.className = "status";
  status.textContent = "3D preview · loads as you explore";
  element.appendChild(status);
  view.status = status;
  const controls = new THREE.OrbitControls(camera, element);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.rotateSpeed = 0.8;
  controls.addEventListener("start", () => setSpin(false));
  element.style.touchAction = "pan-y"; // vertical swipes still scroll the page on phones
  view.controls = controls;
  views.add(view);
  observer.observe(element);
  return view;
}

function loadView(view) {
  if (view.disposed || view.loading || view.model) return;
  view.loading = true;
  view.status.classList.remove("is-error");
  view.status.textContent = "Loading 3D preview…";
  payload(view.modelKey)
    .then((buffer) => new Promise((resolve, reject) => loader.parse(buffer, "", resolve, reject)))
    .then((gltf) => {
      if (view.disposed) { disposeObject(gltf.scene); return; }
      view.model = gltf.scene;
      view.model.traverse((node) => {
        if (node.isMesh) view.materials.push({ mesh: node, pbr: node.material, channels: {} });
      });
      applyChannel(view);
      view.scene.add(view.model);
      view.status.remove();
    })
    .catch((error) => {
      if (view.disposed) return;
      view.status.classList.add("is-error");
      view.status.textContent = "Preview unavailable.";
      const retry = el("button", { class: "retry-load", type: "button", text: "Retry" });
      retry.addEventListener("click", () => { payloads.delete(view.modelKey); loadView(view); });
      view.status.appendChild(retry);
      console.error(error);
    })
    .finally(() => { view.loading = false; });
}

function disposeMaterial(material) {
  for (const value of Object.values(material)) if (value && value.isTexture) value.dispose();
  material.dispose();
}

// Must be called with the model's own PBR materials in place, as loaded.
function disposeObject(root) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry.dispose();
    disposeMaterial(node.material);
  });
}

function disposeView(view) {
  view.disposed = true;
  observer.unobserve(view.element);
  view.controls.dispose();
  if (view.model) {
    // The meshes may wear channel materials; the PBR material owns every texture, and the
    // channel materials only borrow them.
    for (const entry of view.materials) {
      entry.mesh.geometry.dispose();
      disposeMaterial(entry.pbr);
      for (const material of Object.values(entry.channels)) material.dispose();
    }
  }
  views.delete(view);
  // Decoded payloads are cached as promises; drop a settled one so its buffer can be collected.
  // One still in flight stays cached, so showing the view again cannot request it twice.
  if (!pending.has(view.modelKey)) payloads.delete(view.modelKey);
}

const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    for (const view of views) if (view.element === entry.target) loadView(view);
  }
}, { rootMargin: "300px" });

// Base color is an sRGB texture shown as is; metallic (B) and roughness (G) are linear values
// shown as grey levels, or together as the paper's MR composite (red metallic, green
// roughness), with no tone mapping, as in the paper's figures.
const CHANNEL_SHADER = {
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: "uniform sampler2D map; uniform float metalness; uniform float roughness; uniform int channel;"
    + " varying vec2 vUv; void main() { vec4 t = texture2D(map, vUv);"
    + " float m = t.b * metalness; float r = t.g * roughness;"
    + " gl_FragColor = channel == 2 ? vec4(vec3(m), 1.0) : channel == 1 ? vec4(vec3(r), 1.0) : vec4(m, r, 0.0, 1.0); }",
};
function channelMaterial(pbr, channel) {
  if (channel === "albedo") {
    return new THREE.MeshBasicMaterial({ map: pbr.map, color: pbr.color, side: THREE.DoubleSide, toneMapped: false });
  }
  const map = pbr.metalnessMap || pbr.roughnessMap;
  console.assert(map, "every packed material carries a metallic-roughness map");
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, channel: { value: { metallic: 2, roughness: 1, mr: 0 }[channel] },
                metalness: { value: pbr.metalness }, roughness: { value: pbr.roughness } },
    vertexShader: CHANNEL_SHADER.vertexShader, fragmentShader: CHANNEL_SHADER.fragmentShader,
    side: THREE.DoubleSide, toneMapped: false,
  });
}
function applyChannel(view) {
  for (const entry of view.materials) {
    if (state.channel === "pbr") { entry.mesh.material = entry.pbr; continue; }
    if (!entry.channels[state.channel]) entry.channels[state.channel] = channelMaterial(entry.pbr, state.channel);
    entry.mesh.material = entry.channels[state.channel];
  }
}

const environments = new Map();
function setEnvironment(name) {
  state.environmentName = name;
  updateStatus();
  if (!environments.has(name)) {
    environments.set(name, payload("env/" + name).then((buffer) => {
      const texture = new THREE.RGBELoader().parse(buffer);
      const data = new THREE.DataTexture(texture.data, texture.width, texture.height, THREE.RGBAFormat, texture.type);
      data.mapping = THREE.EquirectangularReflectionMapping;
      data.flipY = true;
      data.minFilter = data.magFilter = THREE.LinearFilter;
      data.generateMipmaps = false;
      data.needsUpdate = true;
      const target = pmrem.fromEquirectangular(data);
      data.dispose();
      return target.texture;
    }));
  }
  environments.get(name).then((texture) => {
    if (state.environmentName !== name) return; // a later choice wins, whichever loads first
    state.environment = texture;
    for (const view of views) view.scene.environment = texture;
  }).catch((error) => {
    environments.delete(name);
    if (state.environmentName === name) controlElements("channel-status").forEach(node => { node.textContent = "Lighting unavailable. Please select it again."; });
    console.error(error);
  });
}

function setSpin(on) {
  state.spin = on;
  controlElements("spin").forEach(input => { input.checked = on; });
}

let lastFrame = 0;
function render(timestamp) {
  const elapsed = lastFrame ? Math.min((timestamp - lastFrame) / 1000, 0.1) : 0;
  lastFrame = timestamp;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== Math.floor(width * renderer.getPixelRatio()) || canvas.height !== Math.floor(height * renderer.getPixelRatio())) {
    renderer.setSize(width, height, false);
  }
  if (state.spin && !document.hidden && !document.getElementById("photo-dialog").open) {
    camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.24 * elapsed);
  }
  camera.position.setLength(CAMERA_DISTANCE / state.zoom);
  camera.lookAt(0, 0, 0);
  renderer.setScissor(0, 0, width, height);
  renderer.clear();
  for (const view of views) {
    view.controls.update();
    if (!view.model) continue;
    const rect = view.element.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > height || rect.right < 0 || rect.left > width) continue;
    // Clip to the scroll container as well as the window; otherwise the shared canvas
    // paints horizontally scrolled models over the surrounding page on small screens.
    const clip = view.clipParent ? view.clipParent.getBoundingClientRect() : { left: 0, right: width, top: 0, bottom: height };
    const left = Math.max(rect.left, clip.left, 0);
    const right = Math.min(rect.right, clip.right, width);
    const top = Math.max(rect.top, clip.top, 0);
    const clippedBottom = Math.min(rect.bottom, clip.bottom, height);
    if (right <= left || clippedBottom <= top) continue;
    const bottom = height - rect.bottom;
    renderer.setViewport(rect.left, bottom, rect.width, rect.height);
    renderer.setScissor(left, height - clippedBottom, right - left, clippedBottom - top);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.render(view.scene, camera);
  }
  requestAnimationFrame(render);
}

function el(tag, attributes, children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes || {})) {
    if (name === "text") node.textContent = value; else node.setAttribute(name, value);
  }
  for (const child of children || []) node.appendChild(child);
  return node;
}

function pager(container, labels, onSelect) {
  console.assert(labels.length > 0, "empty pager");
  const buttons = labels.map((label, index) => {
    const button = el("button", { type: "button", text: label });
    button.addEventListener("click", () => select(index));
    container.appendChild(button);
    return button;
  });
  function select(index) {
    buttons.forEach((button, k) => {
      button.classList.toggle("active", k === index);
      button.setAttribute("aria-pressed", String(k === index));
    });
    onSelect(index);
  }
  select(0);
}

const realViews = [];
const REAL_NAMES = {
  rp03_backpack_canvas: "Canvas backpack", rp04_toy_car_red: "Red toy car",
  rp06_fire_extinguisher: "Fire extinguisher", rp10_camera_folding: "Folding camera",
  rp14_toy_locomotive: "Toy locomotive", rp15_enamel_kettle: "Enamel kettle",
  rp21_chrome_toaster: "Chrome toaster", rp22_silver_urn: "Silver urn",
  rp24_zippo_lighter: "Pocket lighter", rp26_gilt_chalice: "Gilt chalice",
  rp29_bronze_clock_figure: "Figural clock", rp30_oil_can_radio: "Oil-can radio",
  rp34_netsuke_man: "Netsuke figure", rp39_folk_figure_basket: "Folk figure",
  rp41_gourd_vase_painted: "Painted gourd vase", rp42_calabash_carved: "Carved calabash",
};

function openPhoto(src, name, asset) {
  const dialog = document.getElementById("photo-dialog");
  const image = document.getElementById("photo-dialog-image");
  image.src = src;
  image.alt = "Input photograph: " + name;
  document.getElementById("photo-dialog-title").textContent = name;
  document.getElementById("photo-dialog-source").href = asset.source;
  const credit = document.getElementById("photo-dialog-credit");
  credit.replaceChildren(document.createTextNode(asset.author + " · "));
  credit.appendChild(asset.license_url
    ? el("a", { href: asset.license_url, rel: "noopener noreferrer", target: "_blank", text: asset.license })
    : el("span", { text: asset.license }));
  dialog.showModal();
}

function showReal(page) {
  for (const view of realViews.splice(0)) disposeView(view);
  const grid = document.getElementById("real-grid");
  grid.replaceChildren();
  const first = page * REAL_PER_PAGE;
  const last = Math.min((page + 1) * REAL_PER_PAGE, MANIFEST.real.length);
  document.getElementById("real-range").textContent = (first + 1) + "–" + last + " of " + MANIFEST.real.length;
  MANIFEST.real.slice(first, last).forEach((asset, index) => {
    const name = REAL_NAMES[asset.id] || "Object " + (first + index + 1);
    const src = "img/real/" + asset.id + ".jpg";
    const photo = el("button", { class: "photo-trigger", type: "button", "aria-label": "Enlarge input photograph: " + name },
      [el("img", { src, alt: "Input photograph: " + name, loading: "lazy" })]);
    photo.addEventListener("pointerdown", (event) => event.stopPropagation());
    photo.addEventListener("click", () => openPhoto(src, name, asset));
    const cell = el("div", { class: "view" }, [photo, el("span", { class: "object-number", text: String(first + index + 1).padStart(2, "0"), "aria-hidden": "true" })]);
    const source = el("a", { class: "photo-source", href: asset.source, target: "_blank", rel: "noopener noreferrer", text: "Photo source ↗", "aria-label": "Original photograph on Wikimedia Commons: " + name });
    const caption = el("div", { class: "card-caption" }, [el("strong", { text: name }), source]);
    grid.appendChild(el("article", { class: "card" }, [cell, caption]));
    realViews.push(makeView(cell, "models/" + asset.id, name));
  });
}

const sweepViews = [];
function showSweep(index) {
  for (const view of sweepViews.splice(0)) disposeView(view);
  const asset = MANIFEST.sweep[index];
  const grid = document.getElementById("sweep-grid");
  grid.style.gridTemplateColumns = "78px repeat(" + asset.lights + ", minmax(0, 1fr)) minmax(0, 1.1fr)";
  grid.replaceChildren(el("div", { class: "axis-label", text: "Input reference" }));
  for (let light = 1; light <= asset.lights; light++) {
    grid.appendChild(el("div", { class: "head" }, [
      el("div", { class: "reference-wrap" }, [
        el("img", { src: "img/sweep/" + asset.id + "/ref_" + light + ".jpg", alt: "Reference image, lighting " + light, loading: "lazy" }),
        el("img", { class: "ball", src: "img/sweep/ball_" + light + ".jpg", alt: "Mirror ball showing input lighting " + light, loading: "lazy" }),
      ]),
      el("span", { class: "light-label", text: "Reference " + String(light).padStart(2, "0") }),
    ]));
  }
  grid.appendChild(el("div", { class: "gtlabel" }, [el("span", { text: "Ground truth" }), el("small", { text: "Shared target" })]));
  const rows = [["ours", "DSTex"], ["trellis2", "TRELLIS.2"]];
  rows.forEach(([method, label], row) => {
    grid.appendChild(el("div", { class: "rowlabel" + (row === 0 ? " ours-label" : ""), text: label }));
    for (let light = 1; light <= asset.lights; light++) {
      const cell = el("div", { class: "view" + (row === 0 ? " ours-cell" : "") });
      grid.appendChild(cell);
      sweepViews.push(makeView(cell, "models/" + asset.id + "/" + method + "_" + light, label + ", asset " + (index + 1) + ", reference lighting " + light));
    }
    if (row === 0) {
      const cell = el("div", { class: "view gt" });
      grid.appendChild(cell);
      sweepViews.push(makeView(cell, "models/" + asset.id + "/gt", "Ground truth, asset " + (index + 1)));
    }
  });
}

function credits() {
  const list = document.getElementById("credits");
  for (const asset of MANIFEST.real) {
    const source = el("a", { href: asset.source, rel: "noreferrer", target: "_blank", text: asset.title });
    const license = asset.license_url
      ? el("a", { href: asset.license_url, rel: "noopener noreferrer", target: "_blank", text: asset.license })
      : el("span", { text: asset.license });
    const item = el("li");
    item.append(source, " by " + asset.author + ", ", license);
    list.appendChild(item);
  }
}

function updateStatus() {
  const labels = { pbr: "Rendered", albedo: "Base color", metallic: "Metallic", roughness: "Roughness", mr: "MR · Red: metallic / Green: roughness" };
  const environmentLabels = { overcast: "Overcast sky", studio: "Photo studio", workshop: "Workshop", midday: "Midday sun" };
  const activeEnvironment = state.environmentName || "overcast";
  const environmentTitle = state.channel === "pbr" ? "Lighting used to render every output" : "Material channels are shown without lighting. Select Rendered to relight.";
  const environments = controlElements("environment");
  environments.forEach(environment => {
    environment.value = activeEnvironment;
    environment.disabled = state.channel !== "pbr";
    environment.title = environmentTitle;
    environment.parentElement.classList.toggle("is-inactive", environment.disabled);
  });
  controlElements("environment-option").forEach(button => {
    const selected = button.dataset.environment === activeEnvironment;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
    button.disabled = state.channel !== "pbr";
    button.title = environmentTitle;
    button.closest(".environment-control").classList.toggle("is-inactive", button.disabled);
  });
  controlElements("channel-status").forEach(node => {
    node.textContent = labels[state.channel] + (state.channel === "pbr" ? " · " + environmentLabels[activeEnvironment] : " · Unlit");
  });
}

controlElements("environment").forEach(input => input.addEventListener("change", (event) => setEnvironment(event.target.value)));
controlElements("environment-option").forEach(button => button.addEventListener("click", () => setEnvironment(button.dataset.environment)));
document.querySelectorAll("[data-channel]").forEach((button) => button.addEventListener("click", () => {
  state.channel = button.dataset.channel;
  document.querySelectorAll("[data-channel]").forEach((b) => {
    b.classList.toggle("active", b.dataset.channel === state.channel);
    b.setAttribute("aria-pressed", String(b.dataset.channel === state.channel));
  });
  for (const view of views) applyChannel(view);
  updateStatus();
}));
controlElements("spin").forEach(input => input.addEventListener("change", (event) => setSpin(event.target.checked)));
controlElements("zoom").forEach(input => input.addEventListener("input", (event) => {
  state.zoom = Number(event.target.value);
  controlElements("zoom").forEach(other => { other.value = state.zoom; });
}));
controlElements("reset").forEach(button => button.addEventListener("click", () => {
  camera.position.copy(CAMERA_HOME);
  setSpin(false);
  state.zoom = 1;
  controlElements("zoom").forEach(input => { input.value = 1; });
}));

document.getElementById("close-photo").addEventListener("click", () => document.getElementById("photo-dialog").close());
document.getElementById("photo-dialog").addEventListener("click", (event) => {
  if (event.target !== event.currentTarget) return;
  const rect = event.currentTarget.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close();
});

// Use actual control heights so anchor links land below both sticky bars at every width.
if (!document.body.classList.contains("response-page")) {
  const stickyResize = new ResizeObserver(() => {
    document.documentElement.style.setProperty("--tools-height", document.querySelector(".viewer-tools").getBoundingClientRect().height + "px");
  });
  stickyResize.observe(document.querySelector(".viewer-tools"));
}

setEnvironment("overcast");
const realPages = Math.ceil(MANIFEST.real.length / REAL_PER_PAGE);
pager(document.getElementById("real-pager"), Array.from({ length: realPages }, (_, k) => String(k * REAL_PER_PAGE + 1).padStart(2, "0") + "–" + String(Math.min((k + 1) * REAL_PER_PAGE, MANIFEST.real.length)).padStart(2, "0")), showReal);
pager(document.getElementById("sweep-pager"), MANIFEST.sweep.map((_, k) => "0" + (k + 1)), showSweep);
credits();
requestAnimationFrame(render);
