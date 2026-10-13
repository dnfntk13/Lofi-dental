(() => {
  // Clinic coordinates from its existing Google Maps place link.
  const clinic = { latitude: 37.5232763, longitude: 127.0277118 };
  const radians = degrees => degrees * Math.PI / 180;
  function distanceKm(latitude, longitude) {
    const dLat = radians(clinic.latitude - latitude);
    const dLon = radians(clinic.longitude - longitude);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(latitude)) *
      Math.cos(radians(clinic.latitude)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
  }
  for (const section of document.querySelectorAll('[data-visitor-distance]')) {
    const button = section.querySelector('button');
    const result = section.querySelector('[role="status"]');
    const korean = section.dataset.distanceLang === 'ko';
    const initialLabel = button.textContent;
    button.addEventListener('click', () => {
      section.removeAttribute('data-distance-ready');
      if (!navigator.geolocation || !window.isSecureContext) {
        result.textContent = korean ? '이 브라우저에서는 위치를 확인할 수 없어요. Google Maps에서 길찾기를 이용해주세요.' : 'Location is unavailable in this browser. Please use directions on Google Maps.';
        return;
      }
      button.disabled = true;
      button.textContent = korean ? '위치 확인 중…' : 'Finding your location…';
      result.textContent = korean ? '위치 권한을 허용해주세요.' : 'Please allow location access.';
      const reset = () => { button.disabled = false; button.textContent = initialLabel; };
      // Coordinates are used only in this page; never stored or sent to our server.
      navigator.geolocation.getCurrentPosition(position => {
        reset();
        const { latitude, longitude, accuracy } = position.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
          result.textContent = korean ? '위치를 확인하지 못했어요. 다시 시도해주세요.' : 'Could not determine your location. Please try again.';
          return;
        }
        const km = new Intl.NumberFormat(korean ? 'ko-KR' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(distanceKm(latitude, longitude));
        result.textContent = korean ? `내 위치에서 치과까지 약 ${km} km · 직선거리` : `About ${km} km to the clinic · straight-line distance`;
        if (Number.isFinite(accuracy) && accuracy > 1000) result.textContent += korean ? ' (위치 정확도가 낮을 수 있어요)' : ' (location accuracy may be low)';
        section.setAttribute('data-distance-ready', '');
      }, error => {
        reset();
        if (error.code === 1) result.textContent = korean ? '위치 권한이 꺼져 있어요. 브라우저에서 허용한 뒤 다시 눌러주세요.' : 'Location access was denied. Enable it in your browser and try again.';
        else if (error.code === 3) result.textContent = korean ? '위치 확인 시간이 초과됐어요. 다시 시도해주세요.' : 'Location request timed out. Please try again.';
        else result.textContent = korean ? '현재 위치를 확인할 수 없어요. 다시 시도하거나 Google Maps에서 길찾기를 이용해주세요.' : 'Your location is unavailable. Try again or use directions on Google Maps.';
      }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
    });
  }
})();
