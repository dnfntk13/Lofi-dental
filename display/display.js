(function () {
  var playlist = [
    { src: '/assets/display-videos/nojima-before-after-hq.mp4', category: 'BEFORE & AFTER', title: '미소의 변화' },
    { src: '/assets/display-videos/angelica-before-after-hq.mp4', category: 'BEFORE & AFTER', title: '미소의 변화' },
    { src: '/assets/display-videos/lofi-lab-dentistryisart-hq.mp4', category: 'INSIDE OUR LAB', title: '로우파이의 제작 과정' },
    { src: '/assets/display-videos/lofi-lab-primemill-hq.mp4', category: 'INSIDE OUR LAB', title: '로우파이의 제작 과정' },
    { src: '/assets/display-videos/Hongkong%20patient-hq.mp4', category: 'SMILE STORIES', title: '로우파이에서 만난 미소' }
  ];
  var clock = document.getElementById('displayClock');
  var date = document.getElementById('displayDate');
  var standby = document.getElementById('displayStandby');
  var progress = document.getElementById('displayProgress');
  var fills = [], current = -1, offset = 0;
  function two(value) { return value < 10 ? '0' + value : String(value); }
  function updateClock() {
    var korea = new Date(Date.now() + offset + 9 * 60 * 60 * 1000);
    clock.textContent = two(korea.getUTCHours()) + ':' + two(korea.getUTCMinutes());
    date.textContent = (korea.getUTCMonth() + 1) + '월 ' + korea.getUTCDate() + '일 · ' + ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'][korea.getUTCDay()];
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
  playlist.forEach(function () {
    var segment = document.createElement('span');
    var fill = document.createElement('span');
    segment.className = 'progress-segment'; fill.className = 'progress-fill';
    segment.appendChild(fill); progress.appendChild(segment); fills.push(fill);
  });
  var player = window.createDisplayPlayer({
    videos: [document.getElementById('displayVideo'), document.getElementById('displayVideoNext')],
    playlist: playlist,
    onStandby: function (visible) { standby.className = 'display-standby' + (visible ? '' : ' is-hidden'); },
    onItem: function (index) {
      current = index;
      document.getElementById('displayCategory').textContent = playlist[index].category;
      document.getElementById('displayTitle').textContent = playlist[index].title;
      document.getElementById('displayCount').textContent = two(index + 1) + ' / ' + two(playlist.length);
      fills.forEach(function (fill, i) { fill.style.width = i < index ? '100%' : '0%'; });
    },
    onProgress: function (value) { if (current >= 0) fills[current].style.width = value * 100 + '%'; }
  });
  player.start();
  updateClock(); syncClock();
  window.setInterval(updateClock, 1000);
  window.setInterval(syncClock, 600000);
  window.addEventListener('online', function () { player.retry(); syncClock(); });
  document.addEventListener('click', function () { if (standby.className.indexOf('is-hidden') < 0) player.retry(); });
}());
