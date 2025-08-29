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
    if (!isLoggedIn) {
        const loginModal = document.getElementById('login-modal');
        if (loginModal) loginModal.style.display = 'block';
    } else {
        const loginModal = document.getElementById('login-modal');
        if (loginModal) loginModal.style.display = 'none';
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
        logoutBtn.addEventListener('click', function() {
            if (isLoggedIn) {
                handleLogout();
            } else {
                const loginModal = document.getElementById('login-modal');
                if (loginModal) loginModal.style.display = 'block';
            }
        });
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

    map.on('click', function(e) {
        if (isLoggedIn && document.getElementById('edit-modal').style.display === 'block' && selectedMarkerIndex === -1) {
            var latLng = [e.latlng.lat.toFixed(2), e.latlng.lng.toFixed(2)];
            document.getElementById('latlng-input').value = latLng.join(', ');
            var tempMarker = L.marker(latLng).addTo(map);
            setTimeout(function() { map.removeLayer(tempMarker); }, 2000);
        }
    });

    const prevButton = document.querySelector('.prev-button');
    const nextButton = document.querySelector('.next-button');
    const imageViewerCloseBtn = document.querySelector('.image-viewer-close');
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
            const imageViewerModal = document.getElementById('image-viewer-modal');
            if (imageViewerModal) imageViewerModal.style.display = 'none';
            const editModal = document.getElementById('edit-modal');
            if (editModal) editModal.querySelector('#image-error').textContent = '';
        });
    }

    const selectAllFilters = document.getElementById('select-all-filters');
    const hideAllFilters = document.getElementById('hide-all-filters');
    const inversionToggle = document.getElementById('inversion-toggle');
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
}

async function loadInitialData() {
    try {
        const markersResponse = await fetch(`${BACKEND_URL}/api/markers`);
        if (!markersResponse.ok) throw new Error('Markers yüklenemedi.');
        const markersData = await markersResponse.json();
        markerLayers = [];
        markersData.forEach((markerData, index) => {
            addMarkerToMap(markerData, index);
        });

        const classesResponse = await fetch(`${BACKEND_URL}/api/classes`);
        if (!classesResponse.ok) throw new Error('Classes yüklenemedi.');
        classes = await classesResponse.json();
        displayClasses();
        applyFilters();
    } catch (error) {
        console.error('Veri yükleme hatası:', error);
        alert('Veriler yüklenirken bir hata oluştu. Sunucuya erişim sağlanamıyor.');
    }
}

function updateAdminUI() {
    const loginSection = document.getElementById('login-section');
    const adminPanel = document.querySelector('.admin-panel');
    const adminToggle = document.getElementById('admin-toggle');
    if (isLoggedIn) {
        if (loginSection) loginSection.style.display = 'none';
        if (adminPanel) adminPanel.classList.add('visible');
        if (adminToggle) adminToggle.textContent = 'Çıkış Yap';
    } else {
        if (loginSection) loginSection.style.display = 'block';
        if (adminPanel) adminPanel.classList.remove('visible');
        if (adminToggle) adminToggle.textContent = 'Admin Modu';
    }
    loadMarkers();
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    try {
        const hashedPassword = await hashPassword(password);
        const response = await fetch(`${BACKEND_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password: hashedPassword })
        });
        const data = await response.json();
        if (data.success) {
            isLoggedIn = true;
            localStorage.setItem('isLoggedIn', 'true');
            updateAdminUI();
            console.log('Giriş başarılı!');
        } else {
            isLoggedIn = false;
            alert(data.message);
        }
        updateAdminUI();
    } catch (error) {
        console.error('Giriş isteği başarısız:', error);
        alert('Giriş sırasında bir ağ hatası oluştu.');
    }
}

function handleLogout() {
    fetch(`${BACKEND_URL}/api/logout`, { method: 'POST' })
        .then(() => {
            isLoggedIn = false;
            localStorage.setItem('isLoggedIn', 'false');
            updateAdminUI();
            console.log('Çıkış başarılı!');
        })
        .catch(error => console.error('Çıkış hatası:', error));
}

async function saveMarker(markerData) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/markers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(markerData)
        });
        const data = await response.json();
        if (data.success) {
            alert('Marker başarıyla kaydedildi.');
            await loadInitialData();
        } else {
            alert('Marker kaydedilirken bir hata oluştu.');
        }
    } catch (error) {
        console.error('Marker kaydetme hatası:', error);
        alert('Sunucuya bağlanılamıyor.');
    }
}

async function deleteMarker(markerId) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/markers/${markerId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (data.success) {
            alert('Marker başarıyla silindi.');
            await loadInitialData();
        } else {
            alert(data.error);
        }
    } catch (error) {
        console.error('Marker silme hatası:', error);
        alert('Sunucuya bağlanılamıyor.');
    }
}

async function handleAddClass(e) {
    e.preventDefault();
    const classNameInput = document.getElementById('class-name-input');
    const newClassName = classNameInput.value.trim();
    if (newClassName) {
        try {
            const response = await fetch(`${BACKEND_URL}/api/classes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newClassName })
            });
            const data = await response.json();
            if (data.success) {
                alert('Sınıf başarıyla eklendi.');
                classNameInput.value = '';
                await loadInitialData();
            } else {
                alert(data.error);
            }
        } catch (error) {
            console.error('Sınıf ekleme hatası:', error);
            alert('Sunucuya bağlanılamıyor.');
        }
    }
}

async function deleteClass(classId) {
    if (confirm('Bu sınıfı silmek istediğinizden emin misiniz?')) {
        try {
            const response = await fetch(`${BACKEND_URL}/api/classes/${classId}`, {
                method: 'DELETE'
            });
            const data = await response.json();
            if (data.success) {
                alert('Sınıf başarıyla silindi.');
                await loadInitialData();
            } else {
                alert(data.error);
            }
        } catch (error) {
            console.error('Sınıf silme hatası:', error);
            alert('Sunucuya bağlanılamıyor.');
        }
    }
}

function addMarkerToMap(markerData, index) {
    var marker = L.marker([markerData.latLng[0], markerData.latLng[1]], {
        icon: L.divIcon({
            className: 'marker-icon',
            iconSize: [20, 20],
            html: ''
        }),
        draggable: isLoggedIn // Admin modunda sürükle
    }).addTo(map);

    marker.bindPopup(createPopupContent(markerData, index), {
        autoPan: true,
        autoPanPadding: [50, 50] // Harita sınırlarıyla çakışmayı azaltmak için
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

    marker.on('dragend', function(e) {
        markerData.latLng = [marker.getLatLng().lat, marker.getLatLng().lng];
        saveMarker(markerData);
    });

    markerLayers.push({ marker: marker, data: markerData, originalIcon: marker.options.icon });
}

function createPopupContent(markerData, index) {
    var imagesHtml = markerData.images && markerData.images.length > 0
        ? `<div class="marker-images">${markerData.images.map((img, i) => `<img src="${img}" alt="Image ${i}" onclick="openImageViewer(${index}, ${i})">`).join('')}</div>`
        : '<img src="https://via.placeholder.com/150" alt="No image" style="width:80px;height:80px;object-fit:cover;">';
    var adminEditButton = isLoggedIn ? `<button class="edit-button" onclick="editMarker(${index})">Düzenle</button>` : '';
    return `
        <h2>${markerData.title}</h2>
        <p>${markerData.description}</p>
        ${imagesHtml}
        ${adminEditButton}
    `;
}

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
    const suggestionsList = document.getElementById('search-suggestions');
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

function handleSearchSuggestionsClick(e) {
    const target = e.target.closest('.suggestion-item');
    if (!target) return;
    const index = Array.from(document.querySelectorAll('.suggestion-item')).indexOf(target);
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

window.openEditModal = function(data, index) {
    var editModal = document.getElementById('edit-modal');
    if (!editModal) return;
    editModal.style.display = 'block';
    selectedMarkerIndex = index;

    displayClasses();

    document.getElementById('title-input').value = data.title;
    document.getElementById('desc-input').value = data.description;
    document.getElementById('latlng-input').value = data.latLng.join(', ');
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

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOMContentLoaded tetiklendi');
    initApp();
});
