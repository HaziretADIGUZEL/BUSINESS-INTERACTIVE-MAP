const BACKEND_URL = 'https://busyness-interactive-map.onrender.com'; // Render URL
let map;
let markerLayers = [];
let classes = [];
let isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
let selectedMarkerIndex = -1;
let highlightedMarkers = [];
let activeFilters = new Set();
let inversionActive = false;
let tempImages = [];
let currentImages = [];
let currentImageIndex = 0;
let imageViewerMap = null;
const svgHeight = 7598.6665;
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
                document.getElementById('login-modal').style.display = 'block';
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
        if (!markersResponse.ok) throw new Error('Markers yüklene medi.');
        const markersData = await markersResponse.json();
        markerLayers = [];
        markersData.forEach((markerData, index) => addMarkerToMap(markerData, index));

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

function addMarkerToMap(markerData, index) {
    var marker = L.marker([markerData.latLng[0], markerData.latLng[1]], {
        icon: L.divIcon({
            className: 'marker-icon',
            iconSize: [20, 20],
            html: ''
        }),
        draggable: isLoggedIn // Admin modunda sürüklenabilir
    }).addTo(map);

    // Pop-up'ı bağla
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

    if (isLoggedIn) {
        marker.on('dragend', function(e) {
            markerData.latLng = [marker.getLatLng().lat, marker.getLatLng().lng];
            saveMarker(markerData);
        });
    }

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

function updateAdminUI() {
    const adminToggle = document.getElementById('admin-toggle');
    const showAdminPanel = document.getElementById('show-admin-panel');
    const manageClassesBtn = document.getElementById('manage-classes-btn');
    if (adminToggle) adminToggle.textContent = isLoggedIn ? 'Admin Modu Kapat' : 'Admin Modu';
    if (showAdminPanel) showAdminPanel.style.display = isLoggedIn ? 'block' : 'none';
    if (manageClassesBtn) manageClassesBtn.style.display = isLoggedIn ? 'block' : 'none';
    loadMarkers();
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username-input').value;
    const password = document.getElementById('password-input').value;
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
            document.getElementById('login-modal').style.display = 'none';
            updateAdminUI();
            console.log('Giriş başarılı!');
        } else {
            document.getElementById('login-error').textContent = data.message;
        }
    } catch (error) {
        console.error('Giriş isteği başarısız:', error);
        document.getElementById('login-error').textContent = 'Giriş sırasında bir ağ hatası oluştu.';
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
