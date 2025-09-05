// Firebase yapılandırması kaldırıldı, çünkü backend üzerinden iletişim kuruyoruz

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

function initApp() {
    console.log('initApp başlatıldı');
    console.log('Leaflet var mı?', typeof L);

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
    console.log('Leaflet kütüphanesi başarıyla yüklendi');

    // Harita div kontrolü
    var mapDiv = document.getElementById('map');
    if (!mapDiv) {
        console.error('#map div bulunamadı!');
        alert('Hata: #map div bulunamadı.');
        return;
    }
    console.log('#map div bulundu, boyutlar:', mapDiv.style.width, mapDiv.style.height);

    // Harita oluşturma
    var map;
    try {
        // Cihaz tipine göre zoom seviyesini ayarla
        var isMobile = window.innerWidth <= 768;
        var minZoom = isMobile ? -5 : -3; // Mobilde daha az zoom out
        map = L.map('map', {
            crs: L.CRS.Simple,
            minZoom: minZoom,
            maxZoom: 3,
            maxBoundsViscosity: 1.0
        });
        console.log('Harita oluşturuldu. minZoom:', minZoom);
    } catch (err) {
        console.error('L.map hatası:', err);
        alert('Hata: Leaflet harita oluşturulamadı.');
        return;
    }

    // SVG yükleme
    var imageUrl = 'plan.png';
    var imgHeight = 7599;
    var imgWidth = 8020;
    // Sınırları %20 genişlet
    var padding = 0.2;
    var paddedBounds = [
        [-imgHeight * padding, -imgWidth * padding],
        [imgHeight * (1 + padding), imgWidth * (1 + padding)]
    ];
    var imageBounds = [[0, 0], [imgHeight, imgWidth]];
    console.log('PNG yükleniyor:', imageUrl);
    try {
        var imageOverlay = L.imageOverlay(imageUrl, imageBounds).addTo(map);
        imageOverlay.on('load', function() {
            console.log('PNG başarıyla yüklendi:', imageUrl);
            var img = document.querySelector('#map img');
            console.log(img ? { width: img.width, height: img.height } : 'PNG bulunamadı');
        });
        imageOverlay.on('error', function(err) {
            console.error('PNG yüklenemedi:', imageUrl, err);
            alert('PNG yüklenemedi: ' + err.type + '. Dosya yolunu veya PNG yapısını kontrol edin.');
        });
    } catch (err) {
        console.error('L.imageOverlay hatası:', err);
        alert('Hata: Leaflet PNG yüklemesinde sorun.');
    }

    // Haritayı ortala
    try {
        var isMobile = window.innerWidth <= 768;
        var initialZoom = isMobile ? -5 : -3; // Mobilde daha yakın başlat
        map.setView([imgHeight / 2, imgWidth / 2], initialZoom);
        map.setMaxBounds(paddedBounds); // Genişletilmiş sınırları kullan
        console.log('Harita ortalandı:', [imgHeight / 2, imgWidth / 2], 'Zoom:', initialZoom);
    } catch (err) {
        console.error('map.setView hatası:', err);
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
            if (!result.success) throw new Error(result.error || 'Sınıf eklenemedi.');
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
    loadMarkersFromDB();
    loadClassesFromDB();

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
            if (adminToggleMobile) adminToggleMobile.style.display = 'none';
            if (closeAdminMobile) closeAdminMobile.style.display = 'block';
            if (showAdminPanelMobile) showAdminPanelMobile.style.display = 'block';
            if (manageClassesBtnMobile) manageClassesBtnMobile.style.display = 'block';
        } else {
            document.getElementById('admin-toggle').textContent = 'Admin Modu';
            document.getElementById('show-admin-panel').style.display = 'none';
            document.getElementById('manage-classes-btn').style.display = 'none';
            // Mobil paneldeki butonları da güncelle
            var adminToggleMobile = document.getElementById('admin-toggle-mobile');
            var closeAdminMobile = document.getElementById('close-admin-mobile');
            var showAdminPanelMobile = document.getElementById('show-admin-panel-mobile');
            var manageClassesBtnMobile = document.getElementById('manage-classes-btn-mobile');
            if (adminToggleMobile) adminToggleMobile.style.display = 'block';
            if (closeAdminMobile) closeAdminMobile.style.display = 'none';
            if (showAdminPanelMobile) showAdminPanelMobile.style.display = 'none';
            if (manageClassesBtnMobile) manageClassesBtnMobile.style.display = 'none';
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
            var marker = L.marker([markerData.latLng[0], markerData.latLng[1]], {
                icon: L.divIcon({
                    className: 'marker-icon',
                    iconSize: [15, 21],
                    iconAnchor: [7.5, 20], // Sivri uç tam konumda
                    html: pinSVG
                }),
                draggable: adminMode,
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

                var point = map.latLngToContainerPoint(marker.getLatLng());
                var mapHeight = map.getSize().y;
                var isTop60Percent = point.y < mapHeight * 0.6;

                var popup = marker.getPopup();
                popup.options.offset = [0, isTop60Percent ? 40 : -40];
                popup.options.autoPanPaddingTopLeft = L.point(50, isTop60Percent ? 200 : 50);
                popup.options.autoPanPaddingBottomRight = L.point(50, isTop60Percent ? 50 : 200);
                marker.openPopup();

                setTimeout(() => {
                    popup.update();
                }, 0);
            });

            marker.on('dragend', async function(e) {
                const newLatLng = [marker.getLatLng().lat, marker.getLatLng().lng];
                var imgHeight = 7599;
                var imgWidth = 8020;
                // Sınır kontrolü
                if (
                    newLatLng[0] < 0 || newLatLng[0] > imgHeight ||
                    newLatLng[1] < 0 || newLatLng[1] > imgWidth
                ) {
                    alert('Seçilen konum PNG sınırları dışında! Marker taşınamaz.');
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
        var imagesHtml = markerData.images && markerData.images.length > 0
            ? `<div class="marker-images">${markerData.images.map((img, i) => `<img src="${img}" alt="Image ${i}" onclick="openImageViewer(${index}, ${i})">`).join('')}</div>`
            : '<img src="https://via.placeholder.com/150" alt="No image" style="width:80px;height:80px;object-fit:cover;">';
        var adminEditButton = adminMode ? `<button class="edit-button" onclick="editMarker(${index})">Düzenle</button>` : '';
        return `
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
            var imgSrc = layer.data.images && layer.data.images.length > 0 ? layer.data.images[0] : 'https://via.placeholder.com/40';
            var descShort = layer.data.description.length > 30 ? layer.data.description.substring(0, 30) + '...' : layer.data.description;
            li.innerHTML = `
                <img src="${imgSrc}" alt="${layer.data.title}">
                <div>
                    <div class="title">${layer.data.title}</div>
                    <div class="description">${descShort}</div>
                </div>
            `;
            li.addEventListener('click', function() {
                suggestionsList.innerHTML = '';
                suggestionsList.style.display = 'none';
                
                resetFilters();
                markerLayers.forEach(l => map.removeLayer(l.marker));

                map.flyTo(layer.marker.getLatLng(), 1);
                layer.marker.openPopup();
                highlightedMarkers.forEach(function(l) {
                    l.marker.setIcon(l.originalIcon);
                });
                highlightedMarkers = [];
                layer.marker.setIcon(L.divIcon({
                    className: 'marker-icon-highlight',
                    iconSize: [20, 20],
                    html: ''
                }));
                highlightedMarkers.push(layer);
                layer.marker.addTo(map);
            });
            suggestionsList.appendChild(li);
        });

        suggestionsList.style.display = 'block';
    }

    function performSearch(query) {
        resetFilters();
        markerLayers.forEach(layer => map.removeLayer(layer.marker));
        highlightedMarkers = [];

        var matchingMarkers = markerLayers.filter(function(layer) {
            var title = layer.data.title.toLowerCase();
            var description = layer.data.description.toLowerCase();
            return title.includes(query.toLowerCase()) || description.includes(query.toLowerCase());
        });

        if (matchingMarkers.length === 0) {
            alert('Eşleşen marker bulunamadı.');
            return;
        }

        matchingMarkers.forEach(function(layer) {
            layer.marker.addTo(map);
            layer.marker.setIcon(L.divIcon({
                className: 'marker-icon-highlight',
                iconSize: [20, 20],
                html: ''
            }));
            highlightedMarkers.push(layer);
        });

        if (matchingMarkers.length > 0) {
            var group = new L.featureGroup(matchingMarkers.map(layer => layer.marker));
            map.fitBounds(group.getBounds(), { padding: [50, 50] });
        }
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
    } else {
        console.error('admin-toggle bulunamadı!');
    }

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
                if (editModal) editModal.querySelector('#image-error').textContent = '';
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

            console.log('Login denemesi: Kullanıcı adı =', username);

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
                    console.log('Giriş başarılı!');
                    authToken = result.token; // Token'ı kaydet
                    localStorage.setItem('authToken', authToken); // Local Storage'a kaydet
                    adminMode = true;
                    adminToggle.textContent = 'Admin Modu Kapat';
                    setAdminMode(true); // Hem masaüstü hem mobil panelde butonları günceller
                    var loginModal = document.getElementById('login-modal');
                    if (loginModal) loginModal.style.display = 'none';
                    // Mobil panelde admin moduna geçildiyse paneli tekrar aç
                    if (isMobile()) {
                        showMobilePanel();
                    }
                    loadMarkers();
                } else {
                    console.log('Giriş başarısız:', result.message);
                    loginModal.querySelector('#login-error').textContent = result.message || 'Kullanıcı adı veya şifre yanlış!';
                }
            } catch (error) {
                console.error('Hata:', error);
                loginModal.querySelector('#login-error').textContent = 'Sunucu bağlantı hatası.';
            }
        });
    } else {
        console.error('login-form bulunamadı!');
    }

    // Marker listesini yükleyen fonksiyon
    function loadAdminMarkers() {
        var markerList = document.getElementById('marker-list');
        if (!markerList) return;
        markerList.innerHTML = '';
        markersData.forEach(function(markerData, index) {
            var li = document.createElement('li');
            li.style.display = 'flex';
            li.style.alignItems = 'center';
            li.style.justifyContent = 'space-between';
    
            var titleSpan = document.createElement('span');
            titleSpan.textContent = markerData.title;
    
            var btnDiv = document.createElement('div');
            btnDiv.style.display = 'flex';
            btnDiv.style.gap = '10px';
    
            var editBtn = document.createElement('button');
            editBtn.textContent = 'Düzenle';
            editBtn.onclick = function(e) {
                e.stopPropagation();
                editMarker(index);
            };
    
            var deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Sil';
            deleteBtn.onclick = async function(e) {
                e.stopPropagation();
                if (confirm('Bu markerı silmek istediğinizden emin misiniz?')) {
                    try {
                        await deleteMarkerFromDB(markerData.id);
                        loadMarkers();
                        loadAdminMarkers();
                    } catch (error) {
                        alert('Marker silinemedi.');
                    }
                }
            };
    
            btnDiv.appendChild(editBtn);
            btnDiv.appendChild(deleteBtn);
    
            li.appendChild(titleSpan);
            li.appendChild(btnDiv);
    
            markerList.appendChild(li);
        });
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
    };

    // Yeni Marker Ekle Butonu
    var addNewBtn = document.getElementById('add-new-marker');
    if (addNewBtn) {
        addNewBtn.addEventListener('click', function() {
            selectedMarkerIndex = -1;
            const newMarkerData = { latLng: [imgHeight / 2, imgWidth / 2], title: '', description: '', images: [], class: '' };
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
                <img src="${img}" alt="Image ${i}">
                <button onclick="deleteImage(${i})">Sil</button>
            `;
            imageList.appendChild(div);
        });
    }

    window.deleteImage = function(index) {
        tempImages.splice(index, 1);
        updateImageList();
    };

    var addImageUrlBtn = document.getElementById('add-image-url');
    if (addImageUrlBtn) {
        addImageUrlBtn.addEventListener('click', function() {
            var url = document.getElementById('image-url-input').value;
            if (url) {
                tempImages.push(url);
                updateImageList();
                document.getElementById('image-url-input').value = '';
                if (editModal) editModal.querySelector('#image-error').textContent = '';
            } else {
                if (editModal) editModal.querySelector('#image-error').textContent = 'Lütfen geçerli bir URL girin.';
            }
        });
    }

    var imageFileInput = document.getElementById('image-file-input');
    if (imageFileInput) {
        imageFileInput.addEventListener('change', async function(e) {
            var files = e.target.files;
            if (files.length > 0) {
                if (editModal) editModal.querySelector('#image-error').textContent = 'Görsel yükleniyor...';
            }
            
            for (let file of files) {
                var formData = new FormData();
                formData.append('image', file);
                try {
                    const response = await authFetch('/upload', {
                        method: 'POST',
                        body: formData
                    });
                    const result = await response.json();
                    if (result.url) {
                        tempImages.push(result.url);
                        updateImageList();
                        if (editModal) editModal.querySelector('#image-error').textContent = '';
                    } else {
                        if (editModal) editModal.querySelector('#image-error').textContent = 'Görsel yüklenemedi: ' + result.error;
                    }
                } catch (error) {
                    console.error('Yükleme hatası:', error);
                    if (editModal) editModal.querySelector('#image-error').textContent = 'Görsel yüklenemedi: Sunucu bağlantı hatası.';
                }
            }
            imageFileInput.value = '';
        });
    }

    // Düzenleme Modal Aç
    window.openEditModal = async function(data, index) {
        var editModal = document.getElementById('edit-modal');
        if (!editModal) return;
        editModal.style.display = 'block';
        selectedMarkerIndex = index;
        
        loadClassList();

        document.getElementById('title-input').value = data.title;
        document.getElementById('desc-input').value = data.description;
        document.getElementById('latlng-input').value = data.latLng.join(', ');

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
                tag.style.background = '#e0e0e0';
                tag.style.borderRadius = '12px';
                tag.style.padding = '2px 10px 2px 8px';
                tag.style.display = 'inline-flex';
                tag.style.alignItems = 'center';
                tag.style.fontSize = '0.95em';
                tag.style.marginRight = '4px';
                tag.innerHTML = `${cls} <span style="margin-left:6px;cursor:pointer;color:#c00;font-weight:bold;" title="Kaldır">&times;</span>`;
                tag.querySelector('span').onclick = function() {
                    markerClasses.splice(idx, 1);
                    renderTags();
                };
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
        // 24 kontrast renk
        const markerColors = [
            '#e6194b','#3cb44b','#ffe119','#4363d8','#f58231','#911eb4','#46f0f0','#f032e6',
            '#bcf60c','#fabebe','#008080','#e6beff','#9a6324','#fffac8','#800000','#aaffc3',
            '#808000','#ffd8b1','#000075','#808080','#ffffff','#000000','#a9a9a9','#ff69b4'
        ];
        let selectedColor = data.color || markerColors[0];
        function updateColorBoxes() {
            Array.from(colorRow.children).forEach((box, i) => {
                const color = markerColors[i];
                box.style.border = (color === selectedColor) ? '3px solid #333' : '2px solid #ccc';
                if (color === selectedColor) {
                    box.style.boxShadow = '0 0 0 3px #007bff';
                    box.innerHTML = '<svg width="14" height="14" style="position:absolute;top:4px;left:4px;pointer-events:none;" viewBox="0 0 14 14"><polyline points="3,7 6,10 11,4" style="fill:none;stroke:#007bff;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round"/></svg>';
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
                colorBox.innerHTML = '<svg width="14" height="14" style="position:absolute;top:4px;left:4px;pointer-events:none;" viewBox="0 0 14 14"><polyline points="3,7 6,10 11,4" style="fill:none;stroke:#007bff;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round"/></svg>';
                colorBox.style.position = 'relative';
            }
            colorBox.onclick = function() {
                selectedColor = color;
                updateColorBoxes();
            };
            colorRow.appendChild(colorBox);
        });
        // Renk kutucuklarını classSelect'in altına (tag'lerin altına) ekle
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
                // Konum sınır kontrolü
                var latlngStr = document.getElementById('latlng-input').value.replace(/\s+/g, '');
                var latlngArr = latlngStr.split(',').map(Number);
                var lat = latlngArr[0];
                var lng = latlngArr[1];
                var imgHeight = 7599;
                var imgWidth = 8020;
                if (
                    isNaN(lat) || isNaN(lng) ||
                    lat < 0 || lat > imgHeight ||
                    lng < 0 || lng > imgWidth
                ) {
                    alert('Seçilen konum PNG sınırları dışında! Marker eklenemez/düzenlenemez.');
                    return;
                }

                var newData = {
                    latLng: document.getElementById('latlng-input').value.split(', ').map(Number),
                    title: document.getElementById('title-input').value,
                    description: document.getElementById('desc-input').value,
                    images: tempImages,
                    class: markerClasses, // Artık dizi
                    color: selectedColor
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
                } catch (error) {
                    alert('Marker kaydedilemedi.');
                }
            };

        var deleteBtn = document.getElementById('delete-marker');
        if (deleteBtn) {
            deleteBtn.style.display = selectedMarkerIndex === -1 ? 'none' : 'block';
            deleteBtn.onclick = async function() {
                if (selectedMarkerIndex !== -1) {
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

    window.openImageViewer = function(markerIndex, imageIndex) {
        currentImages = markersData[markerIndex].images || [];
        currentImageIndex = imageIndex;
        if (currentImages.length === 0) {
            console.log('Görsel bulunamadı!');
            if (editModal) editModal.querySelector('#image-error').textContent = 'Görsel bulunamadı.';
            return;
        }

        console.log('Büyük görsel açılıyor:', currentImages[currentImageIndex]);

        if (imageViewerMap) {
            imageViewerMap.remove();
        }
        var viewerDiv = document.getElementById('image-viewer-map');
        if (!viewerDiv) return;
        viewerDiv.innerHTML = '';
        imageViewerMap = L.map('image-viewer-map', {
            crs: L.CRS.Simple,
            minZoom: -2,
            maxZoom: 2,
            zoomControl: true
        });

        if (imageViewerModal) imageViewerModal.style.display = 'block';

        setTimeout(function() {
            if (imageViewerMap) imageViewerMap.invalidateSize();
            updateImageViewer();
        }, 100);
    };

    function updateImageViewer() {
        if (!imageViewerMap) return;
        imageViewerMap.eachLayer(layer => {
            if (layer instanceof L.ImageOverlay) {
                imageViewerMap.removeLayer(layer);
            }
        });

        var img = new Image();
        img.src = currentImages[currentImageIndex];
        
        img.onload = function() {
            console.log('Görsel yüklendi:', img.src, { width: img.width, height: img.height });
            var bounds = [[0, 0], [img.height, img.width]];
            L.imageOverlay(img.src, bounds).addTo(imageViewerMap);
            imageViewerMap.fitBounds(bounds);
            imageViewerMap.setMaxBounds(bounds);
            if (editModal) editModal.querySelector('#image-error').textContent = '';
        };
        
        img.onerror = function() {
            console.error('Görsel yüklenemedi:', img.src);
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
                console.log('Önceki görsel:', currentImages[currentImageIndex]);
                updateImageViewer();
            }
        });
    }
    if (nextButton) {
        nextButton.addEventListener('click', function() {
            if (currentImages.length > 1) {
                currentImageIndex = (currentImageIndex + 1) % currentImages.length;
                console.log('Sonraki görsel:', currentImages[currentImageIndex]);
                updateImageViewer();
            }
        });
    }
    if (imageViewerCloseBtn) {
        imageViewerCloseBtn.addEventListener('click', function() {
            if (imageViewerModal) imageViewerModal.style.display = 'none';
            if (editModal) editModal.querySelector('#image-error').textContent = '';
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
            // Çoklu sınıf desteği: class artık dizi
            let markerClasses = Array.isArray(layer.data.class) ? layer.data.class : (layer.data.class ? [layer.data.class] : []);
            // Seçili tüm filtreler marker'ın class dizisinde varsa göster
            let isVisible = true;
            for (let filter of activeFilters) {
                if (!markerClasses.includes(filter)) {
                    isVisible = false;
                    break;
                }
            }
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
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOMContentLoaded tetiklendi');
    initApp();
});

// Hamburger menü ve mobil panel işlevleri
var hamburgerMenu = document.getElementById('hamburger-menu');
var mobilePanel = document.getElementById('mobile-panel');
var adminToggleMobile = document.getElementById('admin-toggle-mobile');
var closeAdminMobile = document.getElementById('close-admin-mobile');
var showAdminPanelMobile = document.getElementById('show-admin-panel-mobile');
var manageClassesBtnMobile = document.getElementById('manage-classes-btn-mobile');

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
    // Panelin içindeki tıklamalar paneli kapatmasın
    mobilePanel.addEventListener('click', function(e) {
        e.stopPropagation();
    });
    // Panel dışında bir yere tıklanınca paneli kapat
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
        // Masaüstü admin girişi ekranını da aç
        var desktopLoginModal = document.getElementById('login-modal');
        if (desktopLoginModal) {
            desktopLoginModal.style.display = 'block';
        }
        // Modalı açınca mobil paneli kapat
        hideMobilePanel();
    });
}
if (closeAdminMobile) {
    closeAdminMobile.addEventListener('click', function() {
        var desktopAdminToggle = document.getElementById('admin-toggle');
        if (desktopAdminToggle) desktopAdminToggle.click();
        setAdminMode(false);
        showLogoutOverlay();
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

document.querySelectorAll('.modal .close').forEach(function(closeBtn) {
    closeBtn.addEventListener('click', function() {
        var modal = closeBtn.closest('.modal');
        if (modal) {
            closeModal(modal.id);
        }
    });
});
