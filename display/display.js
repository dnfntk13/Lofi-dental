(function () {
  var playlist = [
    { src: '/assets/display-videos/nojima-before-after-hq.mp4' },
    { src: '/assets/display-videos/angelica-before-after-hq.mp4' },
    { src: '/assets/display-videos/lofi-lab-dentistryisart-hq.mp4' },
    { src: '/assets/display-videos/lofi-lab-primemill-hq.mp4' },
    { src: '/assets/display-videos/Hongkong%20patient-hq.mp4' }
  ];
  var clock = document.getElementById('displayClock');
  var date = document.getElementById('displayDate');
  var standby = document.getElementById('displayStandby');
  var offset = 0;
  function two(value) { return value < 10 ? '0' + value : String(value); }
  function updateClock() {
    var korea = new Date(Date.now() + offset + 9 * 60 * 60 * 1000);
    clock.textContent = two(korea.getUTCHours()) + ':' + two(korea.getUTCMinutes());
    date.textContent = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][korea.getUTCDay()] + ', ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][korea.getUTCMonth()] + ' ' + korea.getUTCDate() + ', ' + korea.getUTCFullYear();
  }
  function syncClock() {
    var request = new XMLHttpRequest();
    request.open('GET', '/api/time?display=' + Date.now(), true);
    request.timeout = 8000;
    request.onload = function () {
      var serverTime = Number(request.responseText);
      if (request.status === 200 && isFinite(serverTime) && serverTime > 0) { offset = serverTime - Date.now(); updateClock(); }
    };
    request.send(null);
  }
  var player;
  window.cacheDisplayMedia(playlist, function (cachedPlaylist) {
    player = window.createDisplayPlayer({
    videos: [document.getElementById('displayVideo'), document.getElementById('displayVideoNext')],
    playlist: cachedPlaylist,
    onStandby: function (visible) { standby.className = 'display-standby' + (visible ? '' : ' is-hidden'); }
  });
    player.start();
  });
  updateClock(); syncClock();
  window.setInterval(updateClock, 1000);
  window.setInterval(syncClock, 600000);
  window.addEventListener('online', function () { syncClock(); });
  document.addEventListener('click', function () { if (player && standby.className.indexOf('is-hidden') < 0) player.retry(); });
}());
