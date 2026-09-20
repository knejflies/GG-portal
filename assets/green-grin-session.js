(function () {
  "use strict";

  const PREFIX = "greenGrinPersistentSessionV1";
  const storageKey = (mode) => `${PREFIX}:${mode}`;

  function read(mode) {
    try { return window.localStorage.getItem(storageKey(mode)) || ""; }
    catch (_error) { return ""; }
  }

  function write(mode, token) {
    try {
      if (token) window.localStorage.setItem(storageKey(mode), token);
      else window.localStorage.removeItem(storageKey(mode));
    } catch (_error) {
      // Persistent storage can be unavailable in private browsing.
    }
  }

  function clear(mode) {
    write(mode, "");
  }

  function clearAll() {
    clear("admin");
    clear("employee");
  }

  async function post(endpoint, body) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Your saved sign-in could not be verified.");
    return data;
  }

  async function create(endpoint, mode, pin) {
    const data = await post(endpoint, { action: "create", mode, pin });
    if (!data.token) throw new Error("A device session could not be created.");
    write(mode, data.token);
    return data;
  }

  async function restore(endpoint, mode) {
    const token = read(mode);
    if (!token) return "";
    try {
      const data = await post(endpoint, { action: "restore", mode, token });
      return data.pin || "";
    } catch (_error) {
      clear(mode);
      return "";
    }
  }

  window.GreenGrinSession = {
    create,
    restore,
    clear,
    clearAll,
    has: (mode) => Boolean(read(mode))
  };
})();
