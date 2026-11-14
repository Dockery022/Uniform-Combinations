// One pinned copy of three.js for every module. Loading it by full URL (rather
// than through an import map) keeps the app working on any static host and
// inside sandboxed previews.
export * from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';
