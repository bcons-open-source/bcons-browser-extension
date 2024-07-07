/*
  This class shows a bcons debug message on the devtools console.

  Only one method is exposed:

  - show(bconsMsg, preferences, decryptPass):
      if the provided preferences object permits, it displays the bcons debug
      message on the devtools console.

  The preferences object may contain the following members:

  - sendConsole: it must be true for the message to be shown on the console.
  - sendConsoleTabs: array of strings, where each string indicates that
                     messages of that type should be displayed on the console.
                     Possible values are "l" (log), "w" (warning), "e" (error),
                     "r" (request), "s" (session), "c" (cookies).
  - hideConsoleIcon: if true, the icon for the message type won't be shown.
  - hideConsoleUrl: if true, the URL of the request that generated the message
                    won't be shown.
  - hideConsoleFile: if true, the file name and line where the message was
                     created won't be shown.

*/

class Bcons2devtools
{
  static groupStack = [];

  static async show(bconsMsg, preferences, decryptPass = null)
  {
    if (
      !preferences ||
      !preferences.sendConsole ||
      !preferences.sendConsoleTabs ||
      !Array.isArray(preferences.sendConsoleTabs) ||
      !preferences.sendConsoleTabs.includes(bconsMsg.mt)
    )
    {
      return;
    }

    // Decrypt message
    if (bconsMsg.e == 1)
    {
      if (decryptPass)
      {
        const decrypted = await this.decryptMessage(bconsMsg, decryptPass);
        if (decrypted)
          bconsMsg = decrypted;
        else
        {
          console.warn("Can't show message: invalid passphrase provided to Bcons2devtools::show");
          return;
        }
      }
      else
      {
        console.warn("Can't show message: no decrypt passphrase provided to Bcons2devtools::show");
        return;
      }
    }

    // Filter out messages from ignored domains
    if (bconsMsg.h)
    {
      const hiddenDomains = preferences.hiddenDomains?.trim();
      if (
        hiddenDomains &&
        hiddenDomains.split(",").find(d => d.trim() == bconsMsg.h)
      )
        return null;
    }
    // Filter out messages from ignored URLs
    const endpoint = bconsMsg.url?.split("?")[0];
    if (endpoint)
    {
      const hiddenUrls = preferences.hiddenUrls?.trim();
      if (
        hiddenUrls &&
        hiddenUrls.split(",").find(d => d.trim() == endpoint)
      )
        return null;
    }

    // Filter out messages from ignored files
    const fn = bconsMsg.fn?.split("/").pop();
    if (fn)
    {
      const hiddenFiles = preferences.hiddenFiles?.trim();
      if (
        hiddenFiles &&
        hiddenFiles.split(",").find(d => d.trim() == fn)
      )
        return null;
    }


    // Console clear requested
    if (bconsMsg.x && bconsMsg.x.clearConsole)
      console.clear();

    // Check for group start / end
    if (bconsMsg.x && bconsMsg.x.groupEnd)
    {
      console.groupEnd();
      this.groupStack.pop();
      return;
    }

    if (bconsMsg.x && bconsMsg.x.groupData)
    {
      if (!this.groupStack.includes(bconsMsg.x.groupData.id))
      {
        this.groupStack.push(bconsMsg.x.groupData.id);

        if (bconsMsg.x.groupData.collapsed)
          console.groupCollapsed(bconsMsg.x.groupData.label);
        else console.group(bconsMsg.x.groupData.label);
      }
    }
    else
    {
      if (this.groupStack.length)
      {
        console.groupEnd();
        this.groupStack.pop();
      }
    }

    // Ping messages
    if (bconsMsg.x.ping)
    {
      if (bconsMsg.x.ping.trim())
        bconsMsg.m = bconsMsg.x.ping.trim();
      else
      {
        bconsMsg.m = `${bconsMsg.fn.split("/").pop()} (${bconsMsg.fl})`
      }
    }

    // Trace messages
    if (bconsMsg.x && bconsMsg.x.traceIsMsg && bconsMsg.x.phpBt)
    {
      bconsMsg.m = bconsMsg.x.phpBt.map(e =>
        `\n${e.file} (${e.line})\n${e.code.trim()}`
      ).join("\n");
      bconsMsg.mt = 't';
    }

    // Show message
    let content = bconsMsg.m;
    switch (bconsMsg.ct)
    {
      case "d":
      case "r":
        content = JSON.parse(content);
        break;

      default:
        const tmp = document.createElement("div");
        tmp.innerHTML = content;
        content = tmp.textContent;
        break;
    }

    const params = [content];
    const url = bconsMsg.v + " " + endpoint;
    const file = (bconsMsg.fn && bconsMsg.fl)
                 ? `${bconsMsg.fn.split("/").pop()} (${bconsMsg.fl})`
                 : "";
    let values = "";

    if (bconsMsg.x.ping)
      params.unshift(this.dataItem("#373", false, true));

    if (!preferences.hideConsoleFile)
      params.unshift(this.dataItem("#454", false, !bconsMsg.x.ping));

    if (!preferences.hideConsoleUrl)
      params.unshift(this.dataItem("#006ca2", false, preferences.hideConsoleFile && !bconsMsg.x.ping));

    if (!preferences.hideConsoleDomain)
      params.unshift(this.dataItem("#a37500", false, preferences.hideConsoleFile && preferences.hideConsoleUrl));

    params.unshift(this.dataItem(this.msgTypeColor(bconsMsg.mt), true, preferences.hideConsoleFile && preferences.hideConsoleUrl && preferences.hideConsoleDomain));

    values += "%c" + bconsMsg.mt.toUpperCase();

    if (!preferences.hideConsoleDomain)
      values += "%c" + bconsMsg.h;

    if (!preferences.hideConsoleUrl)
      values += "%c" + url;

    if (!preferences.hideConsoleFile)
      values += "%c" + file;

    if (bconsMsg.x.ping)
      values += "%cPING";

    params.unshift(values);

    if (bconsMsg.ct == "r")
      console.table(content, bconsMsg.x.columns);
    else console.log.apply(console, params);
  }

  static msgTypeColor(msgType)
  {
    switch (msgType)
    {
      case "w": return "#a09c1c";
      case "e": return "#a01c1c";
      case "r": return "#1ca03b";
      case "s": return "#881ca0";
      case "c": return "#211ca0";
      case "l":
      default:
        return "#1c86a0";
    }
  }

  static dataItem(color, roundStart = false, roundEnd = false)
  {
    let borders = "";

    if (roundStart)
      borders += "border-start-start-radius: 3px;border-end-start-radius: 3px;";

    if (roundEnd)
      borders += "border-end-end-radius: 3px;border-start-end-radius: 3px;";

    return `${borders}color:white;padding:1px 5px;background:${color};`;
  }

  static async decryptMessage(data, decryptPass)
  {
    if (!data.e)
      return data;

    if (!decryptPass)
      return null;

    // Message content
    data.m = await this.decrypt(data.m, decryptPass);
    if (!data.m)
      return null;

    // Request domain
    data.h = await this.decrypt(data.h, decryptPass);
    if (!data.h)
      return null;

    // Request URL
    data.url = await this.decrypt(data.url, decryptPass);
    if (!data.url)
      return null;

    // Request method
    data.v = await this.decrypt(data.v, decryptPass);
    if (!data.v)
      return null;

    // File info
    data.fl = await this.decrypt(data.fl, decryptPass);
    if (!data.fl)
      return null;
    data.fn = await this.decrypt(data.fn, decryptPass);
    if (!data.fn)
      return null;

    // Extra data
    data.x = await this.decrypt(data.x, decryptPass);
    if (!data.x)
      return null;
    else data.x = JSON.parse(data.x);

    // Message has been decrypted, remove the encryption flag
    data.e = 0;
    return data;
  }

  // Based on code kindly provided by ChatGPT, we love you, please
  // don't kill us!
  static async decrypt(encryptedData, passphrase)
  {
    // Decode Base64 to ArrayBuffer
    const dataBuffer = this.base64ToArrayBuffer(encryptedData);

    // Extract the IV (first 16 bytes)
    const iv = dataBuffer.slice(0, 16);

    // The rest is the ciphertext
    const ciphertext = dataBuffer.slice(16);

    // Generate the cryptographic key from the passphrase
    const keyMaterial = await this.getKeyMaterial(passphrase);
    const cryptoKey = await window.crypto.subtle.importKey(
      "raw",
      keyMaterial,
      { name: "AES-CBC" },
      false,
      ["decrypt"]
    );

    // Decrypt the data
    try
    {
      const decrypted = await window.crypto.subtle.decrypt(
        {
          name: "AES-CBC",
          iv
        },
        cryptoKey,
        ciphertext
      );

      // Convert decrypted ArrayBuffer back to a string
      return new TextDecoder().decode(decrypted);
    } catch (e)
    {
      return null;
    }
  }

  static base64ToArrayBuffer(base64)
  {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++)
      bytes[i] = binaryString.charCodeAt(i);

    return bytes.buffer;
  }

  static async getKeyMaterial(passphrase)
  {
    const encoder = new TextEncoder();
    return window.crypto.subtle.digest(
      { name: "SHA-256" },
      encoder.encode(passphrase)
    );
  }
}
