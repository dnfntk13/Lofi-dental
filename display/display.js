(function () {
  var playlist = [
    { src: '/assets/display-videos/nojima-before-after-tv.mp4' },
    { src: '/assets/display-videos/angelica-before-after-tv.mp4' },
    { src: '/assets/display-videos/lofi-lab-dentistryisart-tv.mp4' },
    { src: '/assets/display-videos/lofi-lab-primemill-tv.mp4' },
    { src: '/assets/display-videos/Hongkong%20patient-tv.mp4' }
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
  // TV files have a 16:9 encoded frame with portrait content in the centre.
  // Size the frame to cover the stage; overflow clips padding, not the portrait.
  // Explicit dimensions also work on TV engines without object-fit support.
  var video = document.getElementById('displayVideo');
  function fitVideo() {
    var stage = video.parentNode;
    var width = Math.max(stage.clientWidth, stage.clientHeight * 16 / 9);
    var height = width * 9 / 16;
    video.style.width = width + 'px';
    video.style.height = height + 'px';
    video.style.left = (stage.clientWidth - width) / 2 + 'px';
    video.style.top = (stage.clientHeight - height) / 2 + 'px';
  }
  fitVideo();
  window.addEventListener('resize', fitVideo);
  window.addEventListener('load', fitVideo);
  var player = window.createTvDisplayPlayer(document.getElementById('displayVideo'), playlist, document.getElementById('displayPlay'));
  standby.className = 'display-standby is-hidden';
  updateClock(); syncClock();
  window.setInterval(updateClock, 1000);
  window.setInterval(syncClock, 600000);
  window.addEventListener('online', function () { syncClock(); });
  document.addEventListener('keydown', function (event) { if (event.keyCode === 13 || event.keyCode === 32) player.retry(); });
}());
