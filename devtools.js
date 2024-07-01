const browser = (typeof chrome !== "undefined") ? chrome : browser;

// This is the code for the devtools extension

// The bcons websocket component connects to the bcons server and listen to
// any messages for our user
import { BconsWS } from "./webComponents/bconsWS.js";
let bconsWS = null;

// The browser tab that opened the devtools window
let ourTabId = null;
// Our user's data
let userData = null;
// The current project. If the browser tab is on a URL that matches any
// domain of any of the user's projects, this contains the project data.
// Otherwise it is null.
let project = null;
// Until the user clicks on the "bcons" panel the bcons console is not created,
// so we store any received messages here.
const msgBuffer = [];
// This is false until the user clicks on the "bcons" panel.
let panelOpened = false;

// Listen for messages received from other parts of the extension
browser.runtime.onMessage.addListener((request, sender, sendResponse) =>
{
  // Sent by devtools panel when starting
  if (
    request.e == "bconsQueryProject" &&
    request.data.tabId == ourTabId
  )
  {
    // Send the project data
    browser.runtime.sendMessage({
      e: "bconsSetProject",
      data: { project, userData }
    });

    // Also, send any pending messages if available.
    if (msgBuffer.length)
    {
      browser.runtime.sendMessage({
        e: "bconsAddMessages",
        data: { tabId: ourTabId, messages: msgBuffer }
      });
      msgBuffer.length = 0;
    }
  }

  // The preferences are updated in devtools panel
  if (request.e == "bconsPreferencesUpdated")
  {
  // Update our local data
    userData.preferences = request.p;
  }

  // Sent by service worker when a tab has been updated. Here we notify any
  // other consoles of the tab update via Fry and update the current project.
  if (request.e == "bconsTabUpdated")
  {
    if (request.tabId != ourTabId)
    {
      //console.log("Event for tab", request.tabId, ",  our tab is", ourTabId, "", ", exiting");
      return;
    }

    // We notify Fry of the page change so that any connected consoles can
    // clear their panels if the user has that setting active
    if (project?.id)
    {
      bconsWS.send({
        e: "pageReload",
        userToken: userData.token,
        p: project.id
      });
    }

    // Check the new URL to determine if the project has changed
    checkUrlProject(request.url);
  }
});

// Create the bcons panel in the devtools window
browser.devtools.panels.create(
  "bcons",
  "icon.png",
  "panel/panel.html",
  panel => {
    panel.onShown.addListener(() => {
      panelOpened = true;
    });
  });


// Retrieves user data from the synced storage
function loadUserData(callback = null)
{
  browser.storage.sync.get(data =>
  {
    userData = data?.userData;

    if (!userData)
      console.error("No user data found in sync storage");

    if (callback)
      callback();
  });
}

// Checks if the browser tab url matches any domain of any project
function checkUrlProject(url)
{
  project = null;
  const hostname = new URL(url).hostname;

  loadUserData(() =>
  {
    for (let p of userData?.projects)
    {
      if (p.a_domains && p.a_domains.includes(hostname))
      {
        project = p;
        break;
      }
    }

    if (project)
      bconsWS.connect();
    else bconsWS.disconnect();

    // We send the set project message so that if the panel is open and we
    // leave a watched URL the panel can change its contents and vice versa.
    browser.runtime.sendMessage({
      e: "bconsSetProject",
      data: { tabId: ourTabId, project, userData }
    });

  });
}

// Returns the console settings for the current project; if not defined, the
// default settings are returned.
function consoleSettings()
{
  return userData?.preferences?.consoleSettings[project?.id] ||
    userData?.preferences?.consoleSettings?.default;
}

// Connects to the bcons server and listens for messages.
function connectToWsServer()
{
  const wsServer = userData.wsServers[
    Math.floor(Math.random() * userData.wsServers.length)
  ];

  bconsWS = new BconsWS({
    userToken: userData.token,
    wsServer,
    device: "BE", // BE: Browser Extension
    onMessage: data =>
    {
      // Ignore messages not for current project
      if (data.p != project?.id)
        return;

      // Broadcast message to extension. panel.js will show the message on the
      // devtools extension panel and serviceworker.js will emit it to our
      // tab to log it on the devtools console.
      const message = {
        e: "bconsAppMsg",
        data,
        // The following are required for content.js
        tabId: ourTabId,
        decryptKey: localStorage.getItem("pass_" + project?.id),
        consoleSettings: consoleSettings()
      };
      browser.runtime.sendMessage(message);

      // If panel is not yet opened, save message in buffer
      if (!panelOpened)
        msgBuffer.push(message);
    }
  });
}

function init()
{
  connectToWsServer();

  // Get the tab id and the URL
  ourTabId = browser?.devtools?.inspectedWindow?.tabId;

  // Chrome-like browsers
  if (browser.tabs)
  {
    browser.tabs.get(ourTabId, tabData =>
    {
      checkUrlProject(tabData.url);
    });
  }
  else // Firefox
  {
    browser.devtools.inspectedWindow.eval("window.location.href").then(result =>
    {
      checkUrlProject(result[0]);
    }, error =>
    {
      console.error(error);
    });
  }
}


loadUserData(init);
