const browser = (typeof chrome !== "undefined") ? chrome : browser;

/*
This script runs on the browser tab page. When a debug message is received and
the user has enabled the option to dump messages to the devtools console, the
Bcon2devtools auxiliary class is called to display it.
*/
browser.runtime.onMessage.addListener(request =>
{
  if (request.e == "bconsAppMsg")
  {
    Bcons2devtools.show(
      request.data,
      request.consoleSettings,
      request.decryptKey
    );
  }
  else if (request.e == "bconsUserToken")
  {
    const data =
    {
      type: "bconsSiteMessageResponse",
      response: request.token
    }
    window.postMessage(data, "*");
  }
});

// Let the bcons.dev site know that the extension is installed.
const inBconsSite =
  location.hostname == "bcons.dev" ||
  location.hostname == "bcons.local";

if (inBconsSite)
{
  const meta = document.createElement("meta");
  meta.setAttribute("id", "bconsExtension");
  meta.setAttribute("name", "installed");
  document.head.appendChild(meta);
}

// Listen to messages sent from the current website
window.addEventListener("message", e =>
{
  // We only accept messages from the bcons website
  if (!inBconsSite)
    return;

  if (e.data.type && (e.data.type == "bconsSiteMessage"))
  {
    browser.runtime.sendMessage({ e: e.data.command });
  }
});
