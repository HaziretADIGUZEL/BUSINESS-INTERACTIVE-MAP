// Kullanım Kılavuzu İçeriği - Bu dosyayı düzenleyerek metinleri kolayca değiştirin
const guideContent = {
    title: "Kullanım Kılavuzu",
    sections: [
        {
            id: "intro",
            title: "Giriş",
            content: `
                <p style="font-family: 'Roboto', sans-serif; font-size: 16px; line-height: 1.6;">
                    Bu kılavuz, Çınar İtfaiye Oryantasyon Haritası'nın kullanımını açıklar. 
                    Harita üzerinde marker'ları keşfedebilir, filtreleyebilir ve admin modunda düzenleyebilirsiniz.
                </p>
                <h3 style="font-family: 'Montserrat', sans-serif; color: #DC143C;">Önemli Notlar</h3>
                <ul style="font-family: 'Open Sans', sans-serif;">
                    <li>Admin modu için giriş yapın.</li>
                    <li>Mobil cihazlarda hamburger menü kullanın.</li>
                </ul>
            `
        },
        {
            id: "navigation",
            title: "Harita Navigasyonu",
            content: `
                <p style="font-family: 'Lato', sans-serif;">Haritayı zoom in/out yapın...</p>
                <table style="border-collapse: collapse; width: 100%; font-family: 'Source Sans Pro', sans-serif;">
                    <tr><th style="border: 1px solid #ddd; padding: 8px;">Özellik</th><th style="border: 1px solid #ddd; padding: 8px;">Açıklama</th></tr>
                    <tr><td style="border: 1px solid #ddd; padding: 8px;">Zoom</td><td style="border: 1px solid #ddd; padding: 8px;">Fare tekerleği ile yakınlaştırın.</td></tr>
                </table>
            `
        },
        {
            title: "Harita Kullanımı",
            content: "Bu bölümde haritanın temel görünümü, gezinme ve genel özellikler açıklanmaktadır. Harita, ÇINAR İTFAİYE oryantasyon haritasıdır ve marker'lar (noktalar) ile önemli yerleri gösterir.",
            subsections: [
                {
                    title: "Harita Görünümü ve Gezinme",
                    content: "Harita, bina planını gösteren büyük bir görseldir. Fare ile sürükleyerek hareket edebilir, zoom (+/-) butonları veya fare tekerleği ile yakınlaştırıp uzaklaştırabilirsiniz. Mobil cihazlarda dokunarak hareket edin. Harita sınırları dışında hareket edemezsiniz. Yıldız efektleri ve animasyonlar görsel çekicilik için eklenmiştir."
                },
                {
                    title: "Marker'lar (Noktalar)",
                    content: "Haritadaki renkli pinler (noktalar) önemli yerleri temsil eder. Bir marker'a tıklayınca başlık, açıklama ve varsa görseller görünür. Görsellere tıklayarak büyük boyutta görüntüleyebilirsiniz. Admin modunda marker'ları düzenleyebilir veya yeni ekleyebilirsiniz."
                }
            ]
        },
        {
            title: "Arama ve Filtreleme",
            content: "Haritadaki noktaları bulmak için arama ve filtreleme araçları vardır. Arama kutusuyla başlık veya açıklamaya göre arayabilir, filtrelerle sınıflara göre gösterebilirsiniz.",
            subsections: [
                {
                    title: "Arama Özelliği",
                    content: "Üstteki arama kutusuna anahtar kelime yazın ve 'Ara' butonuna basın. Eşleşen marker'lar haritada vurgulanır ve harita o bölgeye odaklanır. Öneriler listesi otomatik çıkar. Mobil cihazlarda da aynı şekilde çalışır."
                },
                {
                    title: "Filtreleme",
                    content: "'Sınıflar Filtrele' butonuna tıklayarak açılır menüden sınıfları seçin. Seçili sınıflardaki marker'lar görünür, diğerleri gizlenir. 'Hepsini Gizle' ile tüm marker'ları gizleyebilir, 'Tersine Çevir' ile seçili olmayanları gösterebilirsiniz. Filtreler arama ile birlikte kullanılabilir."
                }
            ]
        },
        {
            title: "Admin Özellikleri",
            content: "Admin modu, haritayı yönetmek için gereklidir. Giriş yaptıktan sonra marker ekleme, düzenleme, sınıf yönetimi ve barkod okutma gibi özellikler aktif olur.",
            subsections: [
                {
                    title: "Admin Girişi",
                    content: "Sağ üstteki 'Admin Modu' butonuna tıklayın ve kullanıcı adı ile şifre girin. Başarılı giriş sonrası admin butonları görünür. Oturum süresi 1 saattir; süresi dolunca otomatik çıkış yapılır. Mobil cihazlarda hamburger menüsünden giriş yapabilirsiniz."
                },
                {
                    title: "Marker Yönetimi",
                    content: "'Marker Listesi' butonuna tıklayarak mevcut marker'ları görün ve düzenleyin. Yeni marker eklemek için 'Yeni Marker Ekle' butonunu kullanın. Düzenleme ekranında başlık, açıklama, sınıf, renk, görsel ve konum ayarlayabilirsiniz. Konum seçmek için haritaya tıklayın. Marker'ları sürükleyerek taşıyabilir veya kilitleyebilirsiniz."
                },
                {
                    title: "Sınıf Yönetimi",
                    content: "'Sınıf Yönetimi' butonuna tıklayarak sınıfları ekleyin, düzenleyin veya silin. Sınıflar marker'ları gruplamak için kullanılır. Yeni sınıf eklemek için adı girin. Sınıf silindiğinde bağlı marker'ların sınıfı boşalır."
                },
                {
                    title: "Gelişmiş Düzenleme",
                    content: "'Gelişmiş Düzenleme' butonuna tıklayarak marker'ları veya sınıfları toplu yönetin. Marker'larda başlık, açıklama, renk, görsel sayısı gibi kriterlerle filtreleyin ve seçili olanları düzenleyin veya silin. Sınıfları da benzer şekilde yönetebilirsiniz."
                },
                {
                    title: "Barkod Okutma",
                    content: "Admin modunda 'Barkod Okut' butonuna tıklayarak kamera açılır. Barkodu çerçeveye hizalayın; otomatik okunur. Mevcut marker'a aitse düzenleme ekranı açılır, değilse yeni marker için barkod atanır. Kullanıcı modunda da barkod ile marker bulabilirsiniz."
                }
            ]
        },
        {
            title: "Mobil Kullanım",
            content: "Mobil cihazlarda harita dokunarak kullanılır. Hamburger menüsü (☰) ile admin özelliklerine erişin. Arama, filtreleme ve barkod okutma masaüstü ile aynıdır. Harita zoom'u mobil için optimize edilmiştir.",
            subsections: [
                {
                    title: "Mobil Gezinme",
                    content: "Dokunarak sürükleyin, iki parmakla zoom yapın. Marker'lara dokununca popup açılır. Admin paneli hamburger menüsünden açılır."
                },
                {
                    title: "Mobil Admin",
                    content: "Hamburger menüsünden 'Admin Modu' ile giriş yapın. 'Marker Listesi', 'Sınıf Yönetimi' ve 'Barkod Okut' butonları görünür. Gelişmiş düzenleme için 'Gelişmiş Düzenleme' butonunu kullanın."
                }
            ]
        },
        {
            title: "İpuçları ve Sorun Giderme",
            content: "Harita yüklenirken bekleyin; yavaş cihazlarda zoom seviyelerini önceden yükleriz. Görseller yüklenmezse URL'yi kontrol edin. Admin oturumu dolunca yeniden giriş yapın. Barkod okumazsa kamerayı temizleyin ve tekrar deneyin.",
            subsections: [
                {
                    title: "Performans İpuçları",
                    content: "Çok fazla marker varsa filtre kullanın. Mobil cihazlarda hafif modda çalışır. Sayfa yenilenince değişiklikler kaydedilir."
                },
                {
                    title: "Yardım",
                    content: "Sorularınız için admin'e başvurun. Bu klavuz güncellenebilir."
                }
            ]
        }
    ]
};