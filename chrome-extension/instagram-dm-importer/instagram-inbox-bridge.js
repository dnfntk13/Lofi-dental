(() => {
  const REQUEST_EVENT = "lofi:instagram-inbox-request";
  const RESPONSE_EVENT = "lofi:instagram-inbox-response";
  const INITIAL_QUERY_NAME = "PolarisDirectInboxQuery";
  const PAGINATION_QUERY_NAME = "IGDThreadListOffMsysPaginationQuery";
  const PAGINATION_DOC_ID = "28035404249479587";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const LABEL_REFRESH_GRACE_MS = 30 * 60 * 1000;
  const originalFetch = window.fetch.bind(window);
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;
  let inboxRequestBody = "";
  let inboxMailbox = null;
  let inboxCapturedAt = 0;

  function isInitialInboxRequest(body) {
    try {
      return new URLSearchParams(body).get("fb_api_req_friendly_name") === INITIAL_QUERY_NAME;
    } catch {
      return false;
    }
  }

  function captureInitialInbox(body, payload) {
    const mailbox = payload?.data?.get_slide_mailbox_for_iris_subscription;
    if (!mailbox?.id || !mailbox?.threads_by_folder) return;
    inboxRequestBody = body;
    inboxMailbox = mailbox;
    inboxCapturedAt = Date.now();
  }

  window.fetch = async (...args) => {
    const [input, init] = args;
    const bodyPromise = typeof init?.body === "string"
      ? Promise.resolve(init.body)
      : input instanceof Request
        ? input.clone().text().catch(() => "")
        : Promise.resolve("");
    const response = await originalFetch(...args);
    const responseClone = response.clone();

    Promise.all([bodyPromise, responseClone.json()])
      .then(([body, payload]) => {
        if (isInitialInboxRequest(body)) captureInitialInbox(body, payload);
      })
      .catch(() => {});

    return response;
  };

  XMLHttpRequest.prototype.open = function (...args) {
    this.__lofiRequestUrl = String(args[1] || "");
    return originalXhrOpen.apply(this, args);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const requestBody = typeof body === "string" ? body : "";
    if (this.__lofiRequestUrl.includes("/api/graphql") && isInitialInboxRequest(requestBody)) {
      this.addEventListener("load", () => {
        try {
          const payload = this.responseType === "json" ? this.response : JSON.parse(this.responseText);
          captureInitialInbox(requestBody, payload);
        } catch {
          // Ignore unrelated or non-JSON GraphQL responses.
        }
      }, { once: true });
    }
    return originalXhrSend.call(this, body);
  };

  function compactThread(edge) {
    const thread = edge?.node?.as_ig_direct_thread;
    const threadFbid = String(thread?.thread_fbid || thread?.id || "");
    const timestamp = Number(thread?.last_activity_timestamp_ms || 0);
    if (!threadFbid || !timestamp) return null;
    const participant = Array.isArray(thread?.participants) ? thread.participants[0] : null;
    const title = String(thread?.thread_title || participant?.full_name || participant?.username || "Instagram DM");
    return {
      signature: `api:${threadFbid}`,
      threadFbid,
      title,
      text: title,
      url: `${location.origin}/direct/t/${threadFbid}/`,
      timestamp,
    };
  }

  async function fetchNextFolder(folder) {
    const body = new URLSearchParams(inboxRequestBody);
    body.set("fb_api_req_friendly_name", PAGINATION_QUERY_NAME);
    body.set("doc_id", PAGINATION_DOC_ID);
    body.set("variables", JSON.stringify({
      count: 15,
      cursor: folder.page_info.end_cursor,
      folder: "INBOX",
      id: inboxMailbox.id,
      newer_than_timestamp_ms: null,
      __relay_internal__pv__IGDPinnedThreadsRenderEnabledGKrelayprovider: true,
      __relay_internal__pv__IGDMaxUnreadMessagesCountrelayprovider: 5,
      __relay_internal__pv__PolarisAIGMAccountLabelEnabledrelayprovider: false,
      __relay_internal__pv__IGDThreadListActionsEnabledGKrelayprovider: true,
    }));
    const response = await originalFetch("/api/graphql", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!response.ok) throw new Error(`Instagram inbox pagination failed (${response.status})`);
    const payload = await response.json();
    if (payload?.errors?.length) throw new Error(payload.errors[0]?.message || "Instagram inbox pagination failed");
    return payload?.data?.fetch__SlideMailbox?.threads_by_folder || null;
  }

  async function collectInboxThreads(daysBack, maxThreads) {
    if (!inboxMailbox || !inboxRequestBody) {
      throw new Error("Instagram inbox data is not ready. Reload the inbox and try again.");
    }

    const cutoff = inboxCapturedAt - ((daysBack + 1) * DAY_MS + LABEL_REFRESH_GRACE_MS);
    const collected = [];
    const seen = new Set();
    let folder = inboxMailbox.threads_by_folder;

    for (let page = 0; page < 50 && folder && collected.length < maxThreads; page += 1) {
      const pageThreads = (folder.edges || []).map(compactThread).filter(Boolean);
      for (const thread of pageThreads) {
        if (thread.timestamp < cutoff || seen.has(thread.threadFbid)) continue;
        seen.add(thread.threadFbid);
        collected.push(thread);
        if (collected.length >= maxThreads) break;
      }

      const crossedCutoff = pageThreads.some((thread) => thread.timestamp < cutoff);
      if (crossedCutoff || !folder.page_info?.has_next_page || collected.length >= maxThreads) break;
      folder = await fetchNextFolder(folder);
    }

    return collected;
  }

  window.addEventListener(REQUEST_EVENT, async (event) => {
    const requestId = String(event.detail?.requestId || "");
    if (!requestId) return;
    try {
      const daysBack = [3, 7].includes(Number(event.detail?.daysBack)) ? Number(event.detail.daysBack) : 3;
      const maxThreads = Math.min(Math.max(Number(event.detail?.maxThreads || 500), 1), 500);
      const threads = await collectInboxThreads(daysBack, maxThreads);
      window.dispatchEvent(new CustomEvent(RESPONSE_EVENT, { detail: { requestId, ok: true, threads } }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent(RESPONSE_EVENT, {
        detail: { requestId, ok: false, message: error.message || "Instagram inbox pagination failed" },
      }));
    }
  });
})();