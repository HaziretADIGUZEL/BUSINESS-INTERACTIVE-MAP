// Firebase yapılandırması kaldırıldı, çünkü backend üzerinden iletişim kuruyoruz

// Render backend URL'si (kendi Render URL'nizi buraya koyun)
const BASE_URL = 'https://your-app.onrender.com'; // Örnek: https://my-project.onrender.com

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
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
        map = L.map('map', {
            crs: L.CRS.Simple,
            minZoom: -3,
            maxZoom: 3,
            maxBoundsViscosity: 1.0
        });
        console.log('Harita oluşturuldu');
    } catch (err) {
        console.error('L.map hatası:', err);
        alert('Hata: Leaflet harita oluşturulamadı.');
        return;
    }

    // SVG yükleme
    var imageUrl = 'plan.svg';
    var svgHeight = 7598.6665;
    var svgWidth = 8020;
    var imageBounds = [[0, 0], [svgHeight, svgWidth]];
    console.log('SVG yükleniyor:', imageUrl);
    try {
        var imageOverlay = L.imageOverlay(imageUrl, imageBounds).addTo(map);
        imageOverlay.on('load', function() {
            console.log('SVG başarıyla yüklendi:', imageUrl);
            var img = document.querySelector('#map img');
            console.log(img ? { width: img.width, height: img.height } : 'SVG bulunamadı');
        });
        imageOverlay.on('error', function(err) {
            console.error('SVG yüklenemedi:', imageUrl, err);
            alert('SVG yüklenemedi: ' + err.type + '. Dosya yolunu veya SVG yapısını kontrol edin.');
        });
    } catch (err) {
        console.error('L.imageOverlay hatası:', err);
        alert('Hata: Leaflet SVG yüklemesinde sorun.');
    }

    // Haritayı ortala
    try {
        map.setView([svgHeight / 2, svgWidth / 2], -3);
        map.setMaxBounds(imageBounds);
        console.log('Harita ortalandı:', [svgHeight / 2, svgWidth / 2]);
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

    // Token'ı localStorage'dan al (sadece yazma/değiştirme için kullanılacak)
    function getAuthToken() {
        return localStorage.getItem('authToken');
    }

    // Backend ile marker ve sınıf verileri
    async function loadMarkersFromDB() {
        try {
            const response = await fetch(`${BASE_URL}/api/markers`); // Token'suz, herkese açık
            if (!response.ok) throw new Error('Markerlar yüklenemedi: ' + response.status);
            markersData = await response.json();
            loadMarkers();
        } catch (error) {
            console.error('Marker yükleme hatası:', error);
            alert('Markerlar yüklenemedi.');
        }
    }

    async function saveMarkerToDB(markerData) {
        try {
            const token = getAuthToken();
            if (!token) throw new Error('Giriş yapmadınız, kaydedilemedi.');
            const response = await fetch(`${BASE_URL}/api/markers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
            const token = getAuthToken();
            if (!token) throw new Error('Giriş yapmadınız, silinemedi.');
            const response = await fetch(`${BASE_URL}/api/markers/${markerId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
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
            const response = await fetch(`${BASE_URL}/api/classes`); // Token'suz, herkese açık
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
            const token = getAuthToken();
            if (!token) throw new Error('Giriş yapmadınız, eklenemedi.');
            const response = await fetch(`${BASE_URL}/api/classes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
            const token = getAuthToken();
            if (!token) throw new Error('Giriş yapmadınız, silinemedi.');
            const response = await fetch(`${BASE_URL}/api/classes/${encodeURIComponent(className)}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Sınıf silinemedi.');
            classesData = classesData.filter(c => c !== className);
            markersData = markersData.filter(m => m.class !== className);
        } catch (error) {
            console.error('Sınıf silme hatası:', error);
            throw error;
        }
    }

    // Marker ve sınıf işlemlerinde backend fonksiyonlarını kullan
    function saveMarkers() { loadMarkersFromDB(); } // Yeni marker eklendiğinde veya silindiğinde listeyi yenile
    function saveClasses() { loadClassesFromDB(); } // Yeni sınıf eklendiğinde veya silindiğinde listeyi yenile

    // Sayfa açılışında verileri backend'den yükle (token'suz, herkese açık)
    loadMarkersFromDB();
    loadClassesFromDB();

    function loadMarkers() {
        markerLayers.forEach(function(layer) {
            if (map.hasLayer(layer.marker)) {
                map.removeLayer(layer.marker);
            }
        });
        markerLayers = [];

        markersData.forEach(function(markerData, index) {
            var marker = L.marker([markerData.latLng[0], markerData.latLng[1]], {
                icon: L.divIcon({
                    className: 'marker-icon',
                    iconSize: [20, 20],
                    html: ''
                }),
                draggable: adminMode
            }).addTo(map);

            marker.bindPopup(createPopupContent(markerData, index, false), {
                autoPan: true,
                autoPanPadding: [50, 50]
            });

            marker.on('click', function(e) {
                map.closePopup();
                marker.setIcon(L.divIcon({
                    className: 'marker-icon active',
                    iconSize: [20, 20],
                    html: ''
                }));
                setTimeout(() => {
                    marker.setIcon(L.divIcon({
                        className: 'marker-icon',
                        iconSize: [20, 20],
                        html: ''
                    }));
                }, 200);

                var point = map.latLngToContainerPoint(marker.getLatLng());
                var mapHeight = map.getSize().y;
                var isTop60Percent = point.y < mapHeight * 0.6;

                var popup = marker.getPopup();
                popup.options.offset = [0, isTop60Percent ? 40 : -40];
                popup.options.autoPanPaddingTopLeft = L.point(50, isTop60Percent ? 200 : 50);
                popup.options.autoPanPaddingBottomRight = L.point(50, isTop60Percent ? 50 : 200);
                popup.setContent(createPopupContent(markerData, index, !isTop60Percent)); // Upside-down için parametre
                marker.openPopup();

                setTimeout(() => {
                    popup.update();
                }, 0);
            });

            marker.on('dragend', async function(e) {
                const newLatLng = [marker.getLatLng().lat, marker.getLatLng().lng];
                const markerId = markersData[index].id;
                const updatedData = { ...markersData[index], latLng: newLatLng };

                try {
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

    function createPopupContent(markerData, index, isUpsideDown) {
        var imagesHtml = markerData.images && markerData.images.length > 0
            ? `<div class="marker-images">${markerData.images.map((img, i) => `<img src="${img}" alt="Image ${i}" onclick="openImageViewer(${index}, ${i})">`).join('')}</div>`
            : '<img src="https://via.placeholder.com/150" alt="No image" style="width:80px;height:80px;object-fit:cover;">';
        var adminEditButton = adminMode ? `<button class="edit-button" onclick="editMarker(${index})">Düzenle</button>` : '';
        return `
            <div class="leaflet-popup-content ${isUpsideDown ? 'upside-down' : ''}">
                <h2>${markerData.title}</h2>
                <p>${markerData.description}</p>
                ${imagesHtml}
                ${adminEditButton}
            </div>
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
            map.flyTo(matchingMarkers[0].marker.getLatLng(), 1);
        }
    }

    if (searchInput) {
        searchInput.addEventListener('input', function() {
            showSuggestions(this.value);
        });
    }

    if (searchButton) {
        searchButton.addEventListener('click', function() {
            performSearch(searchInput.value);
        });
    }

    // Admin Modu Toggle
    var adminToggle = document.getElementById('admin-toggle');
    if (adminToggle) {
        adminToggle.addEventListener('click', function() {
            if (adminMode) {
                adminMode = false;
                this.textContent = 'Admin Modu';
                document.getElementById('show-admin-panel').style.display = 'none';
                document.getElementById('manage-classes-btn').style.display = 'none';
            } else {
                document.getElementById('login-modal').style.display = 'block';
            }
            loadMarkers();
        });
    }

    // Login Form
    var loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.onsubmit = async function(e) {
            e.preventDefault();
            var username = document.getElementById('username-input').value;
            var password = document.getElementById('password-input').value;
            const hashedPassword = await hashPassword(password);
            try {
                const response = await fetch(`${BASE_URL}/api/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password: hashedPassword })
                });
                const result = await response.json();
                if (result.success) {
                    localStorage.setItem('authToken', result.token);
                    adminMode = true;
                    document.getElementById('login-modal').style.display = 'none';
                    document.getElementById('admin-toggle').textContent = 'Admin Modu Kapat';
                    document.getElementById('show-admin-panel').style.display = 'block';
                    document.getElementById('manage-classes-btn').style.display = 'block';
                    loadMarkers();
                    alert('Giriş başarılı!');
                } else {
                    alert('Giriş başarısız: Kullanıcı adı veya şifre yanlış!');
                }
            } catch (error) {
                console.error('Giriş hatası:', error);
                alert('Giriş sırasında hata oluştu. Lütfen tekrar deneyin.');
            }
        };
    }

    // Admin Panel Göster
    var showAdminPanelBtn = document.getElementById('show-admin-panel');
    if (showAdminPanelBtn) {
        showAdminPanelBtn.addEventListener('click', function() {
            document.getElementById('admin-modal').style.display = 'block';
            loadAdminMarkers();
        });
    }

    // Sınıf Yönetimi Butonu
    var manageClassesBtn = document.getElementById('manage-classes-btn');
    if (manageClassesBtn) {
        manageClassesBtn.addEventListener('click', function() {
            document.getElementById('class-management-modal').style.display = 'block';
            loadClassList();
        });
    }

    // Yeni Sınıf Ekle Formu
    var classForm = document.getElementById('class-form');
    if (classForm) {
        classForm.onsubmit = async function(e) {
            e.preventDefault();
            var className = document.getElementById('class-name-input').value.trim();
            if (className && !classesData.includes(className)) {
                try {
                    await saveClassToDB(className);
                    loadClassList();
                    document.getElementById('class-name-input').value = '';
                } catch (error) {
                    alert('Sınıf eklenemedi.');
                }
            } else {
                alert('Geçerli bir sınıf adı girin veya bu sınıf zaten mevcut.');
            }
        };
    }

    // Modal Kapatma
    var modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });

    var closes = document.querySelectorAll('.close');
    closes.forEach(close => {
        close.addEventListener('click', function() {
            this.parentElement.parentElement.style.display = 'none';
        });
    });
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOMContentLoaded tetiklendi');
    initApp();
});
