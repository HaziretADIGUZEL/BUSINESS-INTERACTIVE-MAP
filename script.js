// Firebase yapılandırması kaldırıldı, çünkü backend üzerinden iletişim kuruyoruz

// --- YENİ: Kullanıcı modunda barkod okutma için global değişkenler ---
let userBarcodeStream = null;
let hideAllFiltersAutoDisabled = false;

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Global bir token değişkeni tanımlayın
let authToken = localStorage.getItem('authToken');

// Fetch isteklerine Authorization başlığını ekleyen yardımcı fonksiyon
async function authFetch(url, options = {}) {
    if (authToken) {
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${authToken}`
        };
    }
    const response = await fetch(url, options);
    // 401 Unauthorized hatası alırsak token'ı sil ve sayfayı yeniden yükle
    if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('authToken');
        authToken = null;
        alert('Oturum süreniz doldu veya yetkiniz yok. Lütfen tekrar giriş yapın.');
        window.location.reload();
    }
    return response;
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    // Firebase Timestamps can be objects with seconds, or ISO strings.
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    if (isNaN(date.getTime())) return ''; // Invalid date check

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}.${month}.${year} ${hours}:${minutes}`;
}

// --- YENİ: Son admin girişini gösteren fonksiyon ve panel alanı ---
async function showLastAdminLogin() {
    // Sadece admin modunda göster
    if (!authToken) return;
    try {
        const response = await authFetch('/api/last-login');
        const result = await response.json();
        if (result.success && result.lastLogin) {
            // Panelde gösterecek alanı bul veya oluştur
            let panel = document.getElementById('last-admin-login');
            if (!panel) {
                // Admin panel başlığının hemen altına ekle
                const adminModal = document.getElementById('admin-modal');
                if (adminModal) {
                    const h2 = adminModal.querySelector('h2');
                    panel = document.createElement('div');
                    panel.id = 'last-admin-login';
                    panel.style.fontSize = '13px';
                    panel.style.color = '#1559a1ff';
                    panel.style.margin = '4px 0 10px 0';
                    if (h2 && h2.parentNode) {
                        h2.parentNode.insertBefore(panel, h2.nextSibling);
                    } else {
                        adminModal.insertBefore(panel, adminModal.firstChild);
                    }
                }
            }
            if (panel) {
                panel.textContent = 'Son giriş: ' + formatTimestamp(result.lastLogin);
            }

            // --- EKLENDİ: Oturum süresi kontrolü ve uyarı panelleri ---
            // Son giriş zamanı ile şimdiki zaman arasındaki farkı dakika cinsinden hesapla
            const now = Date.now();
            let lastLoginTime;
            if (typeof result.lastLogin === 'object' && result.lastLogin.seconds) {
                lastLoginTime = result.lastLogin.seconds * 1000;
            } else {
                lastLoginTime = new Date(result.lastLogin).getTime();
            }
            if (!lastLoginTime || isNaN(lastLoginTime)) return;

            // Her 30 saniyede bir kontrol başlat (sadece bir kez başlatılır)
            if (!window.__adminSessionIntervalStarted) {
                window.__adminSessionIntervalStarted = true;
                window.__adminSessionWarned = false; // 5 dakika kala uyarı gösterildi mi?
                setInterval(() => {
                    // Oturum süresi dakika cinsinden
                    const diffMin = (Date.now() - lastLoginTime) / 60000;
                    // 54 ve üstü ise (5 dakika kaldı) ve henüz uyarı gösterilmediyse
                    if (diffMin >= 54 && diffMin < 59 && !window.__adminSessionWarned) {
                        window.__adminSessionWarned = true;
                        showSessionWarningPanel();
                    }
                    // 59 ve üstü ise (oturum bitti)
                    if (diffMin >= 59) {
                        showSessionEndedPanel();
                    }
                }, 30000);
            }
        }
    } catch (e) {
        // Hata olursa paneli gizle
        let panel = document.getElementById('last-admin-login');
        if (panel) panel.style.display = 'none';
    }
}

// --- EKLENDİ: 5 dakika kala uyarı paneli ---
function showSessionWarningPanel() {
    if (document.getElementById('session-warning-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'session-warning-panel';
    panel.style.position = 'fixed';
    panel.style.top = '0';
    panel.style.left = '0';
    panel.style.width = '100vw';
    panel.style.height = '100vh';
    panel.style.background = 'rgba(0,0,0,0.45)';
    panel.style.zIndex = '100000';
    panel.style.display = 'flex';
    panel.style.alignItems = 'center';
    panel.style.justifyContent = 'center';
    panel.innerHTML = `
        <div style="background:#fff;padding:32px 48px;border-radius:18px;font-size:1.5rem;font-weight:600;color:#e67e22;box-shadow:0 2px 16px rgba(0,0,0,0.18);text-align:center;">
            Son mevcut oturum sürenizin dolmasına <b>5 dakikadan az zaman kaldı.</b><br>
            <button id="session-warning-ok" style="margin-top:18px;padding:8px 32px;font-size:1.1rem;border-radius:8px;background:#007bff;color:#fff;border:none;cursor:pointer;">Tamam</button>
        </div>
    `;
    document.body.appendChild(panel);
    document.getElementById('session-warning-ok').onclick = function() {
        if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    };
}

// --- EKLENDİ: Oturum sonlandı paneli ---
function showSessionEndedPanel() {
    if (document.getElementById('session-ended-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'session-ended-panel';
    panel.style.position = 'fixed';
    panel.style.top = '0';
    panel.style.left = '0';
    panel.style.width = '100vw';
    panel.style.height = '100vh';
    panel.style.background = 'rgba(0,0,0,0.55)';
    panel.style.zIndex = '100001';
    panel.style.display = 'flex';
    panel.style.alignItems = 'center';
    panel.style.justifyContent = 'center';
    panel.innerHTML = `
        <div style="background:#fff;padding:32px 48px;border-radius:18px;font-size:1.7rem;font-weight:600;color:#e53935;box-shadow:0 2px 16px rgba(0,0,0,0.18);text-align:center;">
            Oturumunuz sonlandı.<br>
            <button id="session-ended-ok" style="margin-top:18px;padding:8px 32px;font-size:1.1rem;border-radius:8px;background:#e53935;color:#fff;border:none;cursor:pointer;">Tamam</button>
        </div>
    `;
    document.body.appendChild(panel);
    // --- HATA DÜZELTME: showLogoutOverlay fonksiyonunu burada tanımlı hale getir ---
    function showLogoutOverlay() {
        var overlay = document.createElement('div');
        overlay.id = 'logout-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.background = 'rgba(0,0,0,0.5)';
        overlay.style.zIndex = '100002';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.innerHTML = '<div style="background:#fff;padding:32px 48px;border-radius:18px;font-size:2rem;font-weight:600;color:#007bff;box-shadow:0 2px 16px rgba(0,0,0,0.18);">Çıkış yapılıyor...</div>';
        document.body.appendChild(overlay);
    }
    document.getElementById('session-ended-ok').onclick = function() {
        // Admin modunu kapat butonu işleviyle aynı: localStorage'dan authToken sil, adminMode=false, reload
        localStorage.removeItem('authToken');
        authToken = null;
        if (typeof setAdminMode === 'function') setAdminMode(false);
        // Çıkış overlay'i göster
        showLogoutOverlay();
        setTimeout(function() {
            window.location.reload();
        }, 2200);
    };
}

function initApp() {
    // Sayfa yüklenince loading ekranını gizle
    window.addEventListener('load', function() {
        const loadingScreen = document.getElementById('loading-screen');
        const progressBar = document.getElementById('loading-progress-bar');
        
        // Rastgele süre: 4-7 saniye arası (4000-7000 ms)
        const randomDuration = Math.random() * 3000 + 4000; // 4000 + (0-3000)
        
        // Dolma süresi: rastgele sürenin %80'i (%20 daha hızlı)
        const fillDuration = randomDuration * 0.8;
        
        // Gerçekçi animasyon fonksiyonu: Duraklamalar ve hız değişimleri ile ilerleme
        function animateProgress() {
            let progress = 0;
            const startTime = Date.now();
            
            function step() {
                const elapsed = Date.now() - startTime;
                const targetProgress = (elapsed / fillDuration) * 100;
                
                // Gerçekçilik için: Rastgele duraklama ve hız değişimi
                const randomPause = Math.random() < 0.3 ? Math.random() * 500 : 0; // %30 şansla 0-500ms duraklama
                const speedFactor = 0.8 + Math.random() * 0.4; // 0.8-1.2 arası hız çarpanı (daha yavaş/hızlı)
                
                progress += (targetProgress - progress) * speedFactor * 0.1; // Yumuşak yaklaşma
                if (progress > 100) progress = 100;
                
                // Çubuğu %30 daha sağa uzat (progress 100 olduğunda width: 130%)
                progressBar.style.width = (progress * 1.3) + '%';
                
                if (progress < 100) {
                    setTimeout(step, 50 + randomPause); // 50ms + rastgele duraklama
                } else {
                    // Progress bar'ı genişlet
                    document.getElementById('loading-progress-bar').classList.add('expand');
                    // 2 saniye sonra loading screen'i yumuşak gizle
                    setTimeout(() => {
                        if (loadingScreen) {
                            loadingScreen.classList.add('fade-out');
                            setTimeout(() => {
                                loadingScreen.style.display = 'none';
                            }, 500); // Opacity geçişi sonrası gizle
                        }
                    }, 3000);
                }
            }
            step();
        }
        
        // Animasyonu başlat
        animateProgress();
    });

    // Kullanım Kılavuzu Butonları Olayları
document.getElementById('guide-btn-desktop').addEventListener('click', () => {
    window.location.href = 'guide.html';
});
document.getElementById('guide-btn-mobile').addEventListener('click', () => {
    window.location.href = 'guide.html';
});

// guide.js (yeni dosya)
document.addEventListener('DOMContentLoaded', () => {
    const treeMenu = document.getElementById('guide-tree');
    const guideBody = document.getElementById('guide-body');
    const searchInput = document.getElementById('guide-search');
    
    // Ağaç menü oluştur
    guideContent.sections.forEach(section => {
        const li = document.createElement('li');
        li.textContent = section.title;
        li.addEventListener('click', () => loadSection(section));
        treeMenu.appendChild(li);
    });
    
    // İçerik yükle
    function loadSection(section) {
        guideBody.innerHTML = section.content;
    }
    
    // Arama (basit)
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        // İçerikte arama yap ve highlight et (Fuse.js gibi kütüphane ekle)
    });
});
    
    // --- YENİ: Global "Kaydediliyor..." overlay'i oluştur ---
    let savingOverlay = document.getElementById('saving-overlay');
    if (!savingOverlay) {
        savingOverlay = document.createElement('div');
        savingOverlay.id = 'saving-overlay';
        savingOverlay.style.position = 'fixed'; // Tüm ekranı kaplaması için 'fixed'
        savingOverlay.style.top = '0';
        savingOverlay.style.left = '0';
        savingOverlay.style.width = '100vw';
        savingOverlay.style.height = '100vh';
        savingOverlay.style.background = 'rgba(0, 0, 0, 0.6)'; // Daha belirgin bir arka plan
        savingOverlay.style.zIndex = '99999'; // Diğer tüm modalların üzerinde olmalı
        savingOverlay.style.display = 'none'; // Başlangıçta gizli
        savingOverlay.style.alignItems = 'center';
        savingOverlay.style.justifyContent = 'center';
        savingOverlay.innerHTML = '<div style="background:#fff;padding:20px 30px;border-radius:10px;font-size:1.5rem;font-weight:600;color:#007bff;box-shadow:0 2px 10px rgba(0,0,0,0.15);">Kaydediliyor...</div>';
        document.body.appendChild(savingOverlay); // Doğrudan body'ye ekle
    }

        var mobilePanelCloseBtn = document.getElementById('mobile-panel-close-btn');
    if (mobilePanelCloseBtn) {
    mobilePanelCloseBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        hideMobilePanel();
        });
    }


    var hideAllFilters = document.getElementById('hide-all-filters');
    if (hideAllFilters) {
        hideAllFilters.checked = true;
    }

    // Leaflet kontrolü
    if (typeof L === 'undefined') {
        console.error('Leaflet kütüphanesi yüklenemedi!');
        alert('Hata: Leaflet kütüphanesi yüklenemedi.');
        return;
    }

    // Harita div kontrolü
    var mapDiv = document.getElementById('map');
    if (!mapDiv) {
        console.error('#map div bulunamadı!');
        alert('Hata: #map div bulunamadı.');
        return;
    }

        // Harita oluşturma
    var map;
    try {
        // Cihaz tipine göre zoom seviyesini ayarla
        var isMobile = window.innerWidth <= 768;
        var minZoom = isMobile ? -5 : -3; // Mobilde daha az zoom out
        var zoomSnap = isMobile ? 0.4 : 0.1;  // Mobilde daha büyük adım (0.4), masaüstünde hassas (0.1)
        var zoomDelta = isMobile ? 0.4 : 0.1;  // Mobilde küçük adım (0.4), masaüstünde büyük adım (0.1)
        map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: minZoom,
    maxZoom: 3,
    zoomSnap: zoomSnap,    // Cihaz bazlı zoom hassasiyeti
    zoomDelta: zoomDelta,  // Cihaz bazlı zoom adımı
    maxBoundsViscosity: 1.0,
    renderer: L.canvas(),  // Canvas renderer ekle
    zoomControl: false     // --- YENİ: Zoom +/- butonlarını kaldır ---
});
    } catch (err) {
        console.error('L.map hatası:', err);
        alert('Hata: Leaflet harita oluşturulamadı.');
        return;
    }

    let zoomTimeout;
map.on('zoomend', function() {
    clearTimeout(zoomTimeout);
    zoomTimeout = setTimeout(() => {
        // Zoom sonrası işlemler (örneğin, marker güncelleme)
    }, 300);  // 300ms bekle
});

    // SVG yükleme
    var imageUrl = 'plan.webp';
    var imgHeight = 7599;
    var imgWidth = 8020;
    // --- DEĞİŞİKLİK: Sınırları genişlet (marker görüntüleme için) ---
    // Görüntüleme alanı: -2000'den 9000'e kadar (her iki eksen için)
    var viewBounds = [
        [-2000, -2000],
        [9000, 9000]
    ];
    // Orijinal görsel sınırları (değişmez)
    var imageBounds = [[0, 0], [imgHeight, imgWidth]];
    // Sınırları %20 genişlet
    var padding = 0.2;
    var paddedBounds = [
        [-imgHeight * padding, -imgWidth * padding],
        [imgHeight * (1 + padding), imgWidth * (1 + padding)]
    ];
    try {
        var imageOverlay = L.imageOverlay(imageUrl, imageBounds).addTo(map);
        imageOverlay.on('load', function() {
        });
        imageOverlay.on('error', function(err) {
            console.error('Görsel yüklenemedi:', imageUrl, err);
            alert('Görsel yüklenemedi: ' + err.type + '. Dosya yolunu veya görsel yapısını kontrol edin.');
        });
    } catch (err) {
        console.error('L.imageOverlay hatası:', err);
        alert('Hata: Leaflet görsel yüklemesinde sorun.');
    }

    // Haritayı ortala
    try {
        var isMobile = window.innerWidth <= 768;
        var initialZoom = isMobile ? -5 : -3; // Mobilde daha yakın başlat
        map.setView([imgHeight / 2, imgWidth / 2], initialZoom);
        map.setMaxBounds(viewBounds); // Genişletilmiş sınırları kullan
    } catch (err) {
        console.error('map.setView hatası:', err);
    }

// --- Mevcut Konum takibi ---
    let currentLocationMarker = null;
    let locationTrackingActive = false;
    let locationTrackingTimeout = null;
    let locationTrackingInterval = null;
    let lastKnownLocation = null;

    // --- YENİ: Koordinat dönüşüm matrisi ve fonksiyonu ekle ---
    const geoToPixelTransform = {
        lngMin: 32.6354653915523,
        lngMax: 32.63668979126129,
        latMin: 37.992116740984066,
        latMax: 37.993749375315446,
        imgWidth: 8020,
        imgHeight: 7599
    };

    // --- YENİ: Backend coordinateMapper ile haberleşen fonksiyon ---
    async function projectLatLngToPixelViaBackend(lat, lng) {
        try {
            const response = await fetch('/api/gps-to-pixel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat, lng })
            });
            
            const result = await response.json();
            
            if (result.success && result.isValid) {
                console.log('Backend Koordinat Dönüşümü:', {
                    gps: { lat, lng },
                    pixel: result.pixel,
                    distance: result.distance,
                    calculatedGPS: result.calculatedGPS
                });
                
                return {
                    x: result.pixel.x,
                    y: result.pixel.y,
                    isValid: true
                };
            } else {
                console.warn('Backend dönüşüm başarısız:', result);
                return null;
            }
        } catch (error) {
            console.error('Backend iletişim hatası:', error);
            return null;
        }
    }

// --- YENİ: GPS koordinatlarının kalibrasyon alanı içinde olup olmadığını kontrol eden fonksiyon ---
function isLocationInCalibrationArea(lat, lng) {
    const { lngMin, lngMax, latMin, latMax } = geoToPixelTransform;
    
    // Koordinatların sınırlar içinde olup olmadığını kontrol et
    if (lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax) {
        return true;
    }
    return false;
}

// --- YENİ: Sınır dışı konum uyarı paneli ---
function showOutOfBoundsWarning() {
    let panel = document.getElementById('out-of-bounds-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'out-of-bounds-panel';
        panel.style.position = 'fixed';
        panel.style.top = '0';
        panel.style.left = '0';
        panel.style.width = '100vw';
        panel.style.height = '100vh';
        panel.style.background = 'rgba(0,0,0,0.7)';
        panel.style.zIndex = '100000';
        panel.style.display = 'flex';
        panel.style.alignItems = 'center';
        panel.style.justifyContent = 'center';
        panel.innerHTML = `
            <div style="background:#fff;padding:32px 48px;border-radius:18px;max-width:400px;text-align:center;box-shadow:0 2px 16px rgba(0,0,0,0.18);">
                <div style="font-size:3rem;margin-bottom:16px;">⚠️</div>
                <h2 style="color:#e67e22;margin-bottom:12px;font-size:1.5rem;">Konum Sınır Dışında</h2>
                <p style="color:#555;margin-bottom:24px;line-height:1.6;">
                    Mevcut konumunuz kalibrasyon yapılmış alan dışında kaldığı için konum gösterilemiyor.
                </p>
                <button id="out-of-bounds-ok" style="padding:12px 32px;font-size:1.1rem;border-radius:8px;background:#007bff;color:#fff;border:none;cursor:pointer;font-weight:600;">
                    Tamam
                </button>
            </div>
        `;
        document.body.appendChild(panel);
        
        document.getElementById('out-of-bounds-ok').onclick = function() {
            panel.style.display = 'none';
        };
    } else {
        panel.style.display = 'flex';
    }
}

    // Eski local fonksiyonu yedek olarak tut
    function projectLatLngToPixelLocal(lat, lng, transform) {
        const { lngMin, lngMax, latMin, latMax, imgWidth, imgHeight } = transform;
        const pixelX = ((lng - lngMin) / (lngMax - lngMin)) * imgWidth;
        const pixelY = ((latMax - lat) / (latMax - latMin)) * imgHeight;
        
        if (isNaN(pixelX) || isNaN(pixelY)) {
            return null;
        }
        
        return { x: pixelX, y: pixelY };
    }

    function animateMarkerTo(marker, targetLatLng, duration = 800) {
        const start = marker.getLatLng();
        const startTime = performance.now();
        function animate(now) {
            const elapsed = now - startTime;
            const t = Math.min(elapsed / duration, 1);
            const lat = start.lat + (targetLatLng.lat - start.lat) * t;
            const lng = start.lng + (targetLatLng.lng - start.lng) * t;
            marker.setLatLng([lat, lng]);
            if (t < 1) requestAnimationFrame(animate);
        }
        requestAnimationFrame(animate);
    }

    function showCurrentLocation() {
        if (locationTrackingActive) {
            locationTrackingActive = false;
            if (locationTrackingTimeout) clearTimeout(locationTrackingTimeout);
            if (locationTrackingInterval) clearInterval(locationTrackingInterval);
            locationTrackingTimeout = null;
            locationTrackingInterval = null;
            locationBtn.textContent = 'Konumumu Göster';
            // Marker'ı kaldır
            if (currentLocationMarker) {
                map.removeLayer(currentLocationMarker);
                currentLocationMarker = null;
            }
            return;
        }

        if (!navigator.geolocation) {
            alert('Tarayıcınız konum özelliğini desteklemiyor.');
            return;
        }

        locationTrackingActive = true;
        locationBtn.textContent = 'Konum Göstermeyi Durdur';

        let updateCount = 0;
        const maxUpdates = 7;

        function updateLocation() {
    if (!locationTrackingActive) return;
    navigator.geolocation.getCurrentPosition(
        async position => {
            const { latitude: lat, longitude: lng } = position.coords;
            lastKnownLocation = { lat, lng };
            
            console.log('Ham GPS Koordinatları:', {
                lat: lat.toFixed(14),
                lng: lng.toFixed(14),
                accuracy: position.coords.accuracy
            });
            
            // --- YENİ: Sınır kontrolü yap ---
            if (!isLocationInCalibrationArea(lat, lng)) {
                console.warn('Konum kalibrasyon alanı dışında:', { lat, lng });
                
                // Marker varsa kaldır
                if (currentLocationMarker) {
                    map.removeLayer(currentLocationMarker);
                    currentLocationMarker = null;
                }
                
                // Uyarı panelini göster
                showOutOfBoundsWarning();
                
                // Konum takibini durdur
                locationTrackingActive = false;
                locationBtn.textContent = 'Konumumu Göster';
                if (locationTrackingTimeout) clearTimeout(locationTrackingTimeout);
                if (locationTrackingInterval) clearInterval(locationTrackingInterval);
                locationTrackingTimeout = null;
                locationTrackingInterval = null;
                
                return; // İşlemi durdur, marker oluşturma veya fly-to yapma
            }
            
            // ÖNCE: Backend ile dönüşüm yap
            let pixelPoint = await projectLatLngToPixelViaBackend(lat, lng);
            
            // Backend başarısız olursa local hesaplama kullan
            if (!pixelPoint) {
                console.warn('Backend başarısız, local hesaplamaya geçiliyor...');
                pixelPoint = projectLatLngToPixelLocal(lat, lng, geoToPixelTransform);
            }
            
            if (!pixelPoint) {
                console.error('Koordinat dönüşümü başarısız:', { lat, lng });
                return;
            }
            
            console.log('Mevcut konum:', { 
                gps: { lat: lat.toFixed(14), lng: lng.toFixed(14) }, 
                pixel: { x: pixelPoint.x.toFixed(2), y: pixelPoint.y.toFixed(2) }
            });
            
            const targetLatLng = L.latLng(pixelPoint.x, pixelPoint.y);

            if (!currentLocationMarker) {
                // Yeni marker oluştur
                currentLocationMarker = L.marker(targetLatLng, {
                    icon: L.divIcon({
                        className: 'current-location-marker',
                        iconSize: [24, 24],
                        iconAnchor: [12, 12],
                        html: '<div style="background-color: #007bff; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,123,255,0.5);"></div>'
                    }),
                    interactive: true,
                    zIndexOffset: 1000
                }).addTo(map);
                
                currentLocationMarker.bindPopup(
                    `<strong>Mevcut Konumunuz</strong><br>` +
                    `Gerçek Dünya: ${lat.toFixed(14)}, ${lng.toFixed(14)}<br>` +
                    `Pixel: X=${pixelPoint.x.toFixed(2)}, Y=${pixelPoint.y.toFixed(2)}<br>` +
                    `Hassasiyet: ±${position.coords.accuracy.toFixed(1)}m`,
                    { autoClose: false, closeOnClick: false, closeButton: true }
                );
                
                // --- DEĞİŞİKLİK: Zoom seviyesi 0 yerine -0.5 (daha az zoom) ---
                map.setView(targetLatLng, -0.5, { animate: true });
            } else {
                animateMarkerTo(currentLocationMarker, targetLatLng, 900);
                currentLocationMarker.setPopupContent(
                    `<strong>Mevcut Konumunuz</strong><br>` +
                    `Gerçek Dünya: ${lat.toFixed(14)}, ${lng.toFixed(14)}<br>` +
                    `Pixel: X=${pixelPoint.x.toFixed(2)}, Y=${pixelPoint.y.toFixed(2)}<br>` +
                    `Hassasiyet: ±${position.coords.accuracy.toFixed(1)}m`
                );
            }
        },
        error => {
            let errorMsg = 'Konum alınamadı: ';
            if (error.code === error.PERMISSION_DENIED) {
                errorMsg = 'Konum izni reddedildi. Lütfen tarayıcı ayarlarından konum iznini aktifleştirin.';
            } else if (error.code === error.POSITION_UNAVAILABLE) {
                errorMsg = 'Konum bilgisi mevcut değil.';
            } else if (error.code === error.TIMEOUT) {
                errorMsg = 'Konum talebi zaman aşımına uğradı.';
            } else {
                errorMsg += error.message;
            }
            alert(errorMsg);
            locationTrackingActive = false;
            locationBtn.textContent = 'Konumumu Göster';
            if (currentLocationMarker) {
                map.removeLayer(currentLocationMarker);
                currentLocationMarker = null;
            }
        },
        { 
            enableHighAccuracy: true, 
            timeout: 10000, 
            maximumAge: 0
        }
    );

    updateCount++;
    if (updateCount >= maxUpdates) {
        locationTrackingActive = false;
        locationBtn.textContent = 'Konumumu Göster';
        if (locationTrackingInterval) clearInterval(locationTrackingInterval);
        locationTrackingInterval = null;
    }
}


        updateLocation();
        locationTrackingInterval = setInterval(updateLocation, 3000);
        locationTrackingTimeout = setTimeout(() => {
            locationTrackingActive = false;
            locationBtn.textContent = 'Konumumu Göster';
            if (locationTrackingInterval) clearInterval(locationTrackingInterval);
            locationTrackingInterval = null;
        }, 21000);
    }

    // --- YENİ: Masaüstü için konum butonu ---
    const locationBtn = document.createElement('button');
    locationBtn.id = 'current-location-btn';
    locationBtn.innerHTML = '📍'; // Lokasyon ikonu
    locationBtn.title = 'Konumumu Göster';
    locationBtn.style.position = 'absolute';
    locationBtn.style.bottom = '160px';
    locationBtn.style.right = '25px';
    locationBtn.style.zIndex = '1000';
    locationBtn.style.width = '40px';
    locationBtn.style.height = '40px';
    locationBtn.style.background = '#007bff';
    locationBtn.style.color = '#fff';
    locationBtn.style.border = 'none';
    locationBtn.style.borderRadius = '5px';
    locationBtn.style.cursor = 'pointer';
    locationBtn.style.fontSize = '20px';
    locationBtn.style.display = 'flex';
    locationBtn.style.alignItems = 'center';
    locationBtn.style.justifyContent = 'center';
    locationBtn.style.marginBottom = '10px';
    locationBtn.onclick = showCurrentLocation;
    
    // Mobilde gizle
    function updateLocationBtnVisibility() {
        if (window.innerWidth <= 768) {
            locationBtn.style.display = 'none';
        } else {
            locationBtn.style.display = 'flex';
        }
    }
    updateLocationBtnVisibility();
    window.addEventListener('resize', updateLocationBtnVisibility);
    document.body.appendChild(locationBtn);

    // --- YENİ: Mobil panel için konum butonu ---
    const mobileLocationBtn = document.createElement('button');
    mobileLocationBtn.id = 'mobile-location-btn';
    mobileLocationBtn.innerHTML = '📍 Konumumu Göster';
    mobileLocationBtn.style.width = '100%';
    mobileLocationBtn.style.padding = '12px';
    mobileLocationBtn.style.marginTop = '10px';
    mobileLocationBtn.style.background = '#007bff';
    mobileLocationBtn.style.color = '#fff';
    mobileLocationBtn.style.border = 'none';
    mobileLocationBtn.style.borderRadius = '5px';
    mobileLocationBtn.style.cursor = 'pointer';
    mobileLocationBtn.style.fontSize = '16px';
    mobileLocationBtn.onclick = function() {
        showCurrentLocation();
        hideMobilePanel();
    };
    
    // Mobil panele ekle (DOMContentLoaded'dan sonra)
    window.addEventListener('DOMContentLoaded', function() {
        const mobilePanel = document.getElementById('mobile-panel');
        if (mobilePanel) {
            // Guide butonundan önce ekle
            const guideBtnMobile = document.getElementById('guide-btn-mobile');
            if (guideBtnMobile) {
                mobilePanel.insertBefore(mobileLocationBtn, guideBtnMobile);
            } else {
                mobilePanel.appendChild(mobileLocationBtn);
            }
        }
    });
    
    // --- YENİ: Koordinatları gösteren fonksiyon ---
    function displayCurrentCoordinates() {
        const render = (lat, lng) => {
            let message = `Gerçek Konum: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            const lngMin = 32.6354653915523;
            const lngMax = 32.63668979126129;
            const latMin = 37.992116740984066;
            const latMax = 37.993749375315446;
            const pixelX = ((lng - lngMin) / (lngMax - lngMin)) * imgWidth;
            const pixelY = ((latMax - lat) / (latMax - latMin)) * imgHeight;
            if (!Number.isNaN(pixelX) && !Number.isNaN(pixelY)) {
                message += `\nPixel: ${pixelX.toFixed(2)}, ${pixelY.toFixed(2)}`;
            }
            alert(message);
        };

        if (lastKnownLocation) {
            render(lastKnownLocation.lat, lastKnownLocation.lng);
            return;
        }

        if (!navigator.geolocation) {
            alert('Tarayıcınız konum özelliğini desteklemiyor.');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            position => {
                const { latitude, longitude } = position.coords;
                lastKnownLocation = { lat: latitude, lng: longitude };
                render(latitude, longitude);
            },
            error => {
                alert(error.code === error.PERMISSION_DENIED ? 'Konum izni reddedildi.' : 'Konum alınamadı: ' + error.message);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
        );
    }


    // --- YENİ: Preload fonksiyonunu burada tanımla ---
    function preloadZoomLevels() {
        const isMobile = window.innerWidth <= 768;
        const zoomLevels = isMobile ? [3, 2, 1, 0, -1, -2, -3, -4, -5, -6] : [3, 2, 1, 0, -1, -2, -3, -4];
        let index = 0;
        const interval = setInterval(() => {
            if (index < zoomLevels.length) {
                map.setZoom(zoomLevels[index]);
                index++;
            } else {
                clearInterval(interval);
            }
        }, 200);
    }

    // Veri yapıları
    var markersData = [];
    var classesData = [];
    var markerLayers = [];
    var selectedMarkerIndex = -1;
    var adminMode = false;
    var highlightedMarkers = [];
    var activeFilters = new Set();
    var inversionActive = false;
    let selectedColor;

    // Backend ile marker ve sınıf verileri
    async function loadMarkersFromDB() {
        try {
            const response = await fetch('/api/markers');
            if (!response.ok) throw new Error('Markerlar yüklenemedi: ' + response.status);
            markersData = await response.json();
            loadMarkers();
            loadAdminMarkers(); // Markerlar yüklendikten sonra admin listesini güncelle
        } catch (error) {
            console.error('Marker yükleme hatası:', error);
            alert('Markerlar yüklenemedi.');
        }
    }

    async function saveMarkerToDB(markerData) {
        try {
            const response = await authFetch('/api/markers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(markerData)
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Marker kaydedilemedi.');
            return result.marker; // Güncellenmiş marker'ı döndür
        } catch (error) {
            console.error('Marker kaydetme hatası:', error);
            throw error;
        }
    }

    async function deleteMarkerFromDB(markerId) {
        try {
            const response = await authFetch(`/api/markers/${markerId}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Marker silinemedi.');
            markersData = markersData.filter(m => m.id !== markerId);
        } catch (error) {
            console.error('Marker silme hatası:', error);
            throw error;
        }
    }

    async function loadClassesFromDB() {
        try {
            const response = await fetch('/api/classes');
            if (!response.ok) throw new Error('Sınıflar yüklenemedi: ' + response.status);
            classesData = await response.json();
            loadClassList();
        } catch (error) {
            console.error('Sınıf yükleme hatası:', error);
            alert('Sınıflar yüklenemedi.');
        }
    }

    async function saveClassToDB(className) {
        try {
            const response = await authFetch('/api/classes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: className })
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Sınıf eklenedi.');
            classesData.push(className);
        } catch (error) {
            console.error('Sınıf ekleme hatası:', error);
            throw error;
        }
    }

    async function deleteClassFromDB(className) {
        try {
            const response = await authFetch(`/api/classes/${encodeURIComponent(className)}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Sınıf silinemedi.');
            classesData = classesData.filter(c => c !== className);
            // markersData'yı filtreleme kaldırıldı
        } catch (error) {
            console.error('Sınıf silme hatası:', error);
            throw error;
        }
    }

    // Marker ve sınıf işlemlerinde backend fonksiyonlarını kullan
    function saveMarkers() { loadMarkersFromDB(); } // Yeni marker eklendiğinde veya silindiğinde listeyi yenile
    function saveClasses() { loadClassesFromDB(); } // Yeni sınıf eklendiğinde veya silindiğinde listeyi yenile

    // Sayfa açılışında verileri backend'den yükle
    preloadZoomLevels();
    loadMarkersFromDB();
    loadClassesFromDB();
    // --- EKLENDİ: Son admin login panelini başlat ---
    showLastAdminLogin();

    // Admin modu durumunu kontrol et
    function setAdminMode(active) {
        adminMode = active;
        if (active) {
            document.getElementById('admin-toggle').textContent = 'Admin Modu Kapat';
            document.getElementById('show-admin-panel').style.display = 'block';
            document.getElementById('manage-classes-btn').style.display = 'block';
            // Mobil paneldeki butonları da güncelle
            var adminToggleMobile = document.getElementById('admin-toggle-mobile');
            var closeAdminMobile = document.getElementById('close-admin-mobile');
            var showAdminPanelMobile = document.getElementById('show-admin-panel-mobile');
            var manageClassesBtnMobile = document.getElementById('manage-classes-btn-mobile');
            var scanBarcodeBtnMobile = document.getElementById('scan-barcode-btn-mobile');
            var advancedEditBtnMobile = document.getElementById('advanced-edit-btn-mobile');
            if (adminToggleMobile) adminToggleMobile.style.display = 'none';
            if (closeAdminMobile) closeAdminMobile.style.display = 'block';
            if (showAdminPanelMobile) showAdminPanelMobile.style.display = 'block';
            if (manageClassesBtnMobile) manageClassesBtnMobile.style.display = 'block';
            if (scanBarcodeBtnMobile) scanBarcodeBtnMobile.style.display = 'block';
            if (advancedEditBtnMobile) advancedEditBtnMobile.style.display = 'block';

            // Gelişmiş düzenleme butonunu göster
            var advancedEditBtn = document.getElementById('advanced-edit-btn');
            if (advancedEditBtn) advancedEditBtn.style.display = 'inline-block';
        } else {
            document.getElementById('admin-toggle').textContent = 'Admin Modu';
            document.getElementById('show-admin-panel').style.display = 'none';
            document.getElementById('manage-classes-btn').style.display = 'none';
            // Mobil paneldeki butonları da güncelle
            var adminToggleMobile = document.getElementById('admin-toggle-mobile');
            var closeAdminMobile = document.getElementById('close-admin-mobile');
            var showAdminPanelMobile = document.getElementById('show-admin-panel-mobile');
            var manageClassesBtnMobile = document.getElementById('manage-classes-btn-mobile');
            var scanBarcodeBtnMobile = document.getElementById('scan-barcode-btn-mobile');
            var advancedEditBtnMobile = document.getElementById('advanced-edit-btn-mobile');
            if (adminToggleMobile) adminToggleMobile.style.display = 'block';
            if (closeAdminMobile) closeAdminMobile.style.display = 'none';
            if (showAdminPanelMobile) showAdminPanelMobile.style.display = 'none';
            if (manageClassesBtnMobile) manageClassesBtnMobile.style.display = 'none';
            if (scanBarcodeBtnMobile) scanBarcodeBtnMobile.style.display = 'none';
            if (advancedEditBtnMobile) advancedEditBtnMobile.style.display = 'none';

            // Gelişmiş düzenleme butonunu gizle ve modalı kapat
            var advancedEditBtn = document.getElementById('advanced-edit-btn');
            var advancedEditModal = document.getElementById('advanced-edit-modal');
            if (advancedEditBtn) advancedEditBtn.style.display = 'none';
            if (advancedEditModal) advancedEditModal.style.display = 'none';
        }
// Mobil admin paneldeki Barkod Okut butonuna işlev ekle
// Mobil admin paneldeki Barkod Okut ve Gelişmiş Düzenleme butonlarına işlev ekle
var scanBarcodeBtnMobile = document.getElementById('scan-barcode-btn-mobile');
if (scanBarcodeBtnMobile) {
    scanBarcodeBtnMobile.addEventListener('click', function() {
        // Barkod okutma modalını aç
        openBarcodeModal('main');
        hideMobilePanel();
    });
}
var advancedEditBtnMobile = document.getElementById('advanced-edit-btn-mobile');
if (advancedEditBtnMobile) {
    advancedEditBtnMobile.addEventListener('click', function() {
        var advancedEditModal = document.getElementById('advanced-edit-modal');
        if (advancedEditModal) advancedEditModal.style.display = 'block';
        hideMobilePanel();
    });
}
    }

    if (authToken) {
        setAdminMode(true);
    } else {
        setAdminMode(false);
    }

    function loadMarkers() {
        markerLayers.forEach(function(layer) {
            if (map.hasLayer(layer.marker)) {
                map.removeLayer(layer.marker);
            }
        });
        markerLayers = [];

        markersData.forEach(function(markerData, index) {
            // Marker rengi
            const markerColor = markerData.color || '#e6194b';
            // Ters damla (pin) SVG ikon, %30 daha küçük (15x21px), sivri ucu aşağıda
            const pinSVG = '<svg width="20" height="28" viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg">' +
                '<g>' +
                `<path d="M11 29 C3 18 1 14 1 9.5 A10 10 0 1 1 21 9.5 C21 14 19 18 11 29 Z" fill="${markerColor}" stroke="#222" stroke-width="1.5"/>` +
                '<circle cx="11" cy="11" r="4.5" fill="#fff" stroke="#222" stroke-width="1"/>' +
                '</g></svg>';
            // Marker draggable özelliği veritabanından veya modalden gelir
            var marker = L.marker([markerData.latLng[0], markerData.latLng[1]], {
                icon: L.divIcon({
                    className: 'marker-icon',
                    iconSize: [15, 21],
                    iconAnchor: [7.5, 20],
                    html: pinSVG
                }),
                draggable: markerData.draggable === true, // true ise sürüklenebilir, değilse kilitli
                autoPan: true,
                autoPanSpeed: 100
            }).addTo(map);

            marker.bindPopup(createPopupContent(markerData, index), {
                autoPan: true,
                autoPanPadding: [50, 50]
            });

            marker.on('click', function(e) {
                map.closePopup();
                // Aktifken mavi kenarlıklı damla SVG
                const activePinSVG = '<svg width="15" height="21" viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg">' +
                    '<g>' +
                    `<path d="M11 29 C3 18 1 14 1 9.5 A10 10 0 1 1 21 9.5 C21 14 19 18 11 29 Z" fill="${markerColor}" stroke="#007bff" stroke-width="2.5"/>` +
                    '<circle cx="11" cy="11" r="4.5" fill="#fff" stroke="#007bff" stroke-width="1.5"/>' +
                    '</g></svg>';
                marker.setIcon(L.divIcon({
                    className: 'marker-icon active',
                    iconSize: [15, 21],
                    iconAnchor: [7.5, 20],
                    html: activePinSVG
                }));
                setTimeout(() => {
                    marker.setIcon(L.divIcon({
                        className: 'marker-icon',
                        iconSize: [15, 21],
                        iconAnchor: [7.5, 20],
                        html: pinSVG
                    }));
                }, 200);

                marker.openPopup();
            });

            marker.on('dragend', async function(e) {
                const newLatLng = [marker.getLatLng().lat, marker.getLatLng().lng];
                // --- DEĞİŞİKLİK: Genişletilmiş sınır kontrolü ---
                if (
                    newLatLng[0] < -2000 || newLatLng[0] > 9000 ||
                    newLatLng[1] < -2000 || newLatLng[1] > 9000
                ) {
                    alert('Seçilen konum çok uzakta! Marker taşınamaz.');
                    // Marker'ı eski konumuna döndür
                    marker.setLatLng([markersData[index].latLng[0], markersData[index].latLng[1]]);
                    return;
                }
                const markerId = markersData[index].id;
                const updatedData = { ...markersData[index], latLng: newLatLng };
                try {
                    // Update the existing marker instead of deleting and recreating
                    await deleteMarkerFromDB(markerId);
                    await saveMarkerToDB(updatedData);
                    loadMarkersFromDB(); // Yeniden yükle
                } catch (error) {
                    alert('Marker konumu güncellenemedi.');
                }
            });

            markerLayers.push({ marker: marker, data: markerData, originalIcon: marker.options.icon });
        });
        
        applyFilters();
    }

    function createPopupContent(markerData, index) {
        var imagesHtml = '';
        if (markerData.images && markerData.images.length > 0) {
            imagesHtml = `<div class="marker-images">${markerData.images.map((img, i) => `<img src="${img}" alt="Image ${i}" onclick="openImageViewer(${index}, ${i})">`).join('')}</div>`;
        }
        var adminEditButton = adminMode ? `<button class="edit-button" onclick="editMarker(${index})">Düzenle</button>` : '';
        
        const createdAt = formatTimestamp(markerData.createdAt);
        const updatedAt = formatTimestamp(markerData.updatedAt);
        let timestampsHtml = '<div style="font-size: 11px; color: #888; margin-bottom: 8px;">';
        if (createdAt) {
            timestampsHtml += `Oluşturulma: ${createdAt}`;
        }
        if (updatedAt && updatedAt !== createdAt) {
            timestampsHtml += `<br>Son Değişiklik: ${updatedAt}`;
        }
        timestampsHtml += '</div>';

        return `
            ${timestampsHtml}
            <h2>${markerData.title}</h2>
            <p>${markerData.description}</p>
            ${imagesHtml}
            ${adminEditButton}
        `;
    }

    // Arama fonksiyonu
    var searchInput = document.getElementById('search-input');
    var searchButton = document.getElementById('search-button');
    var suggestionsList = document.getElementById('search-suggestions');
    
    function resetFilters() {
        activeFilters.clear();
        inversionActive = false;
        const inversionToggle = document.getElementById('inversion-toggle');
        const selectAllFilters = document.getElementById('select-all-filters');
        const hideAllFilters = document.getElementById('hide-all-filters');

        if (inversionToggle) inversionToggle.checked = false;
        if (selectAllFilters) selectAllFilters.checked = false;
        if (hideAllFilters) hideAllFilters.checked = false;
        
        document.querySelectorAll('.filter-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
    }

    function showSuggestions(query) {
        suggestionsList.innerHTML = '';
        if (query.trim() === '') { 
            suggestionsList.style.display = 'none';
            return;
        }
            if (typeof hideAllFilters !== 'undefined' && hideAllFilters) {
                hideAllFilters.checked = false;
                if (typeof updateFilters === 'function') updateFilters();
            }

        var matchingMarkers = markerLayers.filter(function(layer) {
            var title = layer.data.title.toLowerCase();
            var description = layer.data.description.toLowerCase();
            return title.includes(query.toLowerCase()) || description.includes(query.toLowerCase());
        });

        if (matchingMarkers.length === 0) {
            suggestionsList.style.display = 'none';
            return;
        }

        matchingMarkers.forEach(function(layer) {
            var li = document.createElement('li');
            li.className = 'suggestion-item';
            var descShort = layer.data.description.length > 30 ? layer.data.description.substring(0, 30) + '...' : layer.data.description;
            // Eğer görsel varsa ekle, yoksa sadece başlık ve açıklama göster
            if (layer.data.images && layer.data.images.length > 0) {
                var img = document.createElement('img');
                img.src = layer.data.images[0];
                img.alt = layer.data.title;
                li.appendChild(img);
            }
            var div = document.createElement('div');
            var titleDiv = document.createElement('div');
            titleDiv.className = 'title';
            titleDiv.textContent = layer.data.title;
            var descDiv = document.createElement('div');
            descDiv.className = 'description';
            descDiv.textContent = descShort;
            div.appendChild(titleDiv);
            div.appendChild(descDiv);
            li.appendChild(div);
            li.addEventListener('click', function() {
                suggestionsList.innerHTML = '';
                suggestionsList.style.display = 'none';
                // Tüm markerların glow'unu kaldır
                markerLayers.forEach(l => {
                    var iconDiv = l.marker.getElement();
                    if (iconDiv) iconDiv.classList.remove('marker-glow-red');
                    map.removeLayer(l.marker);
                });
                layer.marker.addTo(map);
                var iconDiv = layer.marker.getElement();
                if (iconDiv) iconDiv.classList.add('marker-glow-red');
                map.flyTo(layer.marker.getLatLng(), -1);
                layer.marker.openPopup();
            });
            suggestionsList.appendChild(li);
        });

        suggestionsList.style.display = 'block';
    }

    function performSearch(query) {
        var matchingMarkers = markerLayers.filter(function(layer) {
            var title = layer.data.title.toLowerCase(); 
            var description = layer.data.description.toLowerCase();
            return title.includes(query.toLowerCase()) || description.includes(query.toLowerCase());
        });
        if (typeof hideAllFilters !== 'undefined' && hideAllFilters) {
            hideAllFilters.checked = false;
            if (typeof updateFilters === 'function') updateFilters();
        }

        // Önce tüm markerların glow'unu ve görünürlüğünü sıfırla
        markerLayers.forEach(layer => {
            var iconDiv = layer.marker.getElement();
            if (iconDiv) iconDiv.classList.remove('marker-glow-red');
            map.removeLayer(layer.marker);
        });

        if (matchingMarkers.length === 0) {
            alert('Eşleşen marker bulunamadı.');
            return;
        }

        // Sadece bulunan markerları göster ve glow ekle
        matchingMarkers.forEach(layer => {
            layer.marker.addTo(map);
            var iconDiv = layer.marker.getElement();
            if (iconDiv) iconDiv.classList.add('marker-glow-red');
        });

        if (matchingMarkers.length === 1) {
            // Tek marker bulunduysa, çok yakın zoom yerine daha uygun bir zoom kullan
            map.flyTo(matchingMarkers[0].marker.getLatLng(), -1); // -1 veya initialZoom kullanılabilir
            matchingMarkers[0].marker.openPopup();
        } else if (matchingMarkers.length > 1) {
            var group = new L.featureGroup(matchingMarkers.map(layer => layer.marker));
            map.fitBounds(group.getBounds(), { padding: [50, 50] });
        }

    // Glow başka işlem yapılana kadar kalacak
    }

    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            showSuggestions(e.target.value);
        });
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                suggestionsList.style.display = 'none';
                performSearch(searchInput.value);
            }
        });
    } else {
        console.error('search-input bulunamadı!');
    }

    if (searchButton) {
        searchButton.addEventListener('click', function() {
            suggestionsList.style.display = 'none';
            performSearch(searchInput.value);
        });
    } else {
        console.error('search-button bulunamadı!');
    }

    document.addEventListener('click', function(e) {
        if (e.target !== searchInput && e.target.parentNode !== suggestionsList) {
            suggestionsList.style.display = 'none';
        }
        
        var filterDropdown = document.getElementById('filter-dropdown');
        var filterToggle = document.getElementById('filter-toggle');
        if (filterDropdown && filterToggle) {
            if (!filterDropdown.contains(e.target) && e.target !== filterToggle) {
                filterDropdown.style.display = 'none';
            }
        }
    });

    // Hata mesajı alanı
    var loginModal = document.getElementById('login-modal');
    if (loginModal) {
        var errorDiv = document.createElement('div');
        errorDiv.id = 'login-error';
        errorDiv.style.color = 'red';
        errorDiv.style.marginTop = '10px';
        loginModal.querySelector('.modal-content').appendChild(errorDiv);
    } else {
        console.error('login-modal bulunamadı!');
    }

    // Görsel yükleme hata mesajı alanı
    var editModal = document.getElementById('edit-modal');
    if (editModal) {
        var imageErrorDiv = document.createElement('div');
        imageErrorDiv.id = 'image-error';
        imageErrorDiv.style.color = 'red';
        imageErrorDiv.style.marginTop = '10px';
        editModal.querySelector('.modal-content').appendChild(imageErrorDiv);
    }

    // Admin Modu Butonu
    var adminToggle = document.getElementById('admin-toggle');
    var showAdminPanelBtn = document.getElementById('show-admin-panel');
    var manageClassesBtn = document.getElementById('manage-classes-btn');
    
    if (adminToggle) {
        adminToggle.addEventListener('click', function() {
            if (adminMode) {
                adminMode = false;
                adminToggle.textContent = 'Admin Modu';
                if (showAdminPanelBtn) showAdminPanelBtn.style.display = 'none';
                if (manageClassesBtn) manageClassesBtn.style.display = 'none';
                localStorage.removeItem('authToken');
                authToken = null;
                loadMarkers();
                document.getElementById('admin-modal').style.display = 'none';
                showLogoutOverlay();
                setTimeout(function() {
                    window.location.reload();
                }, 2200);
            } else {
                if (loginModal) loginModal.style.display = 'block';
                if (loginModal) loginModal.querySelector('#login-error').textContent = '';
            }
        });
    }

    // --- Gelişmiş Düzenleme Modalı Açma/Kapama ---
    var advancedEditBtn = document.getElementById('advanced-edit-btn');
    var advancedEditModal = document.getElementById('advanced-edit-modal');
    var advancedEditClose = document.getElementById('advanced-edit-close');
    var advancedEditStepSelect = document.getElementById('advanced-edit-step-select');
    var advancedEditMarkersPanel = document.getElementById('advanced-edit-markers-panel');
    var advancedEditClassesPanel = document.getElementById('advanced-edit-classes-panel');
    var advancedEditMarkersBtn = document.getElementById('advanced-edit-markers-btn');
    var advancedEditClassesBtn = document.getElementById('advanced-edit-classes-btn');

    if (advancedEditBtn && advancedEditModal && advancedEditClose) {
        advancedEditBtn.addEventListener('click', function() {
            advancedEditModal.style.display = 'block';
            // Sadece seçim ekranı gösterilsin, diğer paneller gizli
            if (advancedEditStepSelect) advancedEditStepSelect.style.display = 'flex';
            if (advancedEditMarkersPanel) advancedEditMarkersPanel.style.display = 'none';
            if (advancedEditClassesPanel) advancedEditClassesPanel.style.display = 'none';
        });
        advancedEditClose.addEventListener('click', function() {
            advancedEditModal.style.display = 'none';
        });
        // Markerları Düzenle butonu işlevi
        if (advancedEditMarkersBtn) {
            advancedEditMarkersBtn.addEventListener('click', function() {
                if (advancedEditStepSelect) advancedEditStepSelect.style.display = 'none';
                if (advancedEditMarkersPanel) {
                    advancedEditMarkersPanel.style.display = 'block';
                    // Panel HTML: filtre üstte, marker listesi altta
advancedEditMarkersPanel.innerHTML = `
    <button id="adv-marker-back-btn" style="margin-bottom:18px;">&larr; Geri</button>
    <div style="background:#f7f7f7;padding:18px 16px 18px 18px;border-radius:12px;max-width:900px;margin:auto;">
        <h3>Marker Filtrele</h3>
        <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:center;">
            <div style="display:flex;align-items:center;gap:25px;justify-content:center;flex-wrap:wrap;">
            <label>Başlık: <input type="text" id="adv-marker-title" style="width:140px;margin-bottom:6px;"></label>
            <label>Açıklama: <input type="text" id="adv-marker-desc" style="width:140px;margin-bottom:6px;"></label>
            </div>
            <div style="position:relative;min-width:180px;">
            <div style="display:flex;align-items:center;gap:25px;justify-content:center;">
            <label>Renk: <select id="adv-marker-color" style="width:90px;margin-bottom:6px;"></select></label>
            <label>Görsel Adedi: <input type="number" id="adv-marker-image-count" min="0" style="width:60px;margin-bottom:6px;"></label>
            </div>
            <label style="display: flex; flex-direction: column; align-items: flex-start; gap: 10px; position: relative; margin-bottom: 6px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    Sınıf:
                    <input type="text" id="adv-marker-class-input" autocomplete="off" placeholder="Sınıf ara/seç..." style="width:140px;padding:4px 8px;border-radius:7px;border:1px solid #ccc;">
                </div>
                <div id="adv-marker-class-chips" style="display:flex;flex-wrap:wrap;gap:4px 6px;justify-content:center;"></div>
                <div id="adv-marker-class-dropdown" style="display:none;position:absolute;top:100%;left:50%;transform:translateX(-50%);width:140px;max-height:120px;overflow:auto;background:#fff;border:1px solid #ccc;border-radius:7px;z-index:10;"></div>
            </label>
            </div>
            <label>Barkod Durumu: <select id="adv-marker-barcode-status" style="width:110px;margin-bottom:6px;">
                <option value="">Hepsi</option>
                <option value="var">Barkod Var</option>
                <option value="yok">Barkod Yok</option>
            </select></label>
        </div>
        <div style="display:flex;align-items:center; margin-top:8px;margin-left:40px;justify-content:center;flex-wrap:wrap;">
        <button id="adv-marker-filter-btn" style="margin-top:0;">Filtrele</button>
        <button id="adv-marker-reset-btn" style="margin-top:0;margin-left:8px;">Sıfırla</button>
        </div>
    </div>
    <div style="flex:2 1 480px;min-width:380px;max-width:900px;background:#f7f7f7;padding:18px 16px 18px 18px;border-radius:12px;margin:24px auto 0 auto;">
        <h3>Markerlar</h3>
        <div style="margin-bottom:10px;flex-wrap:wrap;display:flex; gap:10px;padding-left: 80px;justify-content: center;position:relative; align-items: center;">
            <button id="adv-marker-select-all">Tümünü Seç</button>
            <button id="adv-marker-deselect-all">Seçimi Kaldır</button>
            <button id="adv-marker-delete-selected" style="background: rgb(229, 57, 53); color: rgb(255, 255, 255); transition: none; cursor: move; position: relative; left: 6px;" data-selected="true" data-label-id="0">Seçili Markerları Sil</button>
        </div>
        <ul id="adv-marker-list" style="max-height:48vh;overflow:auto;padding:0;list-style:none;"></ul>
    </div>
`;
                    // Geri butonu işlevi
                    var backBtn = document.getElementById('adv-marker-back-btn');
                    if (backBtn) backBtn.onclick = function() {
                        advancedEditMarkersPanel.style.display = 'none';
                        advancedEditStepSelect.style.display = 'flex';
                    };
                    // Sınıf autocomplete çoklu seçim işlevi
                    let selectedClasses = [];
                    const classInput = document.getElementById('adv-marker-class-input');
                    const classDropdown = document.getElementById('adv-marker-class-dropdown');
                    const classChips = document.getElementById('adv-marker-class-chips');
                    function renderClassDropdown(filter = '') {
                        if (!Array.isArray(classesData)) return;
                        let filtered = classesData.filter(cls => !selectedClasses.includes(cls) && cls.toLowerCase().includes(filter.toLowerCase()));
                        if (filtered.length === 0) {
                            classDropdown.style.display = 'none';
                            return;
                        }
                        classDropdown.innerHTML = '';
                        filtered.forEach(cls => {
                            let div = document.createElement('div');
                            div.textContent = cls;
                            div.style.padding = '6px 10px';
                            div.style.cursor = 'pointer';
                            div.onmousedown = function(e) {
                                e.preventDefault();
                                selectedClasses.push(cls);
                                renderClassChips();
                                classDropdown.style.display = 'none';
                                classInput.value = '';
                            };
                            classDropdown.appendChild(div);
                        });
                        classDropdown.style.width = '210px'; // 140px + %50
                        classDropdown.style.maxHeight = '180px'; // 120px + %50
                        classDropdown.style.display = 'block';
                    }
                    // Tıklanınca da aç
                    classInput.addEventListener('click', function() {
                        renderClassDropdown(this.value);
                    });
                    function renderClassChips() {
                        classChips.innerHTML = '';
                        selectedClasses.forEach(cls => {
                            let chip = document.createElement('span');
                            chip.textContent = cls;
                            chip.style.background = '#e0e0e0';
                            chip.style.borderRadius = '8px';
                            chip.style.padding = '2px 8px';
                            chip.style.marginRight = '3px';
                            chip.style.display = 'inline-flex';
                            chip.style.alignItems = 'center';
                            chip.style.fontSize = '13px';
                            let x = document.createElement('span');
                            x.textContent = '×';
                            x.style.marginLeft = '6px';
                            x.style.cursor = 'pointer';
                            x.onclick = function() {
                                selectedClasses = selectedClasses.filter(c => c !== cls);
                                renderClassChips();
                            };
                            chip.appendChild(x);
                            classChips.appendChild(chip);
                        });
                    }
                    classInput.addEventListener('focus', function() {
                        renderClassDropdown('');
                    });
                    classInput.addEventListener('input', function() {
                        renderClassDropdown(this.value);
                    });
                    classInput.addEventListener('blur', function() {
                        setTimeout(() => { classDropdown.style.display = 'none'; }, 120);
                    });
                    classDropdown.addEventListener('mousedown', function(e) { e.preventDefault(); });
                    renderClassChips();
                    var colorSelect = document.getElementById('adv-marker-color');
                    if (colorSelect) {
                        colorSelect.innerHTML = '<option value="">Hepsi</option>';
                        const markerColors = [
                            '#e6194b','#3cb44b','#ffe119','#4363d8','#f58231','#911eb4','#46f0f0','#f032e6',
                            '#bcf60c','#fabebe','#008080','#e6beff','#9a6324','#fffac8','#800000','#aaffc3',
                            '#808000','#ffd8b1','#000075','#808080','#ffffff','#000000','#a9a9a9','#ff69b4'
                        ];
                        markerColors.forEach(function(color) {
                            var opt = document.createElement('option');
                            opt.value = color;
                            opt.textContent = color;
                            opt.style.background = color;
                            colorSelect.appendChild(opt);
                        });
                    }
                    // Markerları listele (filtre uygulanmadan hepsi)
                    function renderMarkerList(filteredMarkers) {
                        var list = document.getElementById('adv-marker-list');
                        if (!list) return;
                        list.innerHTML = '';
                        (filteredMarkers || markersData).forEach(function(marker, idx) {
                            var li = document.createElement('li');
                            li.style.display = 'flex';
                            li.style.alignItems = 'center';
                            li.style.justifyContent = 'space-between';
                            li.style.padding = '6px 0';
                            li.innerHTML = `
                                <label style="display:flex;align-items:center;gap:8px;">
                                    <input type="checkbox" class="adv-marker-checkbox" data-idx="${idx}">
                                    <span style="font-weight:600;">${marker.title}</span>
                                    <span style="font-size:12px;color:#666;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${marker.description || ''}</span>
                                </label>
                                <button class="adv-marker-edit-btn" data-idx="${idx}" style="background:#ffc107;color:#222;border-radius:8px;padding:4px 12px;">Düzenle</button>
                            `;
                            list.appendChild(li);
                        });
                    }
                    renderMarkerList(markersData);
                    // Filtrele butonu işlevi
                    document.getElementById('adv-marker-filter-btn').onclick = function() {
                        var title = document.getElementById('adv-marker-title').value.trim().toLowerCase();
                        var desc = document.getElementById('adv-marker-desc').value.trim().toLowerCase();
                        // selectedClasses dizisi chipli autocomplete'den geliyor
                        var barcodeStatus = document.getElementById('adv-marker-barcode-status').value;
                        var color = document.getElementById('adv-marker-color').value;
                        var imgCount = document.getElementById('adv-marker-image-count').value;
                        var filtered = markersData.filter(function(m) {
                            let ok = true;
                            if (title && !m.title.toLowerCase().includes(title)) ok = false;
                            if (desc && (!m.description || !m.description.toLowerCase().includes(desc))) ok = false;
                            if (selectedClasses.length > 0 && (!m.class || !selectedClasses.every(cls => m.class.includes(cls)))) ok = false;
                            if (barcodeStatus === 'var' && !m.barcode) ok = false;
                            if (barcodeStatus === 'yok' && m.barcode) ok = false;
                            if (color && m.color !== color) ok = false;
                            if (imgCount !== '' && Number(imgCount) >= 0) {
                                let count = Array.isArray(m.images) ? m.images.length : 0;
                                if (Number(imgCount) === 0 && count > 0) ok = false;
                                if (Number(imgCount) > 0 && count !== Number(imgCount)) ok = false;
                            }
                            return ok;
                        });
                        renderMarkerList(filtered);
                    };
                    // Sıfırla butonu işlevi
                    document.getElementById('adv-marker-reset-btn').onclick = function() {
                        document.getElementById('adv-marker-title').value = '';
                        document.getElementById('adv-marker-desc').value = '';
                        selectedClasses = [];
                        renderClassChips();
                        document.getElementById('adv-marker-barcode-status').value = '';
                        document.getElementById('adv-marker-color').value = '';
                        document.getElementById('adv-marker-image-count').value = '';
                        renderMarkerList(markersData);
                    };
                    // Tümünü Seç/Kaldır işlevleri
                    document.getElementById('adv-marker-select-all').onclick = function() {
                        document.querySelectorAll('.adv-marker-checkbox').forEach(cb => cb.checked = true);
                    };
                    document.getElementById('adv-marker-deselect-all').onclick = function() {
                        document.querySelectorAll('.adv-marker-checkbox').forEach(cb => cb.checked = false);
                    };
                    // Toplu silme işlevi
                    document.getElementById('adv-marker-delete-selected').onclick = async function() {
                        var selected = Array.from(document.querySelectorAll('.adv-marker-checkbox:checked')).map(cb => Number(cb.getAttribute('data-idx')));
                        if (selected.length === 0) { alert('Seçili marker yok!'); return; }
                        if (!confirm('Seçili markerları silmek istediğinize emin misiniz?')) return;
                        for (let idx of selected) {
                            if (markersData[idx] && markersData[idx].id) {
                                await deleteMarkerFromDB(markersData[idx].id);
                            }
                        }
                        await loadMarkersFromDB();
                        renderMarkerList(markersData);
                    };
                    // Düzenle butonları işlevi
                    advancedEditMarkersPanel.addEventListener('click', function(e) {
                        if (e.target.classList.contains('adv-marker-edit-btn')) {
                            var idx = Number(e.target.getAttribute('data-idx'));
                            if (!isNaN(idx)) {
                                window.editMarker(idx);
                                advancedEditModal.style.display = 'none';
                            }
                        }
                    });
                }
                if (advancedEditClassesPanel) advancedEditClassesPanel.style.display = 'none';
            });
        }
        // Sınıfları Düzenle butonu işlevi
        if (advancedEditClassesBtn) {
            advancedEditClassesBtn.addEventListener('click', function() {
                if (advancedEditStepSelect) advancedEditStepSelect.style.display = 'none';
                if (advancedEditClassesPanel) {
                    advancedEditClassesPanel.style.display = 'block';
                   advancedEditClassesPanel.innerHTML = `
    <button id="adv-class-back-btn">&larr; Geri</button>
    <div>
        <h3>Sınıf Ara</h3>
        <input type="text" id="adv-class-search" placeholder="Sınıf adı ara...">
        <div id="adv-class-buttons">
            <button id="adv-class-search-btn">Ara</button>
            <button id="adv-class-select-all">Tümünü Seç</button>
            <button id="adv-class-deselect-all">Seçimi Kaldır</button>
            <button id="adv-class-delete-selected">Seçili Sınıfları Sil</button>
        </div>
        <ul id="adv-class-list"></ul>
    </div>
`;
                    // Geri butonu işlevi
                    var backBtn = document.getElementById('adv-class-back-btn');
                    if (backBtn) backBtn.onclick = function() {
                        advancedEditClassesPanel.style.display = 'none';
                        advancedEditStepSelect.style.display = 'flex';
                    };
                    // Sınıf listesi işlevleri
                    let filteredClasses = classesData.slice();
                    
function renderClassList() {
    var list = document.getElementById('adv-class-list');
    if (!list) return;
    list.innerHTML = '';
    filteredClasses.forEach(function(cls, idx) {
        var li = document.createElement('li');
        
        // Dinamik style ayarları (margin, padding vb. burada kontrol ediliyor)
        li.style.display = 'flex';
        li.style.alignItems = 'center';  // Label'i sola, butonu sağa yasla
        li.style.padding = '0px 0px';  // Padding'i tamamen kaldır
        li.style.borderBottom = '1px solid #eee';
        li.style.marginBottom = '0px';  // Margin'i koru
        li.style.marginTop = '0px';     // Margin'i koru
        li.style.lineHeight = '1';      // Satır yüksekliğini azalt
        
        li.innerHTML = `
            <label style="display:flex;align-items:center;gap:8px;">
                <input type="checkbox" class="adv-class-checkbox" data-idx="${idx}">
                <span style="font-weight:600;">${cls}</span>
            </label>
            <div class="edit-btn-container" style="margin-left: auto;">
                <button class="adv-class-edit-btn" data-idx="${idx}" style="background:#ffc107;color:#222;border-radius:8px;padding:4px 12px;">Düzenle</button>
            </div>
        `;
        list.appendChild(li);
    });
}

// Fonksiyonu çağırarak listeyi başlat (örneğin, panel açıldığında)
renderClassList();
                    // Arama işlevi (oninput kaldırıldı, butonla tetikleniyor)
                    document.getElementById('adv-class-search-btn').onclick = function() {
                        const val = document.getElementById('adv-class-search').value.trim().toLowerCase();
                        filteredClasses = classesData.filter(cls => cls.toLowerCase().includes(val));
                        renderClassList();
                    };
                    // Tümünü Seç/Kaldır
                    document.getElementById('adv-class-select-all').onclick = function() {
                        document.querySelectorAll('.adv-class-checkbox').forEach(cb => cb.checked = true);
                    };
                    document.getElementById('adv-class-deselect-all').onclick = function() {
                        document.querySelectorAll('.adv-class-checkbox').forEach(cb => cb.checked = false);
                    };
                    // Toplu silme
                    document.getElementById('adv-class-delete-selected').onclick = async function() {
                        var selected = Array.from(document.querySelectorAll('.adv-class-checkbox:checked')).map(cb => Number(cb.getAttribute('data-idx')));
                        if ( selected.length === 0) { alert('Seçili sınıf yok!'); return; }
                        if (!confirm('Seçili sınıfları silmek istediğinize emin misiniz?')) return;
                        for (let idx of selected) {
                            if (filteredClasses[idx]) {
                                await deleteClassFromDB(filteredClasses[idx]);

                            }
                        }
                        await loadClassesFromDB();
                        filteredClasses = classesData.slice();
                        renderClassList();
                    };
                    // Düzenle ve sil butonları
                    advancedEditClassesPanel.addEventListener('click', async function(e) {
                        if (e.target.classList.contains('adv-class-edit-btn')) {
                            var idx = Number(e.target.getAttribute('data-idx'));
                            if (!isNaN(idx)) {
                                const newName = prompt('Yeni sınıf adını girin:', filteredClasses[idx]);
                                if (newName && newName.trim() && !classesData.includes(newName.trim())) {
                                    await saveClassToDB(newName.trim());
                                    await deleteClassFromDB(filteredClasses[idx]);
                                    await loadClassesFromDB();
                                    filteredClasses = classesData.slice();
                                    renderClassList();
                                }
                            }
                        } else if (e.target.classList.contains('adv-class-delete-btn')) {
                            var idx = Number(e.target.getAttribute('data-idx'));
                            if (!isNaN(idx)) {
                                if (confirm('Bu sınıfı silmek istediğinizden emin misiniz? Markerlar silinmeyecek, sadece sınıf bağlantısı kaldırılacak.')) {
                                    await deleteClassFromDB(filteredClasses[idx]);
                                    await loadClassesFromDB();
                                    filteredClasses = classesData.slice();
                                    renderClassList();
                                }
                            }
                        }
                    });
                }
                if (advancedEditMarkersPanel) advancedEditMarkersPanel.style.display = 'none';
            });
        }
    }

    // Modal dışında tıklayınca kapat
    if (advancedEditModal) {
        advancedEditModal.addEventListener('click', function(e) {
            if (e.target === advancedEditModal) {
                advancedEditModal.style.display = 'none';
            }
        });
    }
    // else ve console.error kaldırıldı (lint hatası düzeltildi)

    // Yeni Marker Listesi butonu işlevi
    if (showAdminPanelBtn) {
        showAdminPanelBtn.addEventListener('click', function() {
            document.getElementById('admin-modal').style.display = 'block';
            loadAdminMarkers();
        });
    }
    
    // Sınıf Yönetimi butonu işlevi
    if (manageClassesBtn) {
        manageClassesBtn.addEventListener('click', function() {
            document.getElementById('class-modal').style.display = 'block';
            loadClassList();
        });
    }

    // Modal Kapatma
    var modals = document.querySelectorAll('.modal');
    modals.forEach(function(modal) {
        var closeBtn = modal.querySelector('.close, .image-viewer-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                modal.style.display = 'none';
                if (loginModal) loginModal.querySelector('#login-error').textContent = '';
                // HATA KONTROLÜ EKLENDİ ↓↓↓
                if (editModal) {
                    var imageErrorElem = editModal.querySelector('#image-error');
                    if (imageErrorElem) imageErrorElem.textContent = '';
                }
            });
        }
    });

    // Düzenleme pop-up'ını kapatınca admin pop-up'ını aç
    var editModalCloseBtn = document.querySelector('#edit-modal .close');
    if (editModalCloseBtn) {
        editModalCloseBtn.addEventListener('click', function() {
            document.getElementById('admin-modal').style.display = 'block';
        });
    }
    
    // Sınıf modalı kapatma (admin panelini açma davranışı kaldırıldı)
    var classModalCloseBtn = document.querySelector('#class-modal .close');
    if (classModalCloseBtn) {
        classModalCloseBtn.addEventListener('click', function() {
            document.getElementById('class-modal').style.display = 'none';
        });
    }

    // Login Formu
    var loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            var username = document.getElementById('username-input').value;
            var password = document.getElementById('password-input').value;

            // Giriş yapılıyor overlay'i göster
            var overlay = document.createElement('div');
            overlay.id = 'login-overlay';
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100vw';
            overlay.style.height = '100vh';
            overlay.style.background = 'rgba(0,0,0,0.5)';
            overlay.style.zIndex = '100002';
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.innerHTML = '<div style="background:#fff;padding:32px 48px;border-radius:18px;font-size:2rem;font-weight:600;color:#007bff;box-shadow:0 2px 16px rgba(0,0,0,0.18);">Giriş yapılıyor...</div>';
            document.body.appendChild(overlay);

            try {
                const hashedPassword = await hashPassword(password);
                console.log('Giriş şifresi hash\'i:', hashedPassword);

                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password: hashedPassword })
                });
                const result = await response.json();

                if (result.success) {
                    // Giriş başarılıysa overlay 2 saniye kalsın, sonra reload
                    authToken = result.token;
                    localStorage.setItem('authToken', authToken);
                    // --- KULLANICI ADINI LOCALSTORAGE'A KAYDET ---
                    if (result.username) {
                        localStorage.setItem('adminUsername', result.username);
                    } else {
                        localStorage.setItem('adminUsername', username);
                    }
                    setTimeout(function() {
                        window.location.reload();
                    }, 2000);
                } else {
                    // Başarısızsa overlay'i kaldır, hata mesajı göster
                    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
                    var loginModal = document.getElementById('login-modal');
                    if (loginModal) loginModal.querySelector('#login-error').textContent = result.message || 'Kullanıcı adı veya şifre yanlış!';
                }
            } catch (error) {
                if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
                var loginModal = document.getElementById('login-modal');
                if (loginModal) loginModal.querySelector('#login-error').textContent = 'Sunucu bağlantı hatası.';
                console.error('Hata:', error);
            }
        });
    } else {
        console.error('login-form bulunamadı!');
    }

    // Marker listesini yükleyen fonksiyon
    function loadAdminMarkers() {
        var markerList = document.getElementById('marker-list');
        if (!markerList) return;

        // --- YENİ: Panel başlığını değiştir ---
        const adminModal = document.getElementById('admin-modal');
        if (adminModal) {
            const title = adminModal.querySelector('h2');
            if (title) title.textContent = 'Marker Paneli';
        }

        // --- YENİ: Sıralama kontrollerini ekle ---
        let sortControls = document.getElementById('marker-sort-controls');
        if (!sortControls) {
            sortControls = document.createElement('div');
            sortControls.id = 'marker-sort-controls';
            sortControls.style.display = 'flex';
            sortControls.style.alignItems = 'center';
            sortControls.style.gap = '10px';
            sortControls.style.marginBottom = '15px';
            sortControls.innerHTML = `
                <label for="sort-criteria" style="font-weight: 400;">Sırala:</label>
                <select id="sort-criteria" style="padding: 4px; border-radius: 5px;">
                    <option value="updatedAt">Son Değişiklik</option>
                    <option value="createdAt">Oluşturma Tarihi</option>
                    <option value="title">Alfabetik</option>
                </select>
                <button id="sort-reverse-btn" title="Sıralamayı tersine çevir" style="padding: 4px 8px; cursor: pointer;">⇅</button>
            `;
            markerList.parentNode.insertBefore(sortControls, markerList);

            // Event listener'ları sadece bir kez ekle
            document.getElementById('sort-criteria').addEventListener('change', renderSortedMarkers);
            document.getElementById('sort-reverse-btn').addEventListener('click', () => {
                // State'i değiştir ve yeniden render et
                window.isSortReversed = !window.isSortReversed;
                renderSortedMarkers();
            });
        }

        // --- YENİ: Sıralama state'ini yönet ---
        // Eğer state tanımlı değilse, varsayılan olarak false ata
        if (typeof window.isSortReversed === 'undefined') {
            window.isSortReversed = false;
        }
        
        function renderSortedMarkers() {
            const criteria = document.getElementById('sort-criteria').value;
            let sortedMarkers = [...markersData]; // Orijinal diziyi bozmamak için kopyala

            sortedMarkers.sort((a, b) => {
                let valA, valB;
                if (criteria === 'title') {
                    valA = a.title.toLowerCase();
                    valB = b.title.toLowerCase();
                } else { // createdAt veya updatedAt
                    // Geçersiz tarihleri en sona atmak için kontrol
                    valA = a[criteria] ? new Date(a[criteria]).getTime() : 0;
                    valB = b[criteria] ? new Date(b[criteria]).getTime() : 0;
                    if (isNaN(valA)) valA = 0;
                    if (isNaN(valB)) valB = 0;
                }

                if (valA < valB) return -1;
                if (valA > valB) return 1;
                return 0;
            });

            // Varsayılan sıralama yönü: Tarihler için yeniden eskiye, alfabe için A-Z.
            // Tarih ise, sort'un doğal (eskiden yeniye) sonucunu ters çevirerek en yeniyi başa al.
            if (criteria === 'createdAt' || criteria === 'updatedAt') {
                sortedMarkers.reverse();
            }

            // Eğer kullanıcı "Tersine Çevir" butonuna bastıysa, mevcut sıralamayı tersine çevir.
            if (window.isSortReversed) {
                sortedMarkers.reverse();
            }
            
            // Listeyi temizle ve sıralanmış verilerle doldur
            markerList.innerHTML = '';
            sortedMarkers.forEach(function(markerData) {
                // Sıralanmış listedeki marker'ın orijinal `markersData` dizisindeki index'ini bulmalıyız.
                // Çünkü `editMarker` fonksiyonu bu orijinal index'e göre çalışıyor.
                const originalIndex = markersData.findIndex(m => m.id === markerData.id);
                if (originalIndex === -1) return; // Eğer bir şekilde bulunamazsa (veri tutarsızlığı), bu adımı atla.

                var li = document.createElement('li');
                li.style.display = 'flex';
                li.style.alignItems = 'center';
                li.style.justifyContent = 'space-between';
                li.style.padding = '8px 4px';
                li.style.borderBottom = '1px solid #eee';

                // Sol taraf: Başlık ve Tarihler
                var infoDiv = document.createElement('div');
                infoDiv.style.display = 'flex';
                infoDiv.style.flexDirection = 'column';
                infoDiv.style.gap = '4px';

                var titleSpan = document.createElement('span');
                titleSpan.textContent = markerData.title;
                titleSpan.style.fontWeight = '600';

                // Tarihleri içeren küçük bir div
                var timestampsDiv = document.createElement('div');
                timestampsDiv.style.fontSize = '11px';
                timestampsDiv.style.color = '#777';
                const createdAt = formatTimestamp(markerData.createdAt);
                const updatedAt = formatTimestamp(markerData.updatedAt);
                let timestampsText = `Oluşturma: ${createdAt || 'N/A'}`;
                if (updatedAt && updatedAt !== createdAt) {
                    timestampsText += ` | Son Değişiklik: ${updatedAt}`;
                }
                timestampsDiv.textContent = timestampsText;

                infoDiv.appendChild(titleSpan);
                infoDiv.appendChild(timestampsDiv);

                // Sağ taraf: Butonlar
                var btnDiv = document.createElement('div');
                btnDiv.style.display = 'flex';
                btnDiv.style.gap = '10px';
        
                var editBtn = document.createElement('button');
                editBtn.textContent = 'Düzenle';
                editBtn.onclick = function(e) {
                    e.stopPropagation();
                    editMarker(originalIndex); // Düğmelerin doğru çalışması için her zaman orijinal index'i kullan
                };
        
                var deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'Sil';
                deleteBtn.onclick = async function(e) {
                    e.stopPropagation();
                    if (confirm('Bu markerı silmek istediğinizden emin misiniz?')) {
                        try {
                            await deleteMarkerFromDB(markerData.id);
                            await loadMarkersFromDB(); // Veriyi yeniden yükle, bu da loadAdminMarkers'ı ve sıralamayı yeniden tetikleyecek
                        } catch (error) {
                            alert('Marker silinemedi.');
                        }
                    }
                };
        
                btnDiv.appendChild(editBtn);
                btnDiv.appendChild(deleteBtn);
        
                li.appendChild(infoDiv); // Başlık ve tarihları içeren div'i ekle
                li.appendChild(btnDiv);
        
                markerList.appendChild(li);
            });
        }

        // Paneli ilk yüklemede veya veri güncellendiğinde varsayılan sıralama ile render et
        renderSortedMarkers();
    }
    
    // Sınıf listesini yükleyen fonksiyon
    function loadClassList() {
        var classList = document.getElementById('class-list');
        var classSelect = document.getElementById('class-select');
        var filterOptions = document.getElementById('filter-options');
        
        if (!classList || !classSelect || !filterOptions) return;
        
        classList.innerHTML = '';
        classSelect.innerHTML = '<option value="">-- Sınıf Seç --</option>';
        filterOptions.innerHTML = '';
        
        classesData.forEach((className, index) => {
            var li = document.createElement('li');
            li.className = 'class-item-wrapper';
            li.innerHTML = `
                <span>${className}</span>
                <div>
                    <button onclick="editClass(${index})">Düzenle</button>
                    <button class="delete-btn" onclick="deleteClass(${index})">Sil</button>
                </div>
            `;
            classList.appendChild(li);
            
            var option = document.createElement('option');
            option.value = className;
            option.textContent = className;
            classSelect.appendChild(option);
            
            var filterLabel = document.createElement('label');
            filterLabel.innerHTML = `<input type="checkbox" class="filter-checkbox" value="${className}"> ${className}`;
            filterOptions.appendChild(filterLabel);
        });
        
        document.querySelectorAll('.filter-checkbox').forEach(checkbox => {
            checkbox.checked = activeFilters.has(checkbox.value);
            checkbox.addEventListener('change', updateFilters);
        });
    }
    
    // Sınıf Ekleme Formu
    const classForm = document.getElementById('class-form');
    if (classForm) {
        classForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const newClassName = document.getElementById('new-class-name').value.trim();
            if (newClassName && !classesData.includes(newClassName)) {
                try {
                    await saveClassToDB(newClassName);
                    loadClassList();
                    document.getElementById('new-class-name').value = '';
                    document.getElementById('class-modal').style.display = 'none';
                } catch (error) {
                    alert('Sınıf eklenemedi.');
                }
            }
        });
    }
    
    // Sınıf Düzenleme
    window.editClass = async function(index) {
        const newName = prompt('Yeni sınıf adını girin:', classesData[index]);
        if (newName && newName.trim() && !classesData.includes(newName.trim())) {
            const oldName = classesData[index];
            try {
                // Delete old class first
                await deleteClassFromDB(oldName);
                
                // Save new class
                await saveClassToDB(newName.trim());

                // Update markers with the new class name
                for (const marker of markersData) {
                    if (marker.class === oldName) {
                        marker.class = newName.trim();
                        await deleteMarkerFromDB(marker.id);
                        await saveMarkerToDB(marker);
                    }
                }
                loadClassList();
                loadMarkersFromDB();
            } catch (error) {
                alert('Sınıf güncellenemedi.');
            }
        }
    };
    
    // Sınıf Silme
    window.deleteClass = async function(index) {
        if (!adminMode) {
            alert('Bu işlemi yapmak için admin modunda olmalısınız.');
            return;
        }
        if (confirm('Bu sınıfı silmek istediğinizden emin misiniz? Markerlar silinmeyecek, sadece sınıf bağlantısı kaldırılacak.')) {
            const classToDelete = classesData[index];
            try {
                // Sınıfa bağlı markerların class alanını boşalt
                for (const marker of markersData) {
                    if (marker.class === classToDelete) {
                        marker.class = '';
                        await saveMarkerToDB(marker);
                    }
                }
                // Sınıfı sil
                await deleteClassFromDB(classToDelete);
                // Bekleme ekranı göster
                var overlay = document.createElement('div');
                overlay.id = 'class-delete-overlay';
                overlay.style.position = 'fixed';
                overlay.style.top = '0';
                overlay.style.left = '0';
                overlay.style.width = '100vw';
                overlay.style.height = '100vh';
                overlay.style.background = 'rgba(0,0,0,0.5)';
                overlay.style.zIndex = '9999';
                overlay.style.display = 'flex';
                overlay.style.alignItems = 'center';
                overlay.style.justifyContent = 'center';
                overlay.innerHTML = '<div style="background:#fff;padding:32px 48px;border-radius:18px;font-size:2rem;font-weight:600;color:#007bff;box-shadow:0 2px 16px rgba(0,0,0,0.18);">Sınıf siliniyor...</div>';
                document.body.appendChild(overlay);
                setTimeout(function() {
                    window.location.reload();
                }, 2200);
            } catch (error) {
                alert('Sınıf silinemedi.');
            }
        }
 }
   

    // Yeni Marker Ekle Butonu
    var addNewBtn = document.getElementById('add-new-marker');
    if (addNewBtn) {
        addNewBtn.addEventListener('click', function() {
            selectedMarkerIndex = -1;
            const newMarkerData = { 
                latLng: [imgHeight / 2, imgWidth / 2], 
                title: '', 
                description: '', 
                images: [], 
                class: '',
                createdAt: new Date().toISOString(), // Oluşturma anı
                updatedAt: new Date().toISOString()  // Güncelleme anı
            };
            openEditModal(newMarkerData, selectedMarkerIndex);
            document.getElementById('admin-modal').style.display = 'none';
        });
    }

    // Harita Tıklama (Admin Modunda Konum Seç)
    map.on('click', function(e) {
        if (adminMode && document.getElementById('edit-modal').style.display === 'block') {
            var latLng = [e.latlng.lat.toFixed(2), e.latlng.lng.toFixed(2)];
            document.getElementById('latlng-input').value = latLng.join(', ');
            var tempMarker = L.marker(latLng).addTo(map);


            setTimeout(function() { map.removeLayer(tempMarker); }, 2000);
        }
    });

    // Görsel Yükleme ve Düzenleme
    var tempImages = [];
function updateImageList() {
    var imageList = document.getElementById('image-list');
    if (!imageList) return;
    imageList.innerHTML = '';
    tempImages.forEach((img, i) => {
        var div = document.createElement('div');
        div.className = 'image-item';
        div.innerHTML = `
            <img src="${img}" alt="Image ${i}" onclick="openTempImageViewer(${i})" style="cursor: pointer;">
            <button type="button" onclick="deleteImage(${i})">Sil</button>
        `;
        imageList.appendChild(div);
    });
}

    window.deleteImage = function(index) {
    if (confirm('Bu görseli silmek istediğinizden emin misiniz?')) {
        tempImages.splice(index, 1);
        updateImageList();
    }
};
    const addImageUrlBtn = document.getElementById('add-image-url');
    if (addImageUrlBtn) {
        addImageUrlBtn.addEventListener('click', function() {
            const imageUrlInput = document.getElementById('image-url-input');
            let imageError = document.getElementById('image-error');
            const url = imageUrlInput.value.trim();

            // Uyarı mesajı yoksa oluştur
            if (!imageError) {
                imageError = document.createElement('div');
                imageError.id = 'image-error';
            }

            function showError(msg) {
                imageError.textContent = msg;
                if (imageError.parentNode) imageError.parentNode.removeChild(imageError);
                imageUrlInput.parentNode.insertBefore(imageError, imageUrlInput.nextSibling);
            }

            if (!url) {
                showError('Lütfen bir görsel URL girin.');
                return;
            }

            const validExt = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i;
            if (!validExt.test(url)) {
                showError('Lütfen geçerli bir görsel URL girin.');
                return;
            }

            // Görsel yüklenebilir mi kontrolü (asenkron)
            const img = new Image();
            img.onload = function() {
                // Yüklenebiliyorsa hata mesajını kaldır ve görseli ekle
                if (imageError && imageError.parentNode) imageError.parentNode.removeChild(imageError);
                if (!tempImages.includes(url)) {
                    tempImages.push(url);
                    updateImageList();
                }
                imageUrlInput.value = '';
            };
            img.onerror = function() {
                showError('Lütfen geçerli ve erişilebilir bir görsel URL girin.');
            };
            img.src = url;
        });
    }

    // Düzenleme Modal Aç
    window.openEditModal = async function(data, index) {
        // --- Modal arka planına tıklınca marker düzenleme modalı kapanmasın ---
        var editModal = document.getElementById('edit-modal');
        if (editModal) {
            editModal.onclick = function(e) {
                // Sadece modal-content dışına tıklanırsa hiçbir şey yapma (kapatma!)
                if (e.target === editModal) {
                    e.stopPropagation();
                    e.preventDefault();
                    return false;
                }
            };
        }

        // --- marker-form submit ile modal kapanmasını engelle ---
        var markerForm = document.getElementById('marker-form');
        if (markerForm) {
            markerForm.onsubmit = function(ev) {
                // Sadece kaydetme işlemi yapılacak, modal burada kapanmayacak
                // (Modalı kapatan başka bir kod varsa engelle)
                ev = ev || window.event;
                if (ev) {
                    ev.stopPropagation();
                    // Modalı kapatan başka bir kodun çalışmasını engelle
                    // (Kaydetme işlemi sonrası modalı kapatmak istiyorsanız, sadece başarılı kayıttan sonra kapatın)
                }
                // Modalı kapatma işlemi burada yapılmaz!
                return true;
            };
        }
    // --- konum kilitle kutucuğu için orijinal değerleri yedekle ---
    let originalDraggable = (typeof data.draggable === 'boolean') ? data.draggable : false;
    let originalCheckboxState = !(data.draggable === true);
        var editModal = document.getElementById('edit-modal');
        if (!editModal) return;
        editModal.style.display = 'block';
        selectedMarkerIndex = index;
        
        loadClassList();

        // --- DÜZENLEME MODALINDA ZAMAN DAMGASI GÖSTER ---
        const createdAt = formatTimestamp(data.createdAt);
        const updatedAt = formatTimestamp(data.updatedAt);
        let timestampsHtmlContent = '';
        if (createdAt) {
            timestampsHtmlContent += `Oluşturulma: ${createdAt}`;
        }
        if (updatedAt && updatedAt !== createdAt) {
            timestampsHtmlContent += `<br>Son Değişiklik: ${updatedAt}`;
        }

        let timestampsDiv = document.getElementById('edit-modal-timestamps');
        if (!timestampsDiv) {
            timestampsDiv = document.createElement('div');
            timestampsDiv.id = 'edit-modal-timestamps';
            timestampsDiv.style.fontSize = '11px';
            timestampsDiv.style.color = '#888';
            timestampsDiv.style.marginBottom = '12px';
            timestampsDiv.style.textAlign = 'left';
            const titleInput = document.getElementById('title-input');
            if (titleInput && titleInput.parentNode) {
                titleInput.parentNode.insertBefore(timestampsDiv, titleInput);
            }
        }
        timestampsDiv.innerHTML = timestampsHtmlContent;


        document.getElementById('title-input').value = data.title;
        document.getElementById('desc-input').value = data.description;
        document.getElementById('latlng-input').value = data.latLng.join(', ');

        // --- Konumu Kilitle kutucuğu ---
        let lockRow = document.getElementById('marker-lock-row');
        if (lockRow) lockRow.remove();
        lockRow = document.createElement('div');
        lockRow.id = 'marker-lock-row';
        lockRow.style.display = 'flex';
        lockRow.style.alignItems = 'center';
        lockRow.style.gap = '8px';
        lockRow.style.margin = '8px 0 8px 0';

        // YENİ: Kutucuk özellikleri
        const lockCheckbox = document.createElement('input');
        lockCheckbox.type = 'checkbox';
        lockCheckbox.id = 'marker-lock-checkbox';
        lockCheckbox.checked = !(data.draggable === true);
        lockCheckbox.setAttribute('data-selected', 'true');
        lockCheckbox.setAttribute('data-label-id', '0');
        lockCheckbox.style.width = '49.7188px';
        lockCheckbox.style.height = '17px';
        lockCheckbox.style.transition = 'none';

        // Etiket
        const lockLabel = document.createElement('label');
        lockLabel.htmlFor = 'marker-lock-checkbox';
        lockLabel.textContent = 'Konumu Kilitle (Sürüklemeyi Engelle)';

        // Ekle
        lockRow.appendChild(lockCheckbox);
        lockRow.appendChild(lockLabel);

        // LatLng input'un hemen altına ekle
        const latlngInput = document.getElementById('latlng-input');
        if (latlngInput && latlngInput.parentNode) {
            latlngInput.parentNode.insertBefore(lockRow, latlngInput.nextSibling);
        }

        // Modal açıldığında marker'ı kilitle/det kilidini aç
        let markerObj = (typeof index === 'number' && index >= 0) ? markerLayers[index] : null;
        if (markerObj && markerObj.marker && markerObj.marker.dragging) {
            markerObj.marker.dragging.disable();
            if (!lockCheckbox.checked) markerObj.marker.dragging.enable();
        }
        lockCheckbox.addEventListener('change', function() {
            if (markerObj && markerObj.marker && markerObj.marker.dragging) {
                if (this.checked) {
                    markerObj.marker.dragging.disable();
                } else {
                    markerObj.marker.dragging.enable();
                }
            }
        });
    // --- Local snapshot ile değişiklik uyarı sistemi ve log ---
    // Her yeni marker açılışında eski snapshot'ı sil
    if (window.markerFormSnapshot) {
        window.markerFormSnapshot = null;
    }
    setTimeout(() => {
        window.markerFormSnapshot = JSON.stringify({
            title: document.getElementById('title-input').value || '',
            description: document.getElementById('desc-input').value || '',
            latLng: document.getElementById('latlng-input').value || '',
            class: (() => {
                const tags = document.querySelectorAll('#class-tags span');
                return Array.from(tags).map(t => t.childNodes[0].textContent.trim()).sort().join(',');
            })(),
            // --- DÜZELTME: Renk artık doğrudan selectedColor değişkeninden (HEX kodu) alınacak ---
            color: selectedColor,
            barcode: (document.getElementById('barcode-input') || {}).value || '',
            images: (() => {
                const imgs = document.querySelectorAll('#image-list img');
                return Array.from(imgs).map(img => img.src).join(',');
            })(),
            // --- DEĞİŞİKLİK: Kilit durumu artık doğrudan checkbox'tan alınacak ---
            draggable: document.getElementById('marker-lock-checkbox') && !document.getElementById('marker-lock-checkbox').checked ? '1' : '0'
        });
    }, 10);


        // Modal kapatılırsa (kaydetmeden), marker ve kutucuk eski haline döner
        function revertLockState() {
            if (markerObj && markerObj.marker && markerObj.marker.dragging) {
                if (originalDraggable) {
                    markerObj.marker.dragging.enable();
                } else {
                    markerObj.marker.dragging.disable();
                }
            }
            lockCheckbox.checked = originalCheckboxState;
        }

        // Modal kapatma butonlarını bul ve revert+snapshot kontrolü+log ekle
        const closeBtns = editModal.querySelectorAll('.close');
        closeBtns.forEach(function(btn) {
            btn.onclick = null;
            // Önce eski event listener'ı kaldırmak için fonksiyonu referans olarak tanımla
            function closeHandler(ev) {
                // Sadece marker düzenleme modalı için, event'ın yayılımını kesin olarak engelle
                ev.stopPropagation();
                ev.stopImmediatePropagation();
                // İptal durumunda modalın kapanmasını kesin engelle
                let cancelled = false;
                // Eğer aktif modal edit-modal ise, başka hiçbir global/modal kapatma event'i çalışmasın
                var editModal = document.getElementById('edit-modal');
                if (editModal && editModal.style.display === 'block') {
                    window.__activeModal = 'edit-modal';
                } else {
                    window.__activeModal = null;
                }
                if (window.__activeModal === 'edit-modal' && ev.target.classList.contains('close')) {
                    // Sadece edit-modal açıkken ve .close'a tıklanmışsa, this handler çalışsın
                } else if (window.__activeModal === 'edit-modal') {
                    // edit-modal açıkken başka bir kapatma event'i tetiklenirse, hiçbir şey yapma
                    return false;
                }
                window.isClosingEditModal = true;
                revertLockState();
                if (!window.markerFormSnapshot) {
                    // Snapshot yoksa direkt kapat
                    editModal.style.display = 'none';
                    var adminModal = document.getElementById('admin-modal');
                    if (adminModal) adminModal.style.display = 'block';
                    window.isClosingEditModal = false;
                    // Tüm close eventlerini kaldır
                    closeBtns.forEach(function(b){ b.removeEventListener('click', closeHandler); });
                    return;
                }
                // Snapshot ile mevcut durumu kıyasla
                const currentData = JSON.stringify({
                    title: document.getElementById('title-input').value || '',
                    description: document.getElementById('desc-input').value || '',
                    latLng: document.getElementById('latlng-input').value || '',
                    class: (() => {
                        const tags = document.querySelectorAll('#class-tags span');
                        return Array.from(tags).map(t => t.childNodes[0].textContent.trim()).sort().join(',');
                    })(),
                    color: selectedColor, // Kapsam içinde olduğu için artık erişilebilir
                    barcode: (document.getElementById('barcode-input') || {}).value || '',
                    images: (() => {
                        const imgs = document.querySelectorAll('#image-list img');
                        return Array.from(imgs).map(img => img.src).join(',');
                    })(),
                    draggable: document.getElementById('marker-lock-checkbox') && !document.getElementById('marker-lock-checkbox').checked ? '1' : '0'
                });
                if (currentData !== window.markerFormSnapshot) {
                    showUnsavedChangesPanel(
                        function onConfirm() {
                            // Evet: Modalı kapat
                            editModal.style.display = 'none';
                            window.markerFormSnapshot = null;
                            var adminModal = document.getElementById('admin-modal');
                            if (adminModal) adminModal.style.display = 'block';
                            window.isClosingEditModal = false;
                            closeBtns.forEach(function(b){ b.removeEventListener('click', closeHandler); });
                        },
                        function onCancel() {
                            window.isClosingEditModal = false;
                        }
                    );
                    // Çıkış işlemini burada tamamen durdur, modalı asla kapatma!
                    return;
                }
                // Değişiklik yoksa doğrudan kapat
                editModal.style.display = 'none';
                window.markerFormSnapshot = null;
                var adminModal = document.getElementById('admin-modal');
                if (adminModal) adminModal.style.display = 'block';
                window.isClosingEditModal = false;
                closeBtns.forEach(function(b){ b.removeEventListener('click', closeHandler); });
// Kaydedilmemiş değişiklikler için özel uyarı paneli fonksiyonu
function showUnsavedChangesPanel(onConfirm, onCancel) {
    // Panel açılırken marker düzenleme modalının close butonlarını devre dışı bırak
    var editModal = document.getElementById('edit-modal');
    var closeBtns = editModal ? editModal.querySelectorAll('.close') : [];
             // Tüm close eventlerini geçici olarak kaldır
    closeBtns.forEach(function(b){
        b.__old_onclick = b.onclick;
        b.onclick = function(e) { e.stopPropagation(); e.preventDefault(); };
    });
    let panel = document.getElementById('unsaved-changes-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'unsaved-changes-panel';
        panel.innerHTML = `
            <div class="unsaved-changes-modal">
                <div class="unsaved-changes-content">
                    <p>Kaydedilmemiş değişiklikler var. Çıkmak istediğinize emin misiniz?</p>
                    <button id="unsaved-yes">Evet</button>
                    <button id="unsaved-no">Hayır</button>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
    } else {
        panel.style.display = 'flex';
    }
    // Panel açıldığında body'ye class ekle
    document.body.classList.add('unsaved-panel-open');
    document.getElementById('unsaved-yes').onclick = function(e) {
       
        e.stopPropagation();
        panel.style.display = 'none';
        document.body.classList.remove('unsaved-panel-open');
        // Panel kapanınca close butonlarını tekrar aktif et
        closeBtns.forEach(function(b){
            if (b.__old_onclick) b.onclick = b.__old_onclick;
            delete b.__old_onclick;
        });
        // --- EKLENDİ: Kaydetmeden çıkınca tempImages temizlensin ---
        tempImages = [];
        updateImageList();
        if (onConfirm) onConfirm();
    };
    document.getElementById('unsaved-no').onclick = function(e) {
        e.stopPropagation();
        panel.style.display = 'none';
        document.body.classList.remove('unsaved-panel-open');
        // Panel kapanınca close butonlarını tekrar aktif et
        closeBtns.forEach(function(b){
            if (b.__old_onclick) b.onclick = b.__old_onclick;
            delete b.__old_onclick;
        });
        // Marker düzenleme modalı tekrar görünür olsun
        var editModal = document.getElementById('edit-modal');
        if (editModal) editModal.style.display = 'block';
        if (onCancel) onCancel();
    };
   

    panel.onclick = function(e) {
        // Sadece overlay'e tıklanırsa hiçbir şey yapma, paneli kapatma
        if (e.target === panel) {
            e.stopPropagation();
        }
    };
}
            }
            btn.addEventListener('click', closeHandler);
        });

        // --- Düzenleme modalında Barkod Okut butonu ---
        const scanBarcodeBtn = document.getElementById('scan-barcode-btn');
        if (scanBarcodeBtn) {
            scanBarcodeBtn.onclick = function() {
                // Barkod okutma modalını aç
                openBarcodeModal('main');
            };
        }

        // --- Barkod alanı ---
        const barcodeRow = document.getElementById('barcode-row');
        const barcodeInput = document.getElementById('barcode-input');
        const addBarcodeBtn = document.getElementById('add-barcode-btn');
        const removeBarcodeBtn = document.getElementById('remove-barcode-btn');
        if (barcodeRow && barcodeInput && addBarcodeBtn && removeBarcodeBtn) {
            // Sadece admin modunda göster
            barcodeRow.style.display = (typeof adminMode !== 'undefined' && adminMode) ? 'flex' : 'none';
            barcodeInput.value = data.barcode || '';
            addBarcodeBtn.style.display = (!data.barcode) ? 'inline-block' : 'none';
            removeBarcodeBtn.style.display = (data.barcode) ? 'inline-block' : 'none';
            addBarcodeBtn.onclick = function() {
                // Barkod ekle: Modal açılır, kamera ile okutulmuşsa barcodeInput.value atanır
                // Manuel ekleme yok, sadece handleBarcodeResult ile atanır
                alert('Barkod eklemek için Barkod Okut butonunu kullanın. Okutulan barkod otomatik atanacaktır.');
            };
            removeBarcodeBtn.onclick = function() {
                if (confirm('Barkodu silmek istediğinizden emin misiniz?')) {
                    barcodeInput.value = '';
                    addBarcodeBtn.style.display = 'inline-block';
                    removeBarcodeBtn.style.display = 'none';
                }
            };
        }

        // Çoklu sınıf desteği: class artık dizi
        // Tag alanı
        const classTagsDiv = document.getElementById('class-tags');
        if (classTagsDiv) classTagsDiv.remove();
        const newTagsDiv = document.createElement('div');
        newTagsDiv.id = 'class-tags';
        newTagsDiv.style.display = 'flex';
        newTagsDiv.style.flexWrap = 'wrap';
        newTagsDiv.style.gap = '8px';
        // Sınıf taglarını göster
        let markerClasses = Array.isArray(data.class) ? data.class : (data.class ? [data.class] : []);
        function renderTags() {
            newTagsDiv.innerHTML = '';
            markerClasses.forEach((cls, idx) => {
                const tag = document.createElement('span');
                tag.style.borderRadius = '12px';
                tag.style.padding = '2px 10px 2px 8px';
                tag.style.display = 'inline-flex';
                tag.style.alignItems = 'center';
                tag.style.fontSize = '13px';
                // --- DÜZELTME: Sınıf adını ekle ---
                tag.textContent = cls;
                let x = document.createElement('span');
                x.textContent = '×';
                x.style.marginLeft = '6px';
                x.style.cursor = 'pointer';
                x.onclick = function() {
                    markerClasses = markerClasses.filter(c => c !== cls);
                    renderTags();
                };
                tag.appendChild(x);
                newTagsDiv.appendChild(tag);
            });
        }
        renderTags();
        // Sınıf seçimi
        const classSelect = document.getElementById('class-select');
        if (classSelect) {
            classSelect.value = '';
            classSelect.onchange = function() {
                const selected = classSelect.value;
                if (selected && !markerClasses.includes(selected)) {
                    markerClasses.push(selected);
                    renderTags();
                }
                classSelect.value = '';
            };
        }
        // Tag alanını classSelect'in hemen altına ekle
        if (classSelect && classSelect.parentNode) {
            classSelect.parentNode.insertBefore(newTagsDiv, classSelect.nextSibling);
        }

        // --- Renk seçici kutucuklar ---
    const colorRowId = 'marker-color-row';
    let colorRow = document.getElementById(colorRowId);
    if (colorRow) colorRow.remove();
    colorRow = document.createElement('div');
    colorRow.id = colorRowId;
    colorRow.style.display = 'flex';
    colorRow.style.flexWrap = 'wrap';
    colorRow.style.gap = '6px';
    colorRow.style.margin = '12px 0 8px 0';
    // Başlık ekle
    var colorTitle = document.createElement('div');
    colorTitle.textContent = 'Marker Rengi';
    colorTitle.style.fontWeight = 'bold';
    colorTitle.style.marginBottom = '6px';
    colorTitle.style.width = '100%';
    colorRow.appendChild(colorTitle);
        // 24 kontrast renk
        const markerColors = [
            '#e6194b','#3cb44b','#ffe119','#4363d8','#f58231','#911eb4','#46f0f0','#f032e6',
            '#bcf60c','#fabebe','#008080','#e6beff','#9a6324','#fffac8','#800000','#aaffc3',
            '#808000','#ffd8b1','#000075','#808080','#ffffff','#000000','#a9a9a9','#ff69b4'
        ];
        selectedColor = data.color || markerColors[0]; // <-- HATA DÜZELTME: Kapsamı genişletilmiş değişkene ata
        function updateColorBoxes() {
            Array.from(colorRow.children).forEach((box, i) => {
                if (i === 0) return; // başlık
                const color = markerColors[i-1];
                box.style.border = (color === selectedColor) ? '3px solid #333' : '2px solid #ccc';
                if (color === selectedColor) {
                    box.style.boxShadow = '0 0 0 3px #007bff';
                    box.innerHTML = '<svg width="14" height="14" style="position:absolute;top:4px;left:4px;pointer-events:none;" viewBox="0 0 14 14"><polyline points="3,7 6,10 11,4" style="fill:none;stroke:#007bff;stroke-width=2.5;stroke-linecap:round;stroke-linejoin:round"/></svg>';
                    box.style.position = 'relative';
                } else {
                    box.style.boxShadow = '';
                    box.innerHTML = '';
                    box.style.position = '';
                }
            });
        }
        markerColors.forEach((color, i) => {
            const colorBox = document.createElement('div');
            colorBox.style.width = '22px';
            colorBox.style.height = '22px';
            colorBox.style.borderRadius = '6px';
            colorBox.style.border = color === selectedColor ? '3px solid #333' : '2px solid #ccc';
            colorBox.style.background = color;
            colorBox.style.cursor = 'pointer';
            colorBox.title = color;
            if (color === selectedColor) {
                colorBox.style.boxShadow = '0 0 0 3px #007bff';
                colorBox.innerHTML = '<svg width="14" height="14" style="position:absolute;top:4px;left:4px;pointer-events:none;" viewBox="0 0 14 14"><polyline points="3,7 6,10 11,4" style="fill:none;stroke:#007bff;stroke-width=2.5;stroke-linecap:round;stroke-linejoin:round"/></svg>';
                colorBox.style.position = 'relative';
            }
            colorBox.onclick = function() {
                selectedColor = color;
                updateColorBoxes();
                // --- KALDIRILDI: Renk değiştiğinde snapshot GÜNCELLENMEYECEK. ---
            };
            colorRow.appendChild(colorBox);
        });
        // Renk kutucularını classSelect'in altına (tag'lerin altına) ekle
        if (classSelect && classSelect.parentNode) {
            classSelect.parentNode.insertBefore(colorRow, newTagsDiv.nextSibling);
        }
        // Her modal açılışında tik işaretini güncelle
        updateColorBoxes();

        tempImages = data.images || [];
        updateImageList();

        var form = document.getElementById('marker-form');
        if (!form) return;
            form.onsubmit = async function(ev) {
                ev.preventDefault();

                // --- YENİ: Kaydediliyor ekranını göster ---
                const savingOverlay = document.getElementById('saving-overlay');
                if (savingOverlay) savingOverlay.style.display = 'flex';


                // --- DEĞİŞİKLİK: Genişletilmiş konum sınır kontrolü ---
                var latlngStr = document.getElementById('latlng-input').value.replace(/\s+/g, '');
                var latlngArr = latlngStr.split(',').map(Number);
                var lat = latlngArr[0];
                var lng = latlngArr[1];
                if (
                    isNaN(lat) || isNaN(lng) ||
                    lat < -2000 || lat > 9000 ||
                    lng < -2000 || lng > 9000
                ) {
                    alert('Seçilen konum çok uzakta! Marker eklenemez/düzenlenemez. Geçerli aralık: -2000 ile 9000 arası.');
                    if (savingOverlay) savingOverlay.style.display = 'none'; // Hata durumunda overlay'i gizle
                    return;
                }

                // 12 haneli barkod kontrolü
                var barcodeValue = barcodeInput ? barcodeInput.value.trim() : '';
                if (barcodeValue) {
                    if (!/^\d{12}$/.test(barcodeValue)) {
                        alert('Barkod numarası 12 haneli bir sayı olmalıdır.');
                        if (savingOverlay) savingOverlay.style.display = 'none'; // Hata durumunda overlay'i gizle
                        barcodeInput.focus();
                        return;
                    }
                    // Eşsiz barkod kontrolü (başka markerda var mı?)
                    var duplicate = markersData.some(function(m, idx) {
                        if (!m.barcode) return false;
                        if (selectedMarkerIndex !== -1 && idx === selectedMarkerIndex) return false; // Kendi markerı hariç
                        return m.barcode === barcodeValue;
                    });
                    if (duplicate) {
                        alert('Bu barkod başka bir markerda zaten kayıtlı. Lütfen farklı bir barkod girin.');
                        if (savingOverlay) savingOverlay.style.display = 'none'; // Hata durumunda overlay'i gizle
                        barcodeInput.focus();
                        return;
                    }
                }

                var newData = {
                    latLng: document.getElementById('latlng-input').value.split(', ').map(Number),
                    title: document.getElementById('title-input').value,
                    description: document.getElementById('desc-input').value,
                    images: tempImages,
                    class: markerClasses, // Artık dizi
                    color: selectedColor,
                    barcode: barcodeInput ? barcodeInput.value : undefined,
                    draggable: !lockCheckbox.checked, // Kilitli değilse draggable true
                    createdAt: (selectedMarkerIndex !== -1 && markersData[selectedMarkerIndex].createdAt) ? markersData[selectedMarkerIndex].createdAt : new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                try {
                    if (selectedMarkerIndex === -1) {
                        await saveMarkerToDB(newData);
                    } else {
                        newData.id = markersData[selectedMarkerIndex].id;
                        await deleteMarkerFromDB(newData.id);
                        const savedMarker = await saveMarkerToDB(newData);
                        markersData[selectedMarkerIndex] = savedMarker; // Yerel veriyi güncelle
                    }
                    await loadMarkersFromDB(); // Backend'den güncel veriyi al
                    // loadAdminMarkers() fonksiyonunu loadMarkersFromDB tamamlandıktan sonra çağırın
                    setTimeout(loadAdminMarkers, 100); // Kısa bir gecikme ile çağırmak markerların güncellenmesini garanti eder
                    editModal.style.display = 'none';
                    document.getElementById('admin-modal').style.display = 'block';
                    // --- HATA DÜZELTME: Kaydettikten sonra snapshot'ı temizle ---
                    window.markerFormSnapshot = null;
                } catch (error) {
                    alert('Marker kaydedilemedi.');
                } finally {
                    // --- YENİ: İşlem bitince kaydediliyor ekranını gizle ---
                    if (savingOverlay) savingOverlay.style.display = 'none';
                }
            };

        var deleteBtn = document.getElementById('delete-marker');
        if (deleteBtn) {
            deleteBtn.style.display = selectedMarkerIndex === -1 ? 'none' : 'block';
            deleteBtn.onclick = async function() {
                if (selectedMarkerIndex !== -1 && confirm('Bu markerı silmek istediğinizden emin misiniz?')) {
                    try {
                        await deleteMarkerFromDB(markersData[selectedMarkerIndex].id);
                        loadMarkers();
                        loadAdminMarkers();
                        editModal.style.display = 'none';
                        document.getElementById('admin-modal').style.display = 'block';
                    } catch (error) {
                        alert('Marker silinemedi.');
                    }
                }
            };
        }
    }

    // Marker Düzenle
    window.editMarker = function(index) {
        selectedMarkerIndex = index;
        openEditModal(markersData[index], index);
    }

    // Büyük Görsel Görüntüleyici
    var imageViewerModal = document.getElementById('image-viewer-modal');
    var imageViewerMap = null;
    var currentImages = [];
    var currentImageIndex = 0;

    // --- YENİ: Düzenleme panelindeki geçici görseller için görüntüleyici ---
    window.openTempImageViewer = function(imageIndex) {
    currentImages = tempImages;  // Geçici görselleri kullan
    currentImageIndex = imageIndex;
    if (currentImages.length === 0) {
        console.log('No temp images found');
        return;
    }

    if (imageViewerMap) {
        imageViewerMap.remove();
    }
    var viewerDiv = document.getElementById('image-viewer-map');
    if (!viewerDiv) {
        console.log('viewerDiv not found');
        return;
    }
    viewerDiv.innerHTML = '';
    imageViewerMap = L.map('image-viewer-map', {
        crs: L.CRS.Simple,
        minZoom: -2,
        maxZoom: 2,
        zoomControl: true
    });

    if (imageViewerModal) {
        imageViewerModal.style.display = 'block';
        imageViewerModal.style.zIndex = '100000';  // Düzenleme modalıdan üstte olsun
        console.log('Temp image viewer modal opened');
    }

    setTimeout(function() {
        if (imageViewerMap) imageViewerMap.invalidateSize();
        updateImageViewer();
    }, 100);
};

    window.openImageViewer = function(index, imageIndex) {
        console.log('openImageViewer called with', index, imageIndex);  // Debug log
        currentImages = markersData[index].images;
        currentImageIndex = imageIndex;
        if (currentImages.length === 0) {
            console.log('No images found');  // Debug log
            if (editModal) editModal.querySelector('#image-error').textContent = 'Görsel bulunamadı.';
            return;
        }

        if (imageViewerMap) {
            imageViewerMap.remove();
        }
        var viewerDiv = document.getElementById('image-viewer-map');
        if (!viewerDiv) {
            console.log('viewerDiv not found');  // Debug log
            return;
        }
        viewerDiv.innerHTML = '';
        imageViewerMap = L.map('image-viewer-map', {
            crs: L.CRS.Simple,
            minZoom: -2,
            maxZoom: 2,
            zoomControl: true
        });

        if (imageViewerModal) {
            imageViewerModal.style.display = 'block';
            imageViewerModal.style.zIndex = '10000';
            console.log('Modal opened');  // Debug log
        }

        setTimeout(function() {
            if (imageViewerMap) imageViewerMap.invalidateSize();
            updateImageViewer();
        }, 100);
    };

    function updateImageViewer() {
        console.log('updateImageViewer called');  // Debug log
        if (!imageViewerMap) return;
        imageViewerMap.eachLayer(layer => {
            if (layer instanceof L.ImageOverlay) {
                imageViewerMap.removeLayer(layer);
            }
        });

        var img = new Image();
        img.src = currentImages[currentImageIndex];
        console.log('Loading image:', img.src);  // Debug log
        
        img.onload = function() {
            console.log('Image loaded successfully:', img.src);  // Debug log
            var bounds = [[0, 0], [img.height, img.width]];
            L.imageOverlay(img.src, bounds).addTo(imageViewerMap);
            imageViewerMap.fitBounds(bounds);
            imageViewerMap.setMaxBounds(bounds);
            if (editModal) editModal.querySelector('#image-error').textContent = '';
        };
        
        img.onerror = function() {
            console.error('Image load error:', img.src);  // Debug log
            if (editModal) editModal.querySelector('#image-error').textContent = 'Büyük görsel yüklenemedi: URL geçersiz veya erişilemiyor.';
        };
    }

    var prevButton = document.querySelector('.prev-button');
    var nextButton = document.querySelector('.next-button');
    var imageViewerCloseBtn = document.querySelector('.image-viewer-close');
    if (prevButton) {
        prevButton.addEventListener('click', function() {
            if (currentImages.length > 1) {
                currentImageIndex = (currentImageIndex - 1 + currentImages.length) % currentImages.length;
                updateImageViewer();
            }
        });
    }
    if (nextButton) {
        nextButton.addEventListener('click', function() {
            if (currentImages.length > 1) {
                currentImageIndex = (currentImageIndex + 1) % currentImages.length;
                updateImageViewer();
            }
        });
    }
    if (imageViewerCloseBtn) {
        imageViewerCloseBtn.addEventListener('click', function() {
            if (imageViewerModal) imageViewerModal.style.display = 'none';
            // HATA KONTROLÜ EKLENDİ ↓↓↓
            if (editModal) {
                var imageErrorElem = editModal.querySelector('#image-error');
                if (imageErrorElem) imageErrorElem.textContent = '';
            }
        });
    }
    
    // Filtreleme Fonksiyonları
    var filterToggle = document.getElementById('filter-toggle');
    var filterDropdown = document.getElementById('filter-dropdown');
    var selectAllFilters = document.getElementById('select-all-filters');
    var hideAllFilters = document.getElementById('hide-all-filters');
    var inversionToggle = document.getElementById('inversion-toggle');
    
    loadClassList();
    
    if (filterToggle) {
        filterToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            if (filterDropdown) {
                filterDropdown.style.display = filterDropdown.style.display === 'block' ? 'none' : 'block';
                loadClassList();
            }
        });
    }
    
    if (selectAllFilters) {
        selectAllFilters.addEventListener('change', function() {
            if (hideAllFilters) hideAllFilters.checked = false;
            document.querySelectorAll('.filter-checkbox').forEach(checkbox => {
                checkbox.checked = this.checked;
            });
            updateFilters();
        });
    }
    
    if (hideAllFilters) {
        hideAllFilters.addEventListener('change', function() {
            if (selectAllFilters) selectAllFilters.checked = false;
            if (this.checked) {
                document.querySelectorAll('.filter-checkbox').forEach(checkbox => {
                    checkbox.checked = false;
                });
            }
            updateFilters();
        });
    }
    
    if (inversionToggle) {
        inversionToggle.addEventListener('change', function() {
            inversionActive = this.checked;
            applyFilters();
        });
    }
    
    function updateFilters() {
        activeFilters.clear();
        document.querySelectorAll('.filter-checkbox:checked').forEach(checkbox => {
            activeFilters.add(checkbox.value);
        });
        applyFilters();
    }
    
    function applyFilters() {
        if (hideAllFilters && hideAllFilters.checked) {
            markerLayers.forEach(layer => map.removeLayer(layer.marker));
            return;
        }

        // Hiçbir filtre seçili değilse hepsi görünsün
        if (activeFilters.size === 0 && !inversionActive) {
            markerLayers.forEach(layer => {
                layer.marker.addTo(map);
            });
            return;
        }

        markerLayers.forEach(layer => {
            let markerClasses = Array.isArray(layer.data.class) ? layer.data.class : (layer.data.class ? [layer.data.class] : []);
            // Seçili tüm filtreler marker'ın class dizisinde varsa true
            let matchesAll = true;
            for (let filter of activeFilters) {
                if (!markerClasses.includes(filter)) {
                    matchesAll = false;
                    break;
                }
            }
            // Tersine çevirme aktifse: sadece matchesAll olanları gizle, diğerlerini göster
            // Tersine çevirme kapalıysa: sadece matchesAll olanları göster, diğerlerini gizle
            let isVisible = inversionActive ? !matchesAll : matchesAll;
            if (isVisible) {
                layer.marker.addTo(map);
            } else {
                map.removeLayer(layer.marker);
            }
        });
    }

    function showLogoutOverlay() {
        var overlay = document.createElement('div');
        overlay.id = 'logout-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.background = 'rgba(0,0,0,0.5)';
        overlay.style.zIndex = '9999';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.innerHTML = '<div style="background:#fff;padding:32px 48px;border-radius:18px;font-size:2rem;font-weight:600;color:#007bff;box-shadow:0 2px 16px rgba(0,0,0,0.18);">Çıkış yapılıyor...</div>';
        document.body.appendChild(overlay);
    }

    // --- ADMIN MODUNDA BARKOD OKUT BUTONU EKLE ---
    function addBarcodeScanButton() {
        if (!adminMode) return;
        if (document.getElementById('barcode-scan-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'barcode-scan-btn';
        btn.textContent = 'Barkod Okut';
        btn.style.marginLeft = '12px';
        btn.onclick = function() { openBarcodeModal('main'); };
        // Masaüstü admin butonlarının yanına ekle
        const adminBtns = document.querySelector('.admin-buttons');
        if (adminBtns) adminBtns.appendChild(btn);
    }
    // Admin moda geçince butonu ekle
    if (authToken) addBarcodeScanButton();
    // Admin mod değişiminde de çağırılmalı (setAdminMode fonksiyonunda da çağrılabilir)

    // --- BARKOD OKUMA MODALI VE KAMERA ---
    let barcodeStream = null;
    // openBarcodeModal: hangi ekrandan çağrıldığını parametreyle alır
    let barcodeScanContext = 'main';
    function openBarcodeModal(context) {
        barcodeScanContext = context || 'main';
        const modal = document.getElementById('barcode-modal');
        const video = document.getElementById('barcode-video');
        const status = document.getElementById('barcode-status');
        if (!modal || !video) return;
        modal.style.display = 'block';
        status.textContent = 'Kamera başlatılıyor...';
        // Kamera aç
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(stream => {
                barcodeStream = stream;
                video.srcObject = stream;
                video.play();
                status.textContent = 'Barkodu çerçeveye hizalayın';
                scanBarcodeLoop();
            })
            .catch(err => {
                status.textContent = 'Kamera erişimi reddedildi veya desteklenmiyor.';
            });
    }
    // Modal kapatınca kamera durdur
    document.getElementById('barcode-modal-close').onclick = function() {
        closeBarcodeModal();
    };
    function closeBarcodeModal() {
        const modal = document.getElementById('barcode-modal');
        const video = document.getElementById('barcode-video');
        if (barcodeStream) {
            barcodeStream.getTracks().forEach(track => track.stop());
            barcodeStream = null;
        }
        if (video) video.srcObject = null;
        if (modal) modal.style.display = 'none';
    }
    // --- jsQR ile barkod okuma döngüsü ---
    function scanBarcodeLoop() {
        const video = document.getElementById('barcode-video');
        const status = document.getElementById('barcode-status');
        if (!video || video.readyState !== 4) {
            setTimeout(scanBarcodeLoop, 200);
            return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR(imageData.data, canvas.width, canvas.height);
        if (code) {
            status.textContent = 'Barkod bulundu: ' + code.data;
            // Barkod bulunduğunda işlemleri başlat
            handleBarcodeResult(code.data);
            closeBarcodeModal();
            return;
        }
        setTimeout(scanBarcodeLoop, 300);
    }
    // --- Barkod sonucu işleme (devamı eklenecek) ---
    function handleBarcodeResult(barcode) {
        // Barkod eşleşmesi kontrolü
        const foundIndex = markersData.findIndex(m => m.barcode === barcode);
        if (foundIndex !== -1) {
            // Marker bulundu, düzenleme ekranını aç
            alert('Barkod mevcut bir markera ait. Marker düzenleme ekranı açılıyor.');
            window.editMarker(foundIndex);
        } else {
            if (barcodeScanContext === 'main') {
                // Ana ekrandan barkod okutulduysa, yeni marker ekleme ekranı aç ve barkodu ata
                alert('Barkod hiçbir marker ile eşleşmedi. Yeni marker ekleme ekranı açılıyor.');
                // Yeni marker için boş veri ile modal aç
                window.openEditModal({
                    title: '',
                    description: '',
                    latLng: [0,0],
                    images: [],
                    class: [],
                    color: undefined,
                    barcode: barcode
                }, -1);
            } else {
                // Düzenleme modalında barkod okutulduysa, barkod alanına otomatik ata
                const barcodeInput = document.getElementById('barcode-input');
                const addBarcodeBtn = document.getElementById('add-barcode-btn');
                const removeBarcodeBtn = document.getElementById('remove-barcode-btn');
                if (barcodeInput && addBarcodeBtn && removeBarcodeBtn) {
                    barcodeInput.value = barcode;
                    addBarcodeBtn.style.display = 'none';
                    removeBarcodeBtn.style.display = 'inline-block';
                }
                alert('Barkod yeni marker için atanacak şekilde dolduruldu. Marker kaydedilirse bu barkod atanacak.');
            }
        }
    }

    // --- YENİ: Kullanıcı modunda barkod okutma modalı ve fonksiyonları ---
    function openUserBarcodeModal() {
        var modal = document.getElementById('user-barcode-modal');
        var video = document.getElementById('user-barcode-video');
        var status = document.getElementById('user-barcode-status');
        if (!modal || !video) return;
        // Hepsini gizle otomatik kaldır
        var hideAllFilters = document.getElementById('hide-all-filters');
        if (hideAllFilters && hideAllFilters.checked) {
            hideAllFilters.checked = false;
            if (typeof updateFilters === 'function') updateFilters();
            hideAllFiltersAutoDisabled = true;
        } else {
            hideAllFiltersAutoDisabled = false;
        }
        modal.style.display = 'block';
        status.textContent = 'Kamera başlatılıyor...';
        // Kamera aç
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(function(stream) {
                userBarcodeStream = stream;
                video.srcObject = stream;
                video.play();
                status.textContent = 'Barkodu çerçeveye hizalayın';
                scanUserBarcodeLoop();
            })
            .catch(function(err) {
                status.textContent = 'Kamera erişimi reddedildi veya desteklenmiyor.';
            });
    }

    function closeUserBarcodeModal() {
        var modal = document.getElementById('user-barcode-modal');
        var video = document.getElementById('user-barcode-video');
        if (userBarcodeStream) {
            userBarcodeStream.getTracks().forEach(function(track) { track.stop(); });
            userBarcodeStream = null;
        }
        if (video) video.srcObject = null;
        if (modal) modal.style.display = 'none';
    }
    // --- jsQR ile barkod okuma döngüsü ---
    function scanUserBarcodeLoop() {
        var video = document.getElementById('user-barcode-video');
        var status = document.getElementById('user-barcode-status');
        if (!video || video.readyState !== 4) {
            setTimeout(scanUserBarcodeLoop, 200);
            return;
        }
        var canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var code = window.jsQR(imageData.data, canvas.width, canvas.height);
        if (code) {
            status.textContent = 'Barkod bulundu: ' + code.data;
            handleUserBarcodeResult(code.data);
            closeUserBarcodeModal();
            return;
        }
        setTimeout(scanUserBarcodeLoop, 300);
    }
    function handleUserBarcodeResult(barcode) {
        // Sadece kullanıcı modunda: marker eşleşirse haritayı ortala ve zoomla, yoksa uyarı ver
        var foundIndex = markersData.findIndex(function(m) { return m.barcode === barcode; });
        // Önce tüm markerların glow'unu kaldır
        markerLayers.forEach(function(layer) {
            var iconDiv = layer.marker.getElement();
            if (iconDiv) iconDiv.classList.remove('marker-glow-red');
        });
        if (foundIndex !== -1) {
            var markerObj = markerLayers[foundIndex];
            var marker = markerObj && markerObj.marker ? markerObj.marker : null;
            if (marker && marker.getLatLng) {
                map.setView(marker.getLatLng(), 1, { animate: true });
                marker.openPopup();
                var iconDiv = marker.getElement();
                if (iconDiv) iconDiv.classList.add('marker-glow-red');
            }
        } else {
            // Sonuç yoksa ve hepsini gizle otomatik kaldırıldıysa tekrar aktif et
            var hideAllFilters = document.getElementById('hide-all-filters');
            if (hideAllFilters && hideAllFiltersAutoDisabled) {
                hideAllFilters.checked = true;
                if (typeof updateFilters === 'function') updateFilters();
            }
            alert('Barkoda ait marker bulunamadı.');
        }
    }

    // --- Sayfa yenileme/kapama sırasında kaydedilmemiş marker değişikliği varsa uyarı ---
    window.addEventListener('beforeunload', function(e) {
        // Eğer marker düzenleme modalı açıksa ve kaydedilmemiş değişiklik varsa uyarı göster
        var editModal = document.getElementById('edit-modal');
        if (editModal && editModal.style.display === 'block' && window.markerFormSnapshot) {
            // Mevcut form verisini al
            var currentData = JSON.stringify({
                title: document.getElementById('title-input')?.value || '',
                description: document.getElementById('desc-input')?.value || '',
                latLng: document.getElementById('latlng-input')?.value || '',
                class: (() => {
                    const tags = document.querySelectorAll('#class-tags span');
                    return Array.from(tags).map(t => t.childNodes[0].textContent.trim()).sort().join(',');
                })(),
                color: selectedColor, // Kapsam içinde olduğu için artık erişilebilir
                barcode: (document.getElementById('barcode-input') || {}).value || '',
                images: (() => {
                    const imgs = document.querySelectorAll('#image-list img');
                    return Array.from(imgs).map(img => img.src).join(',');
                })(),
                draggable: document.getElementById('marker-lock-checkbox') && !document.getElementById('marker-lock-checkbox').checked ? '1' : '0'
            });

            if (window.markerFormSnapshot && currentData !== window.markerFormSnapshot) {
                e.preventDefault();
                e.returnValue = '';
                return '';
            }
        }
    });

    // --- YENİ: Kullanıcı modunda barkod okutma butonunu göster ---
    setTimeout(function() {
        if (typeof adminMode !== 'undefined' && !adminMode) {
            var userBarcodeBtn = document.getElementById('user-barcode-btn');
            if (userBarcodeBtn) {
                userBarcodeBtn.style.display = 'flex';
                userBarcodeBtn.onclick = function() {
                    openUserBarcodeModal();
                };
            }
            var userBarcodeModalClose = document.getElementById('user-barcode-modal-close');
            if (userBarcodeModalClose) {
                userBarcodeModalClose.onclick = closeUserBarcodeModal;
            }
        }
    }, 300);

    

    // Admin kullanıcı adını gösteren paneli başlat
    function showAdminUsernamePanel() {
        let username = localStorage.getItem('adminUsername');
        let token = localStorage.getItem('authToken');
        let panel = document.getElementById('admin-username-panel');
        if (!username || !token) {
            if (panel) panel.style.display = 'none';
            return;
        }
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'admin-username-panel';
            panel.style.position = 'fixed';
            panel.style.left = '12px';
            panel.style.bottom = '12px';
            panel.style.background = 'rgba(30,30,30,0.82)';
            panel.style.color = '#fff';
            panel.style.fontSize = '13px';
            panel.style.padding = '6px 22px 6px 14px';
            panel.style.borderRadius = '16px';
            panel.style.zIndex = '1000';
            panel.style.pointerEvents = 'none';
            panel.style.userSelect = 'none';
            panel.style.fontWeight = '500';
            panel.style.boxShadow = '0 2px 8px rgba(0,0,0,0.18)';
            panel.style.display = 'flex';
            panel.style.alignItems = 'center';
            // Görsel (avatar) ekle
            const img = document.createElement('img');
            img.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(username) + '&background=6db9afff&color=fff&size=32&rounded=true';
            img.alt = 'Admin';
            img.style.width = '27px';
            img.style.height = '27px';
            img.style.borderRadius = '50%';
            img.style.marginRight = '7px';
            img.style.background = '#6db9afff';
            img.style.flexShrink = '0';
            panel.appendChild(img);
            const span = document.createElement('span');
            span.id = 'admin-username-panel-text';
            panel.appendChild(span);
            document.body.appendChild(panel);
        }
        // Sadece text kısmını güncelle
        const span = panel.querySelector('#admin-username-panel-text');
        if (span) {
            span.textContent = username;
        }
        panel.style.display = 'flex';
    }
    showAdminUsernamePanel();
}



// initApp fonksiyonu SONU
window.addEventListener('DOMContentLoaded', initApp);

// === GLOBAL KAPSAMDA: Hamburger menü ve mobil panel işlevleri ===
var hamburgerMenu = document.getElementById('hamburger-menu');
var mobilePanel = document.getElementById('mobile-panel');
var adminToggleMobile = document.getElementById('admin-toggle-mobile');
var closeAdminMobile = document.getElementById('close-admin-mobile');
var showAdminPanelMobile = document.getElementById('show-admin-panel-mobile');
var manageClassesBtnMobile = document.getElementById('manage-classes-btn-mobile');
var desktopManageClassesBtn = document.getElementById('manage-classes-btn');

function isMobile() {
    return window.innerWidth <= 768;
}

function showMobilePanel() {
    if (mobilePanel) {
        mobilePanel.classList.add('active');
    }
}

function hideMobilePanel() {
    if (mobilePanel) {
        mobilePanel.classList.remove('active');
    }
}

if (hamburgerMenu && mobilePanel) {
    hamburgerMenu.style.display = isMobile() ? 'block' : 'none';

    hideMobilePanel();
    hamburgerMenu.addEventListener('click', function(e) {
        e.stopPropagation();
        showMobilePanel();
    });
    mobilePanel.addEventListener('click', function(e) {
        e.stopPropagation();
    });
    document.addEventListener('click', function(e) {
        if (isMobile() && mobilePanel.classList.contains('active')) {
            if (!mobilePanel.contains(e.target) && e.target !== hamburgerMenu) {
                hideMobilePanel();
            }
        }
    });
}

window.addEventListener('resize', function() {
    if (hamburgerMenu) hamburgerMenu.style.display = isMobile() ? 'block' : 'none';
    hideMobilePanel();
});

if (adminToggleMobile) {
    adminToggleMobile.addEventListener('click', function() {
        var desktopLoginModal = document.getElementById('login-modal');
        if (desktopLoginModal) {
            desktopLoginModal.style.display = 'block';
        }
        hideMobilePanel();
    });
}

if (closeAdminMobile) {
    closeAdminMobile.addEventListener('click', function() {
        var desktopAdminToggle = document.getElementById('admin-toggle');
        if (desktopAdminToggle) desktopAdminToggle.click();
        setTimeout(function() {
            window.location.reload();
        }, 2200);
    });
}

if (showAdminPanelMobile) {
    showAdminPanelMobile.addEventListener('click', function() {
        var desktopShowAdminPanel = document.getElementById('show-admin-panel');
        if (desktopShowAdminPanel) desktopShowAdminPanel.click();
        hideMobilePanel();
    });
}

if (manageClassesBtnMobile) {
    manageClassesBtnMobile.addEventListener('click', function() {
        var desktopManageClassesBtn = document.getElementById('manage-classes-btn');
        if (desktopManageClassesBtn) desktopManageClassesBtn.click();
        hideMobilePanel();
    });
}

if (manageClassesBtnMobile) {
    manageClassesBtnMobile.addEventListener('click', function() {
        var desktopManageClassesBtn = document.getElementById('manage-classes-btn');
        if (desktopManageClassesBtn) desktopManageClassesBtn.click();
        hideMobilePanel();
    });
}

// --- YENİ: Mobil konum butonu event listener'ı (GLOBAL KAPSAMDA) ---
var mobileLocationBtn = document.getElementById('mobile-location-btn');
if (mobileLocationBtn) {
    mobileLocationBtn.addEventListener('click', function() {
        hideMobilePanel();
        
        // Masaüstü konum butonunu tetikle (zaten orada tüm mantık var)
        var desktopLocationBtn = document.getElementById('current-location-btn');
        if (desktopLocationBtn) {
            desktopLocationBtn.click();
        }
    });
}

