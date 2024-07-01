const browser = (typeof chrome !== "undefined") ? chrome : browser;

// Base URL of bcons API
const apiBaseUrl = "https://bcons.dev/api";

// The current tab url
let currentUrl = null;

// When service worker is installed update user data (and thus net request
// rules).
browser.runtime.onInstalled.addListener(async function ()
{
  browser.storage.sync.get(async data =>
  {
    updateUserData(data?.userData?.token);
  });
});

/**
 * Retrieves user data from the API.
 * @param token The user's token.
 * @param callback If set this function will be called with the updated user
 *                 data.
 */
function updateUserData(token, callback)
{
  if (!token)
  {
    if (callback)
      callback({ e: "updateUser", success: false });

    return;
  }

  const url = apiBaseUrl + "/userData/"+ token + "?fullData=true";

  fetch(url).then(response =>
  {
    if (response.status === 200)
      return response.json();
    else if (callback)
      callback({ e: "updateUser", success: false });
  })
  .then(data => {
    if (!data?.data?.userData && callback)
      callback({ e: "updateUser", success: false });
    else
    {
      // Data was downloaded successfully
      const userData = data.data.userData;

      // Update request rules
      updateNetRequestRules(userData);

      // Save in synced local storage
      chrome.storage.sync.set({ userData }).then(() =>
      {
        if (callback)
          callback({ e: "updateUser", success: true, userData });
      })
      .catch(error => { console.error(error); });
    }
  })
  .catch(error => {
    if (callback)
      callback({ e: "updateUser", success: false, error });
  });
}

/**
 * Creates rules for network requests so that any request made to any of the
 * domains of the user's projects include the Bcons-User header with the
 * user token.
 * @param {*} userData Object with user data.
 */
async function updateNetRequestRules(userData)
{
  const existingRules = await browser.declarativeNetRequest.getDynamicRules();

  const domains = [];
  userData?.projects?.forEach(p => domains.push(...p.a_domains));

  const newRules = [{
    id: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders: [
        {
          header: "Bcons-User",
          value: userData?.token,
          operation: "set"
        }
      ]
    },
    condition: {
      requestDomains: domains,
      resourceTypes: ["main_frame", "xmlhttprequest"]
    }
  }];

  browser.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingRules.map((rule) => rule.id),
    addRules: newRules
  });

  const tmp = await browser.declarativeNetRequest.getDynamicRules();
  //console.log(tmp);
}

/**
 * Sends a message to the extension options page.
 * @param message Message to send
 * @returns
 */
function sendMessageToOptionsPage(message)
{
  browser.runtime.sendMessage(message);
}

// Listening to onBeforeNavigate and onHistoryStateUpdated we get notified of
// regular site navigation and SPA url changes.
browser.webNavigation.onHistoryStateUpdated.addListener(navigationEvent);
browser.webNavigation.onBeforeNavigate.addListener(navigationEvent);

function navigationEvent(details)
{
  if (!currentUrl || currentUrl != details.url)
  {
    // Emit the updated event so devtools.js can:
    // - Send the page reloaded event through Fry
    // - Check if the new page domain is assigned to a project
    const message = {
      e: "bconsTabUpdated",
      tabId: details.tabId,
      url: details.url
    };
    browser.runtime.sendMessage(message);

    currentUrl = details.url;
  }
}

// Listener for our own extension messages
browser.runtime.onMessage.addListener((request, sender, sendResponse) =>
{
  // Request for updating user's data
  if (request.e == "updateUserData")
  {
    if (!request.token)
    {
      browser.storage.sync.get(async data =>
      {
        updateUserData(data?.userData?.token, sendMessageToOptionsPage);
      });
    }
    else updateUserData(request.token, sendMessageToOptionsPage);

    return true;
  }

  // Preferences have changed
  if (request.e == "bconsPreferencesUpdated")
  {
    const userToken = request.u;
    const requestOptions = {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences: request.p })
    };

    const url = apiBaseUrl + "/userPreferences/" + userToken;
    fetch(url, requestOptions)
      .then(response =>
      {
        if (!response.ok)
          throw new Error('API save preferences request failed');
      })
      .catch(error =>
      {
        console.error('Error saving preferences to API:', error);
      });
  }

  // A message was received from the WS server, we must send it to the
  // content script so it can be shown on the devtools console.
  if (request.e == "bconsAppMsg")
  {
    browser.tabs.sendMessage(request.tabId, request);
  }

  // Version requested
  if (request.e == "version")
    sendResponse(browser.runtime.getManifest().version);

  // Registered user token requested. This is used to check if the user has
  // correctly entered their token in the extension, so we will only return a
  // part of the token.
  if (request.e == "userToken")
  {
    browser.storage.sync.get(async data =>
    {
      const token = data?.userData?.token;
      if (!token)
        return null;

      const safeTokenVersion = token.substring(0, 6) + token.slice(-6);
      const msg = { e: "bconsUserToken", token: safeTokenVersion };
      browser.tabs.sendMessage(sender.tab.id, msg);
    });
  }

});

