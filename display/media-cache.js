/* Cache clips when available, but never leave signage waiting indefinitely. */
(function (root) {
  root.cacheDisplayMedia = function (playlist, ready, options) {
    options = options || {};
    var makeRequest = options.makeRequest || function () { return new XMLHttpRequest(); };
    var urls = options.urls || root.URL;
    var later = options.setTimeout || root.setTimeout.bind(root);
    var cancel = options.clearTimeout || root.clearTimeout.bind(root);
    var allocated = [], cached = [], position = 0, request, deadline, stopped = false, delivered = false;
    function deliver() {
      if (stopped || delivered) return;
      delivered = true;
      cancel(deadline);
      if (request) { request.onload = request.onerror = request.ontimeout = null; request.abort(); }
      while (cached.length < playlist.length) cached.push({src: playlist[cached.length].src});
      ready(cached);
    }
    function next() {
      if (stopped || delivered) return;
      if (position === playlist.length) { deliver(); return; }
      var current, finished = false;
      function finish(success) {
        if (finished || stopped || delivered) return;
        finished = true;
        current.onload = current.onerror = current.ontimeout = null;
        var item = {src: playlist[position].src};
        if (success) {
          try { item = {src: urls.createObjectURL(current.response), fallbackSrc: item.src}; allocated.push(item.src); } catch (ignore) {}
        }
        cached.push(item);
        position += 1;
        next();
      }
      try {
        current = makeRequest(); request = current;
        current.open('GET', playlist[position].src, true);
        current.responseType = 'blob';
        current.timeout = 8000;
        current.onload = function () {
          finish(current.status === 200 && current.response && current.response.size > 0 &&
            /^video\//i.test(current.response.type));
        };
        current.onerror = current.ontimeout = function () { finish(false); };
        current.send(null);
      } catch (ignore) { deliver(); }
    }
    deadline = later(deliver, 12000);
    if (urls && urls.createObjectURL) next(); else deliver();
    return {destroy: function () {
      stopped = true;
      cancel(deadline);
      if (request) request.abort();
      allocated.forEach(function (url) { urls.revokeObjectURL(url); });
    }};
  };
}(window));
