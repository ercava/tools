
// Configuration: List of your Files
const newspapers = [
    'Harian-Pestamerta-2967',
    'Harian-Pestamerta-2919',
    'Harian-Pestamerta-2918',
    'Harian-Pestamerta-2917',
    'Harian-Pestamerta-1689',
    'Harian-Pestamerta-1687',
    'Harian-Pestamerta-1611',
    'Harian-Pestamerta-1610'
];

const stackContainer = document.getElementById('stack-container');

function renderStack() {
    newspapers.forEach((name, index) => {
        const linkUrl = `${name}.html`;
        const thumbUrl = `assets/${name} A.png`; // Use the 'A' page as cover

        const item = document.createElement('a');
        item.href = linkUrl;
        item.className = 'newspaper-item';

        // Image Element
        const img = document.createElement('img');
        img.src = thumbUrl;
        img.alt = name;
        img.loading = "lazy";

        // Ensure leftmost item is on top physically
        item.style.zIndex = newspapers.length - index;

        item.appendChild(img);
        stackContainer.appendChild(item);
    });
}

renderStack();
