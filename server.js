const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');
const admin = require('firebase-admin');

// Initialize Express
const app = express();
const upload = multer({ dest: 'uploads/' });

// Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL // e.g., https://your-project-id.firebaseio.com
});
const db = admin.database();

// Middleware
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON bodies
app.use(express.static('.')); // Serve static files
app.use('/uploads', express.static('uploads')); // Serve images

// Load admin credentials from environment variables
const adminUsername = process.env.ADMIN_USERNAME;
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

const admins = [
    {
        username: adminUsername,
        password: adminPasswordHash
    }
];

// In-memory storage for classes (replace with Firebase if needed)
let classes = [];

// Image upload endpoint
app.post('/upload', upload.single('image'), async (req, res) => {
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

// Login endpoint
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const admin = admins.find(a => a.username === username && a.password === password);
        if (admin) {
            res.json({ success: true });
        } else {
            res.json({ success: false, message: 'Kullanıcı adı veya şifre yanlış!' });
        }
    } catch (error) {
        console.error('Login hatası:', error);
        res.status(500).json({ success: false, message: 'Sunucu hatası.' });
    }
});

// Logout endpoint (placeholder, as sessions are not implemented)
app.post('/api/logout', (req, res) => {
    res.json({ success: true });
});

// Markers endpoints
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

app.post('/api/markers', async (req, res) => {
    try {
        const markerData = req.body;
        const newMarkerRef = db.ref('markers').push();
        markerData.id = newMarkerRef.key; // Use Firebase-generated key as ID
        await newMarkerRef.set(markerData);
        res.json({ success: true, marker: markerData });
    } catch (error) {
        console.error('Marker kaydetme hatası:', error);
        res.status(500).json({ success: false, error: 'Marker kaydedilemedi.' });
    }
});

app.delete('/api/markers/:id', async (req, res) => {
    try {
        const markerId = req.params.id;
        await db.ref(`markers/${markerId}`).remove();
        res.json({ success: true });
    } catch (error) {
        console.error('Marker silme hatası:', error);
        res.status(500).json({ success: false, error: 'Marker silinemedi.' });
    }
});

// Classes endpoints
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

app.post('/api/classes', async (req, res) => {
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

app.delete('/api/classes/:name', async (req, res) => {
    try {
        const className = req.params.name;
        const snapshot = await db.ref('classes').once('value');
        const classesData = snapshot.val();
        const classKey = Object.keys(classesData).find(key => classesData[key] === className);
        if (classKey) {
            await db.ref(`classes/${classKey}`).remove();
            // Remove markers associated with the class
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
