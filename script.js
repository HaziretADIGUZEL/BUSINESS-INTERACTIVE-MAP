// Firebase yapılandırma (kendi projenin bilgileri ile doldur!)
const firebaseConfig = {
    apiKey: "AIzaSyDBG7zQ-6bMHhAC0jwpJIlnjpLNj6L_NaI",
    authDomain: "marker-and-class-database.firebaseapp.com",
    databaseURL: "https://marker-and-class-database-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "marker-and-class-database",
    storageBucket: "marker-and-class-database.firebasestorage.app",
    messagingSenderId: "672136991301",
    appId: "1:672136991301:web:0e392da0b607251afdc92c"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

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

    // Firebase ile marker ve sınıf verileri
    var markersData = [];
    var classesData = [];
    var markerLayers = [];
    var selectedMarkerIndex = -1;
    var adminMode = false;
    var highlightedMarkers = [];
    var activeFilters = new Set();
    var inversionActive = false;

    // Firebase'den marker ve sınıfları yükle
    function loadMarkersFromDB() {
        db.ref('markers').once('value').then(snapshot => {
            markersData = snapshot.val() || [];
            loadMarkers();
        });
    }
    function saveMarkersToDB() {
        db.ref('markers').set(markersData);
    }
    function loadClassesFromDB() {
        db.ref('classes').once('value').then(snapshot => {
            classesData = snapshot.val() || [];
            loadClassList();
        });
    }
    function saveClassesToDB() {
        db.ref('classes').set(classesData);
    }

    // Marker ve sınıf işlemlerinde localStorage yerine Firebase fonksiyonlarını kullan
    function saveMarkers() { saveMarkersToDB(); }
    function saveClasses() { saveClassesToDB(); }

    // Sayfa açılışında verileri Firebase'den yükle
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
                draggable: adminMode // Admin modunda sürüklenebilir
            }).addTo(map);

            // Pop-up'ı yalnızca bir kez bağla
            marker.bindPopup(createPopupContent(markerData, index), {
                autoPan: true,
                autoPanPadding: [50, 50] // Harita sınırlarıyla çakışmayı azaltmak için
            });

            marker.on('click', function(e) {
                // Pop-up'ı açmadan önce mevcut pop-up'ı kapat
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

                // Marker'ın ekran konumunu hesapla
                var point = map.latLngToContainerPoint(marker.getLatLng());
                var mapHeight = map.getSize().y;
                var isTop60Percent = point.y < mapHeight * 0.6;

                // Pop-up offset'ini dinamik olarak ayarla
                var popup = marker.getPopup();
                popup.options.offset = [0, isTop60Percent ? 40 : -40];
                popup.options.autoPanPaddingTopLeft = L.point(50, isTop60Percent ? 200 : 50);
                popup.options.autoPanPaddingBottomRight = L.point(50, isTop60Percent ? 50 : 200);
                marker.openPopup();

                // Pop-up güncelle
                setTimeout(() => {
                    popup.update();
                }, 0);
            });

            marker.on('dragend', function(e) {
                markersData[index].latLng = [marker.getLatLng().lat, marker.getLatLng().lng];
                saveMarkers();
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
                
                // Arama yapıldığında filtreleri sıfırla ve tüm marker'ları gizle
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
                layer.marker.addTo(map); // Seçilen marker'ı haritada görünür yap
            });
            suggestionsList.appendChild(li);
        });

        suggestionsList.style.display = 'block';
    }

    function performSearch(query) {
        // Arama yapıldığında filtreleri sıfırla
        resetFilters();

        // Önce tüm marker'ları haritadan kaldır
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
            // Sadece eşleşen marker'ları haritaya ekle
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
        // Enter tuşu ile arama
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
                loadMarkers(); // Admin modunda marker'ları yeniden yükle (sürüklenebilir)
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
    
    // Sınıf modalı kapatıldığında admin panelini aç
    var classModalCloseBtn = document.querySelector('#class-modal .close');
    if(classModalCloseBtn) {
        classModalCloseBtn.addEventListener('click', function() {
            document.getElementById('admin-modal').style.display = 'block';
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
                const response = await fetch('admins.json');
                if (!response.ok) {
                    throw new Error('admins.json yüklenemedi: ' + response.status);
                }
                const admins = await response.json();
                console.log('admins.json yüklendi:', admins);

                const hashedPassword = await hashPassword(password);
                console.log('Giriş şifresi hash\'i:', hashedPassword);

                var admin = admins.find(a => a.username === username);
                if (admin) {
                    console.log('Kullanıcı bulundu, şifre kontrol ediliyor...');
                    if (hashedPassword === admin.password) {
                        console.log('Giriş başarılı!');
                        adminMode = true;
                        adminToggle.textContent = 'Admin Modu Kapat';
                        if (loginModal) loginModal.style.display = 'none';
                        if (showAdminPanelBtn) showAdminPanelBtn.style.display = 'block';
                        if (manageClassesBtn) manageClassesBtn.style.display = 'block';
                        loadMarkers(); // Admin modunda marker'ları yeniden yükle (sürüklenebilir)
                    } else {
                        console.log('Şifre yanlış!');
                        loginModal.querySelector('#login-error').textContent = 'Kullanıcı adı veya şifre yanlış!';
                    }
                } else {
                    console.log('Kullanıcı bulunamadı!');
                    loginModal.querySelector('#login-error').textContent = 'Kullanıcı adı veya şifre yanlış!';
                }
            } catch (error) {
                console.error('Hata:', error);
                loginModal.querySelector('#login-error').textContent = 'Hata: admins.json yüklenemedi.';
            }
        });
    } else {
        console.error('login-form bulunamadı!');
    }


    // Marker listesini yükleyen yeni fonksiyon
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
            deleteBtn.onclick = function(e) {
                e.stopPropagation();
                if (confirm('Bu markerı silmek istediğinizden emin misiniz?')) {
                    markersData.splice(index, 1);
                    saveMarkers();
                    loadMarkers();
                    loadAdminMarkers();
                }
            };
    
            btnDiv.appendChild(editBtn);
            btnDiv.appendChild(deleteBtn);
    
            li.appendChild(titleSpan);
            li.appendChild(btnDiv);
    
            markerList.appendChild(li);
        });
        loadMarkers();
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
            // Admin Panelindeki Liste
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
            
            // Marker Düzenleme Select Kutusu
            var option = document.createElement('option');
            option.value = className;
            option.textContent = className;
            classSelect.appendChild(option);
            
            // Filtreleme Dropdown Listesi
            var filterLabel = document.createElement('label');
            filterLabel.innerHTML = `<input type="checkbox" class="filter-checkbox" value="${className}"> ${className}`;
            filterOptions.appendChild(filterLabel);
        });
        
        // Filtre kutularının durumunu güncelle
        document.querySelectorAll('.filter-checkbox').forEach(checkbox => {
            checkbox.checked = activeFilters.has(checkbox.value);
            checkbox.addEventListener('change', updateFilters);
        });
    }
    
    // Sınıf Ekleme Formu
    const classForm = document.getElementById('class-form');
    if (classForm) {
        classForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const newClassName = document.getElementById('new-class-name').value.trim();
            if (newClassName && !classesData.includes(newClassName)) {
                classesData.push(newClassName);
                saveClasses();
                loadClassList();
                document.getElementById('new-class-name').value = '';
            }
        });
    }
    
    // Sınıf Düzenleme
    window.editClass = function(index) {
        const newName = prompt('Yeni sınıf adını girin:', classesData[index]);
        if (newName && newName.trim() && !classesData.includes(newName.trim())) {
            const oldName = classesData[index];
            classesData[index] = newName.trim();
            markersData.forEach(marker => {
                if (marker.class === oldName) {
                    marker.class = newName.trim();
                }
            });
            saveClasses();
            saveMarkers();
            loadClassList();
        }
    };
    
    // Sınıf Silme
    window.deleteClass = function(index) {
        if (confirm('Bu sınıfı ve ona atanmış tüm markerları silmek istediğinizden emin misiniz?')) {
            const classToDelete = classesData[index];
            classesData.splice(index, 1);
            markersData = markersData.filter(marker => marker.class !== classToDelete);
            saveClasses();
            saveMarkers();
            loadClassList();
            loadMarkers();
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
                <button onclick="tempImages.splice(${i}, 1); updateImageList();">Sil</button>
            `;
            imageList.appendChild(div);
        });
    }

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
            for (let file of files) {
                var formData = new FormData();
                formData.append('image', file);
                try {
                    const response = await fetch('/upload', {
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
    window.openEditModal = function(data, index) {
        var editModal = document.getElementById('edit-modal');
        if (!editModal) return;
        editModal.style.display = 'block';
        selectedMarkerIndex = index;
        
        loadClassList(); // Sınıf listesini yükle

        document.getElementById('title-input').value = data.title;
        document.getElementById('desc-input').value = data.description;
        document.getElementById('latlng-input').value = data.latLng.join(', ');
        document.getElementById('class-select').value = data.class || ''; // Sınıfı seç
        tempImages = data.images || [];
        updateImageList();

        var form = document.getElementById('marker-form');
        if (!form) return;
        form.onsubmit = function(ev) {
            ev.preventDefault();
            var newData = {
                latLng: document.getElementById('latlng-input').value.split(', ').map(Number),
                title: document.getElementById('title-input').value,
                description: document.getElementById('desc-input').value,
                images: tempImages,
                class: document.getElementById('class-select').value // Sınıf bilgisini kaydet
            };

            if (selectedMarkerIndex === -1) {
                markersData.push(newData);
            } else {
                markersData[selectedMarkerIndex] = newData;
            }

            saveMarkers();
            loadMarkers();
            loadAdminMarkers();
            editModal.style.display = 'none';
            document.getElementById('admin-modal').style.display = 'block';
        };

        var deleteBtn = document.getElementById('delete-marker');
        if (deleteBtn) {
            deleteBtn.style.display = selectedMarkerIndex === -1 ? 'none' : 'block';
            deleteBtn.onclick = function() {
                if (selectedMarkerIndex !== -1) {
                    markersData.splice(selectedMarkerIndex, 1);
                    saveMarkers();
                    loadMarkers();
                    loadAdminMarkers();
                    editModal.style.display = 'none';
                    document.getElementById('admin-modal').style.display = 'block';
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

        // imageViewerMap'i sıfırla
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
                loadClassList(); // Filtreleri her açıldığında yenile
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
                // Sadece işaretlendiğinde tüm filtreleri kaldır
                document.querySelectorAll('.filter-checkbox').forEach(checkbox => {
                    checkbox.checked = false;
                });
            }
            // İşaret kaldırıldığında hiçbir checkbox'ın durumunu değiştirme
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
