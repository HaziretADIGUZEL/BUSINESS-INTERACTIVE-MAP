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
    // Sınırları %20 genişlet
    var padding = 0.2;
    var paddedBounds = [
        [-svgHeight * padding, -svgWidth * padding],
        [svgHeight * (1 + padding), svgWidth * (1 + padding)]
    ];
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
        map.setMaxBounds(paddedBounds); // Genişletilmiş sınırları kullan
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
            markersData = markersData.filter(m => m.class !== className);
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
    if (authToken) {
        adminMode = true;
        document.getElementById('admin-toggle').textContent = 'Admin Modu Kapat';
        document.getElementById('show-admin-panel').style.display = 'block';
        document.getElementById('manage-classes-btn').style.display = 'block';
    }

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
                draggable: adminMode,
                autoPan: true, // Marker sürüklenirken harita otomatik kayar
                autoPanSpeed: 100 // Varsayılan: 10, daha yüksek değer daha hızlı kaydırır
            }).addTo(map);

            marker.bindPopup(createPopupContent(markerData, index), {
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
                marker.openPopup();

                setTimeout(() => {
                    popup.update();
                }, 0);
            });

            marker.on('dragend', async function(e) {
                const newLatLng = [marker.getLatLng().lat, marker.getLatLng().lng];
                var svgHeight = 7598.6665;
                var svgWidth = 8020;
                // Sınır kontrolü
                if (
                    newLatLng[0] < 0 || newLatLng[0] > svgHeight ||
                    newLatLng[1] < 0 || newLatLng[1] > svgWidth
                ) {
                    alert('Seçilen konum SVG sınırları dışında! Marker taşınamaz.');
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
            console.log('Admin Modu butonuna tıklandı');
            if (!adminMode) {
                if (loginModal) loginModal.style.display = 'block';
                if (loginModal) loginModal.querySelector('#login-error').textContent = '';
            } else {
                adminMode = false;
                adminToggle.textContent = 'Admin Modu';
                if (showAdminPanelBtn) showAdminPanelBtn.style.display = 'none';
                if (manageClassesBtn) manageClassesBtn.style.display = 'none';
                localStorage.removeItem('authToken'); // Token'ı sil
                authToken = null;
                loadMarkers();
                document.getElementById('admin-modal').style.display = 'none';
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
                    if (loginModal) loginModal.style.display = 'none';
                    if (showAdminPanelBtn) showAdminPanelBtn.style.display = 'block';
                    if (manageClassesBtn) manageClassesBtn.style.display = 'block';
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
        if (confirm('Bu sınıfı ve ona atanmış tüm markerları silmek istediğinizden emin misiniz?')) {
            const classToDelete = classesData[index];
            try {
                await deleteClassFromDB(classToDelete);
                loadClassList();
                loadMarkers();
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
            const newMarkerData = { latLng: [svgHeight / 2, svgWidth / 2], title: '', description: '', images: [], class: '' };
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
        document.getElementById('class-select').value = data.class || '';
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
                var svgHeight = 7598.6665;
                var svgWidth = 8020;
                if (
                    isNaN(lat) || isNaN(lng) ||
                    lat < 0 || lat > svgHeight ||
                    lng < 0 || lng > svgWidth
                ) {
                    alert('Seçilen konum SVG sınırları dışında! Marker eklenemez/düzenlenemez.');
                    return;
                }
                var newData = {
                    latLng: document.getElementById('latlng-input').value.split(', ').map(Number),
                    title: document.getElementById('title-input').value,
                    description: document.getElementById('desc-input').value,
                    images: tempImages,
                    class: document.getElementById('class-select').value
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

        if (activeFilters.size === 0 && !inversionActive) {
            if (selectAllFilters && selectAllFilters.checked) {
                // Do nothing, all markers are already shown
            } else {
                markerLayers.forEach(layer => {
                    layer.marker.addTo(map);
                });
                return;
            }
        }

        markerLayers.forEach(layer => {
            const hasClass = layer.data.class && activeFilters.has(layer.data.class);
            let isVisible;

            if (inversionActive) {
                isVisible = !hasClass;
            } else {
                isVisible = hasClass;
            }
            
            if (isVisible) {
                layer.marker.addTo(map);
            } else {
                map.removeLayer(layer.marker);
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOMContentLoaded tetiklendi');
    initApp();
});
