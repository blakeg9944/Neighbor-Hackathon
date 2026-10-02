document.getElementById('sendBtn').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = "Sending...";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url) {
      statusDiv.textContent = "Could not retrieve active URL.";
      return;
    }

    const response = await fetch("http://127.0.0.1:8000/api/url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url: tab.url })
    });

    if (response.ok) {
      const data = await response.json();
      statusDiv.textContent = "URL successfully sent! Opening page...";

      // Option A: Open a dynamic URL returned by your FastAPI backend
      const targetUrl = data.redirect_url || "http://localhost:3000/dashboard";

      // Option B: Open a fixed frontend page
      // const targetUrl = "http://localhost:3000/results";

      chrome.tabs.create({ url: targetUrl });
    } else {
      statusDiv.textContent = `Server error: ${response.status}`;
    }
  } catch (error) {
    statusDiv.textContent = `Error: ${error.message}`;
  }
});