const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Middleware'ler
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // JSON body'leri parse etmek için
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// KÖK DİZİNDE YENİ BİR 'data' KLASÖRÜ OLUŞTURUN
// admins.json ve diğer hassas dosyaları buraya taşıyın.
const ADMINS_FILE = path.join(__dirname, 'data', 'admins.json');
const MARKERS_FILE = path.join(__dirname, 'data', 'markers.json'); // Yeni
const CLASSES_FILE = path.join(__dirname, 'data', 'classes.json'); // Yeni

// Oturum yönetimi için basit bir değişken (Gelişmiş projelerde JWT veya oturum kütüphaneleri kullanılır)
let authenticatedAdmin = null;

// Görsel yükleme endpoint'i
app.post('/api/upload', upload.single('image'), async (req, res) => {
    // Admin kontrolü eklenmeli
    if (!authenticatedAdmin) {
        return res.status(401).json({ error: 'Yetkilendirme Hatası: Admin girişi yapılmamış.' });
    }
    
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'Dosya seçilmedi.' });
        }
        const newPath = path.join('uploads', `${Date.now()}_${file.originalname}`);
        await fs.rename(file.path, newPath);
        const url = `/uploads/${path.basename(newPath)}`;
        res.json({ url });
    } catch (error) {
        console.error('Yükleme hatası:', error);
        res.status(500).json({ error: `Sunucu hatası: ${error.message}` });
    }
});

// LOGIN ENDPOINT'İ
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const adminsData = await fs.readFile(ADMINS_FILE, 'utf8');
        const admins = JSON.parse(adminsData);
        
        const admin = admins.find(a => a.username === username);

        if (admin && bcrypt.compareSync(password, admin.password)) {
            // Şifre doğru, admin oturumunu başlat
            authenticatedAdmin = username;
            res.json({ success: true, message: 'Giriş başarılı.' });
        } else {
            // Hatalı kullanıcı adı veya şifre
            res.status(401).json({ success: false, message: 'Hatalı kullanıcı adı veya şifre.' });
        }
    } catch (error) {
        console.error('Login hatası:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası.' });
    }
});

// LOGOUT ENDPOINT'İ
app.post('/api/logout', (req, res) => {
    authenticatedAdmin = null;
    res.json({ success: true, message: 'Çıkış başarılı.' });
});

// MARKER VE SINIFLARI YÖNETEN ENDPOINTLER
// Not: Bu endpointler daha sonra marker ve sınıf verilerini bir veritabanında (örneğin MongoDB) tutacak şekilde güncellenmelidir.
// Şimdilik dosya sisteminde tutulacaktır.

// Marker'ları okuma (frontend için)
app.get('/api/markers', async (req, res) => {
    try {
        const data = await fs.readFile(MARKERS_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        // Dosya yoksa boş array döndür
        if (error.code === 'ENOENT') {
            return res.json([]);
        }
        console.error('Marker okuma hatası:', error);
        res.status(500).json({ error: 'Markerlar yüklenirken bir hata oluştu.' });
    }
});

// Marker ekleme veya güncelleme (admin için)
app.post('/api/markers', async (req, res) => {
    if (!authenticatedAdmin) {
        return res.status(401).json({ error: 'Yetkilendirme Hatası' });
    }

    try {
        const newMarker = req.body;
        const markersData = await fs.readFile(MARKERS_FILE, 'utf8').catch(() => '[]');
        const markers = JSON.parse(markersData);
        
        // ID varsa güncelle, yoksa yeni ekle
        const existingIndex = markers.findIndex(m => m.id === newMarker.id);
        if (existingIndex !== -1) {
            markers[existingIndex] = newMarker;
        } else {
            newMarker.id = Date.now().toString(); // Basit ID oluşturma
            markers.push(newMarker);
        }

        await fs.writeFile(MARKERS_FILE, JSON.stringify(markers, null, 2));
        res.json({ success: true, marker: newMarker });
    } catch (error) {
        console.error('Marker kaydetme hatası:', error);
        res.status(500).json({ error: 'Marker kaydedilirken bir hata oluştu.' });
    }
});

// Marker silme (admin için)
app.delete('/api/markers/:id', async (req, res) => {
    if (!authenticatedAdmin) {
        return res.status(401).json({ error: 'Yetkilendirme Hatası' });
    }

    try {
        const markerId = req.params.id;
        const markersData = await fs.readFile(MARKERS_FILE, 'utf8');
        let markers = JSON.parse(markersData);
        const initialLength = markers.length;
        markers = markers.filter(m => m.id !== markerId);
        
        if (markers.length === initialLength) {
            return res.status(404).json({ error: 'Marker bulunamadı.' });
        }

        await fs.writeFile(MARKERS_FILE, JSON.stringify(markers, null, 2));
        res.json({ success: true, message: 'Marker silindi.' });
    } catch (error) {
        console.error('Marker silme hatası:', error);
        res.status(500).json({ error: 'Marker silinirken bir hata oluştu.' });
    }
});


// Sınıfları okuma
app.get('/api/classes', async (req, res) => {
    try {
        const data = await fs.readFile(CLASSES_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        if (error.code === 'ENOENT') {
            return res.json([]);
        }
        console.error('Sınıf okuma hatası:', error);
        res.status(500).json({ error: 'Sınıflar yüklenirken bir hata oluştu.' });
    }
});


// Sınıf ekleme veya güncelleme
app.post('/api/classes', async (req, res) => {
    if (!authenticatedAdmin) {
        return res.status(401).json({ error: 'Yetkilendirme Hatası' });
    }

    try {
        const newClass = req.body;
        const classesData = await fs.readFile(CLASSES_FILE, 'utf8').catch(() => '[]');
        const classes = JSON.parse(classesData);
        
        const existingIndex = classes.findIndex(c => c.id === newClass.id);
        if (existingIndex !== -1) {
            classes[existingIndex] = newClass;
        } else {
            newClass.id = Date.now().toString();
            classes.push(newClass);
        }

        await fs.writeFile(CLASSES_FILE, JSON.stringify(classes, null, 2));
        res.json({ success: true, class: newClass });
    } catch (error) {
        console.error('Sınıf kaydetme hatası:', error);
        res.status(500).json({ error: 'Sınıf kaydedilirken bir hata oluştu.' });
    }
});

// Sınıf silme
app.delete('/api/classes/:id', async (req, res) => {
    if (!authenticatedAdmin) {
        return res.status(401).json({ error: 'Yetkilendirme Hatası' });
    }

    try {
        const classId = req.params.id;
        const classesData = await fs.readFile(CLASSES_FILE, 'utf8');
        let classes = JSON.parse(classesData);
        const initialLength = classes.length;
        classes = classes.filter(c => c.id !== classId);

        if (classes.length === initialLength) {
            return res.status(404).json({ error: 'Sınıf bulunamadı.' });
        }

        await fs.writeFile(CLASSES_FILE, JSON.stringify(classes, null, 2));
        res.json({ success: true, message: 'Sınıf silindi.' });
    } catch (error) {
        console.error('Sınıf silme hatası:', error);
        res.status(500).json({ error: 'Sınıf silinirken bir hata oluştu.' });
    }
});

// Sunucuyu başlat
app.listen(process.env.PORT || 8000, () => {
    console.log('Sunucu http://localhost:8000 adresinde çalışıyor');
});
