document.getElementById('sendBtn').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = "Sending...";

  try {
    // 1. Get the current active tab in the focused window
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url) {
      statusDiv.textContent = "Could not retrieve active URL.";
      return;
    }

    // 2. Post the URL to your external API endpoint
    const response = await fetch("https://api.yourwebsite.com/endpoint", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url: tab.url })
    });

    if (response.ok) {
      statusDiv.textContent = "URL successfully sent!";
    } else {
      statusDiv.textContent = `Server error: ${response.status}`;
    }
  } catch (error) {
    statusDiv.textContent = `Error: ${error.message}`;
  }
});