/* ES5 syntax for signage browsers. Preserve the last frame while the next video loads. */
(function (root) {
  root.createDisplayPlayer = function (options) {
    var videos = options.videos, playlist = options.playlist;
    var now = options.now || Date.now;
    var later = options.setTimeout || root.setTimeout.bind(root);
    var cancel = options.clearTimeout || root.clearTimeout.bind(root);
    var repeat = options.setInterval || root.setInterval.bind(root);
    var stopRepeat = options.clearInterval || root.clearInterval.bind(root);
    var active = -1, pending = -1, index = -1, attempt = 0, failures = 0;
    var loadTimer, retryTimer, fadeTimer, watchdog;
    var progressAt = now(), lastTime = -1, disposed = false, started = false;
    function notify(name, value) { if (options[name]) options[name](value); }
    function prepare(slot, item) {
      var video = videos[slot];
      if (video.getAttribute('src') !== playlist[item].src || video.error) {
        video.src = playlist[item].src;
        video.load();
      }
      video.muted = true;
      video.volume = 0;
    }
    function play(slot, token) {
      try {
        var promise = videos[slot].play();
        if (promise && promise.catch) promise.catch(function () {
          if (token === attempt && pending === slot) fail(token);
        });
      } catch (error) { if (token === attempt && pending === slot) fail(token); }
    }
    function fail(token) {
      if (disposed || token !== attempt) return;
      cancel(loadTimer); cancel(fadeTimer);
      attempt += 1;
      if (pending >= 0) videos[pending].pause();
      pending = -1;
      failures += 1;
      if (failures >= playlist.length) {
        active = -1;
        videos.forEach(function (video) { video.pause(); video.className = 'display-video'; });
        notify('onStandby', true);
        retryTimer = later(function () { failures = 0; request((index + 1) % playlist.length); }, 30000);
      } else {
        retryTimer = later(function () { request((index + 1) % playlist.length); }, 250);
      }
    }
    function request(item) {
      if (disposed) return;
      cancel(retryTimer); cancel(loadTimer); cancel(fadeTimer);
      var slot = active === 0 ? 1 : 0;
      var token = ++attempt;
      index = item; pending = slot;
      var video = videos[slot];
      video.pause();
      video.className = 'display-video';
      video.onplaying = function () {
        if (disposed || token !== attempt || pending !== slot) return;
        cancel(loadTimer);
        var previous = active;
        active = slot; pending = -1; failures = 0;
        progressAt = now(); lastTime = video.currentTime;
        video.className = 'display-video is-active';
        if (previous >= 0) videos[previous].className = 'display-video';
        notify('onStandby', false); notify('onItem', item);
        fadeTimer = later(function () {
          if (disposed || token !== attempt) return;
          var spare = slot === 0 ? 1 : 0;
          videos[spare].pause();
          videos[spare].onerror = null;
          prepare(spare, (item + 1) % playlist.length);
        }, 700);
      };
      video.onended = function () { if (active === slot && pending < 0 && token === attempt) request((item + 1) % playlist.length); };
      video.onerror = function () { if (token === attempt) fail(token); };
      video.ontimeupdate = function () {
        if (active !== slot || token !== attempt) return;
        if (video.currentTime !== lastTime) { lastTime = video.currentTime; progressAt = now(); }
        notify('onProgress', isFinite(video.duration) && video.duration > 0 ? Math.max(0, Math.min(1, video.currentTime / video.duration)) : 0);
      };
      loadTimer = later(function () { fail(token); }, 15000);
      prepare(slot, item);
      try { video.currentTime = 0; } catch (ignore) {}
      play(slot, token);
    }
    function start() {
      if (started || disposed || !playlist.length) return;
      started = true;
      notify('onStandby', true);
      request(0);
      watchdog = repeat(function () {
        if (active < 0 || pending >= 0) return;
        var video = videos[active];
        if (now() - progressAt >= 15000) { fail(attempt); return; }
        if (video.paused && !video.ended) play(active, attempt);
      }, 3000);
    }
    return {
      start: start,
      retry: function () { if (!disposed && pending < 0) request(index < 0 ? 0 : index); },
      destroy: function () {
        disposed = true; attempt += 1;
        cancel(loadTimer); cancel(retryTimer); cancel(fadeTimer); stopRepeat(watchdog);
        videos.forEach(function (video) { video.pause(); video.onplaying = video.onended = video.onerror = video.ontimeupdate = null; });
      }
    };
  };
}(window));
