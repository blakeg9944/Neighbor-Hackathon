import { CONFIG } from './config.js';

const API_URL = CONFIG.backendUrl;
const SITE_HOST = new URL(CONFIG.frontendUrl).hostname;
const makeResumeButton = document.getElementById("sendBtn");
const statusDiv = document.getElementById("status");
const autofillSection = document.getElementById("autofillSection");
const jobSelect = document.getElementById("jobSelect");
const fillBtn = document.getElementById("fillBtn");
const downloadBtn = document.getElementById("downloadBtn");
const autofillStatus = document.getElementById("autofillStatus");
let activeUrl = "";
let activeTabId = null;
let jobs = [];

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  const title = document.getElementById("title");
  const host = document.getElementById("host");

  if (!tab || !tab.url) {
    statusDiv.textContent = "Open a job posting first";
    return;
  }

  title.textContent = tab.title || "Untitled page";
  try {
    const parsedUrl = new URL(tab.url);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      statusDiv.textContent = "Open a job posting first";
      return;
    }

    activeUrl = tab.url;
    activeTabId = tab.id;
    host.textContent = parsedUrl.hostname;
    makeResumeButton.disabled = false;

    // Auto-apply (§9.1) doesn't make sense on the website's own tabs.
    if (parsedUrl.hostname !== SITE_HOST) {
      initAutofill(tab.title || "", parsedUrl.hostname);
    }
  } catch {
    statusDiv.textContent = "Open a job posting first";
  }
});

makeResumeButton.addEventListener("click", () => {
  if (!activeUrl) return;
  const query = new URLSearchParams({ url: activeUrl, source: "extension" });
  chrome.tabs.create({ url: `${CONFIG.frontendUrl}/generate?${query.toString()}` });
  window.close();
});

document.getElementById("dashboard").addEventListener("click", (event) => {
  event.preventDefault();
  chrome.tabs.create({ url: `${CONFIG.frontendUrl}` });
  window.close();
});

// --- Auto-apply (DESIGN_SPEC §9.1) ------------------------------------------
// The only place this extension calls the backend directly, using a token
// authBridge.js copied out of the website's own Supabase session.

function getToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["access_token"], (data) => resolve(data.access_token || null));
  });
}

async function apiGet(path, token) {
  const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return res.json();
}

function bestJobMatch(list, title, hostname) {
  const hay = `${title} ${hostname}`.toLowerCase();
  let bestIdx = 0;
  let bestScore = -1;
  list.forEach((job, i) => {
    const words = `${job.title || ""} ${job.company || ""}`.toLowerCase().split(/\s+/);
    const score = words.filter((w) => w.length > 2 && hay.includes(w)).length;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  });
  return bestIdx;
}

async function initAutofill(tabTitle, hostname) {
  autofillSection.style.display = "block";
  const token = await getToken();
  if (!token) {
    autofillStatus.textContent = "Sign in on the website first to enable autofill.";
    return;
  }
  try {
    jobs = await apiGet("/api/jobs", token);
  } catch {
    autofillStatus.textContent = "Couldn't load your saved jobs. Try opening the dashboard once.";
    return;
  }
  if (!jobs.length) {
    autofillStatus.textContent = "No tailored resumes yet — make one first.";
    return;
  }
  jobSelect.innerHTML = "";
  jobs.forEach((job, i) => {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = [job.title, job.company].filter(Boolean).join(" @ ") || job.url;
    jobSelect.appendChild(option);
  });
  jobSelect.selectedIndex = bestJobMatch(jobs, tabTitle, hostname);
  jobSelect.disabled = false;
  fillBtn.disabled = false;
  downloadBtn.disabled = false;
}

function selectedJob() {
  return jobs[Number(jobSelect.value)];
}

// --- injected into the live tab (and its frames) -- never touches a submit/next/continue button
function extractFieldsInPage() {
  const SKIP_TYPES = new Set(["hidden", "submit", "button", "file", "image", "reset"]);
  let counter = 0;
  const out = [];

  function labelFor(el) {
    if (el.labels && el.labels.length) return el.labels[0].innerText.trim();
    const aria = el.getAttribute("aria-label");
    if (aria) return aria;
    if (el.placeholder) return el.placeholder;
    const wrapping = el.closest("label");
    if (wrapping) return wrapping.innerText.trim();
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const node = document.getElementById(labelledBy);
      if (node && node.innerText) return node.innerText.trim();
    }
    const prev = el.previousElementSibling;
    if (prev && prev.innerText) return prev.innerText.trim().slice(0, 100);
    return el.name || el.id || "field";
  }

  // Radio groups: native radios only act as mutually-exclusive choices when they share `name`, so
  // extract the whole group as ONE field (question label + every choice's own label as an option)
  // instead of one disconnected field per radio -- otherwise the overall question text and the
  // sibling choices are lost and there's nothing for the LLM to pick between.
  const handledRadios = new Set();
  const radiosByName = new Map();
  document.querySelectorAll('input[type="radio"]').forEach((r) => {
    if (r.disabled || !r.name) return;
    if (!radiosByName.has(r.name)) radiosByName.set(r.name, []);
    radiosByName.get(r.name).push(r);
  });
  radiosByName.forEach((radios) => {
    const container = radios[0].closest("fieldset") || radios[0].closest('[role="radiogroup"]');
    const ownLabelEls = new Set(radios.map((r) => r.labels && r.labels[0]).filter(Boolean));
    const legend = container && container.querySelector("legend");
    const groupLabel =
      (legend && legend.innerText.trim()) ||
      (container && Array.from(container.querySelectorAll("label")).find((l) => !ownLabelEls.has(l))?.innerText.trim()) ||
      radios[0].name;
    const fieldId = `af_${counter++}`;
    radios.forEach((r) => {
      r.setAttribute("data-autofill-group", fieldId);
      handledRadios.add(r);
    });
    out.push({ field_id: fieldId, label: groupLabel, type: "radio", options: radios.map((r) => labelFor(r)), multiple: false });
  });

  document.querySelectorAll("input, textarea, select").forEach((el) => {
    if (handledRadios.has(el)) return; // captured as part of a radio group above
    const tag = el.tagName.toLowerCase();
    const type = tag === "select" ? "select" : (el.type || "text");
    if (SKIP_TYPES.has(type) || el.disabled) return;
    const fieldId = `af_${counter++}`;
    el.setAttribute("data-autofill-id", fieldId);
    const options = tag === "select" ? Array.from(el.options).map((o) => o.textContent.trim()) : [];
    out.push({ field_id: fieldId, label: labelFor(el), type, options, multiple: tag === "select" && el.multiple });
  });

  // Custom multi/single-select widgets (React-Select-style pickers common on Greenhouse/Ashby) that
  // render as a listbox of role="option" items instead of a native <select>. Only extracted if the
  // option list is already present in the DOM -- a combobox that only renders options once opened is
  // a known gap, not handled here.
  document.querySelectorAll('[role="listbox"]').forEach((listbox) => {
    const optionEls = Array.from(listbox.querySelectorAll('[role="option"]'));
    if (!optionEls.length) return;
    const fieldId = `af_${counter++}`;
    listbox.setAttribute("data-autofill-id", fieldId);
    const combobox = document.querySelector(`[aria-controls="${listbox.id}"]`) || listbox.closest('[role="combobox"]');
    out.push({
      field_id: fieldId,
      label: (combobox && labelFor(combobox)) || listbox.getAttribute("aria-label") || "options",
      type: "multiselect",
      options: optionEls.map((o) => o.textContent.trim()),
      multiple: listbox.getAttribute("aria-multiselectable") === "true",
    });
  });

  return out;
}

// --- injected into one specific frame with that frame's slice of the mapping
function applyFieldsInPage(mapping) {
  let filled = 0;
  for (const [fieldId, rawValue] of Object.entries(mapping)) {
    const radioGroup = document.querySelectorAll(`[data-autofill-group="${fieldId}"]`);
    if (radioGroup.length) {
      const target = String(rawValue).trim();
      let matched = false;
      radioGroup.forEach((radio) => {
        if (matched) return;
        const label = radio.labels && radio.labels.length ? radio.labels[0].innerText.trim() : (radio.getAttribute("aria-label") || "");
        if (label === target) {
          if (!radio.checked) radio.click(); // .click() (not setting .checked) so React-controlled forms register it
          matched = true;
        }
      });
      if (matched) filled++;
      continue;
    }

    const el = document.querySelector(`[data-autofill-id="${fieldId}"]`);
    if (!el) continue;
    const tag = el.tagName.toLowerCase();
    const values = String(rawValue).split(",").map((v) => v.trim()).filter(Boolean);

    if (tag === "select") {
      let any = false;
      Array.from(el.options).forEach((opt) => {
        if (values.some((v) => opt.textContent.trim() === v || opt.value === v)) {
          opt.selected = true;
          any = true;
        }
      });
      if (any) {
        el.dispatchEvent(new Event("change", { bubbles: true }));
        filled++;
      }
    } else if (el.getAttribute("role") === "listbox") {
      // Click only role="option" items inside a field WE tagged as a listbox above --
      // never any other button on the page (that's what keeps this safe from hitting Submit/Next).
      let any = false;
      el.querySelectorAll('[role="option"]').forEach((opt) => {
        const already = opt.getAttribute("aria-selected") === "true";
        if (values.includes(opt.textContent.trim()) && !already) {
          opt.click();
          any = true;
        }
      });
      if (any) filled++;
    } else if (el.type === "checkbox" || el.type === "radio") {
      const want = /^(yes|true|1|on)$/i.test(rawValue);
      if (el.checked !== want) el.click(); // .click() so React-controlled checkboxes register it
      filled++;
    } else {
      el.value = rawValue;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      filled++;
    }
  }
  return filled;
}

async function extractAllFields(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: extractFieldsInPage,
  });
  const fieldToFrame = {};
  const fields = [];
  for (const r of results) {
    for (const f of r.result || []) {
      const globalId = `${r.frameId}:${f.field_id}`;
      fieldToFrame[globalId] = r.frameId;
      fields.push({ ...f, field_id: globalId });
    }
  }
  return { fields, fieldToFrame };
}

async function applyAllFields(tabId, mapping, fieldToFrame) {
  const byFrame = {};
  for (const [globalId, value] of Object.entries(mapping)) {
    const frameId = fieldToFrame[globalId];
    if (frameId === undefined) continue;
    const localId = globalId.slice(String(frameId).length + 1);
    (byFrame[frameId] ||= {})[localId] = value;
  }
  let total = 0;
  for (const [frameId, localMapping] of Object.entries(byFrame)) {
    const results = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [Number(frameId)] },
      func: applyFieldsInPage,
      args: [localMapping],
    });
    total += results[0]?.result || 0;
  }
  return total;
}

fillBtn.addEventListener("click", async () => {
  const job = selectedJob();
  if (!job || !activeTabId) return;
  fillBtn.disabled = true;
  autofillStatus.textContent = "Reading the form…";
  try {
    const token = await getToken();
    const { fields, fieldToFrame } = await extractAllFields(activeTabId);
    if (!fields.length) {
      autofillStatus.textContent = "No fillable fields found on this page.";
      return;
    }
    autofillStatus.textContent = "Filling it in…";
    const res = await fetch(`${API_URL}/api/jobs/${job.id}/autofill`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) throw new Error(`autofill failed (${res.status})`);
    const { mapping } = await res.json();
    const filled = await applyAllFields(activeTabId, mapping, fieldToFrame);
    autofillStatus.textContent = `Filled ${filled} of ${fields.length} fields. Review before you submit.`;
  } catch (e) {
    autofillStatus.textContent = "Couldn't fill the form. Please try again.";
  } finally {
    fillBtn.disabled = false;
  }
});

downloadBtn.addEventListener("click", async () => {
  const job = selectedJob();
  if (!job) return;
  downloadBtn.disabled = true;
  autofillStatus.textContent = "Finding your resume…";
  try {
    const token = await getToken();
    const detail = await apiGet(`/api/jobs/${job.id}`, token);
    const pdf = detail.pdfs && detail.pdfs[0];
    if (!pdf) {
      autofillStatus.textContent = "Generate a PDF for this job on the website first.";
      return;
    }
    const safeTitle = (detail.title || "resume").replace(/[^a-z0-9]+/gi, "-");
    chrome.downloads.download({ url: pdf.url, filename: `${safeTitle}-resume.pdf` });
    autofillStatus.textContent = "Downloading…";
  } catch {
    autofillStatus.textContent = "Couldn't download the resume. Please try again.";
  } finally {
    downloadBtn.disabled = false;
  }
});