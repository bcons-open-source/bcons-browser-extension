const browser = (typeof chrome !== "undefined") ? chrome : browser;

// This code is executed when the user clicks on the "bcons" panel of the
// devtools window. It shows the bcons console.

import { Bconsole } from "../webComponents/bconsole.js";

// The bcons console object
let bcons = null;

// The browser tab that opened the devtools window
const ourTabId = browser?.devtools?.inspectedWindow?.tabId;

// Create the console
function init()
{
  // Get console settings from user's preferences
  browser.storage.sync.get(async storageData =>
  {
    let settings = { default: {} };
    const userData = storageData?.userData;
    if (userData?.preferences?.consoleSettings)
      settings = userData.preferences.consoleSettings;

    // Create the bcons console instance
    bcons = new Bconsole({
      device: "BE",
      manageTheme: true,
      settings,
      onSettingsChange,
      userLocale: browser.i18n.getUILanguage()
    });

    // Get the current tab project
    askForProject();
  });
}

// Ask for our project, the response will come in a bconsSetProject message
function askForProject()
{
  browser.runtime.sendMessage({
    e: "bconsQueryProject",
    data: { tabId: ourTabId }
  });
}

// Listen for messages
browser.runtime.onMessage.addListener(messageReceived);

// Parse a message
function messageReceived(request)
{
  if (request?.e.substr(0, 5) != "bcons")
    return;

  if (typeof request.data != "string")
  {
    processMessage(request.e, request.data);
    return;
  }

  try {
    const data = JSON.parse(request.data);
    processMessage(request.e, data);
  }
  catch (e) {
    console.error(e);
  }
}

// React to a requested event
function processMessage(event, data)
{
  switch (event)
  {
    // This is sent when the project changes. User may have entered or left a
    // url assigned to any project.
    case "bconsSetProject":
      bcons.setProjectId(data?.project?.id || "");
      break;

    // A message has been received from bcons server, show it
    case "bconsAppMsg":
      bcons.parseBackendMessage(data);
      break;

    // This is sent when messages are received before the panel was opened
    case "bconsAddMessages":
      data.messages.forEach(messageReceived);
      break;
  }
}

// This is called when the user changes any settings value inside the console
function onSettingsChange(newSettings)
{
  // Update local storage
  browser.storage.sync.get(async storageData =>
  {
    const userData = storageData.userData;
    userData.preferences.consoleSettings = newSettings;

    browser.storage.sync.set({ userData })
      .then(() =>
      {
        browser.runtime.sendMessage({
          e: "bconsPreferencesUpdated",
          p: userData.preferences,
          u: userData.token
        });
      })
      .catch(error =>
      {
        console.error(error);
      });
  });
}

init();
