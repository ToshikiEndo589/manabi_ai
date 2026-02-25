const sharp = require('sharp');
const path = require('path');

async function createSplash() {
    const width = 1284;
    const height = 2778;
    const mascotSize = 800;

    const bgSvg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1e3a8a" /> <!-- blue-900 (暗め) -->
          <stop offset="50%" stop-color="#2563eb" /> <!-- blue-600 (中間) -->
          <stop offset="100%" stop-color="#172554" /> <!-- blue-950 (暗め) -->
        </linearGradient>
        
        <radialGradient id="glow1" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#60a5fa" stop-opacity="0.35" />
          <stop offset="100%" stop-color="#60a5fa" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="glow2" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.25" />
          <stop offset="100%" stop-color="#a78bfa" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="glow3" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.25" />
          <stop offset="100%" stop-color="#38bdf8" stop-opacity="0" />
        </radialGradient>

        <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>
          <circle cx="60" cy="60" r="1.5" fill="rgba(255,255,255,0.1)"/>
        </pattern>
      </defs>

      <rect width="100%" height="100%" fill="url(#bg)" />
      
      <circle cx="0" cy="0" r="900" fill="url(#glow1)" />
      <circle cx="1200" cy="800" r="700" fill="url(#glow3)" />
      <circle cx="642" cy="2700" r="1000" fill="url(#glow2)" />
      
      <rect width="100%" height="100%" fill="url(#grid)" />
      
      <!-- 日本語フォントを複数指定してWindows/Mac両対応を狙う -->
      <text x="50%" y="1980" font-family="'Yu Gothic', 'Meiryo', 'Hiragino Sans', sans-serif" font-size="100" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="8">まなびAI</text>
      
      <path d="M 0 1700 Q 642 1900 1284 1700" fill="none" stroke="rgba(59, 130, 246, 0.4)" stroke-width="2"/>
      <path d="M 0 1730 Q 642 1930 1284 1730" fill="none" stroke="rgba(139, 92, 246, 0.2)" stroke-width="1"/>
    </svg>
    `;

    try {
        const mascotPath = path.join(__dirname, 'mascot.png');
        const outPath = path.join(__dirname, 'premium_splash_v2.png');

        const mascotBuffer = await sharp(mascotPath)
            .resize(mascotSize, mascotSize)
            .toBuffer();

        const circleMask = Buffer.from(
            `<svg width="${mascotSize}" height="${mascotSize}">
                <circle cx="${mascotSize / 2}" cy="${mascotSize / 2}" r="${(mascotSize / 2) - 15}" fill="white"/>
            </svg>`
        );

        const mascotCropped = await sharp(mascotBuffer)
            .composite([{ input: circleMask, blend: 'dest-in' }])
            .png()
            .toBuffer();

        const glowWrapperSize = mascotSize + 160;
        const mascotGlowSvg = Buffer.from(`
            <svg width="${glowWrapperSize}" height="${glowWrapperSize}">
                <defs>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="30" result="coloredBlur"/>
                        <feMerge>
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                </defs>
                <circle cx="${glowWrapperSize / 2}" cy="${glowWrapperSize / 2}" r="${(mascotSize / 2) - 10}" fill="rgba(255,255,255,0.8)" filter="url(#glow)"/>
            </svg>
        `);

        const mascotWithGlow = await sharp(mascotGlowSvg)
            .composite([{ input: mascotCropped, left: 80, top: 80, blend: 'over' }])
            .png()
            .toBuffer();

        const mascotX = Math.floor((width - glowWrapperSize) / 2);
        const mascotY = Math.floor(height * 0.45) - Math.floor(glowWrapperSize / 2);

        await sharp(Buffer.from(bgSvg))
            .composite([
                { input: mascotWithGlow, top: mascotY, left: mascotX }
            ])
            .png()
            .toFile(outPath);

        console.log("Splash generated successfully!");
    } catch (e) {
        console.error("Error generating splash:", e);
    }
}

createSplash();
