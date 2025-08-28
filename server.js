const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors()); // CORS desteği
app.use(express.static('.')); // Statik dosyaları sun
app.use('/uploads', express.static('uploads')); // Görseller için

// Görsel yükleme endpoint'i
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

app.listen(process.env.PORT || 8000, () => {
    console.log('Sunucu http://localhost:8000 adresinde çalışıyor');

});
