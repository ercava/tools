document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('twibbonCanvas');
    const ctx = canvas.getContext('2d');
    const canvasContainer = document.getElementById('canvasContainer');
    const imageInput = document.getElementById('imageInput');
    const zoomSlider = document.getElementById('zoomSlider');
    const downloadBtn = document.getElementById('downloadBtn');
    const controls = document.getElementById('controls');
    const captionSection = document.getElementById('captionSection');
    const copyBtn = document.getElementById('copyBtn');
    const captionText = document.getElementById('captionText');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = loadingOverlay.querySelector('.loading-text');

    let uploadedImage = null;
    let twibbonImage = new Image();
    // Configure default state
    let imageState = {
        x: 0,
        y: 0,
        scale: 1,
        isDragging: false,
        lastX: 0,
        lastY: 0
    };

    // Load Twibbon Frame
    twibbonImage.src = 'default_twibbon.png';
    twibbonImage.onload = () => {
        // Set canvas to match twibbon dimensions
        canvas.width = twibbonImage.naturalWidth || 1080;
        canvas.height = twibbonImage.naturalHeight || 1080;
        drawCanvas();
    };

    // Initialize with default size in case of delay
    canvas.width = 1080;
    canvas.height = 1080;

    // Handle File Upload Trigger
    canvasContainer.addEventListener('click', () => {
        imageInput.click();
    });

    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            loadingText.innerText = 'Mengunggah Foto...';
            loadingOverlay.classList.add('active');

            compressImage(file, (compressedUrl) => {
                uploadedImage = new Image();
                uploadedImage.onload = () => {
                    resetImageState();
                    canvasContainer.classList.add('has-image');
                    controls.classList.remove('hide');
                    drawCanvas();
                    loadingOverlay.classList.remove('active');
                };
                uploadedImage.src = compressedUrl;
            });
        }
    });

    function compressImage(file, callback) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const tempCanvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Max resolution for uploaded image to keep performance high
                const MAX_RES = 1500;
                if (width > height) {
                    if (width > MAX_RES) {
                        height *= MAX_RES / width;
                        width = MAX_RES;
                    }
                } else {
                    if (height > MAX_RES) {
                        width *= MAX_RES / height;
                        height = MAX_RES;
                    }
                }

                tempCanvas.width = width;
                tempCanvas.height = height;
                const ctx = tempCanvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Compress slightly even on upload to save memory
                // 0.9 quality is virtually indistinguishable from original
                const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.9);
                callback(dataUrl);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function resetImageState() {
        if (!uploadedImage) return;

        // Center and fit image initially
        const scaleX = canvas.width / uploadedImage.width;
        const scaleY = canvas.height / uploadedImage.height;
        const scale = Math.max(scaleX, scaleY); // Cover strategy

        imageState.scale = scale;
        imageState.x = (canvas.width - uploadedImage.width * scale) / 2;
        imageState.y = (canvas.height - uploadedImage.height * scale) / 2;

        // Update slider
        // Map logical scale to slider logic if needed, but simplest is to just use a multiplier on the base scale
        // For simplicity, we'll keep the slider as a multiplier of the "base" fit
        zoomSlider.value = 1;
    }

    function drawCanvas() {
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw White Background (optional, prevents transparency issues)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw Uploaded Image
        if (uploadedImage) {
            const currentScale = imageState.scale * parseFloat(zoomSlider.value);

            // Save context for clipping/transform if we were doing specific shapes, 
            // but for square twibbon we just draw
            ctx.drawImage(
                uploadedImage,
                imageState.x,
                imageState.y,
                uploadedImage.width * currentScale,
                uploadedImage.height * currentScale
            );
        } else {
            // Draw placeholder text/bg if empty (though UI covers this)
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Draw Twibbon Overlay
        if (twibbonImage.complete) {
            ctx.drawImage(twibbonImage, 0, 0, canvas.width, canvas.height);
        }
    }

    // Zoom Handling
    zoomSlider.addEventListener('input', () => {
        drawCanvas();
    });

    // Drag Handling (Pan)
    canvasContainer.addEventListener('mousedown', (e) => {
        if (!uploadedImage) return;
        imageState.isDragging = true;
        imageState.lastX = e.clientX;
        imageState.lastY = e.clientY;
        canvasContainer.style.cursor = 'grabbing';
    });

    window.addEventListener('mouseup', () => {
        if (imageState.isDragging) {
            imageState.isDragging = false;
            canvasContainer.style.cursor = 'grab';
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!imageState.isDragging || !uploadedImage) return;

        // Calculate delta
        // We need to map screen pixels to canvas pixels roughly, or just move by raw pixels
        // Since we are viewing the canvas scaled down via CSS, moving 1px on screen might mean X on canvas
        const rect = canvas.getBoundingClientRect();
        const scaleFactor = canvas.width / rect.width;

        const deltaX = (e.clientX - imageState.lastX) * scaleFactor;
        const deltaY = (e.clientY - imageState.lastY) * scaleFactor;

        imageState.x += deltaX;
        imageState.y += deltaY;

        imageState.lastX = e.clientX;
        imageState.lastY = e.clientY;

        drawCanvas();
    });

    // Touch support for mobile dragging
    canvasContainer.addEventListener('touchstart', (e) => {
        if (!uploadedImage) return;
        e.preventDefault(); // Prevent scrolling
        imageState.isDragging = true;
        imageState.lastX = e.touches[0].clientX;
        imageState.lastY = e.touches[0].clientY;
    }, { passive: false });

    window.addEventListener('touchend', () => {
        imageState.isDragging = false;
    });

    window.addEventListener('touchmove', (e) => {
        if (!imageState.isDragging || !uploadedImage) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const scaleFactor = canvas.width / rect.width;

        const deltaX = (e.touches[0].clientX - imageState.lastX) * scaleFactor;
        const deltaY = (e.touches[0].clientY - imageState.lastY) * scaleFactor;

        imageState.x += deltaX;
        imageState.y += deltaY;

        imageState.lastX = e.touches[0].clientX;
        imageState.lastY = e.touches[0].clientY;

        drawCanvas();
    }, { passive: false });


    // Download
    downloadBtn.addEventListener('click', () => {
        if (!uploadedImage) return;

        // Show loading overlay
        loadingText.innerText = 'Menyiapkan Twibbon...';
        loadingOverlay.classList.add('active');

        // Simulate a short delay for better UX (makes the process feel thorough)
        setTimeout(() => {
            try {
                // Trigger download as JPEG with 0.9 quality (balanced for size and clarity)
                const link = document.createElement('a');
                link.download = 'twibbon-pesta-merta.jpg';
                link.href = canvas.toDataURL('image/jpeg', 0.9);
                link.click();

                // Show Caption Section
                captionSection.classList.remove('hide');
                captionSection.scrollIntoView({ behavior: 'smooth' });
            } finally {
                // Hide loading overlay after download starts
                setTimeout(() => {
                    loadingOverlay.classList.remove('active');
                }, 500);
            }
        }, 1200); // 1.2s feels "premium" and gives enough time for the eyes to register the animation
    });

    // Copy Caption
    copyBtn.addEventListener('click', () => {
        captionText.select();
        captionText.setSelectionRange(0, 99999); // For mobile devices
        navigator.clipboard.writeText(captionText.value).then(() => {
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '<span class="icon">✅</span> Tersalin!';
            copyBtn.classList.add('success');
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
                copyBtn.classList.remove('success');
            }, 2000);
        });
    });
});
