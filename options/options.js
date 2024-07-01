// User token input debouncer
let tokenDebouncer = null;

// Get user data fron storage, if found refresh it
chrome.storage.sync.get(data => {
  if (data?.userData?.token)
  {
    document.querySelector("#userTokenInput").value = data.userData.token;
    checkUserToken(data.userData.token);
  }
});

// Translate UI strings
document.querySelectorAll("[data-i18n]").forEach(e => {
  e.innerHTML = T_(e.dataset.i18n);
});

document.querySelectorAll("[data-i18n-placeholder]").forEach(e => {
  e.setAttribute(
    "placeholder",
    T_(e.dataset.i18nPlaceholder)
  );
});

// Handle events for user token
document.querySelector("#userTokenInput").addEventListener("input", e => {
  const token = e.target.value;

  if (tokenDebouncer)
    clearTimeout(tokenDebouncer);

  tokenDebouncer = setTimeout(() => {
    checkUserToken(token)
  }, 1000);
});

document.querySelector("#reloadData").addEventListener("click", () => {
  checkUserToken(document.querySelector("#userTokenInput").value);
});

function checkUserToken(token)
{
  document.querySelector("#userToken").className = "loading";
  document.querySelector(".userTokenErrorMsg").innerHTML = "";

  const message = { e: "updateUserData", token };
  chrome.runtime.sendMessage(message);
}

function renderUserData(userData)
{
  document.querySelector("#userName").innerHTML = userData.name;

  const numProjects = userData.projects.length;
  document.querySelector("#numProjects").textContent = `(${numProjects})`;

  const table = `
  <table>
    <thead>
      <tr>
        <th>${T_("project")}</th>
        <th>${T_("domains")}</th>
      </tr>
    </thead>
    <tbody id="projectsTable"></tbody>
  </table>`;

  document.querySelector(".projectsList").innerHTML = table;
  const projects = document.querySelector("#projectsTable");

  userData.projects.forEach(p =>
  {
    const tr = document.createElement("tr");

    const nameTd = newElement("td", p.name);
    nameTd.className = "name";
    tr.appendChild(nameTd);

    const domainsTd = document.createElement("td");
    domainsTd.className = "domains";

    if (p.a_domains.length)
      domainsTd.innerHTML = p.a_domains.join("<br/>");
    else domainsTd.innerHTML = T_("noDomainsDefined");

    tr.appendChild(domainsTd);

    projects.appendChild(tr);
  });

  document.querySelector(".userDataContent").style.display = "block";
}


function T_(code)
{
  return chrome.i18n.getMessage(code);
}

function newElement(tag, content)
{
  const e = document.createElement(tag);
  e.innerHTML = content;

  return e;
}

function copyToClipboard(textToCopy) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(textToCopy)
      .catch((err) => {
        console.error('Error copying text to clipboard: ', err);
      });
  } else {
    console.error('Clipboard API is not available in this browser.');
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) =>
{
  if (message.e == "updateUser")
  {
    if (!message.success)
    {
      if (message.error)
      {
        console.error('Fetch error:', message.error);
        document.querySelector(".userTokenErrorMsg").innerHTML = `<p>${message.error}</p>`;
        document.querySelector("#userToken").className = "error";
      }
      else
      {
        document.querySelector("#userToken").className = "error";
        document.querySelector(".userTokenErrorMsg").innerHTML = `<p>${T_("userTokenAuthError")}</p>`;
        document.querySelector(".userDataContent").style.display = "none";
      }
    }
    else
    {
      if (message.userData.status == "inactive")
      {
        document.querySelector("#userToken").className = "error";
        document.querySelector(".userTokenErrorMsg").innerHTML = `<p>${T_("userInactiveError")}</p>`;
        document.querySelector(".userDataContent").style.display = "none";
      }
      else
      {
        document.querySelector("#userToken").className = "success";
        renderUserData(message.userData);
      }
    }
  }
});
