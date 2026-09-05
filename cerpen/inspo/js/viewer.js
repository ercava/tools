
// Logic for Slider Viewer

const track = document.getElementById('slider-track');
const pages = document.querySelectorAll('.slide-page');
const nextBtn = document.getElementById('next-btn');
const prevBtn = document.getElementById('prev-btn');

let currentIndex = 0;
const totalPages = pages.length;

function updateSlider() {
    // 1. Update Active Class
    pages.forEach((page, index) => {
        if (index === currentIndex) {
            page.classList.add('active');
        } else {
            page.classList.remove('active');
        }
    });

    // 2. Slide Track to Center Active Item
    const currentSlide = pages[currentIndex];

    // Check if loaded (img might not have width yet if first load)
    // We can rely on flexbox layout values usually.
    const slideCenter = currentSlide.offsetLeft + (currentSlide.getBoundingClientRect().width / 2);
    const screenCenter = window.innerWidth / 2;

    // We need to move the TRACK so that slideCenter aligns with screenCenter.
    // Default track position is 0. If slideCenter is at 500, we need to move track -500 to bring it to 0...
    // But we want it at screenCenter. So calculate Delta.

    const moveAmount = screenCenter - slideCenter;

    track.style.transform = `translateX(${moveAmount}px)`;
}

// Recalculate on resize
window.addEventListener('resize', updateSlider);
// Recalculate when image loads (important for auto width)
window.addEventListener('load', updateSlider);

// Click on page to focus it
pages.forEach((page, index) => {
    page.addEventListener('click', () => {
        currentIndex = index;
        updateSlider();
    });
});

// Arrow Navigation
if (nextBtn) {
    nextBtn.addEventListener('click', () => {
        if (currentIndex < totalPages - 1) {
            currentIndex++;
            updateSlider();
        }
    });
}

if (prevBtn) {
    prevBtn.addEventListener('click', () => {
        if (currentIndex > 0) {
            currentIndex--;
            updateSlider();
        }
    });
}

// Initialize
updateSlider();
