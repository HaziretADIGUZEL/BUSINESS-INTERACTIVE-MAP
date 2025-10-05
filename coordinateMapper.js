/**
 * Koordinat-Pixel Eşleştirme Sistemi (9 Referans Noktası)
 */

// Referans Noktaları (Köşeler + Orta Noktalar)
const REFERENCE_POINTS = [
    // 4 Köşe
    {
        name: 'topLeft',
        pixelX: 0,
        pixelY: 0,
        lat: 37.99279736150312,
        lng: 32.63456638780986
    },
    {
        name: 'topRight',
        pixelX: 7599,
        pixelY: 0,
        lat: 37.993749375315446,
        lng: 32.6354653915523
    },
    {
        name: 'bottomLeft',
        pixelX: 0,
        pixelY: 8020,
        lat: 37.992116740984066,
        lng: 32.63582306365832
    },
    {
        name: 'bottomRight',
        pixelX: 7599,
        pixelY: 8020,
        lat: 37.99303542939012,
        lng: 32.63668979126129
    },
    // Orta Noktalar
    {
        name: 'center',
        pixelX: 3799.5,
        pixelY: 4010,
        lat: 37.99291767413062,
        lng: 32.63564951888404
    },
    {
        name: 'leftMiddle',
        pixelX: 0,
        pixelY: 4010,
        lat: 37.99245984247931,
        lng: 32.63519311712463
    },
    {
        name: 'bottomMiddle',
        pixelX: 3799.5,
        pixelY: 8020,
        lat: 37.99257510052641,
        lng: 32.636255596950996
    },
    {
        name: 'rightMiddle',
        pixelX: 7599,
        pixelY: 4010,
        lat: 37.99339207661689,
        lng: 32.63607572316304
    },
    {
        name: 'topMiddle',
        pixelX: 3799.5,
        pixelY: 0,
        lat: 37.993267537462145,
        lng: 32.635009502370124
    }
];

// Harita boyutları
const MAP_DIMENSIONS = {
    width: 8020,
    height: 7599
};

/**
 * İki nokta arasındaki mesafeyi hesapla (Euclidean distance)
 */
function distance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

/**
 * Inverse Distance Weighting (IDW) ile GPS'ten Pixel hesapla
 * Daha yakın referans noktaları daha fazla ağırlığa sahip olur
 */
function gpsToPixel(lat, lng) {
    let totalWeightX = 0;
    let totalWeightY = 0;
    let totalWeight = 0;
    
    // Her referans noktası için hesaplama
    for (let ref of REFERENCE_POINTS) {
        // GPS mesafesi (derece cinsinden)
        const dist = distance(lat, lng, ref.lat, ref.lng);
        
        // Çok yakın bir noktaya denk geldiyse direkt döndür
        if (dist < 0.0000001) {
            console.log('Tam eşleşme bulundu:', ref.name);
            return {
                pixelX: ref.pixelX,
                pixelY: ref.pixelY,
                isValid: true,
                matchedPoint: ref.name
            };
        }
        
        // Ağırlık hesapla (mesafe ne kadar yakınsa ağırlık o kadar fazla)
        // power=2 kullanıyoruz (IDW standart değeri)
        const weight = 1 / Math.pow(dist, 2);
        
        totalWeightX += weight * ref.pixelX;
        totalWeightY += weight * ref.pixelY;
        totalWeight += weight;
    }
    
    // Ağırlıklı ortalama ile pixel hesapla
    const pixelX = Math.round(totalWeightX / totalWeight);
    const pixelY = Math.round(totalWeightY / totalWeight);
    
    // Sınırları kontrol et
    const clampedX = Math.max(0, Math.min(MAP_DIMENSIONS.height, pixelX));
    const clampedY = Math.max(0, Math.min(MAP_DIMENSIONS.width, pixelY));
    
    // Debug log
    console.log('GPS -> Pixel (IDW) Hesaplama:', {
        input: { lat, lng },
        output: { pixelX: clampedX, pixelY: clampedY },
        clamped: pixelX !== clampedX || pixelY !== clampedY
    });
    
    return {
        pixelX: clampedX,
        pixelY: clampedY,
        isValid: pixelX === clampedX && pixelY === clampedY
    };
}

/**
 * Inverse Distance Weighting (IDW) ile Pixel'den GPS hesapla
 */
function pixelToGPS(pixelX, pixelY) {
    let totalWeightLat = 0;
    let totalWeightLng = 0;
    let totalWeight = 0;
    
    // Her referans noktası için hesaplama
    for (let ref of REFERENCE_POINTS) {
        // Pixel mesafesi
        const dist = distance(pixelX, pixelY, ref.pixelX, ref.pixelY);
        
        // Çok yakın bir noktaya denk geldiyse direkt döndür
        if (dist < 0.1) {
            return {
                lat: ref.lat,
                lng: ref.lng,
                isValid: true,
                matchedPoint: ref.name
            };
        }
        
        // Ağırlık hesapla
        const weight = 1 / Math.pow(dist, 2);
        
        totalWeightLat += weight * ref.lat;
        totalWeightLng += weight * ref.lng;
        totalWeight += weight;
    }
    
    // Ağırlıklı ortalama ile GPS hesapla
    const lat = totalWeightLat / totalWeight;
    const lng = totalWeightLng / totalWeight;
    
    return {
        lat: lat,
        lng: lng,
        isValid: true
    };
}

/**
 * Test fonksiyonu: Referans noktalarını doğrula
 */
function validateReferencePoints() {
    console.log('=== Referans Noktası Doğrulama ===\n');
    
    let totalError = 0;
    let maxError = 0;
    
    REFERENCE_POINTS.forEach(ref => {
        const result = gpsToPixel(ref.lat, ref.lng);
        const errorX = Math.abs(result.pixelX - ref.pixelX);
        const errorY = Math.abs(result.pixelY - ref.pixelY);
        const error = Math.sqrt(errorX * errorX + errorY * errorY);
        
        totalError += error;
        maxError = Math.max(maxError, error);
        
        console.log(`${ref.name}:`);
        console.log(`  Beklenen Pixel: (${ref.pixelX}, ${ref.pixelY})`);
        console.log(`  Hesaplanan Pixel: (${result.pixelX}, ${result.pixelY})`);
        console.log(`  Hata: ${error.toFixed(2)} pixel\n`);
    });
    
    console.log(`Ortalama Hata: ${(totalError / REFERENCE_POINTS.length).toFixed(2)} pixel`);
    console.log(`Maksimum Hata: ${maxError.toFixed(2)} pixel`);
}

// Export
module.exports = {
    pixelToGPS,
    gpsToPixel,
    validateReferencePoints,
    REFERENCE_POINTS,
    MAP_DIMENSIONS
};

// Test (node coordinateMapper.js ile çalıştırıldığında)
if (require.main === module) {
    validateReferencePoints();
}
