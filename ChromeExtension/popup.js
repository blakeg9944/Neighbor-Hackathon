const SITE_URL = "http://localhost:5173";
const makeResumeButton = document.getElementById("sendBtn");
const statusDiv = document.getElementById("status");
let activeUrl = "";

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
    host.textContent = parsedUrl.hostname;
    makeResumeButton.disabled = false;
  } catch {
    statusDiv.textContent = "Open a job posting first";
  }
});

makeResumeButton.addEventListener("click", () => {
  if (!activeUrl) return;
  const query = new URLSearchParams({ url: activeUrl, source: "extension" });
  chrome.tabs.create({ url: `${SITE_URL}/generate?${query.toString()}` });
  window.close();
});

document.getElementById("dashboard").addEventListener("click", (event) => {
  event.preventDefault();
  chrome.tabs.create({ url: `${SITE_URL}/` });
  window.close();
});