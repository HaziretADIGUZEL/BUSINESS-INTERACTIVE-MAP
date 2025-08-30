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
app.use(cors());
app.use(express.json());
app.use(express.static('.'));
app.use('/uploads', express.static('uploads'));

// JWT secret
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
    console.error('JWT_SECRET ortam değişkeni tanımlı değil!');
    process.exit(1);
}

// Admin kimlik bilgileri
const adminUsername = process.env.ADMIN_USERNAME;
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
if (!adminUsername || !adminPasswordHash) {
    console.error('ADMIN_USERNAME veya ADMIN_PASSWORD_HASH tanımlı değil!');
    process.exit(1);
}

const admins = [
    {
        username: adminUsername,
        password: adminPasswordHash
    }
];

// Auth middleware: Token doğrula (sadece yazma/değiştirme için kullanılacak)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Token eksik' });

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'Geçersiz veya süresi dolmuş token' });
        req.user = user;
        next();
    });
};

// Görsel yükleme endpoint'i (admin korumalı yapıyoruz, çünkü yazma işlemi)
app.post('/upload', authenticateToken, upload.single('image'), async (req, res) => {
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

// Çıkış endpoint'i
app.post('/api/logout', (req, res) => {
    res.json({ success: true });
});

// Marker endpoint'leri
app.get('/api/markers', async (req, res) => { // Okuma herkese açık
    try {
        const snapshot = await db.ref('markers').once('value');
        const markers = snapshot.val() ? Object.values(snapshot.val()) : [];
        res.json(markers);
    } catch (error) {
        console.error('Marker yükleme hatası:', error);
        res.status(500).json({ success: false, error: 'Markerlar yüklenemedi.' });
    }
});

app.post('/api/markers', authenticateToken, async (req, res) => { // Yazma admin korumalı
    try {
        const markerData = req.body;
        const newMarkerRef = db.ref('markers').push();
        markerData.id = newMarkerRef.key;
        await newMarkerRef.set(markerData);
        res.json({ success: true, marker: markerData });
    } catch (error) {
        console.error('Marker kaydetme hatası:', error);
        res.status(500).json({ success: false, error: 'Marker kaydedilemedi.' });
    }
});

app.delete('/api/markers/:id', authenticateToken, async (req, res) => { // Silme admin korumalı
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
app.get('/api/classes', async (req, res) => { // Okuma herkese açık
    try {
        const snapshot = await db.ref('classes').once('value');
        const classesData = snapshot.val() ? Object.values(snapshot.val()) : [];
        res.json(classesData);
    } catch (error) {
        console.error('Sınıf yükleme hatası:', error);
        res.status(500).json({ success: false, error: 'Sınıflar yüklenemedi.' });
    }
});

app.post('/api/classes', authenticateToken, async (req, res) => { // Yazma admin korumalı
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

app.delete('/api/classes/:name', authenticateToken, async (req, res) => { // Silme admin korumalı
    try {
        const className = req.params.name;
        const snapshot = await db.ref('classes').once('value');
        const classesData = snapshot.val();
        const classKey = Object.keys(classesData).find(key => classesData[key] === className);
        if (classKey) {
            await db.ref(`classes/${classKey}`).remove();
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

const port = process.env.PORT || 8000;
app.listen(port, () => {
    console.log(`Sunucu http://localhost:${port} adresinde çalışıyor`);
});
