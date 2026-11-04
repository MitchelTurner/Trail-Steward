/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  presets: [require('../../packages/config/tailwind.preset.js')],
};
