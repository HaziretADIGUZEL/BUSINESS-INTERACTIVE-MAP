const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');

const app = express();
const upload = multer({ dest: 'uploads/' });

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

// In-memory storage for markers and classes (replace with a database in production)
let markers = [];
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
        // Password is already hashed from frontend, compare directly
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
app.get('/api/markers', (req, res) => {
    res.json(markers);
});

app.post('/api/markers', async (req, res) => {
    try {
        const markerData = req.body;
        markerData.id = markers.length + 1; // Simple ID generation
        markers.push(markerData);
        res.json({ success: true, marker: markerData });
    } catch (error) {
        console.error('Marker kaydetme hatası:', error);
        res.status(500).json({ success: false, error: 'Marker kaydedilemedi.' });
    }
});

app.delete('/api/markers/:id', (req, res) => {
    const markerId = parseInt(req.params.id);
    const index = markers.findIndex(m => m.id === markerId);
    if (index !== -1) {
        markers.splice(index, 1);
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, error: 'Marker bulunamadı.' });
    }
});

// Classes endpoints
app.get('/api/classes', (req, res) => {
    res.json(classes);
});

app.post('/api/classes', (req, res) => {
    const { name } = req.body;
    if (name && !classes.includes(name)) {
        classes.push(name);
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, error: 'Geçersiz veya mevcut sınıf adı.' });
    }
});

app.delete('/api/classes/:name', (req, res) => {
    const className = req.params.name;
    const index = classes.indexOf(className);
    if (index !== -1) {
        classes.splice(index, 1);
        markers = markers.filter(m => m.class !== className);
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, error: 'Sınıf bulunamadı.' });
    }
});

app.listen(8000, () => {
    console.log('Sunucu http://localhost:8000 adresinde çalışıyor');
});
