'use strict';

// Export the editable vector at the exact 16:9 plugin-card size.
// Requires sharp (also available in the Codex bundled Node dependencies).
const sharp = require('sharp');
const path = require('node:path');

const root = path.join(__dirname, '..');
sharp(path.join(root, 'artwork/coverflow.svg'))
    .resize(960, 540)
    .png({ compressionLevel: 9 })
    .toFile(path.join(root, 'artwork/coverflow.png'))
    .then(info => console.log('CoverFlow artwork:', info.width, 'x', info.height, info.size, 'bytes'))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
