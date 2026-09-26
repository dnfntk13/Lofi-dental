/* Download complete clips before playback so video buffering never competes with playback. */
(function (root) {
  root.cacheDisplayMedia = function (playlist, ready, options) {
    options = options || {};
    var makeRequest = options.makeRequest || function () { return new XMLHttpRequest(); };
    var urls = options.urls || root.URL;
    var later = options.setTimeout || root.setTimeout.bind(root);
    var cancel = options.clearTimeout || root.clearTimeout.bind(root);
    var cached = [], position = 0, request, retryTimer, stopped = false;
    function next() {
      if (stopped) return;
      if (position === playlist.length) { ready(cached); return; }
      var current = makeRequest(), finished = false;
      request = current;
      function finish(success) {
        if (finished || stopped) return;
        finished = true;
        current.onload = current.onerror = current.ontimeout = null;
        if (success) {
          cached.push({src: urls.createObjectURL(current.response)});
          position += 1;
          next();
        } else {
          // Keep completed downloads and retry just the failed clip.
          retryTimer = later(next, 5000);
        }
      }
      current.open('GET', playlist[position].src, true);
      current.responseType = 'blob';
      current.timeout = 60000;
      current.onload = function () {
        finish(current.status === 200 && current.response && current.response.size > 0 &&
          /^video\//i.test(current.response.type));
      };
      current.onerror = current.ontimeout = function () { finish(false); };
      current.send(null);
    }
    next();
    return {destroy: function () {
      stopped = true;
      cancel(retryTimer);
      if (request) request.abort();
      cached.forEach(function (item) { urls.revokeObjectURL(item.src); });
    }};
  };
}(window));
