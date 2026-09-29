/* Single visible decoder and ordinary MP4 URLs for built-in TV browsers. */
(function (root) {
  root.createTvDisplayPlayer = function (video, playlist, button) {
    var index = 0, stopped = false, token = 0, lastTime = -1, lastProgress = Date.now();
    var blocked = false, failures = 0, retryTimer;
    function hideButton() { button.style.display = 'none'; blocked = false; }
    function showButton() { blocked = true; button.style.display = 'block'; button.focus(); }
    function play() {
      var generation = token;
      try {
        var result = video.play();
        if (result && result.catch) result.catch(function (error) {
          if (generation !== token || stopped) return;
          if (error && error.name === 'NotAllowedError') showButton();
          else if (!error || error.name !== 'AbortError') fail();
        });
      } catch (error) { showButton(); }
    }
    function load() {
      if (stopped) return;
      root.clearTimeout(retryTimer); token += 1;
      hideButton(); lastTime = -1; lastProgress = Date.now();
      video.pause(); video.muted = true; video.defaultMuted = true; video.volume = 0;
      video.className = 'display-video is-active';
      video.src = playlist[index].src; video.load(); play();
    }
    function fail() {
      if (stopped || blocked || retryTimer) return;
      video.pause(); failures += 1;
      retryTimer = root.setTimeout(function () {
        retryTimer = null;
        index = (index + 1) % playlist.length; load();
      }, failures >= playlist.length ? 30000 : 500);
    }
    video.onplaying = function () { hideButton(); failures = 0; lastProgress = Date.now(); };
    video.ontimeupdate = function () {
      if (video.currentTime !== lastTime) { lastTime = video.currentTime; lastProgress = Date.now(); }
    };
    video.onended = function () { index = (index + 1) % playlist.length; load(); };
    video.onerror = fail;
    button.onclick = function () { hideButton(); lastProgress = Date.now(); play(); };
    var watchdog = root.setInterval(function () {
      if (!stopped && !blocked && !retryTimer && Date.now() - lastProgress > 20000) fail();
    }, 3000);
    load();
    return {retry: function () { if (blocked) button.onclick(); }, destroy: function () {
      stopped = true; token += 1; root.clearInterval(watchdog); root.clearTimeout(retryTimer); video.pause();
      video.onplaying = video.ontimeupdate = video.onended = video.onerror = button.onclick = null;
    }};
  };
}(window));
