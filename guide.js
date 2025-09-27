document.addEventListener('DOMContentLoaded', () => {
    const treeMenu = document.getElementById('guide-tree');
    const guideBody = document.getElementById('guide-body');
    const guideTitle = document.getElementById('guide-title');
    const searchInput = document.getElementById('guide-search');
    const searchBtn = document.getElementById('guide-search-btn');
    const searchSuggestions = document.getElementById('search-suggestions');

    let currentQuery = ''; // Highlight için

    // Başlık ayarla
    guideTitle.innerHTML = '<span style="font-family: \'Open Sans\', sans-serif; font-weight: normal; display: block; margin-bottom: 0;"><span style="font-family: \'Open Sans\', sans-serif; font-weight: normal; display: block; margin-bottom: 0; color: red; text-transform: uppercase;">Çınar İtfaiye</span> Oryantasyon Haritası Kullanım Kılavuzu</span>';

    // Tüm bölümleri topla
    const allSections = [];
    function collectSections(sections) {
        sections.forEach(section => {
            allSections.push(section);
            if (section.subsections) collectSections(section.subsections);
        });
    }
    collectSections(guideContent.sections);

    // Ağaç menü oluştur (iç içe)
    function buildTree(sections, parentUl) {
        sections.forEach(section => {
            const li = document.createElement('li');
            li.textContent = section.title;
            li.addEventListener('click', (e) => {
                e.stopPropagation();
                loadSection(section, li);
                // Sadece alt dal varsa genişlet/daralt
                if (section.subsections && section.subsections.length > 0) {
                    li.classList.toggle('expanded');
                }
            });
            if (section.subsections && section.subsections.length > 0) {
                li.classList.add('has-children'); // Alt dal varsa class ekle
                const subUl = document.createElement('ul');
                li.appendChild(subUl);
                buildTree(section.subsections, subUl);
            }
            parentUl.appendChild(li);
        });
    }
    buildTree(guideContent.sections, treeMenu);

    // İçerik yükle
    function loadSection(section, li) {
        // Önceki active class'ları kaldır
        document.querySelectorAll('.tree-menu li.active').forEach(el => el.classList.remove('active'));
        // Yeni active class ekle
        li.classList.add('active');
        guideBody.innerHTML = `<h2>${section.title}</h2>${highlightText(section.content, currentQuery)}`;
        // Alt dalların bilgileri üst dalda gösterilmesin, sadece üst dalın kendi bilgisi
    }

        // Highlight fonksiyonu
    function highlightText(text, query) {
        if (!query || query.length < 3) return text;
        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }

    // Arama önerileri
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        if (query.length === 0) {
            // Arama kutusu boş, ağacı geri yükle
            treeMenu.innerHTML = '';
            buildTree(guideContent.sections, treeMenu);
            searchSuggestions.style.display = 'none';
            currentQuery = ''; // Highlight sıfırla
        } else if (query.length >= 3) {
            // İçerik arama önerileri
            const suggestions = allSections.filter(section => section.title.toLowerCase().includes(query) || section.content.toLowerCase().includes(query)).map(section => {
                let display = section.title;
                let type = 'title';
                if (section.content.toLowerCase().includes(query)) {
                    const snippet = getSnippet(section.content, query);
                    display = `${section.title} - ${snippet}`;
                    type = 'content';
                } else if (section.title.toLowerCase().includes(query)) {
                    const snippet = getSnippet(section.title, query);
                    display = `${section.title} - ${snippet}`;
                    type = 'title';
                }
                return { display, section, type };
            });
            searchSuggestions.innerHTML = suggestions.map(item => `<div class="suggestion" data-section-index="${allSections.indexOf(item.section)}" data-type="${item.type}">${item.display}</div>`).join('');
            searchSuggestions.style.display = 'block';
        } else {
            // Sadece başlık önerileri
            const suggestions = allSections.filter(section => section.title.toLowerCase().includes(query)).map(section => {
                let display = section.title;
                return { display, section, type: 'title' };
            });
            searchSuggestions.innerHTML = suggestions.map(item => `<div class="suggestion" data-section-index="${allSections.indexOf(item.section)}" data-type="${item.type}">${item.display}</div>`).join('');
            searchSuggestions.style.display = 'block';
        }
    });

    // Snippet oluştur
    function getSnippet(content, query) {
        const lowerContent = content.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const index = lowerContent.indexOf(lowerQuery);
        if (index === -1) return '';
        const words = content.split(/\s+/);
        // Kelime index'ini bul
        let wordIndex = 0;
        let charCount = 0;
        for (let i = 0; i < words.length; i++) {
            if (charCount + words[i].length >= index) {
                wordIndex = i;
                break;
            }
            charCount += words[i].length + 1; // space
        }
        const start = Math.max(0, wordIndex - 3);
        const end = Math.min(words.length, wordIndex + query.split(/\s+/).length + 3);
        const snippetWords = words.slice(start, end);
        let snippet = snippetWords.join(' ');
        if (start > 0) snippet = '... ' + snippet;
        if (end < words.length) snippet += ' ...';
        // Query'yi mark yap
        snippet = snippet.replace(new RegExp(query, 'gi'), `<mark>$&</mark>`);
        return snippet;
    }

    // Öneri seçimi
    searchSuggestions.addEventListener('click', (e) => {
        if (e.target.classList.contains('suggestion')) {
            searchSuggestions.style.display = 'none';
            currentQuery = searchInput.value.toLowerCase(); // Highlight için
            const index = e.target.getAttribute('data-section-index');
            const section = allSections[index];
            const li = findLi(guideContent.sections, section, treeMenu);
            if (li) {
                expandParents(li);
                loadSection(section, li);
            }
        }
    });

    // Li'yi bul
    function findLi(sections, targetSection, parentUl) {
        for (let i = 0; i < sections.length; i++) {
            if (sections[i] === targetSection) {
                return parentUl.children[i];
            }
            if (sections[i].subsections) {
                const subUl = parentUl.children[i].querySelector('ul');
                if (subUl) {
                    const li = findLi(sections[i].subsections, targetSection, subUl);
                    if (li) return li;
                }
            }
        }
        return null;
    }

    // Parent'ları expand et
    function expandParents(li) {
        let current = li;
        while (current) {
            if (current.classList.contains('has-children')) {
                current.classList.add('expanded');
            }
            current = current.parentElement;
            if (current && current.tagName === 'LI') {
                // Parent li'yi expand et
            } else if (current && current.tagName === 'UL') {
                // UL'nin parent li'sini expand et
                const parentLi = current.previousElementSibling;
                if (parentLi) parentLi.classList.add('expanded');
                current = current.parentElement;
            } else {
                break;
            }
        }
    }

    // Arama butonu
    searchBtn.addEventListener('click', () => {
        const query = searchInput.value.toLowerCase();
        if (query.length === 0) {
            // Kırmızı border
            searchInput.style.border = '1px solid red';
            setTimeout(() => {
                searchInput.style.border = '';
            }, 2000);
            // Hata mesajı
            const searchError = document.getElementById('search-error');
            searchError.textContent = 'Arama başarısız.';
            searchError.style.display = 'block';
            setTimeout(() => {
                searchError.style.display = 'none';
            }, 2000);
        } else {
            performSearch(query);
        }
    });

    // Arama gerçekleştir
    function performSearch(query) {
        currentQuery = query;
        const filtered = allSections.filter(section =>
            section.title.toLowerCase().includes(query) ||
            section.content.toLowerCase().includes(query)
        );
        treeMenu.innerHTML = '';
        if (filtered.length > 0) {
            buildTree(filtered, treeMenu);
        } else {
            treeMenu.innerHTML = '<li>Arama sonucu bulunamadı.</li>';
        }
        searchSuggestions.style.display = 'none';
    }

    // Dark mode toggle
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    darkModeToggle.addEventListener('click', () => {
        const html = document.documentElement;
        if (html.hasAttribute('native-dark-active')) {
            html.removeAttribute('native-dark-active');
            // Remove dark mode styles
            const customLink = document.getElementById('dark-mode-custom-link');
            if (customLink) customLink.remove();
            const generalLink = document.getElementById('dark-mode-general-link');
            if (generalLink) generalLink.remove();
            const customStyle = document.getElementById('dark-mode-custom-style');
            if (customStyle) customStyle.remove();
            const nativeStyle = document.getElementById('dark-mode-native-style');
            if (nativeStyle) nativeStyle.remove();
            const nativeSheet = document.getElementById('dark-mode-native-sheet');
            if (nativeSheet) nativeSheet.remove();
        } else {
            html.setAttribute('native-dark-active', '');
            // Add dark mode styles
            const customLink = document.createElement('link');
            customLink.type = 'text/css';
            customLink.rel = 'stylesheet';
            customLink.id = 'dark-mode-custom-link';
            document.head.appendChild(customLink);

            const generalLink = document.createElement('link');
            generalLink.type = 'text/css';
            generalLink.rel = 'stylesheet';
            generalLink.id = 'dark-mode-general-link';
            document.head.appendChild(generalLink);

            const customStyle = document.createElement('style');
            customStyle.lang = 'en';
            customStyle.type = 'text/css';
            customStyle.id = 'dark-mode-custom-style';
            document.head.appendChild(customStyle);

            const nativeStyle = document.createElement('style');
            nativeStyle.lang = 'en';
            nativeStyle.type = 'text/css';
            nativeStyle.id = 'dark-mode-native-style';
            nativeStyle.textContent = `:root, ::after, ::before, ::backdrop {
  --native-dark-accent-color: #a9a9a9;
  --native-dark-bg-blend-mode: multiply;
  --native-dark-bg-color: #292929;
  --native-dark-bg-image-color: rgba(0, 0, 0, 0.10);
  --native-dark-bg-image-filter: brightness(50%) contrast(200%);
  --native-dark-border-color: #555555;
  --native-dark-box-shadow: 0 0 0 1px rgb(255 255 255 / 10%);
  --native-dark-brightness: 0.85;
  --native-dark-cite-color: #92de92;
  --native-dark-fill-color: #7d7d7d;
  --native-dark-font-color: #dcdcdc;
  --native-dark-link-color: #8db2e5;
  --native-dark-opacity: 0.85;
  --native-dark-text-shadow: none;
  --native-dark-transparent-color: transparent;
  --native-dark-visited-link-color: #c76ed7
}

:root {
  color-scheme: dark !important;
  accent-color: var(--native-dark-accent-color);
}

html a:visited, 
html a:visited > *:not(svg) {
  color: var(--native-dark-visited-link-color) !important;
}

a[ping]:link,
a[ping]:link > *:not(svg),
:link:not(cite) {
  color: var(--native-dark-link-color) !important;
}

html cite,
html cite a:link,
html cite a:visited {
  color: var(--native-dark-cite-color) !important;
}

figure:empty {
  opacity: var(--native-dark-opacity) !important;
}

img,
image {
  filter: brightness(var(--native-dark-brightness)) !important;
}`;
            document.head.appendChild(nativeStyle);

            const nativeSheet = document.createElement('style');
            nativeSheet.lang = 'en';
            nativeSheet.type = 'text/css';
            nativeSheet.id = 'dark-mode-native-sheet';
            document.head.appendChild(nativeSheet);
        }
    });
});
