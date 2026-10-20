// Verified in Google Ads > Data manager > lofiesthetic on 2026-10-20.
// This is Lofi's tag, not Concourse's GTM container.
export const googleTagId = 'G-S9ZX4LDDRR';

const publicPages = new Set([
  '/index.html', '/english.html', '/english/index.html',
  '/english-dentist-seoul.html', '/teeth-whitening-seoul.html',
  '/smile-makeover-seoul.html', '/dental-implants-seoul.html',
  '/full-mouth-restoration-seoul.html', '/lofi-lab.html', '/lofi-lab-en.html',
  '/before-after.html', '/before-after-en.html', '/meetdrkim.html',
  '/dr-kim-story.html', '/로우파이 이야기.html', '/contact-options.html',
]);

export function addGoogleTagToPage(html, resolvedPath, adminAuthorized = false) {
  const bookingPage = ['/reservation/index.html', '/reservation/concerns.html', '/reservation/received.html'].includes(resolvedPath);
  const publicArticle = /^\/articles\/(?:ko\/)?[a-z0-9-]+\.html$/.test(resolvedPath);
  if (!adminAuthorized && (bookingPage || publicPages.has(resolvedPath) || publicArticle) &&
      !html.includes('id="lofi-ads-consent-client"')) {
    html = html.replace(/<\/head>/i, '<script id="lofi-ads-consent-client" src="/assets/ads-measurement.js" defer></script>\n</head>');
  }
  // Default-deny unknown/private routes, including booking, replies and signage.
  if (adminAuthorized || (!publicPages.has(resolvedPath) && !publicArticle)) return html;
  if (!/<head\b[^>]*>/i.test(html) || /id=["']lofi-google-tag["']/.test(html)) return html;
  const tag = `<script id="lofi-google-tag">
(function(w,d){
  if(w.location.protocol!=='https:' || !['lofiesthetic.com','www.lofiesthetic.com'].includes(w.location.hostname)) return;
  if(d.getElementById('lofi-google-tag-loader')) return;
  w.dataLayer=w.dataLayer||[];
  w.gtag=w.gtag||function(){w.dataLayer.push(arguments);};
  w.gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
  w.gtag('set','ads_data_redaction',true);
  w.gtag('set','url_passthrough',false);
  w.gtag('js',new Date());
  w.gtag('config','${googleTagId}',{
    send_page_view:false,
    allow_google_signals:false,
    allow_ad_personalization_signals:false,
    allow_enhanced_conversions:false,
    page_location:w.location.origin+w.location.pathname,
    page_referrer:'',
    page_title:'Lofi Esthetic Dentistry'
  });
  var s=d.createElement('script');
  s.id='lofi-google-tag-loader';s.async=true;
  s.src='https://www.googletagmanager.com/gtag/js?id=${googleTagId}';
  s.referrerPolicy='no-referrer';
  d.head.appendChild(s);
})(window,document);
</script>`;
  return html.replace(/<head\b[^>]*>/i, match => `${match}\n${tag}`);
}
