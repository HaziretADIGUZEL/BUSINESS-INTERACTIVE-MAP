const BACKEND_URL = 'https://busyness-interactive-map.onrender.com'; // Render URL
let map;
let markerLayers = [];
let classes = [];
let isLoggedIn = localStorage.getItem('isLoggedIn') === 'true' || false;
let selectedMarkerIndex = -1;
let highlightedMarkers = [];
let activeFilters = new Set();
let inversionActive = false;
let tempImages = [];
let currentImages = [];
let currentImageIndex = 0;
let imageViewerMap = null;
const svgHeight = 7598.6665; // Global scope for svg dimensions
const svgWidth = 8020;

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function initApp() {
    console.log('initApp başlatıldı');
    console.log('Leaflet var mı?', typeof L);

    var hideAllFilters = document.getElementById('hide-all-filters');
    if (hideAllFilters) {
        hideAllFilters.checked = true;
    }

    if (typeof L === 'undefined') {
        console.error('Leaflet kütüphanesi yüklenemedi!');
        alert('Hata: Leaflet kütüphanesi yüklenemedi.');
        return;
    }
    console.log('Leaflet kütüphanesi başarıyla yüklendi');

    var mapDiv = document.getElementById('map');
    if (!mapDiv) {
        console.error('#map div bulunamadı!');
        alert('Hata: #map div bulunamadı.');
        return;
    }
    console.log('#map div bulundu, boyutlar:', mapDiv.style.width, mapDiv.style.height);

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

    var imageUrl = 'plan.svg';
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

    try {
        map.setView([svgHeight / 2, svgWidth / 2], -3);
        map.setMaxBounds(imageBounds);
        console.log('Harita ortalandı:', [svgHeight / 2, svgWidth / 2]);
    } catch (err) {
        console.error('map.setView hatası:', err);
    }

    setupEventListeners();
    await loadInitialData();
    updateAdminUI();

    // Otomatik login kontrolü
    if (!isLoggedIn) {
        const loginModal = document.getElementById('login-modal');
        if (loginModal) loginModal.style.display = 'block';
    }
}

function setupEventListeners() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    } else {
        console.error('login-form bulunamadı!');
    }

    const logoutBtn = document.getElementById('admin-toggle');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    const mapElement = document.getElementById('map');
    if (mapElement) {
        mapElement.addEventListener('contextmenu', e => e.preventDefault());
    }

    const adminPanelToggle = document.getElementById('show-admin-panel');
    if (adminPanelToggle) {
        adminPanelToggle.addEventListener('click', () => {
            const adminModal = document.getElementById('admin-modal');
            if (adminModal) {
                adminModal.style.display = 'block';
                loadAdminMarkers();
            }
        });
    }

    const addClassForm = document.getElementById('class-form');
    if (addClassForm) {
        addClassForm.addEventListener('submit', handleAddClass);
    }

    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    const suggestionsList = document.getElementById('search-suggestions');
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

    if (suggestionsList) {
        suggestionsList.addEventListener('click', handleSearchSuggestionsClick);
    }

    const filterToggle = document.getElementById('filter-toggle');
    const filterDropdown = document.getElementById('filter-dropdown');
    if (filterToggle) {
        filterToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            if (filterDropdown) {
                filterDropdown.style.display = filterDropdown.style.display === 'block' ? 'none' : 'block';
                loadClassList();
            }
        });
    }

    if (filterDropdown) {
        filterDropdown.addEventListener('change', updateFilters);
    }

    document.addEventListener('click', function(e) {
        if (e.target !== searchInput && e.target.parentNode !== suggestionsList) {
            suggestionsList.style.display = 'none';
        }
        if (filterDropdown && filterToggle && !filterDropdown.contains(e.target) && e.target !== filterToggle) {
            filterDropdown.style.display = 'none';
        }
    });

    const addNewBtn = document.getElementById('add-new-marker');
    if (addNewBtn) {
        addNewBtn.addEventListener('click', function() {
            selectedMarkerIndex = -1;
            const newMarkerData = { latLng: [svgHeight / 2, svgWidth / 2], title: '', description: '', images: [], class: '' };
            openEditModal(newMarkerData, selectedMarkerIndex);
            document.getElementById('admin-modal').style.display = 'none';
        });
    }

    const imageFileInput = document.getElementById('image-file-input');
    if (imageFileInput) {
        imageFileInput.addEventListener('change', async function(e) {
            var files = e.target.files;
            for (let file of files) {
                var formData = new FormData();
                formData.append('image', file);
                try {
                    const response = await fetch(`${BACKEND_URL}/upload`, {
                        method: 'POST',
                        body: formData
                    });
                    const result = await response.json();
                    if (result.url) {
                        tempImages.push(result.url);
                        updateImageList();
                        const editModal = document.getElementById('edit-modal');
                        if (editModal) editModal.querySelector('#image-error').textContent = '';
                    } else {
                        const editModal = document.getElementById('edit-modal');
                        if (editModal) editModal.querySelector('#image-error').textContent = 'Görsel yüklenemedi: ' + result.error;
                    }
                } catch (error) {
                    console.error('Yükleme hatası:', error);
                    const editModal = document.getElementById('edit-modal');
                    if (editModal) editModal.querySelector('#image-error').textContent = 'Görsel yüklenemedi: Sunucu bağlantı hatası.';
                }
            }
            imageFileInput.value = '';
        });
    }

    const addImageUrlBtn = document.getElementById('add-image-url');
    if (addImageUrlBtn) {
        addImageUrlBtn.addEventListener('click', function() {
            var url = document.getElementById('image-url-input').value;
            if (url) {
                tempImages.push(url);
                updateImageList();
                const editModal = document.getElementById('edit-modal');
                if (editModal) editModal.querySelector('#image-error').textContent = '';
            } else {
                const editModal = document.getElementById('edit-modal');
                if (editModal) editModal.querySelector('#image-error').textContent = 'Lütfen geçerli bir URL girin.';
            }
        });
    }

    var modals = document.querySelectorAll('.modal');
    modals.forEach(function(modal) {
        var closeBtn = modal.querySelector('.close, .image-viewer-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                modal.style.display = 'none';
                const loginModal = document.getElementById('login-modal');
                const editModal = document.getElementById('edit-modal');
                if (loginModal) loginModal.querySelector('#login-error').textContent = '';
                if (editModal) editModal.querySelector('#image-error').textContent = '';
            });
        }
    });

    var editModalCloseBtn = document.querySelector('#edit-modal .close');
    if (editModalCloseBtn) {
        editModalCloseBtn.addEventListener('click', function() {
            document.getElementById('admin-modal').style.display = 'block';
        });
    }

    var classModalCloseBtn = document.querySelector('#class-modal .close');
    if (classModalCloseBtn) {
        classModalCloseBtn.addEventListener('click', function() {
            document.getElementById('admin-modal').style.display = 'block';
        });
    }

    const manageClassesBtn = document.getElementById('manage-classes-btn');
    if (manageClassesBtn) {
        manageClassesBtn.addEventListener('click', function() {
            document.getElementById('class-modal').style.display = 'block';
            loadClassList();
        });
    }

    // Marker sürükleme için olay dinleyici
    map.on('click', function(e) {
        if (isLoggedIn && document.getElementById('edit-modal').style.display === 'block' && selectedMarkerIndex === -1) {
            var latLng = [e.latlng.lat.toFixed(2), e.latlng.lng.toFixed(2)];
            document.getElementById('latlng-input').value = latLng.join(', ');
            var tempMarker = L.marker(latLng).addTo(map);
            setTimeout(function() { map.removeLayer(tempMarker); }, 2000);
        }
    });
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const loginError = document.getElementById('login-error');
    try {
        const hashedPassword = await hashPassword(password);
        const response = await fetch(`${BACKEND_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password: hashedPassword })
        });
        const result = await response.json();
        if (result.success) {
            isLoggedIn = true;
            localStorage.setItem('isLoggedIn', 'true');
            document.getElementById('login-modal').style.display = 'none';
            updateAdminUI();
        } else {
            loginError.textContent = result.message || 'Giriş başarısız!';
        }
    } catch (error) {
        console.error('Giriş hatası:', error);
        loginError.textContent = 'Sunucu bağlantı hatası.';
    }
}

async function handleLogout() {
    try {
        await fetch(`${BACKEND_URL}/api/logout`, { method: 'POST' });
        isLoggedIn = false;
        localStorage.setItem('isLoggedIn', 'false');
        updateAdminUI();
        const adminModal = document.getElementById('admin-modal');
        if (adminModal) adminModal.style.display = 'none';
    } catch (error) {
        console.error('Çıkış hatası:', error);
    }
}

function updateAdminUI() {
    const adminToggle = document.getElementById('admin-toggle');
    const showAdminPanel = document.getElementById('show-admin-panel');
    if (adminToggle) {
        adminToggle.textContent = isLoggedIn ? 'Çıkış Yap' : 'Giriş Yap';
    }
    if (showAdminPanel) {
        showAdminPanel.style.display = isLoggedIn ? 'block' : 'none';
    }
}

async function loadInitialData() {
    try {
        const markersResponse = await fetch(`${BACKEND_URL}/api/markers`);
        if (!markersResponse.ok) throw new Error('Markerlar yüklenemedi.');
        const markers = await markersResponse.json();
        markerLayers = markers.map((data, index) => {
            const marker = L.marker(data.latLng, { draggable: isLoggedIn });
            marker.data = data;
            marker.originalIcon = L.divIcon({ className: 'marker-icon', iconSize: [20, 20], html: '' });
            marker.setIcon(marker.originalIcon);
            marker.addTo(map);
            marker.bindPopup(`<b>${data.title}</b><br>${data.description}`);
            if (isLoggedIn) {
                marker.on('dragend', function(e) {
                    const newLatLng = [e.target.getLatLng().lat.toFixed(2), e.target.getLatLng().lng.toFixed(2)];
                    marker.data.latLng = newLatLng;
                    saveMarker(marker.data);
                });
            }
            return { marker, data, originalIcon: marker.originalIcon };
        });

        const classesResponse = await fetch(`${BACKEND_URL}/api/classes`);
        if (!classesResponse.ok) throw new Error('Sınıflar yüklenemedi.');
        classes = await classesResponse.json();
        displayClasses();
    } catch (error) {
        console.error('Veri yükleme hatası:', error);
        alert('Veriler yüklenemedi: ' + error.message);
    }
}

async function saveMarker(data) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/markers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (result.success) {
            if (selectedMarkerIndex !== -1) {
                // Güncelleme: Mevcut markerı güncelle
                markerLayers[selectedMarkerIndex].data = result.marker;
                markerLayers[selectedMarkerIndex].marker.setLatLng(result.marker.latLng);
                markerLayers[selectedMarkerIndex].marker.bindPopup(`<b>${result.marker.title}</b><br>${result.marker.description}`);
            } else {
                // Yeni marker: Ekle
                const marker = L.marker(result.marker.latLng, { draggable: isLoggedIn });
                marker.data = result.marker;
                marker.originalIcon = L.divIcon({ className: 'marker-icon', iconSize: [20, 20], html: '' });
                marker.setIcon(marker.originalIcon);
                marker.addTo(map);
                marker.bindPopup(`<b>${result.marker.title}</b><br>${result.marker.description}`);
                if (isLoggedIn) {
                    marker.on('dragend', function(e) {
                        const newLatLng = [e.target.getLatLng().lat.toFixed(2), e.target.getLatLng().lng.toFixed(2)];
                        marker.data.latLng = newLatLng;
                        saveMarker(marker.data);
                    });
                }
                markerLayers.push({ marker, data: result.marker, originalIcon: marker.originalIcon });
            }
            loadAdminMarkers();
        } else {
            alert('Marker kaydedilemedi: ' + result.error);
        }
    } catch (error) {
        console.error('Marker kaydetme hatası:', error);
        alert('Marker kaydedilemedi: Sunucu bağlantı hatası.');
    }
}

async function deleteMarker(id) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/markers/${id}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            const index = markerLayers.findIndex(layer => layer.data.id === id);
            if (index !== -1) {
                map.removeLayer(markerLayers[index].marker);
                markerLayers.splice(index, 1);
                loadAdminMarkers();
            }
        } else {
            alert('Marker silinemedi: ' + result.error);
        }
    } catch (error) {
        console.error('Marker silme hatası:', error);
        alert('Marker silinemedi: Sunucu bağlantı hatası.');
    }
}

async function handleAddClass(e) {
    e.preventDefault();
    const className = document.getElementById('class-name').value;
    if (className && !classes.includes(className)) {
        try {
            const response = await fetch(`${BACKEND_URL}/api/classes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: className })
            });
            const result = await response.json();
            if (result.success) {
                classes.push(className);
                displayClasses();
                document.getElementById('class-name').value = '';
                document.getElementById('class-modal').style.display = 'none';
                document.getElementById('admin-modal').style.display = 'block';
            } else {
                alert('Sınıf eklenemedi: ' + result.error);
            }
        } catch (error) {
            console.error('Sınıf ekleme hatası:', error);
            alert('Sınıf eklenemedi: Sunucu bağlantı hatası.');
        }
    } else {
        alert('Geçersiz veya mevcut sınıf adı.');
    }
}

async function deleteClass(className) {
    if (confirm(`'${className}' sınıfını silmek istediğinizden emin misiniz?`)) {
        try {
            const response = await fetch(`${BACKEND_URL}/api/classes/${encodeURIComponent(className)}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (result.success) {
                classes = classes.filter(c => c !== className);
                markerLayers.forEach(layer => {
                    if (layer.data.class === className) {
                        map.removeLayer(layer.marker);
                        markerLayers.splice(markerLayers.indexOf(layer), 1);
                    }
                });
                displayClasses();
                loadAdminMarkers();
            } else {
                alert('Sınıf silinemedi: ' + result.error);
            }
        } catch (error) {
            console.error('Sınıf silme hatası:', error);
            alert('Sınıf silinemedi: Sunucu bağlantı hatası.');
        }
    }
}

function showSuggestions(query) {
    const suggestionsList = document.getElementById('search-suggestions');
    suggestionsList.innerHTML = '';
    if (!query) {
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

function handleSearchSuggestionsClick(e) {
    const target = e.target.closest('.suggestion-item');
    if (!target) return;
    const layer = markerLayers.find(l => l.data.title === target.querySelector('.title').textContent);
    if (layer) {
        document.getElementById('search-suggestions').style.display = 'none';
        resetFilters();
        markerLayers.forEach(l => map.removeLayer(l.marker));
        map.flyTo(layer.marker.getLatLng(), 1);
        layer.marker.openPopup();
        highlightedMarkers.forEach(l => l.marker.setIcon(l.originalIcon));
        highlightedMarkers = [];
        layer.marker.setIcon(L.divIcon({
            className: 'marker-icon-highlight',
            iconSize: [20, 20],
            html: ''
        }));
        highlightedMarkers.push(layer);
        layer.marker.addTo(map);
    }
}

function displayClasses() {
    const classList = document.getElementById('class-list');
    const classSelect = document.getElementById('class-select');
    const filterOptions = document.getElementById('filter-options');

    if (!classList || !classSelect || !filterOptions) return;

    classList.innerHTML = '';
    classSelect.innerHTML = '<option value="">-- Sınıf Seç --</option>';
    filterOptions.innerHTML = '';

    classes.forEach((className, index) => {
        var li = document.createElement('li');
        li.className = 'class-item-wrapper';
        li.innerHTML = `
            <span>${className}</span>
            <div>
                <button onclick="editClass('${className}')">Düzenle</button>
                <button class="delete-btn" onclick="deleteClass('${className}')">Sil</button>
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

function loadAdminMarkers() {
    var markerList = document.getElementById('marker-list');
    if (!markerList) return;
    markerList.innerHTML = '';
    markerLayers.forEach(function(layer, index) {
        var li = document.createElement('li');
        li.style.display = 'flex';
        li.style.alignItems = 'center';
        li.style.justifyContent = 'space-between';

        var titleSpan = document.createElement('span');
        titleSpan.textContent = layer.data.title;

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
                deleteMarker(layer.data.id);
            }
        };

        btnDiv.appendChild(editBtn);
        btnDiv.appendChild(deleteBtn);

        li.appendChild(titleSpan);
        li.appendChild(btnDiv);

        markerList.appendChild(li);
    });
}

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

window.editClass = function(className) {
    const newName = prompt('Yeni sınıf adını girin:', className);
    if (newName && newName.trim() && !classes.includes(newName.trim())) {
        const oldName = className;
        classes = classes.map(c => c === oldName ? newName.trim() : c);
        markerLayers.forEach(layer => {
            if (layer.data.class === oldName) {
                layer.data.class = newName.trim();
                saveMarker(layer.data);
            }
        });
        displayClasses();
    }
};

window.editMarker = function(index) {
    selectedMarkerIndex = index;
    openEditModal(markerLayers[index].data, index);
};

window.openImageViewer = function(markerIndex, imageIndex) {
    currentImages = markerLayers[markerIndex].data.images || [];
    currentImageIndex = imageIndex;
    if (currentImages.length === 0) {
        console.log('Görsel bulunamadı!');
        const editModal = document.getElementById('edit-modal');
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

    const imageViewerModal = document.getElementById('image-viewer-modal');
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
        const editModal = document.getElementById('edit-modal');
        if (editModal) editModal.querySelector('#image-error').textContent = '';
    };

    img.onerror = function() {
        console.error('Görsel yüklenemedi:', img.src);
        const editModal = document.getElementById('edit-modal');
        if (editModal) editModal.querySelector('#image-error').textContent = 'Büyük görsel yüklenemedi: URL geçersiz veya erişilemiyor.';
    };
}

function updateFilters() {
    activeFilters.clear();
    document.querySelectorAll('.filter-checkbox:checked').forEach(checkbox => {
        activeFilters.add(checkbox.value);
    });
    applyFilters();
}

function applyFilters() {
    const hideAllFilters = document.getElementById('hide-all-filters');
    if (hideAllFilters && hideAllFilters.checked) {
        markerLayers.forEach(layer => map.removeLayer(layer.marker));
        return;
    }

    if (activeFilters.size === 0 && !inversionActive) {
        const selectAllFilters = document.getElementById('select-all-filters');
        if (selectAllFilters && selectAllFilters.checked) {
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
            isVisible = hasClass || activeFilters.size === 0;
        }

        if (isVisible) {
            layer.marker.addTo(map);
        } else {
            map.removeLayer(layer.marker);
        }
    });
}

window.openEditModal = function(data, index) {
    var editModal = document.getElementById('edit-modal');
    if (!editModal) return;
    editModal.style.display = 'block';
    selectedMarkerIndex = index;

    displayClasses();

    document.getElementById('title-input').value = data.title || '';
    document.getElementById('desc-input').value = data.description || '';
    document.getElementById('latlng-input').value = data.latLng ? data.latLng.join(', ') : '';
    document.getElementById('class-select').value = data.class || '';
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
            class: document.getElementById('class-select').value
        };
        if (selectedMarkerIndex !== -1) {
            newData.id = markerLayers[selectedMarkerIndex].data.id;
        }
        saveMarker(newData);
        editModal.style.display = 'none';
        document.getElementById('admin-modal').style.display = 'block';
    };

    var deleteBtn = document.getElementById('delete-marker');
    if (deleteBtn) {
        deleteBtn.style.display = selectedMarkerIndex === -1 ? 'none' : 'block';
        deleteBtn.onclick = function() {
            if (selectedMarkerIndex !== -1) {
                deleteMarker(markerLayers[selectedMarkerIndex].data.id);
                editModal.style.display = 'none';
                document.getElementById('admin-modal').style.display = 'block';
            }
        };
    }
}

function loadMarkers() {
    markerLayers.forEach(function(layer) {
        if (map.hasLayer(layer.marker)) {
            map.removeLayer(layer.marker);
        }
    });
    markerLayers = [];
    loadInitialData();
}

function resetFilters() {
    activeFilters.clear();
    document.querySelectorAll('.filter-checkbox').forEach(checkbox => {
        checkbox.checked = false;
    });
    const hideAllFilters = document.getElementById('hide-all-filters');
    const selectAllFilters = document.getElementById('select-all-filters');
    if (hideAllFilters) hideAllFilters.checked = false;
    if (selectAllFilters) selectAllFilters.checked = false;
    applyFilters();
}

async function loadClassList() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/classes`);
        if (!response.ok) throw new Error('Sınıflar yüklenemedi.');
        classes = await response.json();
        displayClasses();
    } catch (error) {
        console.error('Sınıf yükleme hatası:', error);
        alert('Sınıflar yüklenemedi: ' + error.message);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOMContentLoaded tetiklendi');
    initApp();
});
