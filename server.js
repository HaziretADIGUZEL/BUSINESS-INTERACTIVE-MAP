const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');
const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');

// Express'i başlat
const app = express();
const upload = multer({ dest: 'uploads/' });

// Firebase Admin SDK'yı başlat
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL
});
const db = admin.database();

// Middleware
app.use(cors()); // CORS'u etkinleştir
app.use(express.json()); // JSON gövdelerini ayrıştır

// Statik dosyaları (CSS, JS, resimler) API rotalarından ÖNCE sun
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Admin kimlik bilgilerini ortam değişkenlerinden al
const admins = JSON.parse(process.env.ADMINS_DATA || '[]'); // JSON stringini parse ederek admin listesini al
const jwtSecret = process.env.JWT_SECRET;

// JWT doğrulaması yapan middleware
const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        jwt.verify(token, jwtSecret, (err, user) => {
            if (err) {
                console.error('JWT doğrulama hatası:', err);
                return res.status(403).json({ success: false, message: 'Geçersiz veya süresi dolmuş token.' });
            }
            req.user = user;
            next();
        });
    } else {
        res.status(401).json({ success: false, message: 'Erişim için token gerekli.' });
    }
};

// Görsel yükleme endpoint'i
app.post('/upload', upload.single('image'), authenticateJWT, async (req, res) => {
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

// Giriş endpoint'i
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const admin = admins.find(a => a.username === username && a.password === password);
        if (admin) {
            // YENİ: Başarılı girişte son giriş zamanını Firebase'e kaydet
            const lastLoginTime = new Date().toISOString();
            await db.ref(`lastLogins/${admin.username}`).set(lastLoginTime);

            const token = jwt.sign({ username: admin.username }, jwtSecret, { expiresIn: '1h' });
            res.json({ success: true, token });
        } else {
            res.status(401).json({ success: false, message: 'Kullanıcı adı veya şifre yanlış!' });
        }
    } catch (error) {
        console.error('Login hatası:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası.' });
    }
});

// YENİ: Son giriş zamanını getiren endpoint
app.get('/api/last-login', authenticateJWT, async (req, res) => {
    try {
        const username = req.user.username;
        const snapshot = await db.ref(`lastLogins/${username}`).once('value');
        const lastLogin = snapshot.val();
        if (lastLogin) {
            res.json({ success: true, lastLogin });
        } else {
            // Eğer bir kayıt yoksa, token geçerli olduğu sürece yeni bir kayıt oluşturup devam et.
            const newLoginTime = new Date().toISOString();
            await db.ref(`lastLogins/${username}`).set(newLoginTime);
            res.json({ success: true, lastLogin: newLoginTime });
        }
    } catch (error) {
        console.error('Son giriş zamanı alınamadı:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası.' });
    }
});

// Çıkış endpoint'i (oturumlar uygulanmadığı için placeholder)
app.post('/api/logout', (req, res) => {
    res.json({ success: true });
});

// Marker endpoint'leri
app.get('/api/markers', async (req, res) => {
    try {
        const snapshot = await db.ref('markers').once('value');
        const markers = snapshot.val() ? Object.values(snapshot.val()) : [];
        res.json(markers);
    } catch (error) {
        console.error('Marker yükleme hatası:', error);
        res.status(500).json({ success: false, error: 'Markerlar yüklenemedi.' });
    }
});

app.post('/api/markers', authenticateJWT, async (req, res) => {
    try {
        const markerData = req.body;
        const newMarkerRef = db.ref('markers').push();
        markerData.id = newMarkerRef.key; // Firebase tarafından üretilen anahtarı ID olarak kullan
        await newMarkerRef.set(markerData);
        res.json({ success: true, marker: markerData });
    } catch (error) {
        console.error('Marker kaydetme hatası:', error);
        res.status(500).json({ success: false, error: 'Marker kaydedilemedi.' });
    }
});

app.delete('/api/markers/:id', authenticateJWT, async (req, res) => {
    try {
        const markerId = req.params.id;
        await db.ref(`markers/${markerId}`).remove();
        res.json({ success: true });
    } catch (error) {
        console.error('Marker silme hatası:', error);
        res.status(500).json({ success: false, error: 'Marker silinemedi.' });
    }
});

// Sınıf endpoint'leri
app.get('/api/classes', async (req, res) => {
    try {
        const snapshot = await db.ref('classes').once('value');
        const classesData = snapshot.val() ? Object.values(snapshot.val()) : [];
        res.json(classesData);
    } catch (error) {
        console.error('Sınıf yükleme hatası:', error);
        res.status(500).json({ success: false, error: 'Sınıflar yüklenemedi.' });
    }
});

app.post('/api/classes', authenticateJWT, async (req, res) => {
    try {
        const { name } = req.body;
        const snapshot = await db.ref('classes').once('value');
        const classesData = snapshot.val() ? Object.values(snapshot.val()) : [];
        if (name && !classesData.includes(name)) {
            await db.ref('classes').push(name);
            res.json({ success: true });
        } else {
            res.status(400).json({ success: false, error: 'Geçersiz veya mevcut sınıf adı.' });
        }
    } catch (error) {
        console.error('Sınıf ekleme hatası:', error);
        res.status(500).json({ success: false, error: 'Sınıf eklenemedi.' });
    }
});

app.delete('/api/classes/:name', authenticateJWT, async (req, res) => {
    try {
        const className = req.params.name;
        const snapshot = await db.ref('classes').once('value');
        const classesData = snapshot.val();
        const classKey = Object.keys(classesData).find(key => classesData[key] === className);
        if (classKey) {
            await db.ref(`classes/${classKey}`).remove();
            // İlgili markerları sil
            const markersSnapshot = await db.ref('markers').once('value');
            const markersData = markersSnapshot.val() || {};
            for (const markerId in markersData) {
                if (markersData[markerId].class === className) {
                    await db.ref(`markers/${markerId}`).remove();
                }
            }
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, error: 'Sınıf bulunamadı.' });
        }
    } catch (error) {
        console.error('Sınıf silme hatası:', error);
        res.status(500).json({ success: false, error: 'Sınıf silinemedi.' });
    }
});

// "Catch-all" rotası: API ile eşleşmeyen tüm GET isteklerini index.html'e yönlendirir.
// Bu rotanın tüm API endpoint'lerinden SONRA gelmesi çok önemlidir.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const port = process.env.PORT || 8000;
app.listen(port, () => {
    console.log(`Sunucu http://localhost:${port} adresinde çalışıyor`);
});
